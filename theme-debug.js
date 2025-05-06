// Debug script for theme switching
console.log("Theme switcher debug script loaded");

function debugThemeSwitcher() {
  // Get the current theme
  const currentTheme = document.documentElement.getAttribute('data-theme');
  console.log("Current theme:", currentTheme);
  
  // Check if stylesheets are properly loaded
  const defaultStylesheet = document.querySelector('.theme-default');
  const modernStylesheet = document.querySelector('.theme-modern');
  
  console.log("Default stylesheet:", defaultStylesheet ? 
    (window.getComputedStyle(defaultStylesheet).display) : "not found");
  console.log("Modern stylesheet:", modernStylesheet ? 
    (window.getComputedStyle(modernStylesheet).display) : "not found");
  
  // Check if theme toggle exists
  const themeToggle = document.getElementById('theme-toggle');
  console.log("Theme toggle:", themeToggle ? 
    (themeToggle.checked ? "checked (Modern)" : "unchecked (Default)") : "not found");
  
  // Check if theme switcher is visible
  const themeSwitcher = document.querySelector('.theme-switcher');
  if (themeSwitcher) {
    console.log("Theme switcher visibility:", window.getComputedStyle(themeSwitcher).display);
    console.log("Theme switcher z-index:", window.getComputedStyle(themeSwitcher).zIndex);
    console.log("Theme switcher position:", window.getComputedStyle(themeSwitcher).position);
  } else {
    console.error("Theme switcher element not found!");
  }
  
  // Show theme switcher dimensions and position
  if (themeSwitcher) {
    const rect = themeSwitcher.getBoundingClientRect();
    console.log("Theme switcher rect:", {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height
    });
  }
  
  // Fix common issues
  if (themeSwitcher) {
    themeSwitcher.style.display = 'flex';
    themeSwitcher.style.position = 'fixed';
    themeSwitcher.style.zIndex = '9999';
    console.log("Applied fixes to theme switcher");
  }
}

// Run debug automatically
document.addEventListener('DOMContentLoaded', function() {
  // Wait a bit for everything to load
  setTimeout(debugThemeSwitcher, 500);
  
  // Add debug button to quickly toggle themes
  const debugButton = document.createElement('button');
  debugButton.textContent = "Toggle Theme";
  debugButton.style.position = 'fixed';
  debugButton.style.bottom = '10px';
  debugButton.style.right = '10px';
  debugButton.style.zIndex = '9999';
  debugButton.style.padding = '8px 12px';
  debugButton.style.backgroundColor = '#f00';
  debugButton.style.color = '#fff';
  debugButton.style.border = 'none';
  debugButton.style.borderRadius = '4px';
  debugButton.style.cursor = 'pointer';
  
  debugButton.addEventListener('click', function() {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.checked = !themeToggle.checked;
      
      // Manually trigger the change event
      const event = new Event('change');
      themeToggle.dispatchEvent(event);
      
      console.log("Toggled theme to:", themeToggle.checked ? "modern" : "default");
    }
    
    // Run debug info again after toggle
    setTimeout(debugThemeSwitcher, 100);
  });
  
  document.body.appendChild(debugButton);
});
