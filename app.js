if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./serviceworker.js");
}

notfound = null;

function onload()
{
    
  
  currentselectedDate = document.getElementById("DatePicker").valueAsDate = new Date();
  //maxDate = new Date(currentselectedDate.setDate(currentselectedDate.getDate()+7));
    if (currentselectedDate.getDay() == 0) 
    {
      currentselectedDate.setDate(currentselectedDate.getDate()-1);
    }
  document.getElementById("Next").disabled = true;
  document.getElementById("Current").disabled = true;
    
  formatDate(currentselectedDate);
  
  today = year+'-'+month+'-'+day;
  document.getElementById("DatePicker").setAttribute("max", today); 
  document.getElementById("DatePicker").value = currentselectedDate;
  currentselectedDate = new Date();
        
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
  currentselectedDate = new Date();
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
  
 fetch(siteUrl)
     .then(function(response) 
     {
        response.text().then(function(text) 
      {
        siteBody = text;
        picturePosition = siteBody.indexOf("https://dirkjan.nl/wp-content/uploads/");
        pictureUrl = siteBody.substring(picturePosition, picturePosition+84);
        endPosition = pictureUrl.lastIndexOf('"');
        pictureUrl = siteBody.substring(picturePosition, picturePosition+endPosition);
        notfound = siteBody.includes("error404");
        if (notfound !==true) 
        {
          document.getElementById("comic").src = pictureUrl;
          
        }
        
      });
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
  
  endDate = new Date();
  endate = endDate.setHours(0,0,0,0);
  endDate = new Date(endDate);
  if (currentselectedDate.getTime() >= endDate.getTime())
  
  {
    document.getElementById("Next").disabled = true;
    document.getElementById("Current").disabled = true;

    formatDate(endDate);

    endDate = year+'-'+month+'-'+day;

    document.getElementById('DatePicker').value = endDate;
    currentselectedDate = new Date();
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
