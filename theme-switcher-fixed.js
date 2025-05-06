// Theme switcher functionality - Fixed version

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
                // Override any inline styles completely
                icon.style.position = 'static';
                icon.style.right = '';
                icon.style.fontSize = '';
                
                // Ensure SVG displays correctly
                icon.style.display = 'block';
                icon.style.width = '28px';
                icon.style.height = '28px';
                
                // Add data attribute to mark as enhanced
                icon.setAttribute('data-modern-enhanced', 'true');
            }
        });
        
        // Make sure the container is also properly styled
        const container = document.querySelector('.settings-icons-container');
        if (container) {
            container.style.display = 'flex';
            container.style.justifyContent = 'center';
        }
    } else {        // Reset to original
        icons.forEach(icon => {
            if (icon) {
                // Remove our modern enhancements
                icon.removeAttribute('title');
                icon.removeAttribute('data-modern-enhanced');
                
                // Reset styles to what they were in HTML
                if (icon.id === 'settings') {
                    icon.style.fontSize = '25px';
                    icon.style.right = '125px';
                    icon.style.position = 'absolute';
                    icon.style.filter = 'brightness(0.15)'; // Make sure icon is visible
                } else if (icon.id === 'favheart') {
                    icon.style.fontSize = '25px';
                    icon.style.right = '70px';
                    icon.style.position = 'absolute';
                    icon.style.filter = ''; // Heart icon already has appropriate fill color
                } else if (icon.id === 'share') {
                    icon.style.fontSize = '25px';
                    icon.style.right = '20px';
                    icon.style.position = 'absolute';
                    icon.style.filter = 'brightness(0.15)'; // Make sure icon is visible
                }
                
                // Set proper dimensions for the SVG icons
                icon.style.display = '';
                icon.style.width = '24px';
                icon.style.height = '24px';
            }
        });
    }
}

// Observer to ensure SVG icons stay styled correctly
let modernIconObserver;

// Function to initialize the observer for modern theme
function setupIconObserver(isModernTheme) {
    if (isModernTheme) {
        // Set up observer to watch for any changes to the settings icons
        if (!modernIconObserver) {
            const iconsContainer = document.querySelector('.settings-icons-container');
            if (iconsContainer) {
                modernIconObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'childList' || 
                            mutation.type === 'attributes' || 
                            mutation.attributeName === 'style') {
                            // Re-apply our icon enhancements
                            console.log("Icon mutation detected, reapplying styles");
                            enhanceIconsForModernTheme(true);
                        }
                    });
                });
                
                modernIconObserver.observe(iconsContainer, {
                    attributes: true,
                    childList: true,
                    subtree: true,
                    attributeFilter: ['style']
                });
                console.log("Icon observer set up");
            }
        }
    } else {
        // Disconnect observer when in default theme
        if (modernIconObserver) {
            modernIconObserver.disconnect();
            modernIconObserver = null;
            console.log("Icon observer disconnected");
        }
    }
}

// Function to initialize settings icons in default theme
function initializeDefaultIcons() {
    const settingsIcon = document.getElementById('settings');
    const favIcon = document.getElementById('favheart');
    const shareIcon = document.getElementById('share');
    
    if (settingsIcon) {
        settingsIcon.style.filter = 'brightness(0.15)';
        settingsIcon.style.width = '24px';
        settingsIcon.style.height = '24px';
    }
    
    if (shareIcon) {
        shareIcon.style.filter = 'brightness(0.15)';
        shareIcon.style.width = '24px';
        shareIcon.style.height = '24px';
    }
    
    if (favIcon) {
        // No filter for heart icon as it already has appropriate color
        favIcon.style.width = '24px';
        favIcon.style.height = '24px';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize default icons right away
    initializeDefaultIcons();
    
    // Check if there's a saved theme preference in localStorage
    const savedTheme = localStorage.getItem('dirkjan-theme');
    
    // Set the initial theme based on saved preference or default to 'default'
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        // Update the toggle switch to match the saved theme
        const themeToggle = document.getElementById('theme-toggle');
        if (savedTheme === 'modern' && themeToggle) {
            themeToggle.checked = true;
            // Apply modern enhancements right away since we're in modern theme
            fixComicCentering(true);
            enhanceIconsForModernTheme(true);
            setupIconObserver(true);
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
            console.log("Theme toggle changed:", e.target.checked ? "modern" : "default");
            if (e.target.checked) {
                // Switch to modern theme
                document.documentElement.setAttribute('data-theme', 'modern');
                localStorage.setItem('dirkjan-theme', 'modern');
                
                // Apply modern enhancements
                fixComicCentering(true);
                enhanceIconsForModernTheme(true);
                setupIconObserver(true);
                console.log("Modern theme applied!");
            } else {
                // Switch to default theme
                document.documentElement.setAttribute('data-theme', 'default');
                localStorage.setItem('dirkjan-theme', 'default');
                
                // Reset to original styling
                fixComicCentering(false);
                enhanceIconsForModernTheme(false);
                setupIconObserver(false);
                console.log("Default theme applied!");
            }
        });
    } else {
        console.error("Theme toggle not found in the DOM!");
    }
      // Initialize comic centering based on current theme
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'modern') {
        fixComicCentering(true);
        enhanceIconsForModernTheme(true);
        setupIconObserver(true);
    } else {
        fixComicCentering(false);
        enhanceIconsForModernTheme(false);
        initializeDefaultIcons(); // Make sure default icons are visible
    }
});
