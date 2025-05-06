// Theme switcher functionality - Completely rewritten version

// Function to fix comic centering issues
function fixComicCentering(isModernTheme) {
    const comic = document.getElementById('comic');
    if (comic) {
        if (isModernTheme) {
            // For modern theme - ensure comic is centered
            comic.style.marginLeft = 'auto';
            comic.style.marginRight = 'auto';
            comic.style.left = 'auto';
            comic.style.right = 'auto';
            comic.style.position = 'relative';
        } else {
            // For default theme - reset to original styling
            comic.style.marginLeft = '';
            comic.style.marginRight = '';
            comic.style.left = '';
            comic.style.right = '';
            comic.style.position = '';
        }
    }
}

// Function to enhance icons for modern theme
function enhanceIconsForModernTheme(isModernTheme) {
    // Get all icons in the settings container
    const settingsIcon = document.getElementById('settings');
    const favIcon = document.getElementById('favheart');
    const shareIcon = document.getElementById('share');
    
    const icons = [settingsIcon, favIcon, shareIcon];
    
    if (isModernTheme) {
        // Add title attributes for tooltips
        if (settingsIcon) settingsIcon.title = "Instellingen";
        if (favIcon) favIcon.title = "Favoriet";
        if (shareIcon) shareIcon.title = "Delen";
        
        // Remove inline styles that might interfere with our CSS
        icons.forEach(icon => {
            if (icon) {
                icon.style.position = 'static';
                icon.style.right = '';
                icon.style.fontSize = '';
            }
        });
    } else {
        // Reset to original
        icons.forEach(icon => {
            if (icon) {
                icon.removeAttribute('title');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Check if there's a saved theme preference in localStorage
    const savedTheme = localStorage.getItem('dirkjan-theme');
    
    // Set the initial theme based on saved preference or default to 'default'
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update the toggle switch to match the saved theme
        const themeToggle = document.getElementById('theme-toggle');
        if (savedTheme === 'modern' && themeToggle) {
            themeToggle.checked = true;
            console.log("Modern theme loaded from localStorage");
        }
    } else {
        document.documentElement.setAttribute('data-theme', 'default');
        console.log("Default theme applied (no saved preference)");
    }
    
    // Make sure the theme-switcher is visible
    const themeSwitcher = document.querySelector('.theme-switcher');
    if (themeSwitcher) {
        themeSwitcher.style.display = 'flex';
        themeSwitcher.style.zIndex = '9999';
        console.log("Theme switcher visible");
    } else {
        console.error("Theme switcher element not found!");
    }
    
    // Add event listener to the theme toggle switch
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        console.log("Theme toggle found, adding event listener");
        
        themeToggle.addEventListener('change', function(e) {
            console.log("Theme toggle changed:", e.target.checked ? "modern" : "default");            if (e.target.checked) {
                // Switch to modern theme
                document.documentElement.setAttribute('data-theme', 'modern');
                localStorage.setItem('dirkjan-theme', 'modern');
                
                // Apply modern enhancements
                fixComicCentering(true);
                enhanceIconsForModernTheme(true);
                console.log("Modern theme applied!");
            } else {
                // Switch to default theme
                document.documentElement.setAttribute('data-theme', 'default');
                localStorage.setItem('dirkjan-theme', 'default');
                
                // Reset to original styling
                fixComicCentering(false);
                enhanceIconsForModernTheme(false);
                console.log("Default theme applied!");
            }
        });    } else {
        console.error("Theme toggle not found in the DOM!");
    }
    
    // Initialize comic centering based on current theme
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'modern') {
        fixComicCentering(true);
        enhanceIconsForModernTheme(true);
    } else {
        fixComicCentering(false);
        enhanceIconsForModernTheme(false);
    }
});
