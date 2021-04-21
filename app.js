if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./serviceworker.js");
}

notfound = null;
textData = null;

function Share()
{
  if (navigator.share) {
    navigator.share({
      title: 'https://dirkjanapp.tk',
      url: pictureUrl
    });
  } 
}

function onload()
{
    
  currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
  maxDate = document.getElementById("DatePicker").valueAsDate = new Date();
  /*if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }

    */
  document.getElementById("Next").disabled = true;
  document.getElementById("Current").disabled = true;
    
  //formatDate(currentselectedDate);
  //maxDate = currentselectedDate;

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
    }

  //maxDate = new Date(currentselectedDate);
   
  formatDate(maxDate);
  
  max = year+'-'+month+'-'+day;
  document.getElementById("DatePicker").setAttribute("max", max); 
  
  formatDate(currentselectedDate);
  
  //today = year+'-'+month+'-'+day;

  //document.getElementById("DatePicker").value = today;
  
  compareDates();
  
  doStuff();
 
}

document.addEventListener('swiped-right', function(e)
 {
  currentselectedDate = document.getElementById('DatePicker');
  
  currentselectedDate = new Date(currentselectedDate.value);
  currentselectedDate.setDate(currentselectedDate.getDate()-1);
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }

  compareDates();

  doStuff();
});

function PreviousClick()
{
  currentselectedDate = document.getElementById('DatePicker');
  
  currentselectedDate = new Date(currentselectedDate.value); 
  currentselectedDate.setDate(currentselectedDate.getDate()-1);
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }
  compareDates();

  doStuff();

} 

document.addEventListener('swiped-left', function(e)
 {
  currentselectedDate = document.getElementById('DatePicker');
  currentselectedDate = new Date(currentselectedDate.value);
  currentselectedDate.setDate(currentselectedDate.getDate()+1);
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()+1);
  }

  compareDates();

  doStuff();
});


function NextClick()
{
  currentselectedDate = document.getElementById('DatePicker');
  currentselectedDate = new Date(currentselectedDate.value);
  currentselectedDate.setDate(currentselectedDate.getDate()+1);
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()+1);
  }
  
  compareDates();

  doStuff();

}

function FirstClick()
{
  currentselectedDate = new Date("2015-05-04");
  
  compareDates();
  
  doStuff();

}

document.addEventListener('swiped-up', function(e)
 {
  currentselectedDate = new Date();
  if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  
  compareDates();

  doStuff();
});

function CurrentClick()
{
  currentselectedDate = new Date(maxDate);
  if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  
  compareDates();

  doStuff();
 
}


document.addEventListener('swiped-down', function(e)
 {
  start = new Date("2015-05-04");
  end = new Date();
  currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }
  compareDates();
  
  doStuff();
});

function RandomClick()
{
  start = new Date("2015-05-04");
  end = new Date();
  currentselectedDate = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  if (currentselectedDate.getDay() == 0) 
  {
    currentselectedDate.setDate(currentselectedDate.getDate()-1);
  }
  compareDates();

  doStuff();
 
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
  
  doStuff();
  
}

function doStuff()
{
  
  formatDate(currentselectedDate);

  formattedDate = year+"-"+month+"-"+day;
  formattedComicDate = year+month+day;
  document.getElementById('DatePicker').value = formattedDate;
  siteUrl = "https://cors.bridged.cc/https://dirkjan.nl/cartoon/"+formattedComicDate;
  
  fetchUrl().then(textData =>
 {

    siteBody = textData;
    notfound = siteBody.includes("error404");
    picturePosition = siteBody.indexOf("https://dirkjan.nl/wp-content/uploads/");
    if (notfound == false)
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
  startDate = new Date("2015/05/04");
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
    currentselectedDate = new Date("2015/05/04");
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
    document.getElementById("Current").disabled = true;

    formatDate(endDate);

    endDate = year+'-'+month+'-'+day;

    document.getElementById('DatePicker').value = endDate;
    currentselectedDate = new Date(endDate);
  }
  else
  {
    document.getElementById("Next").disabled = false;
    document.getElementById("Current").disabled = false;
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

const fetchUrl = async () =>
{
  const websiteData = await fetch(siteUrl);
  const textData = await websiteData.text();
 return textData;
};
