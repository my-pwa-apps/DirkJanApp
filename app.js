if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./serviceworker.js");
}

// Define CORS proxies
const CORS_PROXIES = [
  'https://corsproxy.garfieldapp.workers.dev/cors-proxy?',
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?'
];

// Fetch with fallback function
async function fetchWithFallback(url) {
  let lastError;
  
  // Try each proxy with regular CORS mode
  for (const proxy of CORS_PROXIES) {
    try {
      const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        return response;
      }
    } catch (error) {
      lastError = error;
      console.warn(`Failed to fetch using proxy ${proxy}:`, error);
      continue;
    }
  }
  
  // If all proxies failed with regular mode, try with no-cors as last resort
  try {
    console.log("Trying direct fetch with no-cors mode as last resort");
    const response = await fetch(url, { mode: 'no-cors' });
    // Note: with no-cors, we cannot read the response content in JavaScript
    // but the browser can still use the response for things like displaying images
    return response;
  } catch (error) {
    console.error("Even no-cors mode failed:", error);
    lastError = error;
  }
  
  throw lastError || new Error('All fetch attempts failed');
}

let pictureUrl = ''; // Make pictureUrl global so it's accessible by Share()
let formattedDate = ''; // Make formattedDate global for sharing

async function Share() 
{
	if(!pictureUrl) {
		console.error('No image URL available to share');
		alert('Sorry, no comic is available to share at this moment.');
		return;
	}

	// Create share text with current date
	const shareText = `Check out this DirkJan comic from ${formattedDate}!`;
	const shareUrl = 'https://dirkjanapp.pages.dev';
	
	console.log('Attempting to share:', shareText, shareUrl, 'Image:', pictureUrl);

	if(navigator.share) {
		// First try to share with the comic image
		try {
			await shareWithImage(shareText, shareUrl);
			console.log('Comic with image shared successfully');
			return;
		} catch (error) {
			console.log('Image sharing failed, trying text-only share:', error);
			
			// Try text-only share as fallback
			try {
				await navigator.share({
					title: 'DirkJan Comic',
					text: shareText,
					url: shareUrl
				});
				console.log('Comic shared successfully via Web Share API (text-only)');
				return;
			} catch (textError) {
				console.error('Text-only Web Share API also failed:', textError);
			}
		}
	}
	
	console.log('Web Share API not supported or failed, using clipboard fallback');
	// Fallback for browsers without Web Share API or when sharing fails
	fallbackShare(shareText, shareUrl);
}

async function shareWithImage(shareText, shareUrl) {
	// Check if the browser supports file sharing
	if (!navigator.canShare || !navigator.canShare({ files: [new File([], 'test')] })) {
		throw new Error('File sharing not supported');
	}

	try {
		// Try to fetch the image and convert to shareable file
		const response = await fetch(pictureUrl, { 
			mode: 'cors',
			headers: {
				'Accept': 'image/*'
			}
		});
		
		if (!response.ok) {
			throw new Error(`Failed to fetch image: ${response.status}`);
		}
		
		const blob = await response.blob();
		
		// Create a file from the blob
		const file = new File([blob], `dirkjan-${formattedDate}.jpg`, {
			type: blob.type || 'image/jpeg',
			lastModified: new Date().getTime()
		});

		// Share with the image file
		await navigator.share({
			title: 'DirkJan Comic',
			text: shareText,
			url: shareUrl,
			files: [file]
		});
	} catch (fetchError) {
		console.log('Direct image fetch failed, trying proxy:', fetchError);
		
		// Try with CORS proxy as fallback
		const response = await fetchWithFallback(pictureUrl);
		const blob = await response.blob();
		
		const file = new File([blob], `dirkjan-${formattedDate}.jpg`, {
			type: blob.type || 'image/jpeg',
			lastModified: new Date().getTime()
		});

		await navigator.share({
			title: 'DirkJan Comic',
			text: shareText,
			url: shareUrl,
			files: [file]
		});
	}
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
  // Remove the style element that was added for the lighter background
  
  comicstartDate = "2015/05/04";   
 currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
 
 var favs = JSON.parse(localStorage.getItem('favs'));

 if(favs == null)
	{
		favs = [];
	}
	if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(favs[0]);
		if(favs.length === 0)
		{			document.getElementById("showfavs").checked = false;
			document.getElementById("showfavs").disabled = true;
			// Keep SVG icon, don't change to text
			currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
		}
	}
	else{
		if(favs.length === 0)
		{
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
  CompareDates();
  DisplayComic();
}

function PreviousClick()
{
  if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedDate) > 0){
			currentselectedDate = new Date(favs[favs.indexOf(formattedDate) - 1]);} }
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}
  
  nextclicked = false;
  CompareDates();

  DisplayComic();
  

} 

function NextClick()
{
  nextclicked = true;
  if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedDate) < favs.length - 1){
			currentselectedDate = new Date(favs[favs.indexOf(formattedDate) + 1]);} }
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
  
  CompareDates();

  DisplayComic();

}

function FirstClick()
{
  if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
    currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);}
	else{
	currentselectedDate = new Date(Date.UTC(1978, 5, 19,12));
	}
  CompareDates();
  
  DisplayComic();

}

function CurrentClick()
{
  if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
    favslength = favs.length - 1;
    currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[favslength]);}
	else{
  currentselectedDate = new Date();
  if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  }
  
  CompareDates();

  DisplayComic();
 
}

function RandomClick()
{
  if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[Math.floor(Math.random() * JSON.parse(localStorage.getItem('favs')).length)]); }
	else{
		var start = new Date(comicstartDate);
		var end = new Date();
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
        document.getElementById("comic").src = pictureUrl;
        
        // Also update the rotated comic if it exists
        const rotatedComic = document.getElementById('rotated-comic');
        if (rotatedComic) {
          rotatedComic.src = pictureUrl;
        }
      }
      else
      {
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
      console.error('Error fetching comic:', error);
      document.getElementById("comic").src = ""; // Clear the image
      document.getElementById("comic").alt = "Failed to load comic. Please try again later.";
    });
    
    var favs = JSON.parse(localStorage.getItem('favs'));
	  if(favs == null)
	  {
		  favs = [];
	  }
  if(favs.indexOf(formattedDate) == -1)
		{
			//$(".favicon").css({"color": "red"}).removeClass('fa-heart').addClass('fa-heart-o');
      document.getElementById("favheart").src = "./heartborder.svg";

		}	
		else
		{
		//	$(".favicon").css({"color": "red"}).removeClass('fa-heart-o').addClass('fa-heart');
      document.getElementById("favheart").src = "./heart.svg";
		}  
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
	var favs = JSON.parse(localStorage.getItem('favs'));
	const rotatedDatePicker = document.getElementById('rotated-DatePicker');
	if(document.getElementById("showfavs").checked)
	{
		document.getElementById("DatePicker").disabled = true;
		if (rotatedDatePicker) rotatedDatePicker.disabled = true;
		startDate = new Date(favs[0])}
	else
  {	
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

  if((currentselectedDate.getDate() == new Date().getDate()) && showfavs.checked == false)
  {
    setButtonDisabled("Current", true);
  }
  else
  {
    setButtonDisabled("Current", false);
  }

  if (showfavs.checked && (currentselectedDate.getDate() == new Date (favs[favs.length - 1 ]).getDate()))
  {
    setButtonDisabled("Current", true);
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

function Rotate() {
  var element = document.getElementById('comic');
  
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
  
  if (element.className === "normal") {
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
    clonedComic.onclick = null; // Remove the onclick handler to prevent recursive calls// Create the fullscreen toolbar
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
  else if (element.className === "rotate") {
    element.className = 'normal';
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

// Minimum distance for a swipe (in pixels)
const MIN_SWIPE_DISTANCE = 50;
// Maximum time for a swipe (in milliseconds)
const MAX_SWIPE_TIME = 500;

function handleTouchStart(e) {
	if (!document.getElementById("swipe").checked) return;
	
	const touch = e.touches[0];
	touchStartX = touch.clientX;
	touchStartY = touch.clientY;
	touchStartTime = Date.now();
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
	if (!document.getElementById("swipe").checked) return;
	
	const touch = e.changedTouches[0];
	touchEndX = touch.clientX;
	touchEndY = touch.clientY;
	
	const deltaX = touchEndX - touchStartX;
	const deltaY = touchEndY - touchStartY;
	const deltaTime = Date.now() - touchStartTime;
	
	// Check if the swipe is valid (meets distance and time requirements)
	if (deltaTime > MAX_SWIPE_TIME) return;
	
	const absX = Math.abs(deltaX);
	const absY = Math.abs(deltaY);
	
	// Check if we're in fullscreen/rotated mode
	const isInFullscreen = document.getElementById('rotated-comic') !== null;
	
	// Determine swipe direction based on mode
	if (isInFullscreen) {
    // Rotated mode: Vertical for Next/Prev, Horizontal for Random/Today
    if (absY > absX && absY > MIN_SWIPE_DISTANCE) {
      // Vertical swipe
      if (deltaY < 0) {
        // Swipe Up -> Previous
        console.log('Swipe up detected in rotated view');
        PreviousClick();
      } else {
        // Swipe Down -> Next
        console.log('Swipe down detected in rotated view');
        NextClick();
      }
    } else if (absX > absY && absX > MIN_SWIPE_DISTANCE) {
      // Horizontal swipe
      if (deltaX < 0) {
        // Swipe Left -> Random
        console.log('Swipe left detected in rotated view');
        RandomClick();
      } else {
        // Swipe Right -> Today
        console.log('Swipe right detected in rotated view');
        CurrentClick();
      }
    }
  } else {
    // Normal mode: Horizontal for Next/Prev, Vertical for Random/Today
    if (absX > absY && absX > MIN_SWIPE_DISTANCE) {
      // Horizontal swipe
      if (deltaX > 0) {
        // Swipe right
        console.log('Swipe right detected');
        PreviousClick();
      } else {
        // Swipe left
        console.log('Swipe left detected');
        NextClick();
      }
    } else if (absY > absX && absY > MIN_SWIPE_DISTANCE) {
      // Vertical swipe
      if (deltaY > 0) {
        // Swipe down
        console.log('Swipe down detected');
        RandomClick();
      } else {
        // Swipe up
        console.log('Swipe up detected');
        CurrentClick();
      }
    }
  }
}

// Add touch event listeners to the document
document.addEventListener('touchstart', handleTouchStart, { passive: false });
document.addEventListener('touchmove', handleTouchMove, { passive: false });
document.addEventListener('touchend', handleTouchEnd, { passive: true });

// Add event to prevent toolbar buttons from triggering swipes
document.addEventListener('DOMContentLoaded', function() {
  // Add orientation change listener to adjust UI for rotated comics
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
  }, { capture: true });
  
  // Make the main toolbar draggable
  const mainToolbar = document.querySelector('.toolbar:not(.fullscreen-toolbar)');
  makeMainToolbarDraggable(mainToolbar);
});

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
	var favs = JSON.parse(localStorage.getItem('favs'));
  if(document.getElementById('showfavs').checked)
	{
		localStorage.setItem('showfavs', "true");
		if(favs.indexOf(formattedDate) !== -1)
		{
		}
		else
		{
		  currentselectedDate = new Date(favs[0]);	
		}
	} 
	else
	{
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
    if (getStatus == "true")
    {
      document.getElementById("settingsDIV").style.display = "block";
    }
    else
    {
      document.getElementById("settingsDIV").style.display = "none";
    }

	
function Addfav()
{
  var favs = JSON.parse(localStorage.getItem('favs'));
  if(favs == null)
  {
  favs = [];
  }
  if(favs.indexOf(formattedDate) == -1)
  {
    favs.push(formattedDate);
    //$(".favicon").css({"color": "red"}).removeClass('fa-heart').addClass('fa-heart');
    document.getElementById("favheart").src = "./heart.svg";
    document.getElementById("showfavs").disabled = false;
  }
  else
  {
    favs.splice(favs.indexOf(formattedDate), 1);
    //$(".favicon").css({"color": "red"}).removeClass('fa-heart-o').addClass('fa-heart');    document.getElementById("favheart").src = "./heartborder.svg";
    if(favs.length === 0)
    {
      document.getElementById("showfavs").checked = false;
      document.getElementById("showfavs").disabled = true;
      // Keep SVG icon, don't change to text
    }
  }
  favs.sort();
  localStorage.setItem('favs', JSON.stringify(favs));
  CompareDates();
  DisplayComic();
}
   
function HideSettings()
{
  var x = document.getElementById("settingsDIV");
  
  // Save current scroll position
  const scrollPos = window.scrollY;
  
  // Toggle settings display with minimal reflow
  if (x.style.display === "none") {
    // Add a style element that preserves the background
    if (!document.getElementById('settings-style-fix')) {
      const fixStyle = document.createElement('style');
      fixStyle.id = 'settings-style-fix';
      fixStyle.textContent = `
        html {
          background-attachment: fixed !important;
          min-height: 100vh !important;
        }
        body {
          background-attachment: fixed !important;
          min-height: 100vh !important;
        }
      `;
      document.head.appendChild(fixStyle);
    }
    
    // Use RAF for smoother visual update
    requestAnimationFrame(() => {
      x.style.display = "block";
      localStorage.setItem('settings', "true");
      // Maintain scroll position
      window.scrollTo(0, scrollPos);
    });
  } else {
    requestAnimationFrame(() => {
      x.style.display = "none";
      localStorage.setItem('settings', "false");
      // Maintain scroll position
      window.scrollTo(0, scrollPos);
    });
  }
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
	  if (choiceResult.outcome === 'accepted') {
		console.log('User accepted the install prompt');
	  } else {
		console.log('User dismissed the install prompt');
	  }
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
  if (!toolbar) return;

  let isDragging = false;
  let offsetX, offsetY;

  const onDown = (e) => {
    // Only drag with left mouse button, and not on buttons or datepicker
    if (e.button !== 0 || e.target.closest('button, input')) {
      return;
    }

    isDragging = true;
    toolbar.style.cursor = 'grabbing';
    toolbar.style.transition = 'none';

    const event = e.touches ? e.touches[0] : e;
    const rect = toolbar.getBoundingClientRect();

    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;

    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);

    e.preventDefault();
  };

  const onMove = (e) => {
    if (!isDragging) return;
    const event = e.touches ? e.touches[0] : e;

    let newLeft = event.pageX - offsetX;
    let newTop = event.pageY - offsetY;

    // Constrain to parent (main element)
    const parent = toolbar.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    newLeft = Math.max(parentRect.left, Math.min(newLeft, parentRect.right - toolbarRect.width));
    newTop = Math.max(parentRect.top, Math.min(newTop, parentRect.bottom - toolbarRect.height));

    toolbar.style.left = `${newLeft}px`;
    toolbar.style.top = `${newTop}px`;
    toolbar.style.transform = 'none';
  };

  const onUp = () => {
    if (isDragging) {
      isDragging = false;
      toolbar.style.cursor = 'grab';
      toolbar.style.transition = '';

      const pos = { top: toolbar.style.top, left: toolbar.style.left };
      localStorage.setItem('mainToolbarPosition', JSON.stringify(pos));
    }

    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchend', onUp);
  };

  toolbar.addEventListener('mousedown', onDown);
  toolbar.addEventListener('touchstart', onDown, { passive: false });

  // Load saved position
  const savedPos = JSON.parse(localStorage.getItem('mainToolbarPosition'));
  if (savedPos && savedPos.top && savedPos.left) {
    toolbar.style.top = savedPos.top;
    toolbar.style.left = savedPos.left;
    toolbar.style.transform = 'none';
  }
}