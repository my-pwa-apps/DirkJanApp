# Theme Switcher for DirkJanApp

This document explains how the theme switcher works and how to customize it further.

## Overview

The theme switcher allows users to toggle between the original interface and the new modern interface while maintaining the app's core functionality. The switching is done smoothly without page refreshes and preserves user preferences across sessions.

## Files Added

1. `theme-switcher.css` - Contains styles for the theme toggle switch and theme-specific CSS rules
2. `theme-switcher.js` - Contains the JavaScript logic to switch between themes and apply UI transformations

## How It Works

### HTML Attributes

The theme is controlled by a `data-theme` attribute on the HTML element:
```html
<html lang="nl" data-theme="default">
```

This attribute switches between "default" and "modern" values.

### CSS Loading

Two CSS files are loaded with special classes that control their visibility:
```html
<link rel="stylesheet" href="./main.css" class="theme-default">
<link rel="stylesheet" href="./modern.css" class="theme-modern">
```

CSS rules then show/hide these stylesheets based on the current theme:
```css
html[data-theme="default"] .theme-default { display: block; }
html[data-theme="modern"] .theme-modern { display: block; }
```

### Theme Toggle

The UI includes a toggle switch in the top-right corner allowing users to switch between themes:
```html
<div class="theme-switcher">
  <span class="theme-label">Modern UI</span>
  <label class="theme-switch">
    <input type="checkbox" id="theme-toggle">
    <span class="theme-slider"></span>
  </label>
</div>
```

### JavaScript Logic

The theme-switcher.js file contains two main functions:

1. `applyModernStyling()` - Transforms the UI to match the modern design
2. `applyDefaultStyling()` - Reverts to the original UI design

These functions:
- Change CSS classes for elements (e.g., `.button` to `.btn`)
- Restructure the DOM when needed (adding containers, wrappers)
- Apply theme-specific styling to components
- Transform components (like checkboxes to toggle switches)

### User Preference Storage

The chosen theme is saved in localStorage so it persists across sessions:
```javascript
localStorage.setItem('dirkjan-theme', 'modern'); // or 'default'
```

## Customization Options

### Modifying the Toggle Appearance

You can edit the theme-switcher.css file to change the appearance of the toggle switch.

### Changing Theme Colors

The modern theme uses CSS variables defined at the top of modern.css:
```css
:root {
  --primary-color: #F09819;
  --primary-hover: #e08000;
  /* other variables */
}
```

Edit these values to customize the color scheme.

### Adding More Themes

To add additional themes:

1. Create a new CSS file for the theme
2. Add a new class to link the stylesheet in index.html
3. Add new display rules in theme-switcher.css
4. Extend the theme-switcher.js to handle the new theme option

## Best Practices

- Keep both themes updated when adding new features
- Test both themes when making changes
- Consider using feature detection for browser compatibility

## Browser Compatibility

The theme switcher is compatible with:
- Chrome, Firefox, Safari, Edge (latest versions)
- iOS and Android mobile browsers

## Known Issues

- Switching themes multiple times may occasionally cause minor visual glitches
- Some very specific UI components might need manual adjustment after theme switching
- The switcher might conflict with other JavaScript that directly manipulates CSS classes

## Future Improvements

- Add a smoother transition between themes
- Support for additional themes beyond the default and modern
- Automatic theme switching based on time of day
