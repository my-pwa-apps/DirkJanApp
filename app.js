
// Description: Main javascript file for DirkjanApp

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./serviceworker.js");
}

async function Share() 
{
	if(navigator.share) {
		comicurl = "https://corsproxy.garfieldapp.workers.dev/cors-proxy?"+pictureUrl;
		const response = await fetch(comicurl);
		const blob = await response.blob();
		const file = new File([blob], "dirkjan.png", {type: "image/png",
        lastModified: new Date().getTime()});
		navigator.share({
			//title: 'https://dirkjanapp.pages.dev',
			url: 'https://dirkjanapp.pages.dev',
			text: 'Shared from https://dirkjanapp.pages.dev',
			files: [file]
		});
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
 nextclicked = false

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
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);}
	else{
	currentselectedDate = new Date(Date.UTC(1978, 5, 19,12));
	}
  CompareDates();
  
  DisplayComic();

}

function CurrentClick()
{
  currentselectedDate = new Date();
  if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
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
  siteUrl =  "https://corsproxy.garfieldapp.workers.dev/cors-proxy?https://dirkjan.nl/cartoon/"+formattedComicDate;
  
  localStorage.setItem('lastcomic', currentselectedDate);
  fetchUrl().then(textData =>
 {

    siteBody = textData;
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
  });
    var favs = JSON.parse(localStorage.getItem('favs'));
	  if(favs == null)
	  {
		  favs = [];
	  }
  if(favs.indexOf(formattedComicDate) == -1)
		{
			$(".favicon").css({"color": "red"}).removeClass('fa-heart').addClass('fa-heart-o');

		}	
		else
		{
			$(".favicon").css({"color": "red"}).removeClass('fa-heart-o').addClass('fa-heart');
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

  if(currentselectedDate.getDate() == new Date().getDate()) 
  {
    document.getElementById("Current").disabled = true;
  }
  
	if(document.getElementById("showfavs").checked) {
		document.getElementById("Current").disabled = true;
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

const fetchUrl = async () =>
{
  const websiteData = await fetch(siteUrl, {
    method: "GET",
    });
  const textData = await websiteData.text();
 return textData;
};

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
    $(".favicon").css({"color": "red"}).removeClass('fa-heart-o').addClass('fa-heart');
    document.getElementById("showfavs").disabled = false;
  }
  else
  {
    favs.splice(favs.indexOf(formattedDate), 1);
    $(".favicon").css({"color": "red"}).removeClass('fa-heart').addClass('fa-heart-o');
    if(favs.length === 0)
    {
      document.getElementById("showfavs").checked = false;
      document.getElementById("showfavs").disabled = true;
    }
  }
  favs.sort();
  localStorage.setItem('favs', JSON.stringify(favs));
  CompareDates();
  DisplayComic();
}
   
    
   