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
        
        // Apply modern styling to each icon
        icons.forEach(icon => {
            if (icon) {
                // Override any inline styles completely
                icon.style.position = 'static';
                icon.style.right = '';
                icon.style.fontSize = '';
                
                // Ensure SVG displays correctly with modern styling
                icon.style.display = 'block';
                icon.style.width = '28px';
                icon.style.height = '28px';
                icon.style.padding = 'var(--spacing-sm)';  // From CSS variables
                icon.style.borderRadius = '8px';
                icon.style.backgroundColor = 'var(--primary-color)';
                icon.style.boxShadow = 'var(--shadow-small)';
                icon.style.margin = '0 10px';
                icon.style.objectFit = 'contain';
                
                // Apply white color to all icons in modern mode
                icon.style.filter = 'brightness(0) invert(1)';
                
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
                    icon.style.filter = 'brightness(0)'; // Black for settings icon
                    icon.style.background = 'transparent';
                } else if (icon.id === 'favheart') {
                    icon.style.fontSize = '25px';
                    icon.style.right = '70px';
                    icon.style.position = 'absolute';
                    icon.style.filter = 'none'; // Heart icon already has red fill color
                    icon.style.background = 'transparent';
                } else if (icon.id === 'share') {
                    icon.style.fontSize = '25px';
                    icon.style.right = '20px';
                    icon.style.position = 'absolute';
                    icon.style.filter = 'brightness(0)'; // Black for share icon
                    icon.style.background = 'transparent';
                }
                
                // Set proper dimensions for the SVG icons
                icon.style.display = 'inline';
                icon.style.width = '30px';
                icon.style.height = '30px';
                icon.style.padding = '0';
                icon.style.margin = '0';
                icon.style.boxShadow = 'none';
                icon.style.borderRadius = '0';
                icon.style.objectFit = 'contain';
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
        settingsIcon.style.filter = 'brightness(0)'; // Pure black for tune.svg
        settingsIcon.style.width = '30px';
        settingsIcon.style.height = '30px';
        // Ensure the SVG is properly sized and visible
        settingsIcon.style.objectFit = 'contain';
    }
    
    if (shareIcon) {
        shareIcon.style.filter = 'brightness(0)'; // Pure black for share.svg
        shareIcon.style.width = '30px';
        shareIcon.style.height = '30px';
        shareIcon.style.objectFit = 'contain';
    }
    
    if (favIcon) {
        // No filter for heart icon as it already has appropriate color (#EA3323)
        favIcon.style.filter = 'none';
        favIcon.style.width = '30px';
        favIcon.style.height = '30px';
        favIcon.style.objectFit = 'contain';
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
