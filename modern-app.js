// Modified app.js for the modern UI
// This file contains only the modifications needed for the modern UI
// The original app.js should be kept, and this file should be included after it

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Hide settings panel by default
  const settingsPanel = document.getElementById('settingsDIV');
  if (settingsPanel) {
    settingsPanel.style.display = 'none';
  }

  // Check if we're in dark mode and adjust any specific elements
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    // Add any dark mode specific adjustments here
  }

  // Watch for dark mode changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    // Handle theme change if needed
  });

  // Add touch feedback to buttons
  document.querySelectorAll('.btn, .icon-button').forEach(button => {
    button.addEventListener('touchstart', function() {
      this.classList.add('pressed');
    });
    
    button.addEventListener('touchend', function() {
      this.classList.remove('pressed');
    });
  });

  // Update the Rotate function to use our new classes
  // This overwrites the original Rotate function
  window.Rotate = function() {
    const comicImg = document.getElementById('comic');
    
    if (comicImg.classList.contains('normal')) {
      comicImg.classList.remove('normal');
      comicImg.classList.add('rotate');
    } else {
      comicImg.classList.remove('rotate');
      comicImg.classList.add('normal');
    }
  };

  // Update the HideSettings function to toggle the settings panel
  // This overwrites the original HideSettings function
  window.HideSettings = function() {
    const settingsDiv = document.getElementById('settingsDIV');
    
    if (settingsDiv.style.display === 'none' || !settingsDiv.style.display) {
      settingsDiv.style.display = 'block';
      // Animate settings panel in
      settingsDiv.style.opacity = 0;
      setTimeout(() => {
        settingsDiv.style.opacity = 1;
      }, 10);
    } else {
      // Animate settings panel out
      settingsDiv.style.opacity = 0;
      setTimeout(() => {
        settingsDiv.style.display = 'none';
      }, 300);
    }
  };
});
