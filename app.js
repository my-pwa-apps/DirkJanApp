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

function onload()
{
  
  
  var djfavs = getFavs();
	djfavs = djfavs || [];
	previousUrl = null;

   //document.getElementById("showfavs").checked = djfavs.length !== 0;
	 //document.getElementById("showfavs").disabled = djfavs.length === 0;
	
   if(document.getElementById("showfavs").checked)
   {
	currentselectedDate = djfavs.length !== 0 
		? new Date(djfavs[0]) 
		: document.getElementById("DatePicker").valueAsDate = new Date();
	
   }
    else(currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date());

    document.getElementById("Next").disabled = !djfavs.length;
    document.getElementById("Current").disabled = !djfavs.length;
  

  //currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
  //maxDate = document.getElementById("DatePicker").valueAsDate = new Date();
  maxDate = new Date();

 /* if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }*/

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

  //formatDate(maxDate);
  
  //formattedmaxDate = year+'-'+month+'-'+day;
  formattedmaxDate = maxDate.toISOString().substr(0, 10);
  document.getElementById("DatePicker").setAttribute("max", formattedmaxDate); 
  
  compareDates();
  
  displayComic();
 
}

function PreviousClick()
{
  /*currentselectedDate.setDate(currentselectedDate.getDate()-1);
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }
  */
  
  const djfavs = getFavs();
	const favIndex = djfavs.indexOf(formattedComicDate);

	if (document.getElementById("showfavs").checked && favIndex > 0) {
		currentselectedDate = new Date(djfavs[favIndex - 1]);
	} else {
		currentselectedDate.setDate(currentselectedDate.getDate() - 1);
	}

  compareDates();

  displayComic();

} 

function NextClick()
{
  /*currentselectedDate.setDate(currentselectedDate.getDate()+1);
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()+1);
  }
  */

  let djfavs;
	if (document.getElementById("showfavs").checked) {
	  djfavs = getFavs();
	  let index = djfavs.indexOf(formattedComicDate);
	  if (index < djfavs.length - 1) {
		currentselectedDate = new Date(djfavs[index + 1]);
	  }
	} else {
	  currentselectedDate.setDate(currentselectedDate.getDate() + 1);
	}

  compareDates();

  displayComic();

}

function FirstClick()
{
  //currentselectedDate = new Date(Date.UTC(2015,4,4,12));
  
  var djfavs = getFavs();
	if(document.getElementById("showfavs").checked) {
	currentselectedDate = new Date(djfavs[0]);
	} else {
	currentselectedDate = new Date(Date.UTC(2015, 4, 4, 12));
	}

  compareDates();
  
  displayComic();

}

function CurrentClick()
{
  currentselectedDate = new Date();
  if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  
  compareDates();

  displayComic();
 
}

function RandomClick()
{
 /* start = new Date(Date.UTC(2015,05,04,12));
  end = new Date(maxDate);
  currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }
  */

  const djfavs = getFavs();
	const isShowFavsChecked = document.getElementById("showfavs").checked;

	if (isShowFavsChecked && djfavs.length) {
		currentselectedDate = new Date(djfavs[Math.floor(Math.random() * djfavs.length)]);
	} else {
		const start = new Date("2015-05-04");
		const end = maxDate;
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
  siteUrl =  "https://corsproxy.garfieldapp.workers.dev/cors-proxy?https://dirkjan.nl/cartoon/"+formattedComicDate;
  
  djfavs = getFavs();
  
  $(".favicon").css({"color": "black"})
    .removeClass(djfavs.includes(formattedComicDate) ? 'fa-star-o' : 'fa-star')
    .addClass(djfavs.includes(formattedComicDate) ? 'fa-star' : 'fa-star-o');

  fetchUrl().then(textData =>
 {

    siteBody = textData;
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
      PreviousClick();
      //document.getElementById("comic").src = "dirkjanvrij.png";
    }
  });
  
}

/*function compareDates()
{
  startDate = new Date(Date.UTC(2015,4,4,12));
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
  
  endDate = new Date(maxDate);
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

 }

 */

 function compareDates() {
	var djfavs = getFavs();
	if(document.getElementById("showfavs").checked && djfavs.length !== 0) {
		if(djfavs.includes(document.getElementById("DatePicker").value)) {}
		else{	
		startDate = new Date(djfavs[0])}}
	else{	
		startDate = new Date("2015/05/04");
	}
	startDate = startDate.setHours(0, 0, 0, 0);
	currentselectedDate = currentselectedDate.setHours(0, 0, 0, 0);
	startDate = new Date(startDate);
	currentselectedDate = new Date(currentselectedDate);
	if(currentselectedDate.getTime() <= startDate.getTime()) {
		document.getElementById("Previous").disabled = true;
		document.getElementById("First").disabled = true;
		startDate = startDate.toISOString().substr(0, 10);
	} else {
		document.getElementById("Previous").disabled = false;
		document.getElementById("First").disabled = false;
	}
	if(document.getElementById("showfavs").checked) {
		endDate = new Date(djfavs[djfavs.length - 1]);
	}
	else{ 
		endDate = maxDate;
	}
	endDate = endDate.setHours(0, 0, 0, 0);
	endDate = new Date(endDate);
	if(currentselectedDate.getTime() >= endDate.getTime()) {
		document.getElementById("Next").disabled = true;
		//document.getElementById("Current").disabled = true;
		endDate = endDate.toISOString().substr(0, 10);
	} else {
		document.getElementById("Next").disabled = false;
		document.getElementById("Current").disabled = false;
	}
	if(document.getElementById("showfavs").checked) {
		document.getElementById("Current").disabled = true;
		if(djfavs.length == 1) {
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
  setStatus.onclick = function() {    
        if(document.getElementById("swipe").checked) {
            localStorage.setItem('stat', "true");
        } else {
            localStorage.setItem('stat', "false");
			 }
    }

  setStatus = document.getElementById('showfavs');
	djfavs = getFavs();
	setStatus.onclick = function() {
        if(document.getElementById('showfavs').checked) {
            localStorage.setItem('showfavs', "true");
			if(djfavs.indexOf(formattedComicDate) == -1)
			{
				
			}
			else
			{
				currentselectedDate = new Date(djfavs[0]);	
			}
			
	
       } else {
           localStorage.setItem('showfavs', "false");
			
        }
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
    } else {
        document.getElementById("showfavs").checked = false;
    }

	function getFavs() {
		return JSON.parse(localStorage.getItem('djfavs')) || [];
	  }
		  
   function Addfav() {
      formattedDate = currentselectedDate.getFullYear() + "-" + ("0" + (currentselectedDate.getMonth("") +1 )).slice(-2) + "-" + ("0" + (currentselectedDate.getDate(""))).slice(-2);
      formattedComicDate = formattedDate.split('-').join('/');
      djfavs = getFavs();
      
      if (djfavs.includes(formattedComicDate)) {
        djfavs = djfavs.filter(date => date !== formattedComicDate);
        $(".favicon").css({ color: "black" }).removeClass("fa-star").addClass("fa-star-o");
        document.getElementById("showfavs").disabled = djfavs.length === 0;
      } else {
        djfavs = [...djfavs, formattedComicDate];
        $(".favicon").css({ color: "black" }).removeClass("fa-star-o").addClass("fa-star");
        document.getElementById("showfavs").disabled = false;
      }
      
      djfavs.sort();
      localStorage.setItem("djfavs", JSON.stringify(djfavs));
    
      document.getElementById("Next").disabled = !djfavs.length;
      document.getElementById("Current").disabled = !djfavs.length;
    
      //compareDates();
      //displayComic();
      } 