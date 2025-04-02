if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./serviceworker.js");
}

// Define CORS proxies
const CORS_PROXIES = [
  'https://corsproxy.garfieldapp.workers.dev/cors-proxy?',
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?'
];

// Apply styling to date picker
function applyDatePickerStyling() {
  // Get the computed style of the nav buttons to match
  const navButton = document.querySelector('nav button');
  if (navButton) {
    const navStyle = window.getComputedStyle(navButton);
    const datePicker = document.getElementById('DatePicker');
    
    if (datePicker) {
      // Add custom CSS with stronger selectors to override browser defaults
      const style = document.createElement('style');
      
      // Extract the background gradient if it exists
      let backgroundGradient = navStyle.background;
      if (!backgroundGradient.includes('gradient')) {
        // Fallback to a default gradient if none found
        backgroundGradient = 'linear-gradient(45deg, #1a1a1a, #4a4a4a)';
      }
      
      style.textContent = `
        input[type="date"]#DatePicker {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          background: ${backgroundGradient} !important;
          font-family: ${navStyle.fontFamily};
          font-size: ${navStyle.fontSize};
          font-weight: ${navStyle.fontWeight};
          border: ${navStyle.border};
          border-radius: ${navStyle.borderRadius};
          padding: ${navStyle.padding};
          color: ${navStyle.color};
          box-shadow: none;
        }
        
        /* Override browser-specific calendar icon */
        input[type="date"]#DatePicker::-webkit-calendar-picker-indicator {
          filter: invert(1);
          cursor: pointer;
        }
        
        @media (max-width: 768px) {
          #DatePicker {
            display: block;
            margin-left: auto;
            margin-right: auto;
            text-align: center;
            width: 80%;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }
}

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

async function Share() 
{
	if(navigator.share) {
		try {
			const response = await fetchWithFallback(pictureUrl);
			const blob = await response.blob();
			const file = new File([blob], "dirkjan.png", {type: "image/png",
			lastModified: new Date().getTime()});
			navigator.share({
				url: 'https://dirkjanapp.pages.dev',
				text: 'Shared from https://dirkjanapp.pages.dev',
				files: [file]
			});
		} catch (error) {
			console.error('Error sharing comic:', error);
			alert('Sorry, could not share the comic. Please try again later.');
		}
	}
}

function onLoad()
{
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
		{
			document.getElementById("showfavs").checked = false;
			document.getElementById("showfavs").disabled = true;
      document.getElementById("Current").innerHTML = "Vandaag";
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
  
  // Apply styling to the date picker to match nav buttons
  applyDatePickerStyling();
}

function PreviousClick()
{
  if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedDate) > 0){
			currentselectedDate = new Date(favs[favs.indexOf(formattedDate) - 1]);}}
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
			currentselectedDate = new Date(favs[favs.indexOf(formattedDate) + 1]);}}
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
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[Math.floor(Math.random() * JSON.parse(localStorage.getItem('favs')).length)]);}
	else{
		start = new Date(comicstartDate);
		end = new Date();
		currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}

  CompareDates();

  DisplayComic();
 
}

function DateChange()
{
  currentselectedDate = document.getElementById('DatePicker');
  currentselectedDate = new Date(currentselectedDate.value);
  if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  CompareDates();
  
  DisplayComic();
  
}

function DisplayComic()
{
  
  formatDate(currentselectedDate);

  formattedDate = year+"-"+month+"-"+day;
  formattedComicDate = year+month+day;
  document.getElementById('DatePicker').value = formattedDate;
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
      {
        pictureUrl = siteBody.substring(picturePosition, picturePosition+88);
        endPosition = pictureUrl.lastIndexOf('"');
        pictureUrl = siteBody.substring(picturePosition, picturePosition+endPosition);
        document.getElementById("comic").src = pictureUrl;
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



 function CompareDates() {
	var favs = JSON.parse(localStorage.getItem('favs'));
	if(document.getElementById("showfavs").checked)
	{
		document.getElementById("DatePicker").disabled = true;
		startDate = new Date(favs[0])}
	else
  {	
		document.getElementById("DatePicker").disabled = false;
		startDate = new Date(comicstartDate);
	}
	startDate = startDate.setHours(0, 0, 0, 0);
	currentselectedDate = currentselectedDate.setHours(0, 0, 0, 0);
	startDate = new Date(startDate);
	currentselectedDate = new Date(currentselectedDate);
	if(currentselectedDate.getTime() <= startDate.getTime()) {
		document.getElementById("Previous").disabled = true;
		document.getElementById("First").disabled = true;
		formatDate(startDate);
		startDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		document.getElementById("Previous").disabled = false;
		document.getElementById("First").disabled = false;
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
		document.getElementById("Next").disabled = true;
		formatDate(endDate);
		endDate = year + '-' + month + '-' + day;
		currentselectedDate = new Date(Date.UTC(year, month-1, day,12));
	} else {
		document.getElementById("Next").disabled = false;
		document.getElementById("Current").disabled = false;
	}

  if((currentselectedDate.getDate() == new Date().getDate()) && showfavs.checked == false)
  {
    document.getElementById("Current").disabled = true;
  }
  else
  {
    document.getElementById("Current").disabled = false;
  }

  if (showfavs.checked && (currentselectedDate.getDate() == new Date (favs[favs.length - 1 ]).getDate()))
  {
    document.getElementById("Current").disabled = true;
  }

	if(document.getElementById("showfavs").checked) {
		//document.getElementById("Current").disabled = true;
		if(favs.length == 1) {
			document.getElementById("Random").disabled = true;
			document.getElementById("Previous").disabled = true;
			document.getElementById("First").disabled = true;
		
		}}
	else {
		document.getElementById("Random").disabled = false;}
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

  if (element.className === "normal") {
    element.className = "rotate";
  }
  else if ( element.className === "rotate") {
    element.className = 'normal';
  }
}

document.addEventListener('swiped-down', function(e) {
	if(document.getElementById("swipe").checked) {
		RandomClick()}
})

document.addEventListener('swiped-right', function(e) {
	if(document.getElementById("swipe").checked) {
		PreviousClick()}
})


document.addEventListener('swiped-left', function(e) {
	if(document.getElementById("swipe").checked) {
		NextClick()}
})

document.addEventListener('swiped-up', function(e) {
	if(document.getElementById("swipe").checked) {
		CurrentClick()}
})

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
    document.getElementById('Current').innerHTML = 'Laatste'
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
    document.getElementById('Current').innerHTML = 'Vandaag'
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
    document.getElementById('Current').innerHTML = 'Laatste'
  }
  else
  {
    document.getElementById("showfavs").checked = false;
    document.getElementById('Current').innerHTML = 'Vandaag'
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
    //$(".favicon").css({"color": "red"}).removeClass('fa-heart-o').addClass('fa-heart');
    document.getElementById("favheart").src = "./heartborder.svg";
    if(favs.length === 0)
    {
      document.getElementById("showfavs").checked = false;
      document.getElementById("showfavs").disabled = true;
      document.getElementById("Current").innerHTML = 'Vandaag'
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
	if (x.style.display === "none") {
	  x.style.display = "block";
	  localStorage.setItem('settings', "true");
	} else {
	  x.style.display = "none";
	  localStorage.setItem('settings', "false");
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