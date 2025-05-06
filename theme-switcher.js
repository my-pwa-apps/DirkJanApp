// Theme switcher functionality
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
        
        // Ensure the toggle switch is visible
        const themeSwitch = themeToggle.closest('.theme-switch');
        if (themeSwitch) {
            themeSwitch.style.display = 'inline-block';
        }
        
        themeToggle.addEventListener('change', function(e) {
            console.log("Theme toggle changed:", e.target.checked ? "modern" : "default");
            
            if (e.target.checked) {
                // Switch to modern theme
                document.documentElement.setAttribute('data-theme', 'modern');
                localStorage.setItem('dirkjan-theme', 'modern');
                
                // Apply modern styling
                applyModernStyling();
                
                // Alert for debugging
                console.log("Modern theme applied!");
            } else {
                // Switch to default theme
                document.documentElement.setAttribute('data-theme', 'default');
                localStorage.setItem('dirkjan-theme', 'default');
                
                // Apply default styling
                applyDefaultStyling();
                
                // Alert for debugging
                console.log("Default theme applied!");
            }
        });
    } else {
        console.error("Theme toggle not found in the DOM!");
    }
      // Apply initial styling based on the theme
    if (savedTheme === 'modern') {
        applyModernStyling();
    } else {
        applyDefaultStyling();
    }
    
    // Fix comic centering based on current theme
    if (document.documentElement.getAttribute('data-theme') === 'modern') {
        fixComicCentering(true);
    } else {
        fixComicCentering(false);
    }
});

// Function to apply modern styling
function applyModernStyling() {
    // We don't need to modify the DOM structure anymore
    // The modern.css file applies styling using the data-theme attribute
    console.log("Modern theme applied via CSS");
    
    // Optional: Add a class to the body for additional styling hooks
    document.body.classList.add('modern-theme');
}
    
    // Update grid class
    const buttonGrid = document.querySelector('.buttongrid');
    if (buttonGrid) {
        buttonGrid.classList.add('button-grid');
        buttonGrid.classList.remove('buttongrid');
    }
    
    // Wrap comic in container if not already
    const comic = document.getElementById('comic');
    if (comic && !comic.parentElement.classList.contains('comic-container')) {
        const comicContainer = document.createElement('div');
        comicContainer.className = 'comic-container';
        comic.parentNode.insertBefore(comicContainer, comic);
        comicContainer.appendChild(comic);
    }
    
    // Transform settings icons to buttons if not already
    const settingsIcons = document.querySelector('.settings-icons-container');
    if (settingsIcons && !document.querySelector('.settings-bar')) {
        const settingsBar = document.createElement('div');
        settingsBar.className = 'settings-bar';
        
        // Replace img elements with button elements
        Array.from(settingsIcons.children).forEach(img => {
            if (img.tagName === 'IMG') {
                const button = document.createElement('button');
                button.className = 'icon-button';
                button.id = img.id;
                button.onclick = new Function(img.getAttribute('onclick'));
                
                const newImg = document.createElement('img');
                newImg.src = img.src;
                newImg.alt = img.alt;
                
                button.appendChild(newImg);
                settingsBar.appendChild(button);
            }
        });
        
        settingsIcons.parentNode.insertBefore(settingsBar, settingsIcons);
        settingsIcons.style.display = 'none';
    }
    
    // Update settings panel styling
    const settingsDiv = document.getElementById('settingsDIV');
    if (settingsDiv) {
        settingsDiv.classList.add('settings-panel');
        
        // Transform checkboxes to toggle switches
        const checkboxes = settingsDiv.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (!checkbox.parentElement.classList.contains('toggle')) {
                const label = settingsDiv.querySelector(`label[for="${checkbox.id}"]`);
                const text = label ? label.textContent : '';
                
                // Create toggle switch
                const settingOption = document.createElement('div');
                settingOption.className = 'settings-option';
                
                const toggle = document.createElement('label');
                toggle.className = 'toggle';
                
                const slider = document.createElement('span');
                slider.className = 'slider';
                
                // Move checkbox inside toggle
                checkbox.parentNode.removeChild(checkbox);
                toggle.appendChild(checkbox);
                toggle.appendChild(slider);
                
                // Add text
                const span = document.createElement('span');
                span.textContent = text;
                
                // Remove original label
                if (label) {
                    label.parentNode.removeChild(label);
                }
                
                // Assemble the toggle option
                settingOption.appendChild(toggle);
                settingOption.appendChild(span);
                
                // Find and remove BR elements
                const lineBreaks = settingsDiv.querySelectorAll('br');
                lineBreaks.forEach(br => {
                    br.parentNode.removeChild(br);
                });
                
                // Add the new toggle option
                settingsDiv.appendChild(settingOption);
            }
        });
    }

    // Make Current button primary if it isn't already
    const currentButton = document.getElementById('Current');
    if (currentButton && !currentButton.classList.contains('btn-primary')) {
        currentButton.classList.add('btn-primary');
    }
}

// Function to apply default styling
function applyDefaultStyling() {
    // Update button classes back to original
    document.querySelectorAll('.btn').forEach(button => {
        button.classList.add('button');
        button.classList.remove('btn', 'btn-primary');
    });
    
    // Restore button grid class
    const buttonGrid = document.querySelector('.button-grid');
    if (buttonGrid) {
        buttonGrid.classList.add('buttongrid');
        buttonGrid.classList.remove('button-grid');
    }
    
    // Unwrap comic from container if needed
    const comicContainer = document.querySelector('.comic-container');
    if (comicContainer) {
        const comic = document.getElementById('comic');
        if (comic) {
            comicContainer.parentNode.insertBefore(comic, comicContainer);
            comicContainer.parentNode.removeChild(comicContainer);
        }
    }
    
    // Restore original settings icons
    const settingsBar = document.querySelector('.settings-bar');
    const settingsIcons = document.querySelector('.settings-icons-container');
    if (settingsBar && settingsIcons) {
        settingsIcons.style.display = '';
        settingsBar.parentNode.removeChild(settingsBar);
    }
    
    // Restore settings panel to original style
    const settingsDiv = document.getElementById('settingsDIV');
    if (settingsDiv) {
        settingsDiv.classList.remove('settings-panel');
        
        // Remove modern toggle switches and restore original checkboxes
        const settingOptions = settingsDiv.querySelectorAll('.settings-option');
        settingOptions.forEach(option => {
            settingsDiv.removeChild(option);
        });
        
        // Restore original checkboxes and labels from localStorage if available
        // This is a simplified version - in practice you would need to rebuild the original structure
    }
}
