// ========================================
// CONFIGURATION & CONSTANTS
// ========================================

/**
 * Application Configuration
 * Central location for all magic numbers and configuration values
 */
const CONFIG = Object.freeze({
  // Timing
  UPDATE_CHECK_INTERVAL: 3600000,      // 1 hour in ms
  ROTATION_DEBOUNCE: 300,              // Rotation debounce delay in ms
  NOTIFICATION_AUTO_HIDE: 8000,        // Auto-hide notification after 8s
  KEYBOARD_HINT_DELAY: 2000,           // Show keyboard hint after 2s
  DEBUG_LOGGING: false,
  
  // CORS Proxies (in priority order)
  CORS_PROXIES: [
    'https://corsproxy.garfieldapp.workers.dev/?'
  ],
  COMIC_METADATA_ENDPOINT: 'https://corsproxy.garfieldapp.workers.dev/-/comic-metadata',
  
  // Fetch timeouts
  FETCH_TIMEOUT: 10000,                // 10 second timeout for HTML
  IMAGE_FETCH_TIMEOUT: 8000,           // 8 second timeout for images
  
  // Swipe detection
  SWIPE_MIN_DISTANCE: 50,              // Minimum swipe distance in px
  SWIPE_MAX_TIME: 500,                 // Maximum swipe time in ms
  
  // Toolbar snapping
  SNAP_THRESHOLD: 80,                  // Distance in px within which toolbar snaps to optimal position
  
  // Cache limits
  MAX_PRELOAD_CACHE: 20,               // Maximum preloaded comics
  MIN_IMAGE_SIZE: 400,                 // Minimum valid image size in bytes
  
  // Image scaling
  ROTATED_IMAGE_SCALE: 0.9,            // Scale factor for rotated images (90%)
  
  // Comic dates
  COMIC_START_DATE: "2015/05/04",      // First DirkJan comic date
  
  // Storage keys
  STORAGE_KEYS: Object.freeze({
    FAVS: 'favs',
    LAST_COMIC: 'lastcomic',
    TOOLBAR_POS: 'mainToolbarPosition',
    TOOLBAR_OPTIMAL: 'toolbarInOptimalPosition',
    SETTINGS_POS: 'settingsPosition',
    SWIPE: 'stat',
    SHOW_FAVS: 'showfavs',
    LAST_DATE: 'lastdate',
    START_LATEST: 'startlatest',
    START_MODE: 'startmode',
    SETTINGS_VISIBLE: 'settings',
    KEYBOARD_HINT: 'keyboardHintSeen',
    DARK_MODE: 'darkmode',
    SHUFFLE: 'shuffle'
  })
});

// ========================================
// SERVICE WORKER REGISTRATION & PWA SETUP
// ========================================

/**
 * Initializes and registers the service worker for PWA functionality
 */
if ('serviceWorker' in navigator) {
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadingForUpdate) return;
    reloadingForUpdate = false;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./serviceworker.js')
      .then(registration => {
        const offerUpdate = worker => {
          if (!worker || !navigator.serviceWorker.controller) return;
          showUpdateNotification(() => {
            reloadingForUpdate = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
          });
        };

        offerUpdate(registration.waiting);

        // Check for updates periodically (every hour)
        setInterval(() => {
          registration.update();
        }, CONFIG.UPDATE_CHECK_INTERVAL);
        
        // Listen for new service worker waiting to activate
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                offerUpdate(newWorker);
              }
            });
          }
        });
      })
      .catch(() => {
        TELEMETRY.report('service_worker_failed', 'register');
        // ServiceWorker registration failed - app will work without offline support
      });
  });
}

/**
 * Shows update notification to user when new version is available
 */
function showUpdateNotification(onAccept) {
  if (document.getElementById('update-notification')) return;

  const notification = document.createElement('div');
  notification.id = 'update-notification';
  notification.innerHTML = `
    <div class="update-notification-inner">
      <div class="update-notification-title">🎉 Nieuwe versie beschikbaar!</div>
      <button class="update-notification-btn update-notification-btn-primary">Updaten</button>
      <button class="update-notification-btn update-notification-btn-secondary">Later</button>
    </div>
  `;
  notification.querySelector('.update-notification-btn-primary').addEventListener('click', () => {
    const accept = onAccept || updateApp;
    accept();
  });
  notification.querySelector('.update-notification-btn-secondary').addEventListener('click', dismissUpdate);
  document.body.appendChild(notification);
}

/**
 * Updates app to new version by activating waiting service worker
 */
function updateApp() {
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.remove();
  }
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration()
      .then(registration => {
        if (registration && registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(() => showNotification('Updaten is niet gelukt. Probeer het later opnieuw.', true));
  }
}

/**
 * Dismisses the update notification with fade-out animation
 */
function dismissUpdate() {
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }
}

// ========================================
// CORS PROXY SYSTEM
// ========================================

// AbortController for cancelling in-flight comic fetches on re-navigation
let currentFetchController = null;

// Track which proxy is currently working best
let workingProxyIndex = 0;
const PRIMARY_PROXY_INDEX = 0;
let proxyFailureCount = new Array(CONFIG.CORS_PROXIES.length).fill(0); // One for each proxy
let proxyResponseTimes = new Array(CONFIG.CORS_PROXIES.length).fill(0); // Track average response times in ms

/**
 * Fetches a URL with intelligent CORS proxy fallback
 * Tries the Cloudflare Worker first, then public fallbacks ordered by recent performance
 * @param {string} url - The URL to fetch
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} If all fetch attempts fail
 */
async function fetchWithFallback(url, signal = null) {
  const startTime = performance.now();
  const primaryProxyIndex = PRIMARY_PROXY_INDEX;

  // Always try the Cloudflare Worker first, then score public fallbacks.
  try {
    return await tryProxy(url, primaryProxyIndex, startTime, signal);
  } catch (error) {
    if (error.name === 'NotFoundError') throw error; // Don't retry 404s
    if (error.name === 'AbortError') throw error;
    return await tryRemainingProxies(url, primaryProxyIndex, startTime, signal);
  }
}

/**
 * Scores a proxy based on success rate and response time
 * @param {number} proxyIndex - Proxy index
 * @returns {number} Higher score means a better proxy
 */
function getProxyScore(proxyIndex) {
  const failurePenalty = proxyFailureCount[proxyIndex] * 2000;
  const avgTime = proxyResponseTimes[proxyIndex] || 1500; // Default to 1.5s if unknown
  return 10000 / (avgTime + failurePenalty + 1);
}

/**
 * Gets public fallback proxies ordered by recent performance
 * @param {number} excludeIndex - Proxy to exclude from the order
 * @returns {number[]} Proxy indexes ordered from best to worst
 */
function getPublicProxyOrder(excludeIndex = PRIMARY_PROXY_INDEX) {
  return CONFIG.CORS_PROXIES
    .map((_, index) => index)
    .filter(index => index !== excludeIndex)
    .sort((a, b) => getProxyScore(b) - getProxyScore(a));
}

/**
 * Updates proxy performance statistics
 * @param {number} proxyIndex - Proxy index
 * @param {boolean} success - Whether request succeeded
 * @param {number} responseTime - Response time in ms
 */
function updateProxyStats(proxyIndex, success, responseTime) {
  if (success) {
    workingProxyIndex = proxyIndex;
    proxyFailureCount[proxyIndex] = Math.max(0, proxyFailureCount[proxyIndex] - 1);
    
    // Update rolling average (70% old, 30% new)
    if (proxyResponseTimes[proxyIndex] === 0) {
      proxyResponseTimes[proxyIndex] = responseTime;
    } else {
      proxyResponseTimes[proxyIndex] = proxyResponseTimes[proxyIndex] * 0.7 + responseTime * 0.3;
    }
  } else {
    proxyFailureCount[proxyIndex]++;
  }
}

/**
 * Attempts to fetch via a specific proxy
 * @param {string} url - URL to fetch
 * @param {number} proxyIndex - Proxy index to use
 * @param {number} startTime - Start time for tracking
 * @returns {Promise<Response>}
 */
async function tryProxy(url, proxyIndex, startTime, signal = null) {
  const proxyUrl = CONFIG.CORS_PROXIES[proxyIndex];
  const proxyName = proxyUrl.split('/')[2]; // Extract domain for logging
  
  try {
    const fullUrl = `${proxyUrl}${encodeURIComponent(url)}`;
    const fetchSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(CONFIG.FETCH_TIMEOUT)])
      : AbortSignal.timeout(CONFIG.FETCH_TIMEOUT);
    const response = await fetch(fullUrl, { 
      signal: fetchSignal,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache' // Prevent stale cached errors
    });
    
    if (response.status === 404) {
      // Content doesn't exist on origin - proxy worked fine, don't penalize it
      const err = new Error('HTTP 404');
      err.name = 'NotFoundError';
      throw err;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    // Success
    const responseTime = performance.now() - startTime;
    updateProxyStats(proxyIndex, true, responseTime);
    if (CONFIG.DEBUG_LOGGING) console.log(`Proxy ${proxyIndex} (${proxyName}) in ${responseTime.toFixed(0)}ms`);
    return response;
    
  } catch (error) {
    if (error.name === 'NotFoundError') {
      if (CONFIG.DEBUG_LOGGING) console.warn(`Proxy ${proxyIndex} (${proxyName}): 404 content not found`);
      throw error; // Don't penalize proxy — origin returned 404
    }
    const errorType = error.name === 'TimeoutError' ? 'timeout' : 
                      error.name === 'AbortError' ? 'aborted' : 
                      error.message;
    if (CONFIG.DEBUG_LOGGING) console.warn(`Proxy ${proxyIndex} (${proxyName}):`, errorType);
    updateProxyStats(proxyIndex, false, 0);
    throw error;
  }
}

/**
 * Tries remaining proxies sequentially as final fallback
 * @param {string} url - URL to fetch
 * @param {number} excludeIndex - Proxy already tried
 * @param {number} startTime - Start time for tracking
 * @returns {Promise<Response>}
 */
async function tryRemainingProxies(url, excludeIndex, startTime, signal = null) {
  const errors = [];

  for (const i of getPublicProxyOrder(excludeIndex)) {
    try {
      return await tryProxy(url, i, startTime, signal);
    } catch (error) {
      if (error.name === 'NotFoundError') throw error; // Content doesn't exist, stop trying
      if (error.name === 'AbortError') throw error;
      errors.push(`Proxy ${i}: ${error.message}`);
    }
  }
  
  // Reset failure counts if all proxies are struggling
  if (proxyFailureCount.every(count => count > 2)) {
    if (CONFIG.DEBUG_LOGGING) console.log('Resetting proxy failure counts');
    proxyFailureCount.fill(0);
  }
  
  if (CONFIG.DEBUG_LOGGING) console.error('All proxies failed:', errors.join('; '));
  TELEMETRY.report('proxy_exhausted', 'network');
  throw new Error(`All proxies failed: ${errors.join(', ')}`);
}

// ========================================
// GLOBAL STATE & UTILITY FUNCTIONS
// ========================================

// Comic state
let pictureUrl = '';           // Current comic image URL
let formattedDate = '';         // Current formatted date for sharing (YYYY-MM-DD)
let formattedComicDate = '';    // Date formatted for API calls (YYYYMMDD)
let comicstartDate = CONFIG.COMIC_START_DATE;
let currentselectedDate;        // Currently selected date object
let maxDate;                    // Maximum possible comic date (next Friday)
let latestAvailableDate;        // Actual latest available comic date (found on load)
let isAnimating = false;        // Prevents overlapping animations
let notFoundRetries = 0;        // Prevents infinite 404 recursion
let currentComicObjectUrl = null;
let comicBlobCache = null;
let fullscreenControlsBound = false;

function getComicBlobCache() {
  if (!comicBlobCache) {
    comicBlobCache = COMIC_LOADER.createComicBlobCache({ maxSize: CONFIG.MAX_PRELOAD_CACHE });
  }
  return comicBlobCache;
}

function isFullscreenActive() {
  const shell = document.getElementById('fullscreen-shell');
  return !!(shell && !shell.hidden);
}

// Shuffle mode history (used when the "Shuffle modus" setting is enabled)
let shuffleBackStack = [];      // Previously seen random comics (for going back)
let shuffleForwardStack = [];   // Comics stepped back from (for going forward)

// Parsing variables
let notFound;

// Favorites cache
let _cachedFavs = null;

function setComicStatus(state, message = '') {
  const panel = document.getElementById('comic-status');
  const messageElement = document.getElementById('comic-status-message');
  const retryButton = document.getElementById('retryComic');
  const latestButton = document.getElementById('latestComic');
  if (!panel || !messageElement) return;

  const visible = state !== 'idle';
  panel.hidden = !visible;
  panel.className = `comic-status${visible ? ` is-${state}` : ''}`;
  messageElement.textContent = message;
  if (retryButton) retryButton.disabled = state === 'loading';
  if (latestButton) latestButton.disabled = state === 'loading';
}

/**
 * Utility Functions
 */
const UTILS = {
  /**
   * Safely parses JSON with fallback
   * @param {string} str - JSON string to parse
   * @param {*} fallback - Fallback value if parse fails
   * @returns {*} Parsed value or fallback
   */
  safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch (_) { return fallback; }
  },
  
  /**
   * Formats a date object into components
   * @param {Date} datetoFormat - Date to format
   * @returns {{year: number, month: string, day: string}} Formatted date parts
   */
  formatDate(datetoFormat) {
    const d = datetoFormat.getDate();
    const m = datetoFormat.getMonth() + 1;
    const y = datetoFormat.getFullYear();
    return {
      year: y,
      month: ("0" + m).slice(-2),
      day: ("0" + d).slice(-2)
    };
  },
  
  /**
   * Checks if device is mobile or touch-enabled
   * @returns {boolean} True if mobile/touch device
   */
  isMobileOrTouch() {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return isMobile || isTouch;
  }
};

/**
 * Persist the main toolbar position together with relative metadata.
 * @param {number} top - Toolbar top position in px.
 * @param {number} left - Toolbar left position in px.
 * @param {HTMLElement} [toolbarEl] - Optional toolbar element reference.
 */
function storeToolbarPosition(top, left, toolbarEl, overrides = {}) {
  const toolbar = toolbarEl || document.querySelector('.toolbar:not(.fullscreen-toolbar)');
  const savedRaw = STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_POS);
  const saved = UTILS.safeJSONParse(savedRaw, {});

  const positionData = { ...saved, top, left };

  const applyOverride = (key, value) => {
    if (value === undefined) return;
    if (value === null) {
      delete positionData[key];
    } else {
      positionData[key] = value;
    }
  };

  applyOverride('belowComic', overrides.belowComic);
  applyOverride('offsetFromComic', overrides.offsetFromComic ?? (overrides.belowComic === false ? null : undefined));
  applyOverride('belowSettings', overrides.belowSettings);
  applyOverride('offsetFromSettings', overrides.offsetFromSettings ?? (overrides.belowSettings === false ? null : undefined));

  const comic = document.getElementById('comic');
  if (comic && !('belowComic' in positionData)) {
    const comicRect = comic.getBoundingClientRect();
    const belowComic = top > comicRect.bottom;
    positionData.belowComic = belowComic;
    if (belowComic && !('offsetFromComic' in positionData)) {
      positionData.offsetFromComic = Math.max(15, top - comicRect.bottom);
    } else if (!belowComic) {
      delete positionData.offsetFromComic;
    }
  }

  const settingsPanel = document.getElementById('settingsDIV');
  if (settingsPanel && settingsPanel.classList.contains('visible') && !('belowSettings' in positionData)) {
    const settingsRect = settingsPanel.getBoundingClientRect();
    const belowSettings = top > settingsRect.bottom + 5;
    positionData.belowSettings = belowSettings;
    if (belowSettings && !('offsetFromSettings' in positionData)) {
      positionData.offsetFromSettings = Math.max(15, top - settingsRect.bottom);
    } else if (!belowSettings) {
      delete positionData.offsetFromSettings;
    }
  }

  try {
    STORAGE.set(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify(positionData));
  } catch (_) {}
}



// ========================================
// FAVORITES MANAGEMENT
// ========================================

/**
 * Loads favorites from localStorage with caching
 * @returns {Array<string>} Array of favorite comic dates (YYYY-MM-DD format)
 */
function loadFavs() {
  if (Array.isArray(_cachedFavs)) return _cachedFavs;
  const parsed = STORAGE.getJSON(CONFIG.STORAGE_KEYS.FAVS, []);
  return (_cachedFavs = Array.isArray(parsed) ? parsed : []);
}

/**
 * Saves favorites to localStorage with deduplication
 * @param {Array<string>} arr - Array of favorite dates to save
 */
function saveFavs(arr) {
  if (!Array.isArray(arr)) return;
  const deduped = Array.from(new Set(arr)).sort();
  _cachedFavs = deduped;
  if (!STORAGE.set(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(deduped))) {
    showNotification('Favorieten konden niet worden opgeslagen.', true);
  }
}

/**
 * Invalidates the favorites cache (forces reload from localStorage)
 */
function invalidateFavsCache() { _cachedFavs = null; }

// ========================================
// TOOLBAR POSITIONING & DRAGGING
// ========================================

/**
 * Calculate optimal toolbar position (centered between logo and comic)
 * @param {HTMLElement} toolbar - The toolbar element
 * @returns {Object|null} Object with {top, left} in pixels, or null if can't calculate
 */
function calculateOptimalToolbarPosition(toolbar) {
  if (!toolbar) return null;
  
  const logo = document.querySelector('.logo');
  const comic = document.getElementById('comic');
  
  if (!logo || !comic) return null;
  
  const logoRect = logo.getBoundingClientRect();
  const comicRect = comic.getBoundingClientRect();
  const toolbarHeight = toolbar.offsetHeight;
  const toolbarWidth = toolbar.offsetWidth;
  
  // Calculate vertical position (centered between logo bottom and comic top)
  const logoBottom = logoRect.bottom;
  const comicTop = comicRect.top;
  const availableSpace = comicTop - logoBottom;
  const centeredTop = logoBottom + Math.max(15, (availableSpace - toolbarHeight) / 2);
  
  // Calculate horizontal position (centered in viewport)
  const viewportWidth = window.innerWidth;
  const centeredLeft = (viewportWidth - toolbarWidth) / 2;
  
  return { top: centeredTop, left: centeredLeft };
}

/**
 * Check if toolbar position is within snap zone of optimal position
 * @param {number} top - Current top position
 * @param {number} left - Current left position (unused now since toolbar is always centered)
 * @param {HTMLElement} toolbar - The toolbar element
 * @returns {boolean} True if within snap zone
 */
function isInSnapZone(top, left, toolbar) {
  const optimalPos = calculateOptimalToolbarPosition(toolbar);
  if (!optimalPos) return false;
  
  const verticalDistance = Math.abs(top - optimalPos.top);
  
  // Only check vertical distance since toolbar is always horizontally centered
  return verticalDistance < CONFIG.SNAP_THRESHOLD;
}

/**
 * Keeps main toolbar within viewport bounds on resize/orientation changes
 * Repositions if no saved position exists to keep it centered
 */
function clampMainToolbarInView() {
  const toolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
  if (!toolbar) return;
  
  // Check if toolbar is in optimal position mode
  const isOptimalMode = STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_OPTIMAL) === 'true';
  
  if (isOptimalMode) {
    // Toolbar is in optimal mode - recalculate centered position on resize
    const optimalPos = calculateOptimalToolbarPosition(toolbar);
    if (optimalPos) {
      toolbar.style.top = optimalPos.top + 'px';
      toolbar.style.left = optimalPos.left + 'px';
      toolbar.style.transform = 'none';
      // Update saved position to maintain optimal state
      storeToolbarPosition(optimalPos.top, optimalPos.left, toolbar);
    }
    return;
  }
  
  // Check if user has saved a custom position
  const savedPosRaw = STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_POS);
  const hasSavedPosition = savedPosRaw && savedPosRaw !== 'null';
  
  if (!hasSavedPosition) {
    // No saved position - recenter between logo and comic on resize
    positionToolbarCentered(toolbar);
    return;
  }
  
  // User has saved position - clamp within bounds and adjust for responsive width
  const hasExplicitPosition = toolbar.style.top && toolbar.style.left;
  if (!hasExplicitPosition) return;
  
  // Wait for CSS to apply width changes from media queries
  requestAnimationFrame(() => {
    const rect = toolbar.getBoundingClientRect();
    let top = parseFloat(toolbar.style.top);
    let left = parseFloat(toolbar.style.left);
    const toolbarWidth = toolbar.offsetWidth;
    const viewportWidth = window.innerWidth;
    
    // Calculate proper boundaries with margins
    const leftMargin = viewportWidth <= 480 ? 8 : (viewportWidth <= 768 ? 10 : 20);
    const minLeft = leftMargin;
    const maxLeft = viewportWidth - toolbarWidth - leftMargin;
    const maxTop = window.innerHeight - rect.height;
    let changed = false;
    
    // Vertical clamping
    if (top < 0) { top = 0; changed = true; }
    if (top > maxTop) { top = Math.max(0, maxTop); changed = true; }
    
    // Horizontal clamping with proper margins
    if (left < minLeft) { 
      left = minLeft;
      changed = true; 
    }
    if (left > maxLeft) { 
      left = Math.max(minLeft, maxLeft);
      changed = true; 
    }
    
    // If toolbar width caused it to extend beyond viewport, recenter it
    if (left + toolbarWidth > viewportWidth - leftMargin) {
      left = (viewportWidth - toolbarWidth) / 2;
      changed = true;
    }
    
    if (changed) {
      toolbar.style.left = left + 'px';
      toolbar.style.top = top + 'px';
      storeToolbarPosition(top, left, toolbar);
    }
  });
}

/**
 * Generic draggable element maker - snap/persist stay in the app, pointer math lives in toolbar.js
 * @param {HTMLElement} element - Element to make draggable
 * @param {HTMLElement} dragHandle - Element that triggers dragging (usually header)
 * @param {string} storageKey - localStorage key for saving position
 * @param {Function} onDragStart - Optional callback when drag starts
 * @param {Function} onDragEnd - Optional callback when drag ends
 */
function makeDraggable(element, dragHandle, storageKey, onDragStart = null, onDragEnd = null) {
  TOOLBAR.makeDraggable(element, dragHandle, {
    keepHorizontallyCentered: storageKey === CONFIG.STORAGE_KEYS.TOOLBAR_POS,
    onDragStart,
    onDragEnd,
    trySnap(numericTop, numericLeft, el) {
      if (storageKey !== CONFIG.STORAGE_KEYS.TOOLBAR_POS) return null;
      if (isInSnapZone(numericTop, numericLeft, el)) {
        const optimalPos = calculateOptimalToolbarPosition(el);
        if (optimalPos) {
          el.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
          el.style.top = optimalPos.top + 'px';
          el.style.left = optimalPos.left + 'px';
          el.style.transform = 'none';
          try {
            STORAGE.set(CONFIG.STORAGE_KEYS.TOOLBAR_OPTIMAL, 'true');
          } catch (_) {}
          setTimeout(() => { el.style.transition = ''; }, 300);
          return optimalPos;
        }
      }
      try {
        STORAGE.remove(CONFIG.STORAGE_KEYS.TOOLBAR_OPTIMAL);
      } catch (_) {}
      return null;
    },
    persistPosition(numericTop, numericLeft, el) {
      if (storageKey === CONFIG.STORAGE_KEYS.TOOLBAR_POS) {
        const comic = document.getElementById('comic');
        const settingsPanel = document.getElementById('settingsDIV');
        let belowComic = false;
        let comicGap;
        if (comic) {
          const comicRect = comic.getBoundingClientRect();
          belowComic = numericTop > comicRect.bottom;
          if (belowComic) {
            comicGap = Math.max(15, numericTop - comicRect.bottom);
          }
        }

        let belowSettings = false;
        let settingsGap;
        if (settingsPanel && settingsPanel.classList.contains('visible')) {
          const settingsRect = settingsPanel.getBoundingClientRect();
          belowSettings = numericTop > settingsRect.bottom + 5;
          if (belowSettings) {
            settingsGap = Math.max(15, numericTop - settingsRect.bottom);
          }
        }

        storeToolbarPosition(numericTop, numericLeft, el, {
          belowComic,
          offsetFromComic: comicGap ?? null,
          belowSettings,
          offsetFromSettings: settingsGap ?? null
        });
        return;
      }

      try {
        STORAGE.set(storageKey, JSON.stringify({ top: numericTop, left: numericLeft }));
      } catch (_) {}
    }
  });
}

// ========================================
// SHARING FUNCTIONALITY
// ========================================

/**
 * Shares the current comic using Web Share API with extensive fallbacks
 * Handles image sharing, text fallbacks, and clipboard copying
 * @returns {Promise<void>}
 */
async function Share() {
  if (!pictureUrl) {
    alert('Sorry, er is geen strip beschikbaar om te delen.');
    return;
  }

  const shareText = `Bekijk deze DirkJan-strip van ${formattedDate}!`;
  const shareUrl = new URL('./', window.location.href).href;
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (!navigator.share) {
    fallbackShare(shareText, shareUrl);
    return;
  }

  const originalShareButton = document.getElementById('share');
  if (originalShareButton) {
    originalShareButton.style.opacity = '0.6';
    originalShareButton.style.pointerEvents = 'none';
  }

  try {
    await shareWithImage(shareText, shareUrl);
  } catch (error) {
    // If user cancelled the share dialog, just return
    if (error.name === 'AbortError') return;
    if (isAndroid) {
      try {
        const androidShareText = `DirkJan-strip van ${formattedDate}\n\nAfbeelding: ${pictureUrl}\n\nApp: ${shareUrl}`;
        
        try {
          await navigator.share({
            title: 'DirkJan-stripafbeelding',
            text: androidShareText
          });
          return;
        } catch (error) {
          // If user cancelled, stop trying
          if (error.name === 'AbortError') return;
          // Try next method
        }
        
        try {
          await navigator.share({
            title: 'DirkJan-strip',
            text: `Stripafbeelding: ${pictureUrl}`,
            url: shareUrl
          });
          return;
        } catch (error) {
          // If user cancelled, stop trying
          if (error.name === 'AbortError') return;
          // Try next method
        }
        
        await navigator.share({
          title: 'DirkJan-strip',
          text: `${shareText}\n\nStripafbeelding: ${pictureUrl}\n\nApp: ${shareUrl}`
        });
      } catch (androidError) {
        // Only show fallback if it wasn't a user cancellation
        if (androidError.name !== 'AbortError') {
          fallbackShare(shareText, shareUrl);
        }
      }
    } else {
      try {
        await navigator.share({
          title: 'DirkJan-strip',
          text: `${shareText}\n\nBekijk de stripafbeelding: ${pictureUrl}`,
          url: shareUrl
        });
      } catch (textError) {
        // Only show fallback if it wasn't a user cancellation
        if (textError.name !== 'AbortError') {
          fallbackShare(shareText, shareUrl);
        }
      }
    }
  } finally {
    if (originalShareButton) {
      originalShareButton.style.opacity = '';
      originalShareButton.style.pointerEvents = '';
    }
  }
}

/**
 * Attempts to share comic with image attachment
 * Tries multiple CORS proxies to fetch the image
 * @param {string} shareText - Text to share
 * @param {string} shareUrl - URL to share
 * @returns {Promise<void>}
 * @throws {Error} If image sharing is not supported or fails
 */
async function shareWithImage(shareText, shareUrl) {
  // Safe feature detection since some browsers throw for canShare with files param
  const fileShareSupported = (() => {
    try {
      return !!navigator.canShare && navigator.canShare({ files: [new File([], 't')] });
    } catch (_) { return false; }
  })();
  if (!fileShareSupported) throw new Error('File sharing not supported');

  const tryFetch = async (baseUrl, timeoutMs) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(baseUrl, { mode: 'cors', headers: { Accept: 'image/*' }, signal: controller.signal });
      return resp;
    } finally { clearTimeout(t); }
  };

  // Build URL attempts using the intelligent proxy selection
  // Try proxies in order based on recent success
  const attempts = [];
  
  // Add proxies in priority order (starting with last working one)
  for (let i = 0; i < CONFIG.CORS_PROXIES.length; i++) {
    const proxyIndex = (workingProxyIndex + i) % CONFIG.CORS_PROXIES.length;
    attempts.push(`${CONFIG.CORS_PROXIES[proxyIndex]}${encodeURIComponent(pictureUrl)}`);
  }
  
  // Add direct URL as final fallback
  attempts.push(pictureUrl);

  let blob = null;
  for (const url of attempts) {
    try {
      const r = await tryFetch(url, CONFIG.IMAGE_FETCH_TIMEOUT);
      if (!r.ok) continue;
      const b = await r.blob();
      if (b.size < CONFIG.MIN_IMAGE_SIZE) continue; // Ensure valid image size
      blob = b; break;
    } catch (err) { /* Try next URL */ }
  }
  if (!blob) throw new Error('Failed to fetch image blob');

  // Ensure JPEG for widest support
  let finalFile;
  if (!/jpe?g/i.test(blob.type)) {
    finalFile = await new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob(jBlob => {
          if (!jBlob) return reject(new Error('JPEG conversion failed'));
          resolve(new File([jBlob], `dirkjan-comic-${formattedDate}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image load for conversion failed'));
      };
      img.src = objectUrl;
    });
  } else {
    finalFile = new File([blob], `dirkjan-comic-${formattedDate}.jpg`, { type: 'image/jpeg' });
  }

  // Share prioritizing file only (best chance some Android shells actually attach the image)
  const isAndroid = /Android/i.test(navigator.userAgent);
  const shareVariants = isAndroid ? [
    { files: [finalFile] },
    { title: 'DirkJan-strip', files: [finalFile] },
    { title: 'DirkJan-strip', text: shareText, files: [finalFile] }
  ] : [
    { title: 'DirkJan-strip', text: shareText, files: [finalFile] }
  ];

  for (const payload of shareVariants) {
    try {
      if (navigator.canShare && !navigator.canShare({ files: payload.files })) {
        continue;
      }
      await navigator.share(payload);
      return;
    } catch (err) {
      // If user cancelled, re-throw to stop all attempts
      if (err.name === 'AbortError') throw err;
      // Try next variant
    }
  }
  throw new Error('All image share variants failed');
}

/**
 * Fallback share method using clipboard
 * @param {string} text - Share text
 * @param {string} url - Share URL
 */
function fallbackShare(text, url) {
	// Try to copy to clipboard with image URL included
	const shareContent = `${text}\n${url}\n\nStripafbeelding: ${pictureUrl}`;
	
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(shareContent).then(() => {
			alert('Link en afbeeldings-URL gekopieerd naar klembord!');
		}).catch(() => {
			// Final fallback - show the content to copy manually
			showShareDialog(shareContent);
		});
	} else {
		// Older browsers - show the content to copy manually
		showShareDialog(shareContent);
	}
}

/**
 * Shows a dialog for manual sharing
 * @param {string} content - Content to share
 */
function showShareDialog(content) {
	const userCopied = prompt('Kopieer deze tekst om de strip te delen:\n\n(Tip: Selecteer alles met Ctrl+A, kopieer met Ctrl+C)', content);
	if (userCopied !== null) {
		alert('Bedankt voor het delen van DirkJan!');
	}
}

// ========================================
// INITIALIZATION & NAVIGATION
// ========================================

/**
 * Checks whether DirkJan publishes a comic for the given date
 * @param {Date} dateValue - Date to check
 * @returns {boolean} True for comic dates, false for Sundays
 */
const {
  getCurrentDate,
  parseLocalDate,
  isComicPublishDate,
  moveToComicPublishDate,
  getStartupComicDate,
  getLatestComicCandidateDate,
  clampToLatestComicCandidate
} = DATE_UTILS;

/**
 * Gets the configured startup mode, migrating older settings when present
 * @returns {'today'|'latest'|'last'} Startup mode
 */
function getStartupMode() {
  const storedMode = STORAGE.get(CONFIG.STORAGE_KEYS.START_MODE);
  if (['today', 'latest', 'last'].includes(storedMode)) return storedMode;

  if (STORAGE.get(CONFIG.STORAGE_KEYS.START_LATEST) === 'true') return 'latest';
  if (STORAGE.get(CONFIG.STORAGE_KEYS.LAST_DATE) === 'true') return 'last';

  return 'today';
}

/**
 * Finds the latest available comic by starting at startDate and going backwards
 * @param {Date} startDate - The date to start searching from
 * @param {Date} minDate - The minimum date to search back to (today)
 * @returns {Promise<Date>} The date of the latest available comic
 */
async function findLatestAvailableComic(startDate, minDate) {
  let testDate = new Date(startDate);
  const minTime = minDate.getTime();
  
  while (testDate.getTime() >= minTime) {
    // Skip Sundays (no comic dates)
    if (!isComicPublishDate(testDate)) {
      testDate = moveToComicPublishDate(testDate, -1);
      continue;
    }
    
    // Format the date for the URL
    const d = testDate.getDate();
    const m = testDate.getMonth() + 1;
    const y = testDate.getFullYear();
    const formattedMonth = ("0" + m).slice(-2);
    const formattedDay = ("0" + d).slice(-2);
    const dateStr = `${y}${formattedMonth}${formattedDay}`;
    
    try {
      const comicData = await fetchComicData(dateStr, `https://dirkjan.nl/cartoon/${dateStr}`);
      if (!comicData.notFound && comicData.imageUrl) {
        latestAvailableDate = new Date(testDate);
        updateDatePickerMax(latestAvailableDate);
        return testDate;
      }
    } catch (error) {
      // Network error, continue to previous day
    }
    
    // Go back one day
    testDate.setDate(testDate.getDate() - 1);
  }
  
  // Fallback to minDate if nothing found
  latestAvailableDate = new Date(minDate);
  updateDatePickerMax(latestAvailableDate);
  return minDate;
}

/**
 * Finds the latest available comic in the current prepublication window
 * @returns {Promise<Date>} The latest available comic date
 */
function discoverLatestAvailableComic() {
  const latestCandidate = getLatestComicCandidateDate();
  const searchMinDate = new Date(latestCandidate);
  searchMinDate.setDate(searchMinDate.getDate() - 7);
  return findLatestAvailableComic(latestCandidate, searchMinDate);
}

/**
 * Updates the max attribute on all date pickers
 * @param {Date} maxDateValue - The maximum date to allow
 */
function updateDatePickerMax(maxDateValue) {
  const d = maxDateValue.getDate();
  const m = maxDateValue.getMonth() + 1;
  const y = maxDateValue.getFullYear();
  const formattedMonth = ("0" + m).slice(-2);
  const formattedDay = ("0" + d).slice(-2);
  const formattedMax = `${y}-${formattedMonth}-${formattedDay}`;
  
  const mainPicker = document.getElementById("DatePicker");
  if (mainPicker) mainPicker.setAttribute("max", formattedMax);
  
  const rotatedPicker = document.getElementById("rotated-DatePicker");
  if (rotatedPicker) rotatedPicker.setAttribute("max", formattedMax);
}

/**
 * Initializes the application on page load
 * Sets up initial date, favorites, and displays the first comic
 */  
function onLoad()
{
  // Check URL parameters for app shortcuts
  const urlParams = new URLSearchParams(window.location.search);
  
  currentselectedDate = getStartupComicDate();
  const datePicker = document.getElementById("DatePicker");
  if (datePicker) {
    const dateParts = UTILS.formatDate(currentselectedDate);
    datePicker.value = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
  }
 
  const favs = loadFavs();
  const showFavsEl = document.getElementById("showfavs");

  if (favs.length === 0) {
    showFavsEl.checked = false;
    showFavsEl.disabled = true;
  } else if (showFavsEl.checked) {
    currentselectedDate = parseLocalDate(favs[0]) || currentselectedDate;
  }
 
 maxDate = getCurrentDate();

  currentselectedDate = getStartupComicDate(currentselectedDate);

  // Advance maxDate to the next Friday publication window
  maxDate = getLatestComicCandidateDate(maxDate);

  const maxDateParts = UTILS.formatDate(maxDate);
  
  const formattedmaxDate = maxDateParts.year+'-'+maxDateParts.month+'-'+maxDateParts.day;
  document.getElementById("DatePicker").setAttribute("max", formattedmaxDate);
  
  const startupMode = getStartupMode();
  const showFavsChecked = document.getElementById("showfavs").checked;
  const openRandomShortcut = urlParams.get('random') === 'true' && !showFavsChecked;

  if (openRandomShortcut) {
    currentselectedDate = pickRandomComicDate();
    CompareDates();
    DisplayComic('morph', 'random');
    discoverLatestAvailableComic().then(() => CompareDates()).catch(() => {});
    return;
  }

  if(startupMode === 'latest' && !showFavsChecked)
	{
    discoverLatestAvailableComic().then(latestDate => {
      currentselectedDate = latestDate;
      CompareDates();
      DisplayComic(null, 'nearest');
    }).catch(() => {
      CompareDates();
      DisplayComic(null, 'nearest');
    });
    return;
	}

  if(startupMode === 'last')   
	{
    const storedLastComic = STORAGE.get(CONFIG.STORAGE_KEYS.LAST_COMIC);
		if(!showFavsChecked && storedLastComic !== null)
		{
			currentselectedDate = clampToLatestComicCandidate(storedLastComic);
		}
    CompareDates();
    DisplayComic();

    discoverLatestAvailableComic().then(() => {
      if (document.getElementById("showfavs").checked) return;
      CompareDates();
    }).catch(() => {});
	} else {
    if (!showFavsChecked) {
      currentselectedDate = getStartupComicDate();
    }
    CompareDates();
    DisplayComic();

    discoverLatestAvailableComic().then(() => {
      CompareDates();
    }).catch(() => {});
  }
}

// ========================================
// SHUFFLE MODE
// ========================================

/**
 * Returns true when the "Shuffle modus" setting is enabled
 * @returns {boolean}
 */
function isShuffleEnabled() {
  const checkbox = document.getElementById("shuffle");
  return !!(checkbox && checkbox.checked);
}

/**
 * Picks a random valid comic date within the available range
 * @returns {Date} A normalized comic publish date
 */
function pickRandomComicDate() {
  const start = new Date(comicstartDate);
  const end = latestAvailableDate ? new Date(latestAvailableDate) : getCurrentDate();
  const randomDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return moveToComicPublishDate(randomDate, -1);
}

/**
 * Resets the shuffle navigation history
 */
function resetShuffleHistory() {
  shuffleBackStack.length = 0;
  shuffleForwardStack.length = 0;
}

// ========================================
// DARK MODE
// ========================================

/** Theme color meta values for the browser UI */
const THEME_COLORS = Object.freeze({ LIGHT: '#000000', DARK: '#000000' });

/** Sun/moon icons (inner SVG markup) for the dark mode toggle */
const DARK_MODE_ICONS = Object.freeze({
  MOON: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  SUN: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
});

/**
 * Determines whether dark mode should be active
 * Uses the saved preference, falling back to the OS setting
 * @returns {boolean}
 */
function getPreferredDarkMode() {
  const stored = STORAGE.get(CONFIG.STORAGE_KEYS.DARK_MODE);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Updates the browser theme-color meta tags
 * @param {boolean} isDark
 */
function updateThemeColor(isDark) {
  const color = isDark ? THEME_COLORS.DARK : THEME_COLORS.LIGHT;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute('content', color);
}

/**
 * Updates the dark mode toggle button's visual + ARIA state
 * @param {boolean} isDark
 */
function setDarkModeControlState(isDark) {
  const button = document.getElementById("darkmode");
  if (!button) return;
  button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  const label = isDark ? 'Lichte modus' : 'Donkere modus';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  const svg = button.querySelector('svg');
  if (svg) svg.innerHTML = isDark ? DARK_MODE_ICONS.SUN : DARK_MODE_ICONS.MOON;
}

/**
 * Applies the dark/light theme to the document
 * @param {boolean} isDark
 */
function applyDarkMode(isDark) {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  updateThemeColor(isDark);
  setDarkModeControlState(isDark);
}

/**
 * Toggles dark mode on user request and persists the choice
 */
function ToggleDarkMode() {
  const isDark = document.documentElement.dataset.theme !== 'dark';
  STORAGE.set(CONFIG.STORAGE_KEYS.DARK_MODE, isDark ? "true" : "false");
  applyDarkMode(isDark);
}

/**
 * Initializes dark mode on load and follows the OS setting
 * until the user makes an explicit choice
 */
function initializeDarkMode() {
  applyDarkMode(getPreferredDarkMode());
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      if (STORAGE.get(CONFIG.STORAGE_KEYS.DARK_MODE) === null) {
        applyDarkMode(e.matches);
      }
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }
}

// ========================================
// NOTIFICATION TOAST
// ========================================

let _notificationTimer = null;

/**
 * Shows a brief toast notification
 * @param {string} message - Text to display
 * @param {boolean} [isError=false] - Whether to style as an error
 */
function showNotification(message, isError = false) {
  let toast = document.getElementById("notificationToast");
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'notificationToast';
    toast.className = 'notification-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', !!isError);
  // Force reflow so the transition runs even on rapid successive calls
  void toast.offsetWidth;
  toast.classList.add('show');
  if (_notificationTimer) clearTimeout(_notificationTimer);
  _notificationTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========================================
// FAVORITES IMPORT / EXPORT
// ========================================

/**
 * Enables/disables the export button based on whether favorites exist
 */
function updateExportButtonState() {
  const exportBtn = document.getElementById("exportFavs");
  if (exportBtn) exportBtn.disabled = loadFavs().length === 0;
}

/**
 * Exports favorites to a downloadable JSON file
 */
function exportFavorites() {
  const favs = loadFavs();
  if (!favs.length) {
    showNotification('Geen favorieten om te exporteren.', true);
    return;
  }
  const payload = {
    favorites: favs,
    exportDate: new Date().toISOString(),
    version: 1
  };
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dirkjan-favorieten.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification(favs.length + ' favorieten geëxporteerd.');
  } catch (error) {
    console.error('Export failed:', error);
    showNotification('Exporteren mislukt.', true);
  }
}

/**
 * Imports favorites from a user-selected JSON file
 * @param {Event} event - The file input change event
 */
function importFavorites(event) {
  const input = event && event.target;
  const file = input && input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let imported;
    const parsed = UTILS.safeJSONParse(e.target.result, null);
    if (parsed && Array.isArray(parsed.favorites)) {
      imported = parsed.favorites;
    } else if (Array.isArray(parsed)) {
      imported = parsed;
    } else {
      showNotification('Ongeldig favorietenbestand.', true);
      input.value = '';
      return;
    }
    // Keep only valid date strings (YYYY-MM-DD) and de-duplicate against existing
    const existing = loadFavs();
    const valid = imported.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
    const merged = existing.slice();
    let added = 0;
    valid.forEach(d => {
      if (!merged.includes(d)) {
        merged.push(d);
        added++;
      }
    });
    if (added === 0) {
      showNotification('Alle favorieten bestaan al.');
      input.value = '';
      return;
    }
    merged.sort();
    saveFavs(merged);
    updateExportButtonState();
    const showFavsCheckbox = document.getElementById("showfavs");
    if (showFavsCheckbox) showFavsCheckbox.disabled = merged.length === 0;
    CompareDates();
    showNotification(added + (added === 1 ? ' favoriet geïmporteerd.' : ' favorieten geïmporteerd.'));
    input.value = '';
  };
  reader.onerror = function() {
    showNotification('Bestand lezen mislukt.', true);
    input.value = '';
  };
  reader.readAsText(file);
}

// ========================================
// SERVICE WORKER VERSION DISPLAY
// ========================================

/**
 * Fetches and displays the active service worker cache version in Settings
 */
function displayServiceWorkerVersion() {
  const display = document.getElementById("swVersionDisplay");
  const controller = navigator.serviceWorker?.controller;
  if (!display) return;
  if (typeof controller?.postMessage !== 'function') {
    display.textContent = 'Versie: laden…';
    return;
  }

  const channel = new MessageChannel();
  const timeoutId = setTimeout(() => {
    display.textContent = 'Versie: onbekend';
  }, 2000);
  channel.port1.onmessage = event => {
    clearTimeout(timeoutId);
    display.textContent = event.data?.version ? `Versie: ${event.data.version}` : 'Versie: onbekend';
  };
  controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
}

/**
 * Navigates to the previous comic
 * Handles both normal and favorites-only mode
 */
function PreviousClick()
{
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    const idx = favs.indexOf(formattedDate);
    if (idx > 0) {
      currentselectedDate = parseLocalDate(favs[idx - 1]) || currentselectedDate;
    }
  } else if (isShuffleEnabled() && shuffleBackStack.length) {
    // Shuffle mode: step back through previously seen random comics
    shuffleForwardStack.push(formattedDate);
    currentselectedDate = parseLocalDate(shuffleBackStack.pop()) || currentselectedDate;
  } else {
    currentselectedDate.setDate(currentselectedDate.getDate() - 1);
    currentselectedDate = moveToComicPublishDate(currentselectedDate, -1);
  }
  CompareDates();
  DisplayComic('prev');
} 

/**
 * Navigates to the next comic
 * Handles both normal and favorites-only mode
 */
function NextClick()
{
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    const idx = favs.indexOf(formattedDate);
    if (idx > -1 && idx < favs.length - 1) {
      currentselectedDate = parseLocalDate(favs[idx + 1]) || currentselectedDate;
    }
  } else if (isShuffleEnabled()) {
    // Shuffle mode: step forward through history, or draw a new random comic
    if (shuffleForwardStack.length) {
      shuffleBackStack.push(formattedDate);
      currentselectedDate = parseLocalDate(shuffleForwardStack.pop()) || currentselectedDate;
    } else {
      shuffleBackStack.push(formattedDate);
      currentselectedDate = pickRandomComicDate();
    }
  } else {
    currentselectedDate.setDate(currentselectedDate.getDate() + 1);
    currentselectedDate = moveToComicPublishDate(currentselectedDate, 1);
  }
  CompareDates();
  DisplayComic('next');
}

/**
 * Navigates to the first comic
 * In favorites mode, goes to first favorite
 */
function FirstClick()
{
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    if (favs.length) currentselectedDate = parseLocalDate(favs[0]) || currentselectedDate;
  } else {
    currentselectedDate = new Date(comicstartDate);
  }
  CompareDates();
  DisplayComic('morph', 'nearest');
}

/**
 * Navigates to the latest available comic
 * In favorites mode, goes to last favorite
 */
function CurrentClick()
{
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    const favslength = favs.length - 1;
    if (favslength >= 0) currentselectedDate = parseLocalDate(favs[favslength]) || currentselectedDate;
  } else {
    if (!latestAvailableDate) {
      discoverLatestAvailableComic().then(latestDate => {
        currentselectedDate = latestDate;
        CompareDates();
        DisplayComic('morph', 'nearest');
      });
      return;
    }
    // Go to the latest available comic date without falling into future dates
    currentselectedDate = new Date(latestAvailableDate);
  }
  CompareDates();
  DisplayComic('morph', 'nearest');
}

/**
 * Navigates to a random comic
 * In favorites mode, picks random favorite
 */
function RandomClick()
{
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    if (favs.length) {
      currentselectedDate = parseLocalDate(favs[Math.floor(Math.random() * favs.length)]) || currentselectedDate;
    }
  } else {
    if (isShuffleEnabled() && formattedDate) {
      // Remember the current comic so the user can step back through the shuffle
      shuffleBackStack.push(formattedDate);
      shuffleForwardStack.length = 0;
    }
    currentselectedDate = pickRandomComicDate();
  }
  CompareDates();
  DisplayComic('morph', 'random');
}

/**
 * Handles date picker changes
 * Syncs both main and rotated date pickers
 */
function DateChange(event)
{
  // Get the date from either the main or rotated date picker
  const mainDatePicker = document.getElementById('DatePicker');
  const rotatedDatePicker = document.getElementById('rotated-DatePicker');
  const sourcePicker = event?.target?.id === 'rotated-DatePicker' || (isFullscreenActive() && event?.target === rotatedDatePicker)
    ? rotatedDatePicker
    : mainDatePicker;

  let selectedDate;
  if (sourcePicker && sourcePicker.value) {
    selectedDate = sourcePicker.value;
    if (sourcePicker === rotatedDatePicker && mainDatePicker) {
      mainDatePicker.value = selectedDate;
    } else if (sourcePicker === mainDatePicker && rotatedDatePicker) {
      rotatedDatePicker.value = selectedDate;
    }
  }
  
  if (selectedDate) {
    currentselectedDate = clampToLatestComicCandidate(selectedDate);
    CompareDates();
    DisplayComic('morph', 'nearest');
  }
}

const { extractComicImageUrl, normalizeComicImageUrl } = COMIC_LOADER;

/**
 * Fetches a comic image through the controlled proxy and returns a local blob URL.
 * @param {string} imageUrl - Trusted DirkJan image URL
 * @param {AbortSignal|null} signal - Optional navigation cancellation signal
 * @returns {Promise<string>} Browser-local URL containing the proxied image bytes
 */
async function createComicObjectUrl(imageUrl, signal = null) {
  return COMIC_LOADER.createComicObjectUrl(imageUrl, {
    fetchWithFallback,
    minImageSize: CONFIG.MIN_IMAGE_SIZE,
    signal
  });
}

async function fetchComicData(date, pageUrl, signal) {
  return COMIC_LOADER.fetchComicData(date, pageUrl, signal, {
    metadataEndpoint: CONFIG.COMIC_METADATA_ENDPOINT,
    fetchTimeout: CONFIG.FETCH_TIMEOUT,
    fetchWithFallback
  });
}

/**
 * Fetches and displays the current comic
 * Handles loading states, errors, animations, and updates UI
 * @param {string} direction - Optional: 'next', 'prev', or 'morph' for transition animation
 * @param {string} notFoundBehavior - 'nearest' to walk backward, 'random' for random retries
 */
function DisplayComic(direction = null, notFoundBehavior = 'nearest')
{
  // Prevent overlapping animations - if animating, skip animation for this call
  if (isAnimating && direction) {
    direction = null; // Fall back to no animation if one is in progress
  }
  
  // Capture animation type at start to avoid race conditions in 404 handler
  const capturedAnimationType = direction;

  const handleMissingComic = (comicImg) => {
    if (comicImg) comicImg.classList.remove('loading');
    isAnimating = false;
    notFoundRetries++;

    if (notFoundRetries > 10) {
      notFoundRetries = 0;
      if (comicImg) comicImg.alt = "Geen strip gevonden voor deze datum.";
      setComicStatus('unavailable', 'Geen strip gevonden. Probeer opnieuw of ga naar de nieuwste strip.');
      return;
    }

    if (notFoundBehavior === 'random') {
      const start = new Date(comicstartDate);
      const end = getCurrentDate();
      currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
      CompareDates();
      DisplayComic('morph', 'random');
      return;
    }

    if (capturedAnimationType === 'next') {
      NextClick();
      return;
    }

    if (capturedAnimationType === 'prev') {
      PreviousClick();
      return;
    }

    const startDate = new Date(comicstartDate);
    currentselectedDate.setDate(currentselectedDate.getDate() - 1);
    currentselectedDate = moveToComicPublishDate(currentselectedDate, -1);

    if (currentselectedDate < startDate) {
      notFoundRetries = 0;
      if (comicImg) comicImg.alt = "Geen strip gevonden voor deze datum.";
      setComicStatus('unavailable', 'Geen eerdere strip gevonden. Ga naar de nieuwste strip.');
      return;
    }

    CompareDates();
    DisplayComic('morph', 'nearest');
  };
  
  try {
    const dateParts = UTILS.formatDate(currentselectedDate);

  formattedDate = dateParts.year+"-"+dateParts.month+"-"+dateParts.day;
  formattedComicDate = dateParts.year+dateParts.month+dateParts.day;
  document.getElementById('DatePicker').value = formattedDate;
  
  // Also sync the rotated date picker if it exists
  const rotatedDatePicker = document.getElementById('rotated-DatePicker');
  if (rotatedDatePicker) {
    rotatedDatePicker.value = formattedDate;
  }
  
  const url = `https://dirkjan.nl/cartoon/${formattedComicDate}`;

  // Get comic elements
  const comicImg = document.getElementById("comic");
  const wrapper = document.getElementById('comic-wrapper');
  const rotatedComic = isFullscreenActive() ? document.getElementById('rotated-comic') : null;
  comicImg.alt = `DirkJan strip van ${dateParts.day}-${dateParts.month}-${dateParts.year} laden`;
  setComicStatus(direction ? 'idle' : 'loading', direction ? '' : 'Strip laden...');
  
  // Show loading state only if no animation (first load or error recovery)
  if (!direction) {
    comicImg.classList.add('loading');
    comicImg.classList.remove('loaded');
  }
  
  // Cancel any previous in-flight fetch to prevent stale results from overwriting
  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();
  const fetchSignal = currentFetchController.signal;
  
  fetchComicData(formattedComicDate, url, fetchSignal)
    .then(function(comicData)
	{
      if (fetchSignal.aborted) throw new DOMException('Aborted', 'AbortError');
      notFound = comicData.notFound;
      
      if (!notFound)
      {
        notFoundRetries = 0; // Reset 404 retry counter on success
        // Extract image URL using multiple methods for reliability
        pictureUrl = comicData.imageUrl;
        
        if (!pictureUrl) {
          TELEMETRY.report('comic_parse_failed', 'image_missing');
          throw new Error('Could not extract comic image URL from page');
        }
        // Store as YYYY-MM-DD for stable, locale-independent parsing
        STORAGE.set(CONFIG.STORAGE_KEYS.LAST_COMIC, formattedDate);

        return COMIC_LOADER.resolveDisplayUrl(
          formattedDate,
          pictureUrl,
          getComicBlobCache(),
          fetchSignal,
          { fetchWithFallback, minImageSize: CONFIG.MIN_IMAGE_SIZE }
        );
      }

      return null;
    })
    .then(function(displayUrl)
	{
      if (fetchSignal.aborted) {
        if (displayUrl) URL.revokeObjectURL(displayUrl);
        throw new DOMException('Aborted', 'AbortError');
      }

      if (displayUrl)
      {
        const previousComicObjectUrl = currentComicObjectUrl;
        currentComicObjectUrl = displayUrl;
        
        const animateTransition = () => {
          if (comicImg.src && comicImg.src !== window.location.href && direction) {
            isAnimating = true;
          }
          return COMIC_ANIMATION.animateTransition(comicImg, displayUrl, direction, {
            container: wrapper
          });
        };
        
        // Run animation
        animateTransition().then(() => {
          isAnimating = false; // Release animation lock
          comicImg.alt = `DirkJan strip van ${dateParts.day}-${dateParts.month}-${dateParts.year} door Mark Retera`;
          comicImg.classList.remove('loading', 'slide-in-left', 'slide-in-right');
          // Only add loaded class if no animation was performed (avoids opacity flash)
          if (!direction) {
            comicImg.classList.add('loaded');
          }
          
          // Announce comic change to screen readers
          const statusEl = document.getElementById('comic-announcer');
          if (statusEl) {
            statusEl.textContent = `Strip van ${dateParts.day}-${dateParts.month}-${dateParts.year} geladen`;
          }
          setComicStatus('idle');
          
          // Also update the rotated comic if it exists (with animation)
          if (rotatedComic) {
            animateRotatedComic(rotatedComic, displayUrl, direction);
          }

          if (previousComicObjectUrl && previousComicObjectUrl !== displayUrl) {
            URL.revokeObjectURL(previousComicObjectUrl);
          }
        });
      }
      else
      {
        // Comic not found (404) - try to navigate to find a valid comic
        handleMissingComic(comicImg);
      }
    })
    .catch(function(error) {
      // Ignore aborted fetches (superseded by a newer navigation)
      if (error.name === 'AbortError') return;
      if (error.name === 'NotFoundError') {
        handleMissingComic(comicImg);
        return;
      }
      comicImg.classList.remove('loading');
      comicImg.src = ""; // Clear the image
      comicImg.alt = "Kan strip niet laden. Probeer het later opnieuw.";
      const offline = navigator.onLine === false;
      setComicStatus(
        offline ? 'offline' : 'failed',
        offline
          ? 'Je bent offline. Maak opnieuw verbinding en probeer het nog eens.'
          : 'De strip kon niet worden geladen. Probeer het opnieuw.'
      );
    });
    
  const favs = loadFavs();
  
  // Update heart icon based on favorite status
  const heartButton = document.getElementById("favheart");
  const heartSvg = heartButton ? heartButton.querySelector('svg') : null;
  
  if (favs.indexOf(formattedDate) === -1) {
    // Not a favorite - unfilled heart
    if (heartSvg) {
      heartSvg.style.fill = 'none';
      heartSvg.style.stroke = '#000000';
    }
    if (heartButton) heartButton.setAttribute('aria-pressed', 'false');
  } else {
    // Is a favorite - filled heart
    if (heartSvg) {
      heartSvg.style.fill = '#000000';
      heartSvg.style.stroke = '#000000';
    }
    if (heartButton) heartButton.setAttribute('aria-pressed', 'true');
  }
  
  if (comicImg.complete && comicImg.naturalWidth) {
    preloadAdjacentComics();
  } else {
    comicImg.addEventListener('load', () => {
      preloadAdjacentComics();
    }, { once: true });
  }
  
  } catch (error) {
    console.error('Error in DisplayComic():', error);
    const comicImg = document.getElementById("comic");
    if (comicImg) {
      comicImg.classList.remove('loading');
      comicImg.src = "";
      comicImg.alt = "Kan strip niet weergeven. Probeer het opnieuw.";
      setComicStatus('failed', 'De strip kon niet worden weergegeven. Probeer het opnieuw.');
    }
  }
}

/**
 * Animates the rotated/fullscreen comic transition
 * @param {HTMLElement} rotatedComic - The rotated comic element
 * @param {string} newSrc - The new image URL
 * @param {string} direction - 'next', 'prev', or 'morph'
 */
function animateRotatedComic(rotatedComic, newSrc, direction) {
  if (!rotatedComic || !newSrc) return;
  COMIC_ANIMATION.animateTransition(rotatedComic, newSrc, direction, {
    container: document.getElementById('fullscreen-shell') || document.body,
    outgoingClass: 'rotated-comic-outgoing',
    morphClass: 'rotated-comic-morph-outgoing',
    preserveInlineStyles: true,
    afterIncomingLoad: maximizeRotatedImage
  });
}

/**
 * Sets button disabled states (both main and rotated versions)
 * @param {Object} states - Object mapping button IDs to disabled state booleans
 * Example: {'Next': false, 'Previous': true, 'Current': true}
 */
function setButtonStates(states) {
  for (const [id, disabled] of Object.entries(states)) {
    const mainButton = document.getElementById(id);
    if (mainButton) mainButton.disabled = disabled;
    
    const rotatedButton = document.getElementById(`rotated-${id}`);
    if (rotatedButton) rotatedButton.disabled = disabled;
  }
}

/**
 * Compares current date with comic date range
 * Updates navigation button states and date pickers accordingly
 */
function CompareDates() {
  const favs = loadFavs();
  const showFavsChecked = document.getElementById("showfavs").checked;
  
  // Normalize dates for comparison
  const normalizeDate = (date) => {
    const parsed = parseLocalDate(date);
    return parsed ? parsed.getTime() : 0;
  };
  const currentTime = normalizeDate(currentselectedDate);
  
  // Handle date picker state
  const datePickers = ['DatePicker', 'rotated-DatePicker'];
  datePickers.forEach(id => {
    const picker = document.getElementById(id);
    if (picker) picker.disabled = showFavsChecked;
  });
  
  // Determine start and end dates based on mode
  const startDate = showFavsChecked && favs.length > 0 
    ? normalizeDate(favs[0]) 
    : normalizeDate(comicstartDate);
  
  // Use a discovered latest when available; otherwise avoid clamping the currently selected date.
  const endDate = showFavsChecked && favs.length > 0
    ? normalizeDate(favs[favs.length - 1])
    : latestAvailableDate
      ? normalizeDate(latestAvailableDate)
      : Math.max(normalizeDate(getStartupComicDate()), currentTime);
  
  // Calculate button states
  const buttonStates = {
    First: currentTime <= startDate,
    Previous: currentTime <= startDate,
    Next: currentTime >= endDate,
    Current: currentTime >= endDate && !showFavsChecked,
    Random: showFavsChecked && favs.length <= 1
  };
  
  // Special case: In favorites mode, if we're at the last favorite
  if (showFavsChecked && favs.length > 0) {
    const lastFavDate = normalizeDate(favs[favs.length - 1]);
    if (currentTime === lastFavDate) {
      buttonStates.Current = true;
    }
  }
  
  // Apply all button states at once
  setButtonStates(buttonStates);
  
  // Adjust current date if out of bounds
  if (currentTime < startDate) {
    const sp = UTILS.formatDate(new Date(startDate));
    currentselectedDate = new Date(Date.UTC(sp.year, sp.month - 1, sp.day, 12));
  } else if (currentTime > endDate) {
    const ep = UTILS.formatDate(new Date(endDate));
    currentselectedDate = new Date(Date.UTC(ep.year, ep.month - 1, ep.day, 12));
  }
}

// ========================================
// COMIC ROTATION & FULLSCREEN
// ========================================

// Debounce flag to prevent rapid rotation calls
let isRotating = false;

/**
 * Toggles landscape fullscreen mode for the comic
 * Handles both entering and exiting fullscreen, with swipe support
 */
function Rotate() {
  // Prevent rapid double-calls
  if (isRotating) {
    return;
  }
  
  isRotating = true; // Set flag immediately
  
  try {
    const element = document.getElementById('comic');
    
    if (!element) {
      isRotating = false;
      return;
    }
    
    if (isFullscreenActive()) {
      const shell = document.getElementById('fullscreen-shell');
    if (shell) shell.hidden = true;
    document.body.classList.remove('rotated-state');
    
    // Restore all elements with data-was-hidden attribute
    const hiddenElements = document.querySelectorAll('[data-was-hidden]');
    hiddenElements.forEach(el => {
      el.style.display = el.dataset.originalDisplay || '';
      delete el.dataset.wasHidden;
      delete el.dataset.originalDisplay;
    });
    
    // Hide toolbar immediately to prevent flash during repositioning
    const mainToolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
    if (mainToolbar) {
      mainToolbar.style.visibility = 'hidden';
    }
    
    // Make sure original comic is in normal state
    element.className = "normal";
    
    // Remove any event listeners added during rotation
    window.removeEventListener('resize', handleRotatedViewResize);
    window.removeEventListener('orientationchange', handleRotatedViewResize);
    
    // Reset rotation flag
    isRotating = false;
    
    // Restore toolbar position from localStorage after layout changes
    // Use longer delay to ensure layout is complete
    setTimeout(() => {
      const toolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
      const comic = document.getElementById('comic');
      if (toolbar && comic) {
        const savedPosRaw = STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_POS);
        const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
        
        if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
          const comicRect = comic.getBoundingClientRect();
          const settingsPanel = document.getElementById('settingsDIV');
          
          // Determine correct position based on saved flag
          const shouldBeBelow = savedPos.belowComic === true ||
            (savedPos.belowComic === undefined && (savedPos.offsetFromComic !== undefined || savedPos.top > comicRect.bottom + 10));
          let newTop, newLeft;
          
          newLeft = savedPos.left;
          
          if (shouldBeBelow) {
            const storedComicGap = Math.max(15, savedPos.offsetFromComic || 15);
            const minBelowComic = comicRect.bottom + storedComicGap;

            let targetTop = Number.isFinite(savedPos.top) ? savedPos.top : minBelowComic;
            targetTop = Math.max(targetTop, minBelowComic);

            if (settingsPanel && settingsPanel.classList.contains('visible')) {
              const settingsRect = settingsPanel.getBoundingClientRect();
              const toolbarHeight = toolbar.offsetHeight;

              let belowSettingsFlag = savedPos.belowSettings === true;
              if (!belowSettingsFlag) {
                belowSettingsFlag = savedPos.offsetFromSettings !== undefined || savedPos.top > (settingsRect.bottom + 10);
              }

              if (belowSettingsFlag) {
                const storedSettingsGap = Math.max(15, savedPos.offsetFromSettings || Math.max(savedPos.top - settingsRect.bottom, 15));
                const minBelowSettings = settingsRect.bottom + storedSettingsGap;
                targetTop = Math.max(targetTop, minBelowSettings);
              } else {
                const overlapsSettings = (targetTop + toolbarHeight > settingsRect.top) &&
                  (targetTop < settingsRect.bottom);

                if (overlapsSettings) {
                  const spaceBetween = settingsRect.top - comicRect.bottom;
                  if (spaceBetween >= toolbarHeight + 30) {
                    targetTop = comicRect.bottom + Math.max(15, storedComicGap);
                  } else {
                    targetTop = settingsRect.bottom + 15;
                  }
                } else if (targetTop > settingsRect.bottom) {
                  targetTop = Math.max(targetTop, settingsRect.bottom + 15);
                }
              }
            }

            newTop = targetTop;
          } else {
            // Toolbar should be above comic - check if saved position is still valid
            const toolbarHeight = toolbar.offsetHeight;
            const wouldOverlap = (savedPos.top + toolbarHeight > comicRect.top) && 
                                 (savedPos.top < comicRect.bottom);
            
            if (wouldOverlap) {
              // Position between logo and comic
              const logo = document.querySelector('.logo');
              if (logo) {
                const logoRect = logo.getBoundingClientRect();
                const availableSpace = comicRect.top - logoRect.bottom;
                newTop = logoRect.bottom + Math.max(15, (availableSpace - toolbarHeight) / 2);
              } else {
                newTop = savedPos.top;
              }
            } else {
              // Use saved position
              newTop = savedPos.top;
            }
          }
          
          // Clamp to viewport bounds
          const maxLeft = window.innerWidth - toolbar.offsetWidth;
          const maxTop = window.innerHeight - toolbar.offsetHeight;
          newLeft = Math.max(0, Math.min(newLeft, maxLeft));
          newTop = Math.max(0, Math.min(newTop, maxTop));
          
          // Apply position
          toolbar.style.left = newLeft + 'px';
          toolbar.style.top = newTop + 'px';

          const overrides = {};
          const finalBelowComic = newTop > comicRect.bottom;
          overrides.belowComic = finalBelowComic;
          overrides.offsetFromComic = finalBelowComic ? Math.max(15, newTop - comicRect.bottom) : null;

          if (settingsPanel && settingsPanel.classList.contains('visible')) {
            const settingsRect = settingsPanel.getBoundingClientRect();
            const finalBelowSettings = newTop > settingsRect.bottom + 5;
            overrides.belowSettings = finalBelowSettings;
            overrides.offsetFromSettings = finalBelowSettings ? Math.max(15, newTop - settingsRect.bottom) : null;
          } else {
            overrides.belowSettings = false;
            overrides.offsetFromSettings = null;
          }

          storeToolbarPosition(newTop, newLeft, toolbar, overrides);
          
          // Show toolbar after positioning
          toolbar.style.visibility = 'visible';
        }
      }
    }, 250);
    
    return;
  }
  
  // Check if element has 'normal' class (it might have multiple classes like "normal loaded")
  if (element.className.includes("normal")) {
    closeSettings(false);
    const shell = document.getElementById('fullscreen-shell');
    const overlay = document.getElementById('comic-overlay');
    const clonedComic = document.getElementById('rotated-comic');
    const fullscreenToolbar = document.getElementById('fullscreen-toolbar');
    if (!shell || !overlay || !clonedComic || !fullscreenToolbar) {
      isRotating = false;
      return;
    }

    const elementsToHideInitial = document.querySelectorAll('body > *:not(#fullscreen-shell)');
    elementsToHideInitial.forEach(el => {
      el.dataset.originalDisplay = window.getComputedStyle(el).display;
      el.dataset.wasHidden = "true";
      el.style.setProperty('display', 'none', 'important');
    });

    clonedComic.src = element.src;
    clonedComic.alt = element.alt;
    clonedComic.className = 'fullscreen-landscape';
    clonedComic.style.display = 'block';
    fullscreenToolbar.style.display = 'flex';
    shell.hidden = false;
    document.body.classList.add('rotated-state');

    bindFullscreenControls(overlay, fullscreenToolbar);
    CompareDates();
    positionFullscreenToolbar();
    window.addEventListener('resize', handleRotatedViewResize);
    window.addEventListener('orientationchange', handleRotatedViewResize);

    if (clonedComic.complete) {
      maximizeRotatedImage(clonedComic);
    } else {
      clonedComic.onload = function() {
        maximizeRotatedImage(clonedComic);
      };
    }
  }
  
  } catch (error) {
    console.error('Error in Rotate():', error);
    isRotating = false;
  } finally {
    // Reset the flag after a short delay to prevent rapid re-triggering
    setTimeout(() => {
      isRotating = false;
    }, CONFIG.ROTATION_DEBOUNCE);
  }
}

/**
 * Handles resize and orientation change in rotated view
 * Repositions comic and toolbar appropriately
 */
function bindFullscreenControls(overlay, fullscreenToolbar) {
  if (fullscreenControlsBound) return;
  fullscreenControlsBound = true;

  document.getElementById('rotated-First')?.addEventListener('click', FirstClick);
  document.getElementById('rotated-Previous')?.addEventListener('click', PreviousClick);
  document.getElementById('rotated-Random')?.addEventListener('click', RandomClick);
  document.getElementById('rotated-Next')?.addEventListener('click', NextClick);
  document.getElementById('rotated-Current')?.addEventListener('click', CurrentClick);
  const rotatedDatePicker = document.getElementById('rotated-DatePicker');
  rotatedDatePicker?.addEventListener('input', DateChange);
  rotatedDatePicker?.addEventListener('click', () => rotatedDatePicker.showPicker?.());

  fullscreenToolbar.addEventListener('click', function(e) {
    e.stopPropagation();
  });
  overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
  overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
  overlay.addEventListener('touchend', function(e) {
    handleTouchEnd(e);
    e.stopPropagation();
  }, { passive: true });
  overlay.addEventListener('click', function() {
    Rotate();
  });
}

function handleRotatedViewResize() {
  const rotatedComic = document.getElementById('rotated-comic');
  if (rotatedComic && isFullscreenActive()) {
    maximizeRotatedImage(rotatedComic);
  }
  positionFullscreenToolbar();
}

// ========================================
// TOUCH & SWIPE HANDLING
// ========================================

// Touch tracking variables
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let touchStartTime = 0;

/**
 * Checks if navigation in a given direction is possible
 * @param {string} direction - 'next', 'prev', 'first', 'current', 'random'
 * @returns {boolean} True if navigation is allowed
 */
function canNavigate(direction) {
  const buttonId = {
    'next': 'Next',
    'prev': 'Previous',
    'first': 'First',
    'current': 'Current',
    'random': 'Random'
  }[direction];
  
  if (!buttonId) return true;
  
  const button = document.getElementById(buttonId);
  return button ? !button.disabled : true;
}

/**
 * Handles touch start event
 * Records initial touch position and time for swipe/tap detection
 * @param {TouchEvent} e - Touch event
 */
function handleTouchStart(e) {
	const touch = e.touches[0];
	touchStartX = touch.clientX;
	touchStartY = touch.clientY;
	touchStartTime = Date.now();
	
	// Early return for swipe gesture handling, but keep tracking for tap detection
	if (!document.getElementById("swipe").checked) return;
}

/**
 * Handles touch move event
 * Prevents default scrolling during horizontal swipes
 * @param {TouchEvent} e - Touch event
 */
function handleTouchMove(e) {
	if (!document.getElementById("swipe").checked) return;
	
	// Prevent default scrolling behavior during swipe
	const touch = e.touches[0];
	const deltaX = Math.abs(touch.clientX - touchStartX);
	const deltaY = Math.abs(touch.clientY - touchStartY);
	
	// If horizontal swipe is more significant than vertical, prevent vertical scrolling
	if (deltaX > deltaY && deltaX > 20) {
		e.preventDefault();
	}
}

/**
 * Handles touch end event
 * Detects taps (for rotation) and swipes (for navigation)
 * @param {TouchEvent} e - Touch event
 */
function handleTouchEnd(e) {
	const touch = e.changedTouches[0];
	touchEndX = touch.clientX;
	touchEndY = touch.clientY;
	
	const deltaX = touchEndX - touchStartX;
	const deltaY = touchEndY - touchStartY;
	const deltaTime = Date.now() - touchStartTime;
	
	const absX = Math.abs(deltaX);
	const absY = Math.abs(deltaY);
	
	// For swipe navigation, check if swipe is enabled
	if (!document.getElementById("swipe").checked) return;
	
	// Check if the swipe is valid (meets distance and time requirements)
  if (deltaTime > CONFIG.SWIPE_MAX_TIME) return;
	
	// Check if we're in landscape fullscreen mode
  const isLandscapeFullscreen = isFullscreenActive();
	
	// Determine swipe direction based on mode
	if (isLandscapeFullscreen) {
    // Landscape fullscreen (no rotation): Normal horizontal/vertical mapping
    if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
      // Horizontal swipe
      if (deltaX < 0) {
        // Swipe Left -> Next
        if (canNavigate('next')) NextClick();
      } else {
        // Swipe Right -> Previous
        if (canNavigate('prev')) PreviousClick();
      }
    } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
      // Vertical swipe
      if (deltaY < 0) {
        // Swipe Up -> Latest
        if (canNavigate('current')) CurrentClick();
      } else {
        // Swipe Down -> Random
        if (canNavigate('random')) RandomClick();
      }
    }
  } else {
    // Normal portrait mode: Horizontal for Next/Prev, Vertical for Random/Latest
    if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
      // Horizontal swipe
      if (deltaX > 0) {
        // Swipe right -> Previous
        if (canNavigate('prev')) PreviousClick();
      } else {
        // Swipe left -> Next
        if (canNavigate('next')) NextClick();
      }
    } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
      // Vertical swipe
      if (deltaY > 0) {
        // Swipe down -> Random
        if (canNavigate('random')) RandomClick();
      } else {
        // Swipe up -> Latest
        if (canNavigate('current')) CurrentClick();
      }
    }
  }
}

// Add touch event listeners to the document
document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd, { passive: true });

// Add click handler for comic → landscape fullscreen on non-PWA or iOS
(function() {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isNonPWA = !isAppInstalled();
  
  if (isIOS || isNonPWA) {
    document.getElementById('comic')?.addEventListener('click', function(e) {
      if (isFullscreenActive()) return;
      if (this.className.includes('normal')) {
        e.preventDefault();
        Rotate();
      }
    });
  }
})();

// Add orientation change listener
window.addEventListener('orientationchange', function() {
  setTimeout(() => {
    const orientation = screen.orientation?.type || '';
    const isLandscape = orientation.includes('landscape') || Math.abs(window.orientation) === 90;
    const rotatedComic = document.getElementById('rotated-comic');

    if (isLandscape) {
      if (!isFullscreenActive()) {
        const comic = document.getElementById('comic');
        if (comic && comic.className.includes('normal')) {
          Rotate();
        }
      } else if (rotatedComic) {
        maximizeRotatedImage(rotatedComic);
        positionFullscreenToolbar();
      }
    } else if (isFullscreenActive()) {
      Rotate();
    }
  }, 300);
});

// Unified touch event handling for toolbar and buttons
(function() {
  const isAndroid = /Android/i.test(navigator.userAgent);
  
  // Handle fullscreen toolbar touch events - prevent swipe propagation
  document.body.addEventListener('touchstart', function(e) {
    if (e.target.closest('#fullscreen-toolbar')) {
      e.stopPropagation();
    }
  }, { capture: true });
  
  document.body.addEventListener('touchmove', function(e) {
    if (e.target.closest('#fullscreen-toolbar')) {
      e.stopPropagation();
    }
  }, { capture: true });
  
  // Unified touchend handler for all toolbar buttons
  document.body.addEventListener('touchend', function(e) {
    // Stop swipe on fullscreen toolbar
    if (e.target.closest('#fullscreen-toolbar')) {
      e.stopPropagation();
    }
    
    // Handle button state reset
    const button = e.target.closest('.toolbar-button, .toolbar-datepicker-btn');
    if (button) {
      const delay = isAndroid ? 200 : 150;
      setTimeout(() => {
        if (!button.matches(':active')) {
          button.blur();
          button.style.transform = '';
          button.style.backgroundPosition = '';
        }
      }, delay);
    }
  }, { capture: true });
  
  // Android-specific focus management
  if (isAndroid) {
    document.addEventListener('focusin', function(e) {
      const button = e.target.closest('.toolbar-button, .toolbar-datepicker-btn');
      if (button) {
        setTimeout(() => {
          if (!button.matches(':active')) button.blur();
        }, 300);
      }
    });
    
    document.addEventListener('touchstart', function(e) {
      if (!e.target.closest('.toolbar-button, .toolbar-datepicker-btn')) {
        const focused = document.querySelector('.toolbar-button:focus, .toolbar-datepicker-btn:focus');
        if (focused) focused.blur();
      }
    }, { passive: true });
  }
})();

/**
 * Initialize toolbar positioning and dragging
 */
function initializeToolbar() {
  const mainToolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
  if (!mainToolbar) return;
  
  // Make toolbar draggable
  makeMainToolbarDraggable(mainToolbar);

  const savedPosRaw = STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_POS) || STORAGE.get('mainToolbarPosition');
  const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
  const isOptimalMode = STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_OPTIMAL) === 'true';
  
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    if (isOptimalMode) {
      // Toolbar was in optimal mode - recalculate optimal position on load
      // This ensures it stays centered even if window size changed since last session
      const tryOptimalPosition = () => {
        const optimalPos = calculateOptimalToolbarPosition(mainToolbar);
        if (optimalPos) {
          mainToolbar.style.top = optimalPos.top + 'px';
          mainToolbar.style.left = optimalPos.left + 'px';
          mainToolbar.style.transform = 'none';
        }
      };
      
      // Try immediately and after load
      setTimeout(tryOptimalPosition, 0);
      setTimeout(tryOptimalPosition, 50);
      window.addEventListener('load', () => {
        setTimeout(tryOptimalPosition, 100);
        setTimeout(() => {
          tryOptimalPosition();
          // Save the recalculated position
          const pos = calculateOptimalToolbarPosition(mainToolbar);
          if (pos) storeToolbarPosition(pos.top, pos.left, mainToolbar);
        }, 300);
      });
    } else {
      // Apply saved custom position immediately
      mainToolbar.style.top = savedPos.top + 'px';
      mainToolbar.style.left = savedPos.left + 'px';
      mainToolbar.style.transform = 'none';
    }
  } else {
    // No saved position - calculate centered position
    // Set a safe default first to avoid showing over comic
    const logo = document.querySelector('.logo');
    if (logo) {
      const logoRect = logo.getBoundingClientRect();
      mainToolbar.style.top = (logoRect.bottom + 15) + 'px';
      mainToolbar.style.left = '50%';
      mainToolbar.style.transform = 'translateX(-50%)';
    }
    
    // Then position correctly after elements load and save the position
    const tryPosition = () => {
      mainToolbar.style.transform = 'none'; // Clear transform before positioning
      positionToolbarCentered(mainToolbar, false); // Don't save yet during intermediate attempts
    };
    
    const finalPosition = () => {
      mainToolbar.style.transform = 'none';
      positionToolbarCentered(mainToolbar, true); // Save position on final attempt
    };
    
    // Try positioning multiple times as elements load
    setTimeout(tryPosition, 0);
    setTimeout(tryPosition, 50);
    setTimeout(tryPosition, 100);
    window.addEventListener('load', () => {
      tryPosition();
      setTimeout(tryPosition, 100);
      setTimeout(finalPosition, 300); // Save position after final positioning
    });
  }

  // Only clamp on resize, not on orientation change to prevent toolbar movement
  // Debounce resize handler to avoid excessive calculations
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      clampMainToolbarInView();
    }, 100);
  });
  
  // Use ResizeObserver to detect when toolbar dimensions change due to CSS
  if (typeof ResizeObserver !== 'undefined') {
    const toolbarResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Toolbar size changed (likely due to CSS media query)
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          clampMainToolbarInView();
        }, 50);
      }
    });
    toolbarResizeObserver.observe(mainToolbar);
  }
  
  // Initialize mobile button state management
  initializeMobileButtonStates();
}

// Initialize toolbar when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeToolbar);
} else {
  initializeToolbar();
}

// ========================================
// MOBILE BUTTON STATE MANAGEMENT
// ========================================

/**
 * Unified mobile button state management
 * Fixes "stuck" or "popped out" button states on touch devices
 * Consolidates all button reset logic in one place
 */
function initializeMobileButtonStates() {
  // Only run on mobile/touch devices
  if (!UTILS.isMobileOrTouch()) return;
  
  const toolbarButtons = document.querySelectorAll('.toolbar-button, .toolbar-datepicker-btn');
  
  toolbarButtons.forEach(button => {
    let touchTimer = null;
    let isPressed = false;
    
    // Touch start - mark as pressed
    button.addEventListener('touchstart', (e) => {
      isPressed = true;
      button.style.transition = 'all 0.1s ease';
      
      // Clear any existing timer
      if (touchTimer) clearTimeout(touchTimer);
    }, { passive: true });
    
    // Touch end - reset state immediately with visual feedback
    button.addEventListener('touchend', (e) => {
      if (isPressed) {
        // Force blur immediately to clear :active state
        button.blur();
        
        // Reset transform after brief delay for visual feedback
        touchTimer = setTimeout(() => {
          button.style.transform = '';
          button.style.transition = '';
          button.classList.remove('active');
          isPressed = false;
        }, 100);
      }
    }, { passive: true });
    
    // Touch cancel - immediate reset
    button.addEventListener('touchcancel', () => {
      if (touchTimer) clearTimeout(touchTimer);
      button.style.transform = '';
      button.style.transition = '';
      button.blur();
      button.classList.remove('active');
      isPressed = false;
    }, { passive: true });
    
    // Click handler - ensure cleanup after click
    button.addEventListener('click', () => {
      // Immediate blur to prevent stuck active state
      requestAnimationFrame(() => {
        button.blur();
        button.style.transform = '';
      });
    }, { passive: true });
    
    // Blur - cleanup transforms
    button.addEventListener('blur', () => {
      button.style.transform = '';
      button.classList.remove('active');
      if (isPressed) {
        button.style.transition = '';
        isPressed = false;
      }
    });
    
    // Mouse leave - reset if pressed (hybrid devices)
    button.addEventListener('mouseleave', () => {
      if (isPressed) {
        button.style.transform = '';
        button.style.transition = '';
        button.classList.remove('active');
        isPressed = false;
      }
    });
  });
  
  // Global safeguard - aggressively reset any stuck buttons
  document.addEventListener('touchend', () => {
    // Use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
      toolbarButtons.forEach(button => {
        button.style.transform = '';
        button.blur();
        button.classList.remove('active');
      });
    });
  }, { passive: true, capture: true });
  
  // Additional safeguard for touch move (dragging toolbar shouldn't activate buttons)
  document.addEventListener('touchmove', () => {
    toolbarButtons.forEach(button => {
      if (button.matches(':active')) {
        button.blur();
        button.style.transform = '';
      }
    });
  }, { passive: true });
}

// Settings click handlers
document.getElementById("swipe").onclick = function() {
  STORAGE.set(CONFIG.STORAGE_KEYS.SWIPE, this.checked ? "true" : "false");
};

function setStartupMode(mode) {
  const startupMode = ['today', 'latest', 'last'].includes(mode) ? mode : 'today';
  document.getElementById("starttoday").checked = startupMode === 'today';
  document.getElementById("startlatest").checked = startupMode === 'latest';
  document.getElementById("startlast").checked = startupMode === 'last';
  STORAGE.set(CONFIG.STORAGE_KEYS.START_MODE, startupMode);
  STORAGE.set(CONFIG.STORAGE_KEYS.START_LATEST, startupMode === 'latest' ? "true" : "false");
  STORAGE.set(CONFIG.STORAGE_KEYS.LAST_DATE, startupMode === 'last' ? "true" : "false");
}

document.getElementById('starttoday').addEventListener('change', function() {
  if (this.checked) setStartupMode('today');
});

document.getElementById('startlatest').addEventListener('change', function() {
  if (this.checked) setStartupMode('latest');
});

document.getElementById('startlast').addEventListener('change', function() {
  if (this.checked) setStartupMode('last');
});

document.getElementById('showfavs').addEventListener('change', function() {
  const favs = loadFavs();
  if (this.checked) {
    STORAGE.set(CONFIG.STORAGE_KEYS.SHOW_FAVS, "true");
    if (favs.indexOf(formattedDate) === -1 && favs.length) {
      currentselectedDate = parseLocalDate(favs[0]) || currentselectedDate;
    }
  } else {
    STORAGE.set(CONFIG.STORAGE_KEYS.SHOW_FAVS, "false");
  }
  CompareDates();
  DisplayComic();
});

// Load settings from localStorage
// Swipe defaults to true for new users (null means never set)
document.getElementById("swipe").checked = STORAGE.get(CONFIG.STORAGE_KEYS.SWIPE) !== "false";
document.getElementById("showfavs").checked = STORAGE.get(CONFIG.STORAGE_KEYS.SHOW_FAVS) === "true";
setStartupMode(getStartupMode());

// Shuffle mode toggle
{
  const shuffleCheckbox = document.getElementById("shuffle");
  if (shuffleCheckbox) {
    shuffleCheckbox.checked = STORAGE.get(CONFIG.STORAGE_KEYS.SHUFFLE) === "true";
    shuffleCheckbox.addEventListener('change', function() {
      STORAGE.set(CONFIG.STORAGE_KEYS.SHUFFLE, this.checked ? "true" : "false");
      resetShuffleHistory();
    });
  }
}

// Initialize dark mode, favorites export state, and version display
initializeDarkMode();
updateExportButtonState();
displayServiceWorkerVersion();

{
  const settingsPanel = document.getElementById("settingsDIV");
  if (STORAGE.get(CONFIG.STORAGE_KEYS.SETTINGS_VISIBLE) === "true" && settingsPanel) {
    openSettings();
  } else if (settingsPanel) {
    closeSettings(false);
  }
}

// ========================================
// SETTINGS & FAVORITES UI
// ========================================

/**
 * Toggles favorite status for current comic
 * Updates UI and localStorage
 */
function Addfav()
{
  let favs = loadFavs();
  const heartButton = document.getElementById("favheart");
  const heartSvg = heartButton ? heartButton.querySelector('svg') : null;
  
  if (!favs.includes(formattedDate)) {
    favs.push(formattedDate);
    // Fill the heart
    if (heartSvg) {
      heartSvg.style.fill = '#000000';
      heartSvg.style.stroke = '#000000';
    }
    if (heartButton) heartButton.setAttribute('aria-pressed', 'true');
    document.getElementById("showfavs").disabled = false;
  } else {
    favs = favs.filter(f => f !== formattedDate);
    // Unfill the heart
    if (heartSvg) {
      heartSvg.style.fill = 'none';
      heartSvg.style.stroke = '#000000';
    }
    if (heartButton) heartButton.setAttribute('aria-pressed', 'false');
    if (favs.length === 0) {
      document.getElementById("showfavs").checked = false;
      document.getElementById("showfavs").disabled = true;
    }
  }
  saveFavs(favs);
  updateExportButtonState();
  CompareDates();
}

/**
 * Toggles the settings panel visibility
 */   
function closeSettings(restoreFocus = true) {
  const panel = document.getElementById("settingsDIV");
  if (!panel) return;
  panel.classList.remove('visible');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  document.getElementById('settings')?.setAttribute('aria-expanded', 'false');
  STORAGE.set(CONFIG.STORAGE_KEYS.SETTINGS_VISIBLE, "false");
  if (restoreFocus) document.getElementById('settings')?.focus();
}

function openSettings() {
  const panel = document.getElementById("settingsDIV");
  if (!panel) return;
  const savedPosRaw = STORAGE.get(CONFIG.STORAGE_KEYS.SETTINGS_POS);
  const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    panel.style.top = savedPos.top + 'px';
    panel.style.left = savedPos.left + 'px';
    panel.style.transform = 'none';
  }
  panel.classList.add('visible');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  document.getElementById('settings')?.setAttribute('aria-expanded', 'true');
  STORAGE.set(CONFIG.STORAGE_KEYS.SETTINGS_VISIBLE, "true");
  document.getElementById('settingsClose')?.focus();
}

function HideSettings() {
  const panel = document.getElementById("settingsDIV");
  if (!panel) return;
  if (panel.classList.contains('visible')) closeSettings();
  else openSettings();
}

/**
 * Initializes draggable settings panel
 * Allows user to drag the settings panel by its header
 */
function initializeDraggableSettings() {
  const panel = document.getElementById("settingsDIV");
  const header = document.getElementById("settingsHeader");
  
  if (!panel || !header) return;
  
  // Load and apply saved position FIRST, before any events
  const savedPosRaw = STORAGE.get(CONFIG.STORAGE_KEYS.SETTINGS_POS);
  const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    // Disable animation temporarily
    panel.style.animation = 'none';
    panel.style.top = savedPos.top + 'px';
    panel.style.left = savedPos.left + 'px';
    panel.style.transform = 'none';
    
    // Re-enable animation after a brief delay
    requestAnimationFrame(() => {
      panel.style.animation = '';
    });
  }
  
  // Use shared draggable utility
  makeDraggable(
    panel, 
    header, 
    CONFIG.STORAGE_KEYS.SETTINGS_POS,
    // onDragStart: Disable animation
    (el) => { el.style.animation = 'none'; },
    // onDragEnd: Re-enable animation
    (el) => { requestAnimationFrame(() => { el.style.animation = ''; }); }
  );
}

// Initialize draggable when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDraggableSettings);
} else {
  initializeDraggableSettings();
}
    
let deferredPrompt;

// Check if app is already installed/running in standalone mode
function isAppInstalled() {
  // Check if running as standalone PWA
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  // Check for iOS standalone mode
  if (window.navigator.standalone === true) {
    return true;
  }
  // Check if running from Windows Store or other app context
  if (document.referrer.includes('android-app://') || 
      document.referrer.includes('ms-appx://')) {
    return true;
  }
  return false;
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Don't show install prompt if already installed
  if (isAppInstalled()) {
    return;
  }
  
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  showInstallPromotion();
});

function showInstallPromotion() {
  // Don't show if already installed
  if (isAppInstalled()) {
    return;
  }

  if (!deferredPrompt || document.getElementById('pwa-install-button')) {
    return;
  }
  
  const installButton = document.createElement('button');
  installButton.innerText = 'Installeer App';
  installButton.id = 'pwa-install-button';
  installButton.className = 'pwa-install-button';
  document.body.appendChild(installButton);

  installButton.addEventListener('click', () => {
    if (!deferredPrompt) {
      installButton.remove();
      return;
    }

    // Hide the app provided install promotion
    installButton.style.display = 'none';
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult) => {
      deferredPrompt = null;
    });
  });
}

// Hide install button if app is already installed
window.addEventListener('DOMContentLoaded', () => {
  if (isAppInstalled()) {
    const installButton = document.getElementById('pwa-install-button');
    if (installButton) {
      installButton.style.display = 'none';
    }
  }
});

// Helper function to maximize image size for rotated images
function maximizeRotatedImage(imgElement) {
  // Get viewport dimensions
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  
  // Get natural dimensions of the image
  const naturalWidth = imgElement.naturalWidth;
  const naturalHeight = imgElement.naturalHeight;
  
  // If natural dimensions are not available, do nothing
  if (!naturalWidth || !naturalHeight) {
    return;
  }
  
  // Landscape fullscreen uses the image's natural dimensions (no rotation)
  const displayWidth = naturalWidth;
  const displayHeight = naturalHeight;
  
  // Calculate the scale factor needed to fit the image within the viewport
  let scale;
  if (displayWidth / displayHeight > viewportWidth / viewportHeight) {
    // Image is wider than viewport (relative to aspect ratios)
    scale = viewportWidth / displayWidth;
  } else {
    // Image is taller than viewport (relative to aspect ratios)
    scale = viewportHeight / displayHeight;
  }
  
  // Make the image slightly smaller (90% of the calculated size)
  scale = scale * CONFIG.ROTATED_IMAGE_SCALE;
  
  // Apply dimension with calculated scale
  imgElement.style.width = `${naturalWidth * scale}px`;
  imgElement.style.height = `${naturalHeight * scale}px`;
  
  // Position element
  imgElement.style.position = 'fixed';
  
  // In landscape mode, position higher to avoid toolbar overlap
  imgElement.style.top = '40%';
  imgElement.style.left = '50%';
  imgElement.style.transformOrigin = 'center center';
  imgElement.style.maxWidth = 'none';
  imgElement.style.maxHeight = 'none';
  imgElement.style.zIndex = '10001'; // Higher than the overlay
  imgElement.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
}

// Position the fullscreen toolbar based on device orientation
function positionFullscreenToolbar() {
  const toolbar = document.getElementById('fullscreen-toolbar');
  if (!toolbar) return;
  
  // For rotated mode, let CSS handle the positioning via media queries
  // Just ensure the toolbar has the necessary base styles
  toolbar.style.position = 'fixed';
  toolbar.style.zIndex = '10002';
  
  // Clear any inline positioning to let CSS media queries take over
  toolbar.style.left = '';
  toolbar.style.bottom = '';
  toolbar.style.top = '';
  toolbar.style.transform = '';
  toolbar.style.flexDirection = '';
  toolbar.style.width = '';
  toolbar.style.maxWidth = '';
  toolbar.style.height = '';
}

/**
 * Positions the main toolbar centered between logo and comic image
 * @param {HTMLElement} toolbar - The toolbar element to position
 * @param {boolean} savePosition - Whether to save the calculated position to localStorage
 */
function positionToolbarCentered(toolbar, savePosition = false) {
  if (!toolbar || toolbar.offsetHeight === 0) return;
  
  const logo = document.querySelector('.logo');
  const comic = document.getElementById('comic');
  
  if (!logo || !comic) return;
  
  // Since toolbar is position: fixed, use viewport coordinates (getBoundingClientRect)
  const logoRect = logo.getBoundingClientRect();
  const comicRect = comic.getBoundingClientRect();
  const toolbarHeight = toolbar.offsetHeight;
  
  // Calculate position between logo bottom and comic top (viewport coordinates for fixed positioning)
  const logoBottom = logoRect.bottom;
  const comicTop = comicRect.top;
  const availableSpace = comicTop - logoBottom;
  
  // Center vertically in available space (with minimum 15px gap from logo)
  const centeredTop = logoBottom + Math.max(15, (availableSpace - toolbarHeight) / 2);
  toolbar.style.top = centeredTop + 'px';
  
  // Center horizontally
  const viewportWidth = window.innerWidth;
  const toolbarWidth = toolbar.offsetWidth;
  const centeredLeft = (viewportWidth - toolbarWidth) / 2;
  toolbar.style.left = centeredLeft + 'px';
  toolbar.style.transform = 'none';
  
  // Save position if requested
  if (savePosition) {
    storeToolbarPosition(centeredTop, centeredLeft, toolbar, {
      belowComic: false,
      offsetFromComic: null,
      belowSettings: false,
      offsetFromSettings: null
    });
    // Mark as being in optimal position
    try {
      STORAGE.set(CONFIG.STORAGE_KEYS.TOOLBAR_OPTIMAL, 'true');
    } catch (_) {}
  }
}

/**
 * Makes the main toolbar draggable
 * @param {HTMLElement} toolbar - The toolbar element to make draggable
 */
function makeMainToolbarDraggable(toolbar) {
  if (!toolbar) return;

  // Restore saved absolute position on load (document coordinates)
  const savedPosRaw = STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_POS) || STORAGE.get('mainToolbarPosition');
  const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    toolbar.style.top = savedPos.top + 'px';
    toolbar.style.left = savedPos.left + 'px';
    toolbar.style.transform = 'none';
    
    // Migrate old storage key
    if (!STORAGE.get(CONFIG.STORAGE_KEYS.TOOLBAR_POS)) {
      try { 
        STORAGE.set(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify(savedPos));
        STORAGE.remove('mainToolbarPosition');
      } catch(_) {}
    }
  }

  // Use shared draggable utility - toolbar itself is both element and drag handle
  makeDraggable(
    toolbar,
    toolbar, // Entire toolbar is draggable
    CONFIG.STORAGE_KEYS.TOOLBAR_POS,
    // onDragStart: Set cursor
    (el) => { el.style.cursor = 'grabbing'; },
    // onDragEnd: Restore cursor and clamp position
    (el) => { 
      el.style.cursor = 'grab'; 
      clampMainToolbarInView(); 
    }
  );
  
  // Set initial cursor
  toolbar.style.cursor = 'grab';
}

// ========================================
// KEYBOARD SHORTCUTS
// ========================================
document.addEventListener('keydown', function(e) {
  // Don't trigger shortcuts when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  // Prevent default for keys we're handling
  const handledKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', ' ', 'r', 'R', 'f', 'F'];
  if (handledKeys.includes(e.key)) {
    e.preventDefault();
  }
  
  switch(e.key) {
    case 'ArrowLeft':
      // Left arrow - Previous comic
      if (!document.getElementById('Previous').disabled) {
        PreviousClick();
      }
      break;
      
    case 'ArrowRight':
      // Right arrow - Next comic
      if (!document.getElementById('Next').disabled) {
        NextClick();
      }
      break;
      
    case 'Home':
      // Home key - First comic
      if (!document.getElementById('First').disabled) {
        FirstClick();
      }
      break;
      
    case 'End':
      // End key - Latest comic
      if (!document.getElementById('Current').disabled) {
        CurrentClick();
      }
      break;
      
    case ' ':
      // Spacebar - Random comic
      if (!document.getElementById('Random').disabled) {
        RandomClick();
      }
      break;
      
    case 'r':
    case 'R':
      // R key - Random comic (alternative)
      if (!document.getElementById('Random').disabled) {
        RandomClick();
      }
      break;
      
    case 'f':
    case 'F':
      // F key - Toggle favorite
      Addfav();
      break;
  }
});

// ========================================
// COMIC PRELOADING FOR SMOOTHER NAVIGATION
// ========================================
function preloadAdjacentComics() {
  if (!formattedDate) return;
  if (notFound || !latestAvailableDate) return;
  if (navigator.connection?.saveData) return;

  const currentDate = parseLocalDate(formattedDate) || new Date();
  const startDate = parseLocalDate(CONFIG.COMIC_START_DATE) || new Date(2015, 4, 4);
  const preloadMaxDate = new Date(latestAvailableDate);
  preloadMaxDate.setHours(0, 0, 0, 0);

  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextPublishDate = moveToComicPublishDate(nextDate, 1);
  if (nextPublishDate <= preloadMaxDate) {
    preloadComic(nextPublishDate);
  }

  const prevDate = new Date(currentDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevPublishDate = moveToComicPublishDate(prevDate, -1);
  if (prevPublishDate >= startDate) {
    preloadComic(prevPublishDate);
  }
}

/**
 * Preloads a comic blob so DisplayComic can reuse it.
 * @param {Date} date
 */
function preloadComic(date) {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const formattedMonth = ("0" + m).slice(-2);
  const formattedDay = ("0" + d).slice(-2);
  const preloadFormattedDate = `${y}-${formattedMonth}-${formattedDay}`;
  const preloadFormattedComicDate = `${y}${formattedMonth}${formattedDay}`;
  const cache = getComicBlobCache();
  if (cache.has(preloadFormattedDate)) return;

  fetchComicData(preloadFormattedComicDate, `https://dirkjan.nl/cartoon/${preloadFormattedComicDate}`)
    .then(comicData => {
      if (comicData.notFound || !comicData.imageUrl) return;
      return createComicObjectUrl(comicData.imageUrl).then(objectUrl => {
        const img = new Image();
        img.onload = () => {
          cache.put(preloadFormattedDate, { imageUrl: comicData.imageUrl, objectUrl });
        };
        img.onerror = () => URL.revokeObjectURL(objectUrl);
        img.src = objectUrl;
      });
    })
    .catch(() => {});
}

// ========================================
// VISUAL FEEDBACK - Show keyboard shortcuts hint on first load (desktop only)
// ========================================
function showKeyboardShortcutsHint() {
  // Don't show on mobile/touch devices
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  if (isMobile || isTouch) {
    return; // Skip showing hint on mobile/touch devices
  }
  
  const hasSeenHint = STORAGE.get(CONFIG.STORAGE_KEYS.KEYBOARD_HINT);
  
  if (!hasSeenHint) {
    setTimeout(() => {
      const hint = document.createElement('div');
      hint.id = 'keyboard-hint';
      hint.innerHTML = `
        <div class="keyboard-hint-inner">
          <div class="keyboard-hint-title">⌨️ Sneltoetsen</div>
          <div class="keyboard-hint-body">
            ← → : Vorige/Volgende<br>
            Home/End : Eerste/Laatste<br>
            Spatie/R : Willekeurig<br>
            F : Favoriet
          </div>
          <button class="keyboard-hint-btn">Begrepen!</button>
        </div>
      `;
      hint.querySelector('.keyboard-hint-btn').addEventListener('click', () => {
        hint.remove();
        STORAGE.set(CONFIG.STORAGE_KEYS.KEYBOARD_HINT, 'true');
      });
      document.body.appendChild(hint);
      
      // Auto-hide after 8 seconds
      setTimeout(() => {
        const hintEl = document.getElementById('keyboard-hint');
        if (hintEl) {
          hintEl.style.transition = 'opacity 0.5s';
          hintEl.style.opacity = '0';
          setTimeout(() => {
            if (hintEl.parentElement) {
              hintEl.parentElement.removeChild(hintEl);
            }
            STORAGE.set(CONFIG.STORAGE_KEYS.KEYBOARD_HINT, 'true');
          }, 500);
        }
      }, CONFIG.NOTIFICATION_AUTO_HIDE);
    }, CONFIG.KEYBOARD_HINT_DELAY); // Show after a short delay
  }
}

// Show hint on page load (desktop only)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showKeyboardShortcutsHint);
} else {
  showKeyboardShortcutsHint();
}

function bindApplicationEvents() {
  const bindings = [
    ['First', 'click', FirstClick],
    ['Previous', 'click', PreviousClick],
    ['Random', 'click', RandomClick],
    ['Next', 'click', NextClick],
    ['Current', 'click', CurrentClick],
    ['darkmode', 'click', ToggleDarkMode],
    ['settings', 'click', HideSettings],
    ['settingsClose', 'click', HideSettings],
    ['favheart', 'click', Addfav],
    ['share', 'click', Share],
    ['exportFavs', 'click', exportFavorites]
  ];

  for (const [id, eventName, handler] of bindings) {
    document.getElementById(id)?.addEventListener(eventName, handler);
  }

  const datePicker = document.getElementById('DatePicker');
  datePicker?.addEventListener('input', DateChange);
  datePicker?.addEventListener('click', () => datePicker.showPicker?.());
  document.getElementById('importFavs')?.addEventListener('click', () => {
    document.getElementById('importFavsInput')?.click();
  });
  document.getElementById('importFavsInput')?.addEventListener('change', importFavorites);
  document.getElementById('retryComic')?.addEventListener('click', () => DisplayComic());
  document.getElementById('latestComic')?.addEventListener('click', CurrentClick);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('settingsDIV')?.classList.contains('visible')) {
      closeSettings();
    }
  });
}

bindApplicationEvents();
window.addEventListener('storageerror', event => {
  TELEMETRY.report('storage_failed', event.detail?.operation || 'unknown');
});
onLoad();
