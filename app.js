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
  
  // CORS Proxies (in priority order)
  CORS_PROXIES: [
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://corsproxy.io/?'
  ],
  
  // Fetch timeouts
  FETCH_TIMEOUT: 10000,                // 10 second timeout for HTML
  FETCH_TIMEOUT_FAST: 5000,            // 5 second fast attempt timeout
  IMAGE_FETCH_TIMEOUT: 8000,           // 8 second timeout for images
  
  // Swipe detection
  SWIPE_MIN_DISTANCE: 50,              // Minimum swipe distance in px
  SWIPE_MAX_TIME: 500,                 // Maximum swipe time in ms
  TAP_MAX_MOVEMENT: 10,                // Maximum movement for tap detection in px
  TAP_MAX_TIME: 300,                   // Maximum time for tap detection in ms
  
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
    SETTINGS_POS: 'settingsPosition',
    SWIPE: 'stat',
    SHOW_FAVS: 'showfavs',
    LAST_DATE: 'lastdate',
    SETTINGS_VISIBLE: 'settings'
  })
});
// ========================================
// SERVICE WORKER REGISTRATION & PWA SETUP
// ========================================

/**
 * Initializes and registers the service worker for PWA functionality
 */
if ("serviceWorker" in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register("./serviceworker.js")
      .then(registration => {
        // Check for updates periodically (every hour)
        setInterval(() => {
          registration.update();
        }, CONFIG.UPDATE_CHECK_INTERVAL);
        
        // Listen for new service worker waiting to activate
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available
                showUpdateNotification();
              }
            });
          }
        });
      })
      .catch(() => {
        // ServiceWorker registration failed - app will work without offline support
      });
  });
}

/**
 * Shows update notification to user when new version is available
 */
function showUpdateNotification() {
  const notification = document.createElement('div');
  notification.id = 'update-notification';
  notification.innerHTML = `
    <div style="position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.9); color: white; padding: 15px 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 10004; max-width: 90%; text-align: center; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);">
      <div style="font-weight: bold; margin-bottom: 8px;">🎉 Nieuwe versie beschikbaar!</div>
      <button onclick="updateApp()" style="margin: 5px; padding: 8px 16px; background: linear-gradient(45deg, #f09819 0%, #ff8c00 100%); border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: bold;">Updaten</button>
      <button onclick="dismissUpdate()" style="margin: 5px; padding: 8px 16px; background: rgba(255,255,255,0.2); border: none; border-radius: 8px; color: white; cursor: pointer;">Later</button>
    </div>
  `;
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
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      }
    });
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

// Track which proxy is currently working best
let workingProxyIndex = 0;
let proxyFailureCount = [0, 0]; // One for each proxy
let proxyResponseTimes = [0, 0]; // Track average response times in ms

/**
 * Fetches a URL with intelligent CORS proxy fallback
 * Uses parallel racing for faster fallback and tracks proxy performance
 * @param {string} url - The URL to fetch
 * @param {boolean} enableRacing - If true, races proxies after a delay for faster fallback
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} If all fetch attempts fail
 */
async function fetchWithFallback(url, enableRacing = true) {
  const startTime = performance.now();
  const bestProxyIndex = getBestProxyIndex();
  
  // Try the best performing proxy first
  const primaryAttempt = tryProxy(url, bestProxyIndex, startTime);
  
  if (!enableRacing) {
    // Simple mode: just try primary then fallback
    try {
      return await primaryAttempt;
    } catch (error) {
      return await tryRemainingProxies(url, bestProxyIndex, startTime);
    }
  }
  
  // Racing mode: if primary is slow, start backup attempts
  try {
    return await Promise.race([
      primaryAttempt,
      // Start racing with other proxies after a delay if primary is slow
      (async () => {
        await new Promise(resolve => setTimeout(resolve, CONFIG.FETCH_TIMEOUT_FAST));
        // Primary is taking too long, try backups in parallel
        return await tryBackupProxies(url, bestProxyIndex, startTime);
      })()
    ]);
  } catch (error) {
    // Both primary and racing failed, try remaining sequentially
    return await tryRemainingProxies(url, bestProxyIndex, startTime);
  }
}

/**
 * Gets the best proxy index based on success rate and response time
 * @returns {number} Index of the best performing proxy
 */
function getBestProxyIndex() {
  let bestIndex = workingProxyIndex;
  let bestScore = -Infinity;
  
  for (let i = 0; i < CONFIG.CORS_PROXIES.length; i++) {
    // Heavily penalize failures, reward fast response times
    const failurePenalty = proxyFailureCount[i] * 2000;
    const avgTime = proxyResponseTimes[i] || 1500; // Default to 1.5s if unknown
    const score = 10000 / (avgTime + failurePenalty + 1);
    
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  
  return bestIndex;
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
async function tryProxy(url, proxyIndex, startTime) {
  const proxyUrl = CONFIG.CORS_PROXIES[proxyIndex];
  const proxyName = proxyUrl.split('/')[2]; // Extract domain for logging
  
  try {
    const fullUrl = `${proxyUrl}${encodeURIComponent(url)}`;
    const response = await fetch(fullUrl, { 
      signal: AbortSignal.timeout(CONFIG.FETCH_TIMEOUT),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache' // Prevent stale cached errors
    });
    
    if (!response.ok) {
      const errorMsg = `HTTP ${response.status}`;
      console.warn(`✗ Proxy ${proxyIndex} (${proxyName}) ${errorMsg}`);
      updateProxyStats(proxyIndex, false, 0);
      throw new Error(errorMsg);
    }
    
    // Success
    const responseTime = performance.now() - startTime;
    updateProxyStats(proxyIndex, true, responseTime);
    console.log(`✓ Proxy ${proxyIndex} (${proxyName}) in ${responseTime.toFixed(0)}ms`);
    return response;
    
  } catch (error) {
    const errorType = error.name === 'TimeoutError' ? 'timeout' : 
                      error.name === 'AbortError' ? 'aborted' : 
                      error.message;
    console.warn(`✗ Proxy ${proxyIndex} (${proxyName}):`, errorType);
    updateProxyStats(proxyIndex, false, 0);
    throw error;
  }
}

/**
 * Tries backup proxies in parallel (racing)
 * @param {string} url - URL to fetch
 * @param {number} excludeIndex - Proxy to exclude (already trying)
 * @param {number} startTime - Start time for tracking
 * @returns {Promise<Response>}
 */
async function tryBackupProxies(url, excludeIndex, startTime) {
  const attempts = [];
  
  for (let i = 0; i < CONFIG.CORS_PROXIES.length; i++) {
    if (i === excludeIndex) continue;
    attempts.push(tryProxy(url, i, startTime));
  }
  
  // Return first successful response
  return await Promise.any(attempts);
}

/**
 * Tries remaining proxies sequentially as final fallback
 * @param {string} url - URL to fetch
 * @param {number} excludeIndex - Proxy already tried
 * @param {number} startTime - Start time for tracking
 * @returns {Promise<Response>}
 */
async function tryRemainingProxies(url, excludeIndex, startTime) {
  const errors = [];
  
  for (let i = 0; i < CONFIG.CORS_PROXIES.length; i++) {
    if (i === excludeIndex) continue;
    
    try {
      return await tryProxy(url, i, startTime);
    } catch (error) {
      errors.push(`Proxy ${i}: ${error.message}`);
    }
  }
  
  // Reset failure counts if all proxies are struggling
  if (proxyFailureCount.every(count => count > 2)) {
    console.log('Resetting proxy failure counts');
    proxyFailureCount.fill(0);
  }
  
  console.error('All proxies failed:', errors.join('; '));
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
let maxDate;                    // Maximum available comic date
let nextclicked = false;        // Tracks navigation direction

// Parsing variables
let siteBody, notFound, picturePosition, endPosition;
let startDate, endDate, formattedmaxDate;
let year, month, day;

// Favorites cache
let _cachedFavs = null;

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
   * Formats a date object into YYYY-MM-DD components
   * @param {Date} datetoFormat - Date to format
   * @returns {void} Sets global year, month, day variables
   */
  formatDate(datetoFormat) {
    day = datetoFormat.getDate();
    month = datetoFormat.getMonth() + 1;
    year = datetoFormat.getFullYear();
    month = ("0" + month).slice(-2);
    day = ("0" + day).slice(-2);
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

// Backward compatibility - delegate to UTILS
const formatDate = (datetoFormat) => UTILS.formatDate(datetoFormat);
const safeJSONParse = (str, fallback) => UTILS.safeJSONParse(str, fallback);

// ========================================
// FAVORITES MANAGEMENT
// ========================================

/**
 * Loads favorites from localStorage with caching
 * @returns {Array<string>} Array of favorite comic dates (YYYY-MM-DD format)
 */
function loadFavs() {
  if (Array.isArray(_cachedFavs)) return _cachedFavs;
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.FAVS);
    if (!raw) return (_cachedFavs = []);
    const parsed = JSON.parse(raw);
    return (_cachedFavs = Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return (_cachedFavs = []);
  }
}

/**
 * Saves favorites to localStorage with deduplication
 * @param {Array<string>} arr - Array of favorite dates to save
 */
function saveFavs(arr) {
  if (!Array.isArray(arr)) return;
  const deduped = Array.from(new Set(arr)).sort();
  _cachedFavs = deduped;
  try { localStorage.setItem(CONFIG.STORAGE_KEYS.FAVS, JSON.stringify(deduped)); } catch (e) { /* ignore */ }
}

/**
 * Invalidates the favorites cache (forces reload from localStorage)
 */
function invalidateFavsCache() { _cachedFavs = null; }

// ========================================
// TOOLBAR POSITIONING & DRAGGING
// ========================================

/**
 * Keeps main toolbar within viewport bounds on resize/orientation changes
 * Repositions if no saved position exists to keep it centered
 */
function clampMainToolbarInView() {
  const toolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
  if (!toolbar) return;
  
  // Check if user has saved a custom position
  const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS);
  const hasSavedPosition = savedPosRaw && savedPosRaw !== 'null';
  
  if (!hasSavedPosition) {
    // No saved position - recenter between logo and comic on resize
    positionToolbarCentered(toolbar);
    return;
  }
  
  // User has saved position - just clamp within bounds
  const hasExplicitPosition = toolbar.style.top && toolbar.style.left;
  if (!hasExplicitPosition) return;
  
  const rect = toolbar.getBoundingClientRect();
  let top = parseFloat(toolbar.style.top);
  let left = parseFloat(toolbar.style.left);
  const maxLeft = window.innerWidth - rect.width;
  const maxTop = window.innerHeight - rect.height;
  let changed = false;
  
  if (left < 0) { left = 0; changed = true; }
  if (top < 0) { top = 0; changed = true; }
  if (left > maxLeft) { left = Math.max(0, maxLeft); changed = true; }
  if (top > maxTop) { top = Math.max(0, maxTop); changed = true; }
  
  if (changed) {
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
    
    // Preserve the belowComic and belowSettings flags when clamping
    const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
    const belowComic = savedPos && savedPos.belowComic !== undefined ? savedPos.belowComic : false;
    const belowSettings = savedPos && savedPos.belowSettings !== undefined ? savedPos.belowSettings : false;
    
    try { 
      localStorage.setItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify({ 
        top, 
        left, 
        belowComic,
        belowSettings
      })); 
    } catch(_) {}
  }
}

/**
 * Generic draggable element maker - eliminates duplicate drag code
 * @param {HTMLElement} element - Element to make draggable
 * @param {HTMLElement} dragHandle - Element that triggers dragging (usually header)
 * @param {string} storageKey - localStorage key for saving position
 * @param {Function} onDragStart - Optional callback when drag starts
 * @param {Function} onDragEnd - Optional callback when drag ends
 */
function makeDraggable(element, dragHandle, storageKey, onDragStart = null, onDragEnd = null) {
  if (!element || !dragHandle) return;
  
  let isDragging = false;
  let offsetX, offsetY;
  let elementStartX, elementStartY;
  
  function onDown(e) {
    // For mouse events, only drag with the left button
    if (e.type === 'mousedown' && e.button !== 0) return;
    
    // Prevent dragging when interacting with buttons or inputs
    if (e.target.closest('button, input')) return;
    
    // Check if target is the handle or within it
    if (!(e.target === dragHandle || dragHandle.contains(e.target))) return;
    
    isDragging = true;
    element.style.cursor = 'grabbing';
    element.style.transition = 'none';
    
    const event = e.touches ? e.touches[0] : e;
    const rect = element.getBoundingClientRect();
    
    // Get current position
    elementStartX = parseFloat(element.style.left) || rect.left + window.scrollX;
    elementStartY = parseFloat(element.style.top) || rect.top + window.scrollY;
    
    // Calculate offset from touch/click point to element's top-left
    offsetX = event.clientX + window.scrollX - elementStartX;
    offsetY = event.clientY + window.scrollY - elementStartY;
    
    // Callback for custom start behavior
    if (onDragStart) onDragStart(element);
    
    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    
    e.preventDefault();
  }
  
  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const event = e.touches ? e.touches[0] : e;
    
    // Calculate new position
    let newLeft = event.clientX - offsetX + window.scrollX;
    let newTop = event.clientY - offsetY + window.scrollY;
    
    // Get element dimensions for boundary checking
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    
    // Constrain within document bounds
    const docWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const docHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
    
    newLeft = Math.max(0, Math.min(newLeft, docWidth - width));
    newTop = Math.max(0, Math.min(newTop, docHeight - height));
    
    // Apply position
    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;
    element.style.transform = 'none';
  }
  
  function onUp() {
    if (!isDragging) return;
    
    isDragging = false;
    element.style.cursor = dragHandle === element ? 'grab' : '';
    
    // Save position
    const numericTop = parseFloat(element.style.top) || 0;
    const numericLeft = parseFloat(element.style.left) || 0;
    
    // For toolbar, also save whether it's below the comic and settings
    let isBelowComic = false;
    let isBelowSettings = false;
    if (storageKey === CONFIG.STORAGE_KEYS.TOOLBAR_POS) {
      const comic = document.getElementById('comic');
      const settingsPanel = document.getElementById('settingsDIV');
      
      if (comic) {
        const elementRect = element.getBoundingClientRect();
        const comicRect = comic.getBoundingClientRect();
        // Toolbar is below comic if its top edge is below comic's bottom edge
        isBelowComic = elementRect.top > comicRect.bottom;
        
        // Also check if below settings panel (only matters if settings is visible)
        if (settingsPanel && settingsPanel.classList.contains('visible')) {
          const settingsRect = settingsPanel.getBoundingClientRect();
          isBelowSettings = elementRect.top > settingsRect.bottom;
        }
      }
    }
    
    try {
      const positionData = { top: numericTop, left: numericLeft };
      if (storageKey === CONFIG.STORAGE_KEYS.TOOLBAR_POS) {
        positionData.belowComic = isBelowComic;
        positionData.belowSettings = isBelowSettings;
      }
      localStorage.setItem(storageKey, JSON.stringify(positionData));
    } catch(_) {}
    
    // Callback for custom end behavior
    if (onDragEnd) onDragEnd(element);
    
    // Re-enable transitions
    setTimeout(() => { element.style.transition = ''; }, 50);
    
    // Remove listeners
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchend', onUp);
  }
  
  // Attach initial listeners
  dragHandle.addEventListener('mousedown', onDown);
  dragHandle.addEventListener('touchstart', onDown, { passive: false });
}

// ========================================
// SHARING FUNCTIONALITY
// ========================================

/**
 * Shares the current comic using Web Share API with extensive fallbacks
 * Handles image sharing, text fallbacks, and clipboard copying
 * @returns {Promise<void>}
 */
async function Share() 
{
	if(!pictureUrl) {
		alert('Sorry, no comic is available to share at this moment.');
		return;
	}

	// Create share text with current date
	const shareText = `Check out this DirkJan comic from ${formattedDate}!`;
	const shareUrl = 'https://dirkjanapp.pages.dev';

	// Detect Android for special handling
	const isAndroid = /Android/i.test(navigator.userAgent);

	// Check if Web Share API is supported
	if(!navigator.share) {
		fallbackShare(shareText, shareUrl);
		return;
	}

	// Show immediate feedback to user
	const originalShareButton = document.getElementById('share');
	if (originalShareButton) {
		originalShareButton.style.opacity = '0.6';
		originalShareButton.style.pointerEvents = 'none';
	}

	try {
		await shareWithImage(shareText, shareUrl);
	} catch (error) {
		// Enhanced fallback for Android - try different approaches
		if (isAndroid) {
			try {
				
				// Android-specific: Try sharing with the image URL prominently featured
				const androidShareText = `📸 DirkJan Comic from ${formattedDate}\n\n🖼️ Image: ${pictureUrl}\n\n📱 Get the app: ${shareUrl}`;
				
				// First try: Image URL as main content
				try {
					await navigator.share({
						title: 'DirkJan Comic Image',
						text: androidShareText
					});
					return;
				} catch (error) {
					// Try next method
				}
				
				// Second try: Just the image URL with minimal text
				try {
					await navigator.share({
						title: 'DirkJan Comic',
						text: `Comic image: ${pictureUrl}`,
						url: shareUrl
					});
					return;
				} catch (error) {
					// Try next method
				}
				
				// Third try: Original approach
				await navigator.share({
					title: 'DirkJan Comic',
					text: `${shareText}\n\n📸 Comic image: ${pictureUrl}\n\n🌐 App: ${shareUrl}`
				});
			} catch (androidError) {
				fallbackShare(shareText, shareUrl);
			}
		} else {
			// Enhanced text fallback for other devices
			try {
				await navigator.share({
					title: 'DirkJan Comic',
					text: `${shareText}\n\nView comic image: ${pictureUrl}`,
					url: shareUrl
				});
			} catch (textError) {
				// Final fallback to clipboard
				fallbackShare(shareText, shareUrl);
			}
		}
	} finally {
		// Restore share button
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
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob(jBlob => {
          if (!jBlob) return reject(new Error('JPEG conversion failed'));
          resolve(new File([jBlob], `dirkjan-comic-${formattedDate}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => reject(new Error('Image load for conversion failed'));
      img.src = URL.createObjectURL(blob);
    });
  } else {
    finalFile = new File([blob], `dirkjan-comic-${formattedDate}.jpg`, { type: 'image/jpeg' });
  }

  // Share prioritizing file only (best chance some Android shells actually attach the image)
  const isAndroid = /Android/i.test(navigator.userAgent);
  const shareVariants = isAndroid ? [
    { files: [finalFile] },
    { title: 'DirkJan Comic', files: [finalFile] },
    { title: 'DirkJan Comic', text: shareText, files: [finalFile] }
  ] : [
    { title: 'DirkJan Comic', text: shareText, files: [finalFile] }
  ];

  for (const payload of shareVariants) {
    try {
      if (navigator.canShare && !navigator.canShare({ files: payload.files })) {
        continue;
      }
      await navigator.share(payload);
      return;
    } catch (err) {
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
	const shareContent = `${text}\n${url}\n\nComic image: ${pictureUrl}`;
	
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(shareContent).then(() => {
			alert('Comic link and image URL copied to clipboard! You can now paste it anywhere to share.');
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
	// Create a more user-friendly dialog
	const userCopied = prompt('Copy this text to share the comic (includes both link and image URL):\n\n(Tip: Select all with Ctrl+A, then copy with Ctrl+C)', content);
	if (userCopied !== null) {
		alert('Thanks for sharing DirkJan comics!');
	}
}

// ========================================
// INITIALIZATION & NAVIGATION
// ========================================

/**
 * Initializes the application on page load
 * Sets up initial date, favorites, and displays the first comic
 */  
function onLoad()
{
  // Check URL parameters for app shortcuts
  const urlParams = new URLSearchParams(window.location.search);
  
  comicstartDate = "2015/05/04";   
  currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
 
  let favs = loadFavs();

  if (favs == null) {
    favs = [];
  }
  if (document.getElementById("showfavs").checked) {
    currentselectedDate = new Date(favs[0]);
    if (favs.length === 0) {
      document.getElementById("showfavs").checked = false;
      document.getElementById("showfavs").disabled = true;
      currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
    }
  } else {
    if (favs.length === 0) {
      document.getElementById("showfavs").checked = false;
      document.getElementById("showfavs").disabled = true;
      currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
    }
    currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
  }
 
 maxDate = new Date();
 nextclicked = true;

  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }

  switch (maxDate.getDay())
  {
    case 0:
      maxDate.setDate(maxDate.getDate()+6);
      break;
    case 1:
      maxDate.setDate(maxDate.getDate()+5);
      break;
    case 2:
      maxDate.setDate(maxDate.getDate()+4);
      break;
    case 3:
      maxDate.setDate(maxDate.getDate()+3);
      break;
    case 4:
       maxDate.setDate(maxDate.getDate()+2);
       break;
    case 5:
      maxDate.setDate(maxDate.getDate()+1);
      break;
    case 6:
      maxDate.setDate(maxDate.getDate()+7);
      break;
    }

  formatDate(maxDate);
  
  formattedmaxDate = year+'-'+month+'-'+day;
  document.getElementById("DatePicker").setAttribute("max", formattedmaxDate);
  
  if(document.getElementById("lastdate").checked)   
	{
		if(localStorage.getItem('lastcomic') !== null)
		{
			currentselectedDate = new Date(localStorage.getItem('lastcomic'));
		}
	}
  
  // Handle app shortcut for random comic
  if (urlParams.get('random') === 'true') {
    const start = new Date(comicstartDate);
    const end = new Date();
    currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  }
  
  CompareDates();
  DisplayComic();
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
      currentselectedDate = new Date(favs[idx - 1]);
    }
  } else {
    currentselectedDate.setDate(currentselectedDate.getDate() - 1);
  }
  nextclicked = false;
  CompareDates();
  DisplayComic();
} 

/**
 * Navigates to the next comic
 * Handles both normal and favorites-only mode
 */
function NextClick()
{
  nextclicked = true;
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    const idx = favs.indexOf(formattedDate);
    if (idx > -1 && idx < favs.length - 1) {
      currentselectedDate = new Date(favs[idx + 1]);
    }
  } else {
    currentselectedDate.setDate(currentselectedDate.getDate() + 1);
  }
  CompareDates();
  DisplayComic();
}

/**
 * Navigates to the first comic
 * In favorites mode, goes to first favorite
 */
function FirstClick()
{
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    if (favs.length) currentselectedDate = new Date(favs[0]);
  } else {
    currentselectedDate = new Date(Date.UTC(1978, 5, 19,12));
  }
  CompareDates();
  DisplayComic();
}

/**
 * Navigates to the current/latest comic
 * In favorites mode, goes to last favorite
 */
function CurrentClick()
{
  if (document.getElementById("showfavs").checked) {
    const favs = loadFavs();
    const favslength = favs.length - 1;
    if (favslength >= 0) currentselectedDate = new Date(favs[favslength]);
  } else {
    currentselectedDate = new Date();
    if (currentselectedDate.getDay() == 0) {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  }
  CompareDates();
  DisplayComic();
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
      currentselectedDate = new Date(favs[Math.floor(Math.random() * favs.length)]);
    }
  } else {
    const start = new Date(comicstartDate);
    const end = new Date();
    currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  }
  CompareDates();
  DisplayComic();
}

/**
 * Handles date picker changes
 * Syncs both main and rotated date pickers
 */
function DateChange()
{
  // Get the date from either the main or rotated date picker
  const mainDatePicker = document.getElementById('DatePicker');
  const rotatedDatePicker = document.getElementById('rotated-DatePicker');
  
  let selectedDate;
  if (rotatedDatePicker && rotatedDatePicker.value) {
    selectedDate = rotatedDatePicker.value;
    // Sync the main date picker
    if (mainDatePicker) {
      mainDatePicker.value = selectedDate;
    }
  } else if (mainDatePicker && mainDatePicker.value) {
    selectedDate = mainDatePicker.value;
    // Sync the rotated date picker if it exists
    if (rotatedDatePicker) {
      rotatedDatePicker.value = selectedDate;
    }
  }
  
  if (selectedDate) {
    currentselectedDate = new Date(selectedDate);
    if (currentselectedDate.getDay() == 0) {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
    CompareDates();
    DisplayComic();
  }
}

/**
 * Extracts the comic image URL from the dirkjan.nl HTML page
 * Uses multiple extraction methods for reliability
 * @param {string} html - The HTML content from dirkjan.nl
 * @returns {string|null} The extracted image URL or null if not found
 */
function extractComicImageUrl(html) {
  // Method 1: Regex to find img tag within article.cartoon
  const articleMatch = html.match(/<article class="cartoon"[^>]*>([\s\S]*?)<\/article>/);
  if (articleMatch) {
    const articleContent = articleMatch[1];
    const imgMatch = articleContent.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }
  
  // Method 2: Direct regex for img src in cartoon article
  const directMatch = html.match(/<article class="cartoon"[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/);
  if (directMatch && directMatch[1]) {
    return directMatch[1];
  }
  
  // Method 3: Look for WordPress media library pattern (common URL structure)
  const wpMatch = html.match(/https?:\/\/dirkjan\.nl\/wp-content\/uploads\/[^"'\s]+\.(?:jpg|jpeg|png|gif)/i);
  if (wpMatch) {
    return wpMatch[0];
  }
  
  // Method 4: Fallback to original substring method (legacy support)
  const cartoonPos = html.indexOf('<article class="cartoon">');
  if (cartoonPos !== -1) {
    const startPos = cartoonPos + 41;
    const substring = html.substring(startPos, startPos + 200);
    const endPos = substring.indexOf('"');
    if (endPos > 0) {
      return html.substring(startPos, startPos + endPos);
    }
  }
  
  return null;
}

/**
 * Fetches and displays the current comic
 * Handles loading states, errors, and updates UI
 */
function DisplayComic()
{
  try {
    formatDate(currentselectedDate);

  formattedDate = year+"-"+month+"-"+day;
  formattedComicDate = year+month+day;
  document.getElementById('DatePicker').value = formattedDate;
  
  // Also sync the rotated date picker if it exists
  const rotatedDatePicker = document.getElementById('rotated-DatePicker');
  if (rotatedDatePicker) {
    rotatedDatePicker.value = formattedDate;
  }
  
  const url = `https://dirkjan.nl/cartoon/${formattedComicDate}`;

  localStorage.setItem('lastcomic', currentselectedDate);
  
  // Show loading state
  const comicImg = document.getElementById("comic");
  const rotatedComic = document.getElementById('rotated-comic');
  
  comicImg.classList.add('loading');
  comicImg.classList.remove('loaded');
  
  fetchWithFallback(url)
    .then(function(response)
	{
      return response.text();
    })
    .then(function(text)
	{
      siteBody = text;
      notFound = siteBody.includes("error404");
      
      if (notFound == false)
      {
        // Extract image URL using multiple methods for reliability
        pictureUrl = extractComicImageUrl(siteBody);
        
        if (!pictureUrl) {
          throw new Error('Could not extract comic image URL from page');
        }
        
        // Create new image to preload and add smooth transition
        const tempImg = new Image();
        tempImg.onload = function() {
          comicImg.src = pictureUrl;
          comicImg.alt = `DirkJan strip van ${day}-${month}-${year} door Mark Retera`;
          comicImg.classList.remove('loading');
          comicImg.classList.add('loaded');
          
          // Also update the rotated comic if it exists
          if (rotatedComic) {
            rotatedComic.src = pictureUrl;
          }
        };
        tempImg.onerror = function() {
          comicImg.classList.remove('loading');
          comicImg.src = "";
          comicImg.alt = "Failed to load comic image.";
        };
        tempImg.src = pictureUrl;
      }
      else
      {
        comicImg.classList.remove('loading');
        if (nextclicked)
        {
          NextClick();
        }
        else
        {
          PreviousClick();
        }
      }
    })
    .catch(function(error) {
      comicImg.classList.remove('loading');
      comicImg.src = ""; // Clear the image
      comicImg.alt = "Failed to load comic. Please try again later.";
    });
    
  let favs = loadFavs();
  if (favs == null) {
    favs = [];
  }
  
  // Update heart icon based on favorite status
  const heartButton = document.getElementById("favheart");
  const heartSvg = heartButton ? heartButton.querySelector('svg') : null;
  
  if (favs.indexOf(formattedDate) == -1) {
    // Not a favorite - unfilled heart
    if (heartSvg) {
      heartSvg.style.fill = 'none';
      heartSvg.style.stroke = 'currentColor';
    }
  } else {
    // Is a favorite - filled heart
    if (heartSvg) {
      heartSvg.style.fill = 'currentColor';
      heartSvg.style.stroke = 'currentColor';
    }
  }
  
  // Preload adjacent comics after a short delay
  setTimeout(() => {
    preloadAdjacentComics();
  }, 500);
  
  } catch (error) {
    console.error('Error in DisplayComic():', error);
    const comicImg = document.getElementById("comic");
    if (comicImg) {
      comicImg.classList.remove('loading');
      comicImg.src = "";
      comicImg.alt = "Failed to display comic. Please try again.";
    }
  }
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
  const today = new Date().setHours(0, 0, 0, 0);
  
  // Normalize dates for comparison
  const normalizeDate = (date) => new Date(date).setHours(0, 0, 0, 0);
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
    
  const endDate = showFavsChecked && favs.length > 0
    ? normalizeDate(favs[favs.length - 1])
    : normalizeDate(maxDate);
  
  // Calculate button states
  const buttonStates = {
    First: currentTime <= startDate,
    Previous: currentTime <= startDate,
    Next: currentTime >= endDate,
    Current: currentTime === today && !showFavsChecked,
    Random: showFavsChecked && favs.length <= 1
  };
  
  // Special case: In favorites mode, if we're at the last favorite and it's today
  if (showFavsChecked && favs.length > 0) {
    const lastFavDate = normalizeDate(favs[favs.length - 1]);
    if (currentTime === lastFavDate && lastFavDate === today) {
      buttonStates.Current = true;
    }
  }
  
  // Apply all button states at once
  setButtonStates(buttonStates);
  
  // Adjust current date if out of bounds
  if (currentTime < startDate) {
    formatDate(new Date(startDate));
    currentselectedDate = new Date(Date.UTC(year, month - 1, day, 12));
  } else if (currentTime > endDate) {
    formatDate(new Date(endDate));
    currentselectedDate = new Date(Date.UTC(year, month - 1, day, 12));
  }
}

 /**
  * Formats a date object into year, month, day components
  * Sets global year, month, day variables
  * @param {Date} datetoFormat - Date to format
  * @deprecated Use UTILS.formatDate instead - this is handled by backward compat wrapper above
  */

// ========================================
// COMIC ROTATION & FULLSCREEN
// ========================================

// Debounce flag to prevent rapid rotation calls
let isRotating = false;

/**
 * Toggles comic rotation to fullscreen mode
 * Handles both entering and exiting fullscreen with optional 90-degree rotation
 * Includes tap detection and swipe support in fullscreen mode
 * @param {boolean} applyRotation - Whether to apply 90-degree rotation (default: true)
 */
function Rotate(applyRotation = true) {
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
    
    // Check if we're already in fullscreen mode
    const existingOverlay = document.getElementById('comic-overlay');
  if (existingOverlay) {
    // We're in fullscreen mode, exit it immediately
    document.body.removeChild(existingOverlay);
    
    // Remove rotated image if it exists
    const rotatedComic = document.getElementById('rotated-comic');
    if (rotatedComic) {
      document.body.removeChild(rotatedComic);
    }
    
    // Remove fullscreen toolbar if it exists
    const fullscreenToolbar = document.getElementById('fullscreen-toolbar');
    if (fullscreenToolbar) {
      document.body.removeChild(fullscreenToolbar);
    }
    
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
        const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS);
        const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
        
        if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
          const comicRect = comic.getBoundingClientRect();
          
          // Determine correct position based on saved flag
          const shouldBeBelow = savedPos.belowComic === true;
          let newTop, newLeft;
          
          newLeft = savedPos.left;
          
          if (shouldBeBelow) {
            // Toolbar should be below comic - prefer the saved absolute position
            const settingsPanel = document.getElementById('settingsDIV');
            let newTopCandidate = savedPos.top;

            // Always ensure we stay below the comic
            const minBelowComic = comicRect.bottom + 15;
            if (!Number.isFinite(newTopCandidate)) {
              newTopCandidate = minBelowComic;
            }
            newTopCandidate = Math.max(newTopCandidate, minBelowComic);

            if (settingsPanel && settingsPanel.classList.contains('visible')) {
              const settingsRect = settingsPanel.getBoundingClientRect();
              let belowSettingsFlag = savedPos.belowSettings === true;

              // Fallback: infer from saved top if flag missing
              if (!belowSettingsFlag) {
                belowSettingsFlag = savedPos.top > (settingsRect.bottom + 10);
              }

              if (belowSettingsFlag) {
                const desiredGap = savedPos.top > settingsRect.bottom
                  ? Math.max(savedPos.top - settingsRect.bottom, 15)
                  : 15;
                newTopCandidate = Math.max(newTopCandidate, settingsRect.bottom + desiredGap);
              } else {
                const minBelowSettings = settingsRect.bottom + 15;
                if (newTopCandidate < minBelowSettings) {
                  newTopCandidate = minBelowSettings;
                }
              }
            }

            newTop = newTopCandidate;
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
          
          // Update saved position
          // Also save whether it's below settings
          const settingsPanel = document.getElementById('settingsDIV');
          let belowSettings = false;
          if (settingsPanel && settingsPanel.classList.contains('visible')) {
            const settingsRect = settingsPanel.getBoundingClientRect();
            belowSettings = newTop > settingsRect.bottom;
          }
          
          localStorage.setItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify({ 
            top: newTop, 
            left: newLeft, 
            belowComic: shouldBeBelow,
            belowSettings: belowSettings
          }));
          
          // Show toolbar after positioning
          toolbar.style.visibility = 'visible';
        }
      }
    }, 250);
    
    return;
  }
  
  // Check if element has 'normal' class (it might have multiple classes like "normal loaded")
  if (element.className.includes("normal")) {
    // First hide all elements to prevent flickering
    const elementsToHideInitial = document.querySelectorAll('body > *');
    elementsToHideInitial.forEach(el => {
      el.dataset.originalDisplay = window.getComputedStyle(el).display;
      el.dataset.wasHidden = "true";
      el.style.setProperty('display', 'none', 'important');
    });

    // Create an overlay without any layout constraints
    const overlay = document.createElement('div');
    overlay.id = 'comic-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.3)';
    overlay.style.zIndex = '10000';    // Clone the comic image
    const clonedComic = element.cloneNode(true);
    clonedComic.id = 'rotated-comic';
    // Apply rotation class only if requested (for portrait mode)
    // In landscape mode, we show fullscreen without rotation
    clonedComic.className = applyRotation ? "rotate" : "fullscreen-landscape";
    clonedComic.style.display = 'block'; // Ensure visible
    
    // Create the fullscreen toolbar
    const fullscreenToolbar = document.createElement('div');
    fullscreenToolbar.id = 'fullscreen-toolbar';
    fullscreenToolbar.className = 'toolbar fullscreen-toolbar';
    fullscreenToolbar.innerHTML = `
      <button id="rotated-First" class="toolbar-button" onclick="FirstClick(); return false;" title="Eerste comic">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolbar-svg"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
      </button>
      <button id="rotated-Previous" class="toolbar-button" onclick="PreviousClick(); return false;" title="Vorige comic">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolbar-svg"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button id="rotated-Random" class="toolbar-button" onclick="RandomClick(); return false;" title="Willekeurige comic">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolbar-svg">
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
          <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/>
          <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/>
          <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/>
        </svg>
      </button>
      <button class="toolbar-button toolbar-datepicker-btn" title="Selecteer datum">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolbar-svg"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <input id="rotated-DatePicker" class="toolbar-datepicker" oninput="DateChange()" type="date" min="2015-05-04" title="Selecteer datum">
      </button>
      <button id="rotated-Next" class="toolbar-button" onclick="NextClick(); return false;" title="Volgende comic">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolbar-svg"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button id="rotated-Current" class="toolbar-button" onclick="CurrentClick(); return false;" title="Vandaag">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolbar-svg"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="2"/></svg>
      </button>
    `;
    // Add overlay, comic, and toolbar in order
    document.body.appendChild(overlay);
    document.body.appendChild(clonedComic);
    document.body.appendChild(fullscreenToolbar);

    // Add rotated class to toolbar for SVG rotation only if in rotated mode (not landscape)
    if (applyRotation) {
      fullscreenToolbar.classList.add('rotated');
    } else {
      fullscreenToolbar.classList.add('landscape-toolbar');
    }

    // Call CompareDates to set initial button states
    CompareDates();

    // Show the comic and toolbar
    clonedComic.style.display = 'block';
    fullscreenToolbar.style.display = 'flex';

    // Position toolbar at the bottom always
    positionFullscreenToolbar();

    // Add resize and orientation change listeners
    window.addEventListener('resize', handleRotatedViewResize);
    window.addEventListener('orientationchange', handleRotatedViewResize);
    
    // Apply sizing when image is loaded
    if (clonedComic.complete) {
      maximizeRotatedImage(clonedComic);
    } else {
      clonedComic.onload = function() {
        maximizeRotatedImage(clonedComic);
      };
    }
    
    // Prevent toolbar buttons from closing fullscreen
    fullscreenToolbar.addEventListener('click', function(e) {
      e.stopPropagation();
    });
    
    // Add swipe support in rotated view
    // We use the overlay for swipe events
    overlay.addEventListener('touchstart', handleTouchStart, { passive: false });
    overlay.addEventListener('touchmove', handleTouchMove, { passive: false });
    overlay.addEventListener('touchend', function(e) {
      handleTouchEnd(e);
      // Don't exit fullscreen mode on simple touch if it was a swipe
      e.stopPropagation();
    }, { passive: true });
    
    // Add click handler to exit fullscreen
    overlay.addEventListener('click', function() {
      Rotate(); // Call Rotate again to exit fullscreen
    });
  }
  else if (element.className.includes("rotate")) {
    element.className = 'normal';
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
function handleRotatedViewResize() {
  const rotatedComic = document.getElementById('rotated-comic');
  if (rotatedComic) {
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
	
	// Check if this was a tap (not a swipe)
	const absX = Math.abs(deltaX);
	const absY = Math.abs(deltaY);
	const isTap = absX < CONFIG.TAP_MAX_MOVEMENT && absY < CONFIG.TAP_MAX_MOVEMENT && deltaTime < CONFIG.TAP_MAX_TIME;
	
	// For swipe navigation, check if swipe is enabled
	if (!document.getElementById("swipe").checked) return;
	
	// Check if the swipe is valid (meets distance and time requirements)
  if (deltaTime > CONFIG.SWIPE_MAX_TIME) return;
	
	// Check if we're in fullscreen/rotated mode and which type
  const rotatedComic = document.getElementById('rotated-comic');
  const isInFullscreen = rotatedComic !== null;
  const isRotated = isInFullscreen && rotatedComic.className.includes('rotate');
  const isLandscapeFullscreen = isInFullscreen && rotatedComic.className.includes('fullscreen-landscape');
	
	// Determine swipe direction based on mode
	if (isRotated) {
    // Rotated mode (90° clockwise): Swipe gestures follow the rotation
    // Physical up/down becomes logical left/right, physical left/right becomes logical up/down
    if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
      // Vertical swipe (becomes horizontal navigation due to rotation)
      if (deltaY < 0) {
        // Swipe Up -> visually moves right -> Next
        NextClick();
      } else {
        // Swipe Down -> visually moves left -> Previous
        PreviousClick();
      }
    } else if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
      // Horizontal swipe (becomes vertical navigation due to rotation)
      if (deltaX < 0) {
        // Swipe Left -> visually moves down -> Random
        RandomClick();
      } else {
        // Swipe Right -> visually moves up -> Today
        CurrentClick();
      }
    }
  } else if (isLandscapeFullscreen) {
    // Landscape fullscreen (no rotation): Normal horizontal/vertical mapping
    if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
      // Horizontal swipe
      if (deltaX < 0) {
        // Swipe Left -> Next
        NextClick();
      } else {
        // Swipe Right -> Previous
        PreviousClick();
      }
    } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
      // Vertical swipe
      if (deltaY < 0) {
        // Swipe Up -> Today
        CurrentClick();
      } else {
        // Swipe Down -> Random
        RandomClick();
      }
    }
  } else {
    // Normal portrait mode: Horizontal for Next/Prev, Vertical for Random/Today
    if (absX > absY && absX > CONFIG.SWIPE_MIN_DISTANCE) {
      // Horizontal swipe
      if (deltaX > 0) {
        // Swipe right -> Previous
        PreviousClick();
      } else {
        // Swipe left -> Next
        NextClick();
      }
    } else if (absY > absX && absY > CONFIG.SWIPE_MIN_DISTANCE) {
      // Vertical swipe
      if (deltaY > 0) {
        // Swipe down -> Random
        RandomClick();
      } else {
        // Swipe up -> Today
        CurrentClick();
      }
    }
  }
}

// Add touch event listeners to the document
document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd, { passive: true });

// Add click handler for comic rotation
// Add orientation change listener
window.addEventListener('orientationchange', function() {
  setTimeout(() => {
    const orientation = screen.orientation?.type || '';
    const isLandscape = orientation.includes('landscape') || Math.abs(window.orientation) === 90;
    const rotatedComic = document.getElementById('rotated-comic');
    
    if (isLandscape) {
      // Device is in landscape
      if (!rotatedComic) {
        // Not in fullscreen yet - enter landscape fullscreen mode
        const comic = document.getElementById('comic');
        if (comic && comic.className.includes('normal')) {
          Rotate(false); // Enter fullscreen WITHOUT rotation (device is already landscape)
        }
      } else {
        // Already in fullscreen - just reposition
        maximizeRotatedImage(rotatedComic);
        positionFullscreenToolbar();
      }
    } else {
      // Device is in portrait
      if (rotatedComic) {
        // In fullscreen mode - exit it
        Rotate(); // Exit fullscreen
      }
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

  const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS) || localStorage.getItem('mainToolbarPosition');
  const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
  
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    // Apply saved position immediately
    mainToolbar.style.top = savedPos.top + 'px';
    mainToolbar.style.left = savedPos.left + 'px';
    mainToolbar.style.transform = 'none';
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
  window.addEventListener('resize', clampMainToolbarInView);
  
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
    let isPressed = false;
    
    // Touch start - mark as pressed
    button.addEventListener('touchstart', () => {
      isPressed = true;
      button.style.transition = 'all 0.1s ease';
    }, { passive: true });
    
    // Touch end - reset state with delay for visual feedback
    button.addEventListener('touchend', () => {
      if (isPressed) {
        setTimeout(() => {
          button.style.transform = '';
          button.style.transition = '';
          button.blur();
          isPressed = false;
        }, 150);
      }
    }, { passive: true });
    
    // Touch cancel - immediate reset
    button.addEventListener('touchcancel', () => {
      button.style.transform = '';
      button.style.transition = '';
      button.blur();
      isPressed = false;
    }, { passive: true });
    
    // Click handler (works for both mouse and touch)
    button.addEventListener('click', () => {
      setTimeout(() => {
        button.blur();
        button.style.transform = '';
      }, 150);
    });
    
    // Blur - cleanup transforms
    button.addEventListener('blur', () => {
      button.style.transform = '';
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
        isPressed = false;
      }
    });
  });
  
  // Global safeguard - reset any stuck buttons on touch end
  document.addEventListener('touchend', () => {
    setTimeout(() => {
      toolbarButtons.forEach(button => {
        button.style.transform = '';
        button.blur();
      });
    }, 200);
  }, { passive: true });
}

// Initialize mobile button states when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMobileButtonStates);
} else {
  initializeMobileButtonStates();
}

setStatus = document.getElementById("swipe");
setStatus.onclick = function()
{    
  if(document.getElementById("swipe").checked)
  {
    localStorage.setItem('stat', "true");
  }
  else
  {
    localStorage.setItem('stat', "false");
	}
}

setStatus = document.getElementById('lastdate');
setStatus.onclick = function()
{
  if(document.getElementById('lastdate').checked) 
  {
    localStorage.setItem('lastdate', "true");
  }
  else
  {
    localStorage.setItem('lastdate', "false");
  }
}

setStatus = document.getElementById('showfavs');
setStatus.onclick = function()
{
  const favs = loadFavs();
  if (document.getElementById('showfavs').checked) {
    localStorage.setItem('showfavs', "true");
    if (favs.indexOf(formattedDate) === -1 && favs.length) {
      currentselectedDate = new Date(favs[0]);
    }
  } else {
    localStorage.setItem('showfavs', "false");
  }
  CompareDates();
  DisplayComic();
}

getStatus = localStorage.getItem('stat');
  if (getStatus == "true")
  {
    document.getElementById("swipe").checked = true;
  }
  else
  {
    document.getElementById("swipe").checked = false;
  }

getStatus = localStorage.getItem('showfavs');
  if (getStatus == "true")
  {
    document.getElementById("showfavs").checked = true;
  }
  else
  {
    document.getElementById("showfavs").checked = false;
  }

getStatus = localStorage.getItem('lastdate');
    if (getStatus == "true")
    {
      document.getElementById("lastdate").checked = true;
    }
    else
    {
      document.getElementById("lastdate").checked = false;
    }

getStatus = localStorage.getItem('settings');
    const settingsPanel = document.getElementById("settingsDIV");
    if (getStatus == "true" && settingsPanel) {
      settingsPanel.classList.add('visible');
    } else if (settingsPanel) {
      settingsPanel.classList.remove('visible');
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
      heartSvg.style.fill = 'currentColor';
      heartSvg.style.stroke = 'currentColor';
    }
    document.getElementById("showfavs").disabled = false;
  } else {
    favs = favs.filter(f => f !== formattedDate);
    // Unfill the heart
    if (heartSvg) {
      heartSvg.style.fill = 'none';
      heartSvg.style.stroke = 'currentColor';
    }
    if (favs.length === 0) {
      document.getElementById("showfavs").checked = false;
      document.getElementById("showfavs").disabled = true;
    }
  }
  saveFavs(favs);
  CompareDates();
  DisplayComic();
}

/**
 * Toggles the settings panel visibility
 */   
function HideSettings()
{
  const panel = document.getElementById("settingsDIV");
  
  if (!panel) return;
  
  // Toggle visibility using class
  if (panel.classList.contains('visible')) {
    panel.classList.remove('visible');
    localStorage.setItem('settings', "false");
  } else {
    // Before showing, ensure saved position is applied
    const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS_POS);
    const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
    if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
      panel.style.top = savedPos.top + 'px';
      panel.style.left = savedPos.left + 'px';
      panel.style.transform = 'none';
    }
    
    panel.classList.add('visible');
    localStorage.setItem('settings', "true");
  }
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
  const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.SETTINGS_POS);
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
  
  const installButton = document.createElement('button');
  installButton.innerText = 'Install App';
  installButton.id = 'pwa-install-button';
  installButton.style.position = 'fixed';
  installButton.style.bottom = '10px';
  installButton.style.right = '10px';
  installButton.style.padding = '10px 20px';
  installButton.style.backgroundColor = '#F09819';
  installButton.style.color = 'white';
  installButton.style.border = 'none';
  installButton.style.borderRadius = '5px';
  installButton.style.cursor = 'pointer';
  installButton.style.zIndex = '9999';
  installButton.style.fontWeight = 'bold';
  installButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
  document.body.appendChild(installButton);

  installButton.addEventListener('click', () => {
    // Hide the app provided install promotion
    installButton.style.display = 'none';
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
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
  
  // Check if this is a landscape fullscreen (no rotation) or rotated mode
  const isLandscapeMode = imgElement.className.includes('fullscreen-landscape');
  const isRotatedMode = imgElement.className.includes('rotate');
  
  // For a rotated image, the visual width is the original height, and vice versa
  // But for landscape mode, use natural dimensions
  const rotatedWidth = isLandscapeMode ? naturalWidth : naturalHeight;
  const rotatedHeight = isLandscapeMode ? naturalHeight : naturalWidth;
  
  // Calculate the scale factor needed to fit the image within the viewport
  let scale;
  if (rotatedWidth / rotatedHeight > viewportWidth / viewportHeight) {
    // Image is wider than viewport (relative to aspect ratios)
    scale = viewportWidth / rotatedWidth;
  } else {
    // Image is taller than viewport (relative to aspect ratios)
    scale = viewportHeight / rotatedHeight;
  }
  
  // Make the image slightly smaller (90% of the calculated size)
  scale = scale * 0.9;
  
  // Apply dimension with calculated scale
  imgElement.style.width = `${naturalWidth * scale}px`;
  imgElement.style.height = `${naturalHeight * scale}px`;
  
  // Position element - but let CSS handle the transform for rotation
  imgElement.style.position = 'fixed';
  
  // Set positioning based on mode
  if (isLandscapeMode) {
    // In landscape mode, position higher to avoid toolbar overlap
    // Set explicit positioning for landscape mode
    imgElement.style.top = '40%';
    imgElement.style.left = '50%';
    imgElement.style.transformOrigin = 'center center';
  } else if (isRotatedMode) {
    // In rotated mode, let CSS handle positioning completely
    // Don't set top/left inline to avoid conflicts with CSS transform
    imgElement.style.top = '';
    imgElement.style.left = '';
    imgElement.style.transformOrigin = '';
  }
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
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify({ 
        top: centeredTop, 
        left: centeredLeft,
        belowComic: false,  // Centered position is always above comic (between logo and comic)
        belowSettings: false
      }));
    } catch(_) {}
  }
}

/**
 * Makes the main toolbar draggable
 * @param {HTMLElement} toolbar - The toolbar element to make draggable
 */
function makeMainToolbarDraggable(toolbar) {
  if (!toolbar) return;

  // Restore saved absolute position on load (document coordinates)
  const savedPosRaw = localStorage.getItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS) || localStorage.getItem('mainToolbarPosition');
  const savedPos = UTILS.safeJSONParse(savedPosRaw, null);
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    toolbar.style.top = savedPos.top + 'px';
    toolbar.style.left = savedPos.left + 'px';
    toolbar.style.transform = 'none';
    
    // Migrate old storage key
    if (!localStorage.getItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS)) {
      try { 
        localStorage.setItem(CONFIG.STORAGE_KEYS.TOOLBAR_POS, JSON.stringify(savedPos)); 
        localStorage.removeItem('mainToolbarPosition'); 
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
      // End key - Current/Latest comic
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
const MAX_PRELOAD_CACHE = 20; // Limit memory usage
let preloadedComics = new Map();

function preloadAdjacentComics() {
  // Preload next and previous comics in the background
  if (!formattedDate) return;
  
  const currentDate = new Date(formattedDate);
  
  // Preload next comic
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + 1);
  preloadComic(nextDate);
  
  // Preload previous comic
  const prevDate = new Date(currentDate);
  prevDate.setDate(prevDate.getDate() - 1);
  preloadComic(prevDate);
  
  // Clean up old preloaded comics if cache is too large
  if (preloadedComics.size > MAX_PRELOAD_CACHE) {
    const keysToDelete = Array.from(preloadedComics.keys()).slice(0, preloadedComics.size - MAX_PRELOAD_CACHE);
    keysToDelete.forEach(key => preloadedComics.delete(key));
  }
}

/**
 * Preloads a comic in the background
 * @param {Date} date - Date of the comic to preload
 */
function preloadComic(date) {
  // Format date locally without affecting global state
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const y = date.getFullYear();
  const formattedMonth = ("0" + m).slice(-2);
  const formattedDay = ("0" + d).slice(-2);
  
  const preloadFormattedDate = `${y}-${formattedMonth}-${formattedDay}`;
  const preloadFormattedComicDate = `${y}${formattedMonth}${formattedDay}`;
  
  // Don't preload if already cached
  if (preloadedComics.has(preloadFormattedDate)) return;
  
  const url = `https://dirkjan.nl/cartoon/${preloadFormattedComicDate}`;
  
  fetchWithFallback(url, false) // Disable racing for background preloading
    .then(response => response.text())
    .then(text => {
      if (text.includes("error404")) return;
      
      const imageUrl = extractComicImageUrl(text);
      if (!imageUrl) return;
      
      // Preload the actual image
      const img = new Image();
      img.onload = () => preloadedComics.set(preloadFormattedDate, imageUrl);
      img.src = imageUrl;
    })
    .catch(() => {
      // Silently fail for background preloading
    });
}

// We'll call preloadAdjacentComics() directly from within DisplayComic instead of wrapping it

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
  
  const hasSeenHint = localStorage.getItem('keyboardHintSeen');
  
  if (!hasSeenHint) {
    setTimeout(() => {
      const hint = document.createElement('div');
      hint.id = 'keyboard-hint';
      hint.innerHTML = `
        <div style="position: fixed; bottom: 20px; right: 20px; background: rgba(0,0,0,0.85); color: white; padding: 15px 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10003; max-width: 300px; font-size: 14px; backdrop-filter: blur(10px);">
          <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">⌨️ Keyboard Shortcuts</div>
          <div style="line-height: 1.6;">
            ← → : Previous/Next<br>
            Home/End : First/Latest<br>
            Space/R : Random<br>
            F : Favorite
          </div>
          <button onclick="this.parentElement.parentElement.remove(); localStorage.setItem('keyboardHintSeen', 'true');" style="margin-top: 12px; padding: 6px 12px; background: linear-gradient(45deg, #f09819 0%, #ff8c00 100%); border: none; border-radius: 6px; color: white; cursor: pointer; font-weight: bold; width: 100%;">Got it!</button>
        </div>
      `;
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
            localStorage.setItem('keyboardHintSeen', 'true');
          }, 500);
        }
      }, 8000);
    }, 2000); // Show after 2 seconds
  }
}

// Show hint on page load (desktop only)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', showKeyboardShortcutsHint);
} else {
  showKeyboardShortcutsHint();
}
