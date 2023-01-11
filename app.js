if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./serviceworker.js");
}

function Share()
{
  if (navigator.share) {
    navigator.share({
      title: 'https://dirkjanapp.ml',
      url: pictureUrl
    });
  } 
}

function Addfav()
{
	formattedComicDate = year+'/'+month+'/'+day;
	var favs = JSON.parse(localStorage.getItem('favs'));
	if(favs == null)
	{
		favs = [];
	}
	if(favs.indexOf(formattedComicDate) == -1)
	{
		favs.push(formattedComicDate);
		$(".favicon").css({"color": "black"}).removeClass('fa-star-o').addClass('fa-star');
		document.getElementById("showfavs").disabled = false;
	}
	else
	{
		favs.splice(favs.indexOf(formattedComicDate), 1);
		$(".favicon").css({"color": "black"}).removeClass('fa-star').addClass('fa-star-o');
		if(favs.length === 0)
		{
			document.getElementById("showfavs").checked = false;
			document.getElementById("showfavs").disabled = true;
			
		}
	}
	favs.sort();
	localStorage.setItem('favs', JSON.stringify(favs));
	//compareDates();
	//displayComic();
}


/*function onload()
{
    
  currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
  maxDate = document.getElementById("DatePicker").valueAsDate = new Date();
 
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
  
  compareDates();
  
  displayComic();
 
}*/

function onload() {
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
		document.getElementById("Next").disabled = true;
		document.getElementById("Previous").disabled = true;
}

maxDate = document.getElementById("DatePicker").valueAsDate = new Date();
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

	compareDates();
	displayComic();

}


function PreviousClick()
{
  if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) > 0){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) - 1]);}}
	else{
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}



  compareDates();

  displayComic();

} 


function NextClick()
{
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()+1);
  }

  if(document.getElementById("showfavs").checked) {
		var favs = JSON.parse(localStorage.getItem('favs'));
		if(favs.indexOf(formattedComicDate) < favs.length - 1){
			currentselectedDate = new Date(favs[favs.indexOf(formattedComicDate) + 1]);}}
	else{
			currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}
  
  compareDates();

  displayComic();

}

function FirstClick()
{
    
  if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[0]);}
	else{
    currentselectedDate = new Date(Date.UTC(2015,4,4,12));
	}

  compareDates();
  
  displayComic();

}

function CurrentClick()
{
  if(document.getElementById("showfavs").checked) {
	}
	else
	{
	currentselectedDate = new Date();
	}
  compareDates();

  displayComic();
 
}


function RandomClick()
{
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }
  
  if(document.getElementById("showfavs").checked) {
		currentselectedDate = new Date(JSON.parse(localStorage.getItem('favs'))[Math.floor(Math.random() * JSON.parse(localStorage.getItem('favs')).length)]);}
	else{
		start = new Date(Date.UTC(2015,05,04,12));
    end = new Date(maxDate);
		currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}
  
  compareDates();

  displayComic();
 
}

function DateChange()
{
  currentselectedDate = document.getElementById('DatePicker');
  currentselectedDate = new Date(currentselectedDate.value);
  if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  compareDates();
  
  displayComic();
  
}

function displayComic()
{
  
  formatDate(currentselectedDate);

  formattedDate = year+"-"+month+"-"+day;
  formattedComicDate = year+month+day;
  document.getElementById('DatePicker').value = formattedDate;
  siteUrl = "https://api.codetabs.com/v1/proxy?quest=https://dirkjan.nl/cartoon/"+formattedComicDate;
  
  var favs = JSON.parse(localStorage.getItem('favs'));
	if(favs == null)
	{
		favs = [];
	}
	if(favs.indexOf(formattedComicDate) == -1)
	{
		$(".favicon").css({"color": "black"}).removeClass('fa-star').addClass('fa-star-o');

	}	
	else
	{
		$(".favicon").css({"color": "black"}).removeClass('fa-star-o').addClass('fa-star');
	}

  fetchUrl().then(siteBody =>
 {

    notFound = siteBody.includes("error404");
    picturePosition = siteBody.indexOf("https://dirkjan.nl/wp-content/uploads/");
    if (notFound == false)
    {
      pictureUrl = siteBody.substring(picturePosition, picturePosition+84);
      endPosition = pictureUrl.lastIndexOf('"');
      pictureUrl = siteBody.substring(picturePosition, picturePosition+endPosition);
      document.getElementById("comic").src = pictureUrl;
      
    }
    else
    {
      document.getElementById("comic").src = "dirkjanvrij.png";
    }
  });
  
}

function compareDates()
{
  
  var favs = JSON.parse(localStorage.getItem('favs'));
	if(document.getElementById("showfavs").checked) {
		if(favs.includes(document.getElementById("DatePicker").value)) 
    {
      startDate = new Date(document.getElementById("DatePicker").value);
    }
		else{	
		startDate = new Date(favs[0])}}
	else{	
		startDate = new Date(Date.UTC(2015,4,4,12));
	}
  
  startDate = startDate.setHours(0,0,0,0);
  currentselectedDate = currentselectedDate.setHours(0,0,0,0);
  startDate = new Date(startDate);
  currentselectedDate = new Date(currentselectedDate);
 
  if (currentselectedDate.getTime() <= startDate.getTime() )
  
  {
    document.getElementById("Previous").disabled = true;
    document.getElementById("First").disabled = true;

    formatDate(startDate);

    startDate = year+'-'+month+'-'+day;

    document.getElementById('DatePicker').value = startDate;
    currentselectedDate = new Date(Date.UTC(year,month-1,day,12));
  }
  else
  {
    document.getElementById("Previous").disabled = false;
    document.getElementById("First").disabled = false;
  }
  
  if (currentselectedDate.getTime() == new Date().setHours(0,0,0,0))
  {document.getElementById("Current").disabled = true;}
  else {document.getElementById("Current").disabled = false;}


  if(document.getElementById("showfavs").checked) {
		endDate = new Date(favs[favs.length - 1]);
	}
	else{ 
		endDate = new Date(maxDate);
	}

  endate = endDate.setHours(0,0,0,0);
  endDate = new Date(endDate);
  if (currentselectedDate.getTime() >= endDate.getTime())
  
  {
    document.getElementById("Next").disabled = true;
    
    formatDate(endDate);

    endDate = year+'-'+month+'-'+day;

    document.getElementById('DatePicker').value = endDate;
    currentselectedDate = new Date(Date.UTC(year, month-1, day, 12));
  }
  else
  {
    document.getElementById("Next").disabled = false;
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
    headers: {
      "x-cors-grida-api-key": "77a0175b-4435-49b0-ad18-52d2dea5a548"
    }
  });
   const siteBody = await websiteData.text();
 return siteBody;
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

setStatus = document.getElementById('swipe');
    setStatus.onclick = function() {
        if(document.getElementById('swipe').checked) {
            localStorage.setItem('stat', "true");
        } else {
            localStorage.setItem('stat', "false");
			//currentselectedDate = new Date();
			compareDates();
			displayComic();
        }
    }

	setStatus = document.getElementById('showfavs');
	var favs = JSON.parse(localStorage.getItem('favs'));
    setStatus.onclick = function() {
        if(document.getElementById('showfavs').checked) {
            localStorage.setItem('showfavs', "true");
			if(favs.indexOf(formattedComicDate) == -1)
			{
				
			}
			else
			{
				currentselectedDate = new Date(favs[0]);	
			}
			
	
       } else {
           localStorage.setItem('showfavs', "false");
			
        }

		compareDates();
		//displayComic();

	}


getStatus = localStorage.getItem('stat');
    if (getStatus == "true") {
        document.getElementById("swipe").checked = true;
    } else {
        document.getElementById("swipe").checked = false;
    }

getStatus = localStorage.getItem('showfavs');
    if (getStatus == "true") {
        document.getElementById("showfavs").checked = true;
      }
    else {
        document.getElementById("showfavs").checked = false;
    }

