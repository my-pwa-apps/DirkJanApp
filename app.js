// ========================================
// SERVICE WORKER REGISTRATION & PWA SETUP
// ========================================
if ("serviceWorker" in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register("./serviceworker.js")
      .then(registration => {
        // Check for updates periodically (every hour)
        setInterval(() => {
          registration.update();
        }, 3600000);
        
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

// Show update notification to user
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

// Update app to new version
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

// Dismiss update notification
function dismissUpdate() {
  const notification = document.getElementById('update-notification');
  if (notification) {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }
}

// Define CORS proxies with priority order
// Note: Garfield proxy may have intermittent issues, but we try it first
const CORS_PROXIES = [
  'https://corsproxy.garfieldapp.workers.dev/cors-proxy?',
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url='
];

// Track which proxy is currently working best
let workingProxyIndex = 0;
let proxyFailureCount = [0, 0, 0];

// Fetch with intelligent fallback function
async function fetchWithFallback(url) {
  let lastError;
  const maxRetries = CORS_PROXIES.length;
  
  // Start with the last known working proxy for better performance
  const startIndex = workingProxyIndex;
  
  for (let i = 0; i < maxRetries; i++) {
    const proxyIndex = (startIndex + i) % CORS_PROXIES.length;
    const proxy = CORS_PROXIES[proxyIndex];
    
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, { 
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      if (response.ok) {
        // Success! Update working proxy and reset failure count
        workingProxyIndex = proxyIndex;
        proxyFailureCount[proxyIndex] = 0;
        return response;
      }
      
      // Non-OK response, count as failure
      proxyFailureCount[proxyIndex]++;
      
    } catch (error) {
      lastError = error;
      proxyFailureCount[proxyIndex]++;
      
      // If this proxy has failed multiple times, deprioritize it
      if (proxyFailureCount[proxyIndex] >= 3) {
        // Skip to next proxy
        continue;
      }
    }
  }
  
  // If all proxies failed, try direct access with no-cors as last resort
  try {
    const response = await fetch(url, { mode: 'no-cors' });
    return response;
  } catch (error) {
    lastError = error;
  }
  
  // Reset failure counts if everything failed (network might be back)
  proxyFailureCount = [0, 0, 0];
  
  throw lastError || new Error('All fetch attempts failed');
}

let pictureUrl = ''; // Global comic image URL
let formattedDate = ''; // Global formatted date for sharing
// Explicitly declare other global state variables to avoid accidental implicit globals
let comicstartDate, currentselectedDate, maxDate, nextclicked, siteBody, notFound, picturePosition, endPosition, formattedComicDate, startDate, endDate, formattedmaxDate, year, month, day;
nextclicked = false;

// === Central constants & storage keys ===
const STORAGE_KEYS = Object.freeze({
  FAVS: 'favs',
  LAST_COMIC: 'lastcomic',
  TOOLBAR_POS: 'mainToolbarPosition',
  SWIPE: 'stat',
  SHOW_FAVS: 'showfavs',
  LAST_DATE: 'lastdate',
  SETTINGS_VISIBLE: 'settings'
});

// Swipe thresholds (could be tuned)
const SWIPE_MIN_DISTANCE = 50;   // px
const SWIPE_MAX_TIME = 500;      // ms

// === Favorites caching helpers ===
let _cachedFavs = null;
function loadFavs() {
  if (Array.isArray(_cachedFavs)) return _cachedFavs;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FAVS);
    if (!raw) return (_cachedFavs = []);
    const parsed = JSON.parse(raw);
    return (_cachedFavs = Array.isArray(parsed) ? parsed : []);
  } catch (e) {
    return (_cachedFavs = []);
  }
}
function saveFavs(arr) {
  if (!Array.isArray(arr)) return;
  const deduped = Array.from(new Set(arr)).sort();
  _cachedFavs = deduped;
  try { localStorage.setItem(STORAGE_KEYS.FAVS, JSON.stringify(deduped)); } catch (e) { /* ignore */ }
}
function invalidateFavsCache() { _cachedFavs = null; }

// Generic safe JSON parse helper
function safeJSONParse(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

// Keep toolbar within viewport on resize/orientation changes
function clampMainToolbarInView() {
  const toolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
  if (!toolbar) return;
  const rect = toolbar.getBoundingClientRect();
  let top = parseFloat(toolbar.style.top) || rect.top + window.scrollY;
  let left = parseFloat(toolbar.style.left) || rect.left + window.scrollX;
  const maxLeft = document.documentElement.scrollWidth - rect.width;
  const maxTop = document.documentElement.scrollHeight - rect.height;
  let changed = false;
  if (left < 0) { left = 0; changed = true; }
  if (top < 0) { top = 0; changed = true; }
  if (left > maxLeft) { left = Math.max(0, maxLeft); changed = true; }
  if (top > maxTop) { top = Math.max(0, maxTop); changed = true; }
  if (changed) {
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
    try { localStorage.setItem(STORAGE_KEYS.TOOLBAR_POS, JSON.stringify({ top, left })); } catch(_) {}
  }
}

async function Share() 
{
	console.log('Share() function called');
	console.log('pictureUrl:', pictureUrl);
	console.log('navigator.share available:', !!navigator.share);
	
	if(!pictureUrl) {
		alert('Sorry, no comic is available to share at this moment.');
		return;
	}

	// Create share text with current date
	const shareText = `Check out this DirkJan comic from ${formattedDate}!`;
	const shareUrl = 'https://dirkjanapp.pages.dev';

	// Detect Android for special handling
	const isAndroid = /Android/i.test(navigator.userAgent);
	console.log('isAndroid:', isAndroid);

	// Check if Web Share API is supported
	if(!navigator.share) {
		console.log('Web Share API not supported, using fallback');
		fallbackShare(shareText, shareUrl);
		return;
	}

	console.log('Web Share API supported, attempting to share');

	// Show immediate feedback to user
	const originalShareButton = document.getElementById('share');
	if (originalShareButton) {
		originalShareButton.style.opacity = '0.6';
		originalShareButton.style.pointerEvents = 'none';
	}

	try {
		console.log('Attempting shareWithImage...');
		await shareWithImage(shareText, shareUrl);
		console.log('shareWithImage succeeded');
	} catch (error) {
		console.log('shareWithImage failed:', error);
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
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyIndex = (workingProxyIndex + i) % CORS_PROXIES.length;
    attempts.push(`${CORS_PROXIES[proxyIndex]}${encodeURIComponent(pictureUrl)}`);
  }
  
  // Add direct URL as final fallback
  attempts.push(pictureUrl);

  let blob = null;
  for (const url of attempts) {
    try {
      const r = await tryFetch(url, 12000); // 12 second timeout for image downloads
      if (!r.ok) continue;
      const b = await r.blob();
      if (b.size < 400) continue; // Ensure valid image size
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

function showShareDialog(content) {
	// Create a more user-friendly dialog
	const userCopied = prompt('Copy this text to share the comic (includes both link and image URL):\n\n(Tip: Select all with Ctrl+A, then copy with Ctrl+C)', content);
	if (userCopied !== null) {
		alert('Thanks for sharing DirkJan comics!');
	}
}

  
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

function DisplayComic()
{
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
      picturePosition = siteBody.indexOf('<article class="cartoon">');
      picturePosition = picturePosition+41;
      if (notFound == false)
      {        // Store pictureUrl in the global variable
        pictureUrl = siteBody.substring(picturePosition, picturePosition+88);
        endPosition = pictureUrl.lastIndexOf('"');
        pictureUrl = siteBody.substring(picturePosition, picturePosition+endPosition);
        
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
}

function setButtonDisabled(id, disabled) {
  const mainButton = document.getElementById(id);
  if (mainButton) {
    mainButton.disabled = disabled;
  }
  
  const rotatedButton = document.getElementById(`rotated-${id}`);
  if (rotatedButton) {
    rotatedButton.disabled = disabled;
  }
}

 function CompareDates() {
  const favs = loadFavs();
  const rotatedDatePicker = document.getElementById('rotated-DatePicker');
  const showFavsChecked = document.getElementById("showfavs").checked;
  
  if (showFavsChecked) {
    document.getElementById("DatePicker").disabled = true;
    if (rotatedDatePicker) rotatedDatePicker.disabled = true;
    startDate = new Date(favs[0]);
  } else {	
		document.getElementById("DatePicker").disabled = false;
		if (rotatedDatePicker) rotatedDatePicker.disabled = false;
		startDate = new Date(comicstartDate);
	}
	startDate = startDate.setHours(0, 0, 0, 0);
	currentselectedDate = currentselectedDate.setHours(0, 0, 0, 0);
	startDate = new Date(startDate);
	currentselectedDate = new Date(currentselectedDate);
	if(currentselectedDate.getTime() <= startDate.getTime()) {
		setButtonDisabled("Previous", true);
		setButtonDisabled("First", true);
		formatDate(startDate);
		startDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		setButtonDisabled("Previous", false);
		setButtonDisabled("First", false);
	}
	if(document.getElementById("showfavs").checked) {
		endDate = new Date(favs[favs.length - 1]);
	}
	else{ 
		endDate = new Date(maxDate);
	}
	endate = endDate.setHours(0,0,0,0);
  endDate = new Date(endDate);

  if(currentselectedDate.getTime() >= endDate.getTime()) {
		setButtonDisabled("Next", true);
		formatDate(endDate);
		endDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		setButtonDisabled("Next", false);
		setButtonDisabled("Current", false);
	}

  if((currentselectedDate.getTime() === new Date().setHours(0, 0, 0, 0)) && document.getElementById('showfavs').checked == false)
  {
    setButtonDisabled("Current", true);
  }
  else
  {
    setButtonDisabled("Current", false);
  }

  if (showfavs.checked) {
    const lastFavDate = new Date(favs[favs.length - 1]).setHours(0, 0, 0, 0);
    const today = new Date().setHours(0, 0, 0, 0);
    if (currentselectedDate.getTime() === lastFavDate && lastFavDate === today) {
      setButtonDisabled("Current", true);
    }
  }
	if(document.getElementById("showfavs").checked) {
		//document.getElementById("Current").disabled = true;
		if(favs.length == 1) {
			setButtonDisabled("Random", true);
			setButtonDisabled("Previous", true);
			setButtonDisabled("First", true);
		} else {
			setButtonDisabled("Random", false);
			setButtonDisabled("Previous", false);
			setButtonDisabled("First", false);
		}
	} else {
		setButtonDisabled("Random", false);
	}
}

 function formatDate(datetoFormat)
 {
  day = datetoFormat.getDate();
  month = datetoFormat.getMonth() + 1;
  year = datetoFormat.getFullYear();
  month = ("0"+month).slice(-2);
  day = ("0"+day).slice(-2);
 }

// Add a flag to prevent rapid calls
let isRotating = false;

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
    
    // Make sure original comic is in normal state
    element.className = "normal";
    
    // Remove any event listeners added during rotation
    window.removeEventListener('resize', handleRotatedViewResize);
    window.removeEventListener('orientationchange', handleRotatedViewResize);
    
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
    clonedComic.className = "rotate";
    clonedComic.style.display = 'block'; // Ensure visible
    
    // Add click handler to rotated comic to exit fullscreen
    clonedComic.onclick = function(e) {
      e.stopPropagation();
      Rotate(); // Exit fullscreen mode
    };
    
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
      <button class="toolbar-button" onclick="Rotate(); return false;" title="Sluiten">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="toolbar-svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    // Add overlay, comic, and toolbar in order
    document.body.appendChild(overlay);
    document.body.appendChild(clonedComic);
    document.body.appendChild(fullscreenToolbar);

    // Add rotated class to toolbar for SVG rotation
    fullscreenToolbar.classList.add('rotated');

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
    }, 300);
  }
}

// Handle resize and orientation change in rotated view
function handleRotatedViewResize() {
  const rotatedComic = document.getElementById('rotated-comic');
  if (rotatedComic) {
    maximizeRotatedImage(rotatedComic);
  }
  positionFullscreenToolbar();
}

// Native swipe implementation
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let touchStartTime = 0;

// (Duplicate swipe constants removed; using SWIPE_MIN_DISTANCE and SWIPE_MAX_TIME defined earlier)

function handleTouchStart(e) {
	const touch = e.touches[0];
	touchStartX = touch.clientX;
	touchStartY = touch.clientY;
	touchStartTime = Date.now();
	console.log('Touch start - target:', e.target.id, 'x:', touchStartX, 'y:', touchStartY);
	
	// Early return for swipe gesture handling, but keep tracking for tap detection
	if (!document.getElementById("swipe").checked) return;
}

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

function handleTouchEnd(e) {
	const touch = e.changedTouches[0];
	touchEndX = touch.clientX;
	touchEndY = touch.clientY;
	
	const deltaX = touchEndX - touchStartX;
	const deltaY = touchEndY - touchStartY;
	const deltaTime = Date.now() - touchStartTime;
	
	// Check if this was a tap (not a swipe) on the comic element
	const absX = Math.abs(deltaX);
	const absY = Math.abs(deltaY);
	const isTap = absX < 10 && absY < 10 && deltaTime < 300;
	
	// If it's a tap on the comic image (not in fullscreen), trigger rotation
	// This works regardless of swipe setting
	const targetIsComic = e.target.id === 'comic' || e.target.closest('#comic');
	console.log('Touch end - isTap:', isTap, 'targetIsComic:', targetIsComic, 'target:', e.target.id, 'absX:', absX, 'absY:', absY, 'deltaTime:', deltaTime);
	if (isTap && targetIsComic && !document.getElementById('rotated-comic')) {
		console.log('Triggering rotation!');
		Rotate();
		return;
	}
	
	// For swipe navigation, check if swipe is enabled
	if (!document.getElementById("swipe").checked) return;
	
	// Check if the swipe is valid (meets distance and time requirements)
  if (deltaTime > SWIPE_MAX_TIME) return;
	
	// Check if we're in fullscreen/rotated mode
  const isInFullscreen = document.getElementById('rotated-comic') !== null;
	
	// Determine swipe direction based on mode
	if (isInFullscreen) {
    // Rotated mode: Vertical for Next/Prev, Horizontal for Random/Today
    if (absY > absX && absY > SWIPE_MIN_DISTANCE) {
      // Vertical swipe
      if (deltaY < 0) {
        // Swipe Up -> Previous
        PreviousClick();
      } else {
        // Swipe Down -> Next
        NextClick();
      }
    } else if (absX > absY && absX > SWIPE_MIN_DISTANCE) {
      // Horizontal swipe
      if (deltaX < 0) {
        // Swipe Left -> Random
        RandomClick();
      } else {
        // Swipe Right -> Today
        CurrentClick();
      }
    }
  } else {
    // Normal mode: Horizontal for Next/Prev, Vertical for Random/Today
    if (absX > absY && absX > SWIPE_MIN_DISTANCE) {
      // Horizontal swipe
      if (deltaX > 0) {
        // Swipe right
        PreviousClick();
      } else {
        // Swipe left
        NextClick();
      }
    } else if (absY > absX && absY > SWIPE_MIN_DISTANCE) {
      // Vertical swipe
      if (deltaY > 0) {
        // Swipe down
        RandomClick();
      } else {
        // Swipe up
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
function initializeComicRotation() {
  const comicElement = document.getElementById('comic');
  if (!comicElement) {
    console.error('initializeComicRotation: Comic element not found');
    return;
  }
  
  // Add click event listener for rotation (for mouse clicks)
  // Touch events are handled by the global touch handlers (handleTouchEnd)
  comicElement.addEventListener('click', function(e) {
    // Check if not in fullscreen already and not from a touch event
    // (touch events trigger both touchend and click, we handle them in touchend)
    if (!document.getElementById('rotated-comic') && e.detail > 0) {
      Rotate();
    }
  });
}

// Initialize rotation handlers immediately or wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeComicRotation);
} else {
  initializeComicRotation();
}

// Add orientation change listener
window.addEventListener('orientationchange', function() {
  // Check if we're in fullscreen/rotated mode
  const rotatedComic = document.getElementById('rotated-comic');
  if (rotatedComic) {
    // Reposition comic and toolbar
    setTimeout(() => {
      maximizeRotatedImage(rotatedComic);
      positionFullscreenToolbar();
    }, 300); // Small delay to ensure orientation has completed
  }
});

// Add event delegation for any fullscreen toolbar that might be created
document.body.addEventListener('touchstart', function(e) {
  if (e.target.closest('#fullscreen-toolbar')) {
    // If touch starts on toolbar or its children, don't initiate swipe
    e.stopPropagation();
  }
}, { capture: true });
  
  document.body.addEventListener('touchmove', function(e) {
    if (e.target.closest('#fullscreen-toolbar')) {
      // If touch moves on toolbar or its children, don't trigger swipe
      e.stopPropagation();
    }
  }, { capture: true });
  
  document.body.addEventListener('touchend', function(e) {
    if (e.target.closest('#fullscreen-toolbar')) {
      // If touch ends on toolbar or its children, don't trigger swipe
      e.stopPropagation();
    }
    
    // Fix mobile button state issues - force reset of button states
    if (e.target.closest('.toolbar-button, .toolbar-datepicker-btn')) {
      setTimeout(() => {
        e.target.closest('.toolbar-button, .toolbar-datepicker-btn').blur();
      }, 100);
    }
  }, { capture: true });
  
  // Fix mobile button state for main toolbar buttons
  document.addEventListener('touchend', function(e) {
    if (e.target.closest('.toolbar:not(.fullscreen-toolbar) .toolbar-button, .toolbar:not(.fullscreen-toolbar) .toolbar-datepicker-btn')) {
      const button = e.target.closest('.toolbar-button, .toolbar-datepicker-btn');
      if (button) {
        const isAndroid = /Android/i.test(navigator.userAgent);
        
        if (isAndroid) {
          // Android-specific: gentler reset that preserves visual feedback
          setTimeout(() => {
            button.blur();
            // Only reset if button is not being interacted with
            if (!button.matches(':active')) {
              button.style.transform = '';
              button.style.backgroundPosition = '';
            }
          }, 200);
          
          // Final cleanup
          setTimeout(() => {
            if (!button.matches(':active:hover')) {
              button.blur();
              button.style.transform = '';
              button.style.backgroundPosition = '';
            }
          }, 500);
        } else {
          // Standard handling for other devices
          setTimeout(() => {
            button.blur();
            button.style.transform = '';
            button.style.backgroundPosition = '';
          }, 150);
        }
      }
    }
  });
  
  // Lighter Android-specific event handling
  if (/Android/i.test(navigator.userAgent)) {
    // Handle focus issues without breaking interaction feedback
    document.addEventListener('focusin', function(e) {
      if (e.target.closest('.toolbar-button, .toolbar-datepicker-btn')) {
        // Only blur after a delay to allow visual feedback
        setTimeout(() => {
          if (!e.target.matches(':active')) {
            e.target.blur();
          }
        }, 300);
      }
    });
    
    // Clean up any lingering focus when touching elsewhere
    document.addEventListener('touchstart', function(e) {
      if (!e.target.closest('.toolbar-button, .toolbar-datepicker-btn')) {
        const focusedButton = document.querySelector('.toolbar-button:focus, .toolbar-datepicker-btn:focus');
        if (focusedButton) {
          focusedButton.blur();
        }
      }
    }, { passive: true });
  }

// Initialize toolbar dragging and mobile button states when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    // Make the main toolbar draggable
    const mainToolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
    makeMainToolbarDraggable(mainToolbar);

    const savedPosRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS) || localStorage.getItem('mainToolbarPosition');
    const savedPos = safeJSONParse(savedPosRaw, null);
    if (!savedPos && mainToolbar) {
      window.addEventListener('load', () => {
        // Calculate initial position between logo and comic
        const logo = document.querySelector('.logo');
        const toolbarContainer = document.querySelector('.toolbar-container');
        
        if (logo && toolbarContainer) {
          // Position toolbar right after the logo + its margin
          const logoRect = logo.getBoundingClientRect();
          const initialTop = logoRect.bottom + window.scrollY + 15; // 15px margin
          mainToolbar.style.top = initialTop + 'px';
        }
        
        // Center horizontally
        const viewportWidth = window.innerWidth;
        const rect = mainToolbar.getBoundingClientRect();
        const centeredLeft = (viewportWidth - rect.width) / 2;
        mainToolbar.style.left = centeredLeft + 'px';
        mainToolbar.style.transform = 'none'; // Remove the translateX transform
        
        clampMainToolbarInView();
      });
    } else {
      clampMainToolbarInView();
    }

    window.addEventListener('resize', clampMainToolbarInView);
    window.addEventListener('orientationchange', clampMainToolbarInView);
    
    // Add mobile button state reset functionality
    addMobileButtonStateReset();
  });
} else {
  // DOM already loaded
  const mainToolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
  makeMainToolbarDraggable(mainToolbar);

  const savedPosRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS) || localStorage.getItem('mainToolbarPosition');
  const savedPos = safeJSONParse(savedPosRaw, null);
  if (!savedPos && mainToolbar) {
    window.addEventListener('load', () => {
      // Calculate initial position between logo and comic
      const logo = document.querySelector('.logo');
      const toolbarContainer = document.querySelector('.toolbar-container');
      
      if (logo && toolbarContainer) {
        // Position toolbar right after the logo + its margin
        const logoRect = logo.getBoundingClientRect();
        const initialTop = logoRect.bottom + window.scrollY + 15; // 15px margin
        mainToolbar.style.top = initialTop + 'px';
      }
      
      // Center horizontally
      const viewportWidth = window.innerWidth;
      const rect = mainToolbar.getBoundingClientRect();
      const centeredLeft = (viewportWidth - rect.width) / 2;
      mainToolbar.style.left = centeredLeft + 'px';
      mainToolbar.style.transform = 'none'; // Remove the translateX transform
      
      clampMainToolbarInView();
    });
  } else {
    clampMainToolbarInView();
  }

  window.addEventListener('resize', clampMainToolbarInView);
  window.addEventListener('orientationchange', clampMainToolbarInView);
  
  // Add mobile button state reset functionality
  addMobileButtonStateReset();
}

// Function to handle mobile button state issues
function addMobileButtonStateReset() {
  // Add event listeners to all toolbar buttons to reset their state after click
  const toolbarButtons = document.querySelectorAll('.toolbar-button, .toolbar-datepicker-btn');
  
  toolbarButtons.forEach(button => {
    // Handle touchend to reset button state
    button.addEventListener('touchend', function() {
      // Small delay to allow the click event to fire first
      setTimeout(() => {
        this.blur(); // Remove focus
        this.style.transform = ''; // Reset any transform
      }, 100);
    }, { passive: true });
    
    // Handle click to reset button state (for both mouse and touch)
    button.addEventListener('click', function() {
      // Small delay to allow the action to complete
      setTimeout(() => {
        this.blur(); // Remove focus
        this.style.transform = ''; // Reset any transform
      }, 150);
    });
    
    // Handle focus loss
    button.addEventListener('blur', function() {
      this.style.transform = ''; // Reset any transform when losing focus
    });
  });
}

// Mobile button state management to fix "popped out" buttons on touch devices
function initializeMobileButtonStates() {
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  if (!isMobile && !isTouch) return;
  
  // Get all toolbar buttons
  const toolbarButtons = document.querySelectorAll('.toolbar-button, .toolbar-datepicker-btn');
  
  toolbarButtons.forEach(button => {
    let touchStartTime = 0;
    let isPressed = false;
    
    // Handle touch start
    button.addEventListener('touchstart', (e) => {
      touchStartTime = Date.now();
      isPressed = true;
      button.style.transition = 'all 0.1s ease';
    }, { passive: true });
    
    // Handle touch end - reset button state
    button.addEventListener('touchend', (e) => {
      if (isPressed) {
        // Small delay to allow the visual feedback, then reset
        setTimeout(() => {
          button.style.transform = '';
          button.style.transition = '';
          button.blur(); // Remove focus
          isPressed = false;
        }, 150);
      }
    }, { passive: true });
    
    // Handle touch cancel
    button.addEventListener('touchcancel', (e) => {
      button.style.transform = '';
      button.style.transition = '';
      button.blur();
      isPressed = false;
    }, { passive: true });
    
    // Handle focus loss
    button.addEventListener('blur', (e) => {
      if (isPressed) {
        button.style.transform = '';
        button.style.transition = '';
        isPressed = false;
      }
    });
    
    // Handle focus gain - make sure state is clean
    button.addEventListener('focus', (e) => {
      if (!isPressed) {
        button.style.transform = '';
        button.style.transition = '';
      }
    });
    
    // Additional safeguard: reset on mouse leave (for devices that support both touch and mouse)
    button.addEventListener('mouseleave', (e) => {
      if (isPressed) {
        button.style.transform = '';
        button.style.transition = '';
        isPressed = false;
      }
    });
  });
  
  // Global touch end handler as additional safeguard
  document.addEventListener('touchend', () => {
    toolbarButtons.forEach(button => {
      // Reset any stuck buttons
      setTimeout(() => {
        button.style.transform = '';
        button.blur();
      }, 200);
    });
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
   
function HideSettings()
{
  const panel = document.getElementById("settingsDIV");
  
  if (!panel) return;
  
  // Toggle visibility using class
  if (panel.classList.contains('visible')) {
    panel.classList.remove('visible');
    localStorage.setItem('settings', "false");
  } else {
    panel.classList.add('visible');
    localStorage.setItem('settings', "true");
  }
}

// Draggable settings panel functionality
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let panelStartX = 0;
let panelStartY = 0;

function initializeDraggableSettings() {
  const panel = document.getElementById("settingsDIV");
  const header = document.getElementById("settingsHeader");
  
  if (!panel || !header) return;
  
  // Mouse events
  header.addEventListener('mousedown', dragStart);
  document.addEventListener('mousemove', drag);
  document.addEventListener('mouseup', dragEnd);
  
  // Touch events
  header.addEventListener('touchstart', dragStart, { passive: false });
  document.addEventListener('touchmove', drag, { passive: false });
  document.addEventListener('touchend', dragEnd);
  
  function dragStart(e) {
    // Don't drag if clicking the close button
    if (e.target.closest('.settings-close')) return;
    
    if (!(e.target === header || header.contains(e.target))) return;
    
    isDragging = true;
    panel.style.transition = 'none';
    
    // Get current panel position
    const rect = panel.getBoundingClientRect();
    panelStartX = rect.left + rect.width / 2;  // Center X
    panelStartY = rect.top + rect.height / 2;   // Center Y
    
    // Get touch/mouse starting position
    if (e.type === "touchstart") {
      dragStartX = e.touches[0].clientX;
      dragStartY = e.touches[0].clientY;
    } else {
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    }
    
    e.preventDefault(); // Prevent text selection
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    
    let currentX, currentY;
    
    if (e.type === "touchmove") {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else {
      currentX = e.clientX;
      currentY = e.clientY;
    }
    
    // Calculate how far we've moved from start
    const deltaX = currentX - dragStartX;
    const deltaY = currentY - dragStartY;
    
    // Calculate new panel center position
    const newCenterX = panelStartX + deltaX;
    const newCenterY = panelStartY + deltaY;
    
    // Update position directly using left/top at center point
    panel.style.left = `${newCenterX}px`;
    panel.style.top = `${newCenterY}px`;
    panel.style.transform = `translate(-50%, -50%)`;
  }
  
  function dragEnd(e) {
    if (isDragging) {
      isDragging = false;
      
      // Re-enable transitions for other animations
      setTimeout(() => {
        panel.style.transition = '';
      }, 50);
    }
  }
}

// Initialize draggable when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDraggableSettings);
} else {
  initializeDraggableSettings();
}
    
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI notify the user they can install the PWA
  showInstallPromotion();
});

function showInstallPromotion() {
  const installButton = document.createElement('button');
  installButton.innerText = 'Install App';
  installButton.style.position = 'fixed';
  installButton.style.bottom = '10px';
  installButton.style.right = '10px';
  document.body.appendChild(installButton);

  installButton.addEventListener('click', () => {
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
  
  // For a rotated image, the visual width is the original height, and vice versa
  const rotatedWidth = naturalHeight;
  const rotatedHeight = naturalWidth;
  
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
  
  // Position element in the center of the viewport
  imgElement.style.position = 'fixed';
  imgElement.style.top = '50%';
  imgElement.style.left = '50%';
  imgElement.style.transform = 'translate(-50%, -50%) rotate(90deg)';
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

// Make the main toolbar draggable
function makeMainToolbarDraggable(toolbar) {
  if (!toolbar) {
    return;
  }

  let isDragging = false;
  let offsetX, offsetY;

  // Restore saved absolute position on load (document coordinates)
  const savedPosRaw = localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS) || localStorage.getItem('mainToolbarPosition');
  const savedPos = safeJSONParse(savedPosRaw, null);
  if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
    toolbar.style.top = savedPos.top + 'px';
    toolbar.style.left = savedPos.left + 'px';
    toolbar.style.transform = 'none';
    if (!localStorage.getItem(STORAGE_KEYS.TOOLBAR_POS)) {
      try { localStorage.setItem(STORAGE_KEYS.TOOLBAR_POS, JSON.stringify(savedPos)); localStorage.removeItem('mainToolbarPosition'); } catch(_) {}
    }
  }

  const onDown = (e) => {
    // For mouse events, only drag with the left button
    if (e.type === 'mousedown' && e.button !== 0) {
      return;
    }
    
    // Prevent dragging when interacting with buttons or inputs
    if (e.target.closest('button, input')) {
      return;
    }

    isDragging = true;
    toolbar.style.cursor = 'grabbing';
    toolbar.style.transition = 'none'; // No transition during drag

    const event = e.touches ? e.touches[0] : e;
    
    // Calculate offset from touch/click point to toolbar's top-left corner in document coordinates
    // We need the toolbar's absolute position (document coordinates)
    const toolbarLeft = parseFloat(toolbar.style.left) || 0;
    const toolbarTop = parseFloat(toolbar.style.top) || 0;
    
    // Calculate offset: distance from touch point to toolbar's top-left in document space
    offsetX = event.clientX + window.scrollX - toolbarLeft;
    offsetY = event.clientY + window.scrollY - toolbarTop;

    // Add move and up listeners
    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    // Prevent default actions like text selection or page scrolling
    e.preventDefault();
  };

  const onMove = (e) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling while dragging

    const event = e.touches ? e.touches[0] : e;

    // Calculate where the toolbar's top-left should be
    // This keeps the toolbar under the cursor/finger exactly where grabbed
    let newLeft = event.clientX - offsetX + window.scrollX;
    let newTop = event.clientY - offsetY + window.scrollY;

    // Get fresh dimensions for bounds checking
    const toolbarWidth = toolbar.offsetWidth;
    const toolbarHeight = toolbar.offsetHeight;

    // Constrain within document bounds
    const docWidth = Math.max(document.documentElement.scrollWidth, window.innerWidth);
    const docHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);

    const minLeft = 0;
    const maxLeft = docWidth - toolbarWidth;
    const minTop = 0;
    const maxTop = docHeight - toolbarHeight;

    newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
    newTop = Math.max(minTop, Math.min(newTop, maxTop));

    // Apply position (absolute positioning relative to document)
    toolbar.style.left = `${newLeft}px`;
    toolbar.style.top = `${newTop}px`;
    toolbar.style.transform = 'none'; // Remove any transform
  };

  const onUp = () => {
    if (isDragging) {
      isDragging = false;
      toolbar.style.cursor = 'grab';
      toolbar.style.transition = '';
      const numericTop = parseFloat(toolbar.style.top) || 0;
      const numericLeft = parseFloat(toolbar.style.left) || 0;
      try { localStorage.setItem(STORAGE_KEYS.TOOLBAR_POS, JSON.stringify({ top: numericTop, left: numericLeft })); } catch(_) {}
      clampMainToolbarInView();
    }

    // Remove listeners
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchend', onUp);
  };

  // Attach initial listeners
  toolbar.addEventListener('mousedown', onDown);
  toolbar.addEventListener('touchstart', onDown, { passive: false });
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

function preloadComic(date) {
  // Save current global state to restore after preloading
  const savedYear = year;
  const savedMonth = month;
  const savedDay = day;
  
  formatDate(date);
  const preloadFormattedDate = year + "-" + month + "-" + day;
  const preloadFormattedComicDate = year + month + day;
  
  // Restore global state
  year = savedYear;
  month = savedMonth;
  day = savedDay;
  
  // Don't preload if already cached
  if (preloadedComics.has(preloadFormattedDate)) {
    return;
  }
  
  const url = `https://dirkjan.nl/cartoon/${preloadFormattedComicDate}`;
  
  fetchWithFallback(url)
    .then(response => response.text())
    .then(text => {
      const notFound = text.includes("error404");
      if (!notFound) {
        let picturePos = text.indexOf('<article class="cartoon">') + 41;
        let tempPictureUrl = text.substring(picturePos, picturePos + 88);
        const endPos = tempPictureUrl.lastIndexOf('"');
        tempPictureUrl = text.substring(picturePos, picturePos + endPos);
        
        // Preload the actual image
        const img = new Image();
        img.src = tempPictureUrl;
        
        // Cache it
        preloadedComics.set(preloadFormattedDate, tempPictureUrl);
      }
    })
    .catch(() => {
      // Silently fail for preloading
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
