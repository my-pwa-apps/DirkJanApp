# DirkJan PWA - AI Agent Instructions

## Project Overview
Single-page Progressive Web App (PWA) for browsing DirkJan comics from dirkjan.nl. Vanilla JavaScript, no frameworks. Deployed on Cloudflare Pages.

## Architecture

### Core Files
- **`app.js`** (2500+ lines): Single monolithic JavaScript file with clear section dividers (`// ========================================`)
- **`main.css`** (1500+ lines): All styles, includes mobile-first responsive design
- **`index.html`** (195 lines): Static HTML shell with inline onclick handlers
- **`serviceworker.js`** (181 lines): PWA offline support with 3-tier caching
- **`manifest.webmanifest`**: PWA manifest with `"orientation": "any"` (orientation controlled via JavaScript API)

### Key Architectural Patterns

**1. CONFIG-First Design**
```javascript
const CONFIG = Object.freeze({
  STORAGE_KEYS: Object.freeze({ FAVS: 'favs', TOOLBAR_POS: 'mainToolbarPosition', ... }),
  CORS_PROXIES: [proxy1, proxy2, proxy3], // fallback chain
  // All magic numbers live here
});
```
Always reference `CONFIG.STORAGE_KEYS.*` not hardcoded strings. All configuration is frozen immutable.

**2. UTILS Object for Shared Logic**
```javascript
const UTILS = {
  safeJSONParse: (str, fallback) => { /* resilient parsing */ },
  formatDate: (date) => { /* sets global year/month/day */ },
  isMobileOrTouch: () => { /* device detection */ }
};
```
Use `UTILS.safeJSONParse()` for all localStorage reads (never raw `JSON.parse`).

**3. Section Organization in app.js**
Code is organized in clear sections marked by `// ========================================`:
- CONFIGURATION & CONSTANTS
- SERVICE WORKER REGISTRATION & PWA SETUP
- CORS PROXY SYSTEM
- UTILITY FUNCTIONS
- FAVORITES MANAGEMENT
- TOOLBAR POSITIONING
- ORIENTATION MANAGEMENT
- SHARING FUNCTIONALITY
- COMIC NAVIGATION & DISPLAY
- ROTATION & FULLSCREEN HANDLING
- TOUCH/SWIPE HANDLING
- SETTINGS & UI

**4. CORS Proxy Fallback System**
Comic images fetched via intelligent proxy rotation with failure tracking:
```javascript
async function fetchWithFallback(url) {
  // Tries multiple CORS proxies in order
  // Tracks failures per proxy (proxyFailureCount array)
  // Uses AbortSignal.timeout for fetch timeouts
}
```
Never fetch dirkjan.nl directly - always through `fetchWithFallback()`.

**5. Service Worker Versioning**
```javascript
const CACHE_VERSION = 'v19'; // Increment this for every deployment
```
Every code change REQUIRES incrementing `CACHE_VERSION` in `serviceworker.js`. This triggers cache refresh and update notification to users.

**6. Dual Positioning System**
- **Main toolbar**: Draggable, saves position to `CONFIG.STORAGE_KEYS.TOOLBAR_POS`
- **Settings panel**: Draggable, saves to `CONFIG.STORAGE_KEYS.SETTINGS_POS`
- Both use absolute positioning (`position: absolute` in CSS, `top`/`left` in px via JS)
- Load saved position FIRST in init functions before any events/animations

**7. Device Rotation Handling**
```javascript
// User can disable rotation via settings
const deviceRotationEnabled = localStorage.getItem(CONFIG.STORAGE_KEYS.DEVICE_ROTATION);
if (deviceRotationEnabled === "false") return; // Exit early from orientation handler

// When enabled: landscape → fullscreen mode, portrait → exit fullscreen
window.addEventListener('orientationchange', () => { /* debounced by 300ms */ });
```
- Manifest allows "any" orientation
- JavaScript controls locking via Screen Orientation API (`screen.orientation.lock('portrait')`)
- CSS `body.force-portrait` class prevents rotation when disabled
- NO manual click rotation - only physical device rotation triggers fullscreen

**8. State Management via localStorage**
All state persisted in localStorage (no session state):
```javascript
CONFIG.STORAGE_KEYS = {
  FAVS: 'favs',              // JSON array of favorite dates
  LAST_COMIC: 'lastcomic',   // Last viewed date
  TOOLBAR_POS: '...',        // {top: num, left: num}
  SETTINGS_POS: '...',       // {top: num, left: num}
  DEVICE_ROTATION: '...',    // "true" or "false"
  SWIPE: 'stat',             // "true" or "false"
  SHOW_FAVS: 'showfavs',     // "true" or "false"
  LAST_DATE: 'lastdate',     // "true" or "false"
  SETTINGS_VISIBLE: 'settings' // "true" or "false"
}
```
Use `UTILS.safeJSONParse()` for all reads. Settings save on click, positions save on drag end.

## Critical Development Patterns

### Making Changes
1. **Always increment `CACHE_VERSION` in `serviceworker.js`** after any code change
2. Use section dividers (`// ========================================`) for new functionality
3. Add JSDoc comments for new functions: `/** Description @param {type} name - desc @returns {type} */`
4. Never break existing localStorage keys (migration needed if changing structure)
5. Test on mobile (PWA behavior differs from desktop browser)

### Positioning Elements
```javascript
// WRONG - uses CSS transform
element.style.left = '50%';
element.style.transform = 'translateX(-50%)';

// CORRECT - absolute pixel positioning
element.style.left = centeredLeft + 'px';
element.style.top = centeredTop + 'px';
element.style.transform = 'none'; // Clear any CSS transform
```
Saved positions are always in pixels. Transform creates positioning conflicts.

### Touch/Swipe Detection
```javascript
// Swipe uses global handlers with CONFIG constants
const absX = Math.abs(deltaX);
const absY = Math.abs(deltaY);
if (absX > CONFIG.SWIPE_MIN_DISTANCE && deltaTime < CONFIG.SWIPE_MAX_TIME) {
  // Valid swipe
}
```
Tap detection removed (no click-to-rotate). Device rotation is purely physical orientation change.

### Adding New Settings
1. Add checkbox to `index.html` settings panel
2. Add key to `CONFIG.STORAGE_KEYS`
3. Add click handler to save: `localStorage.setItem(CONFIG.STORAGE_KEYS.NEW_KEY, checked ? "true" : "false")`
4. Add initialization: load from localStorage and set checkbox state
5. Increment service worker version

### Fullscreen/Landscape Mode
```javascript
function Rotate(applyRotation = true) {
  // applyRotation=false: landscape fullscreen (no 90° rotation)
  // applyRotation=true: legacy 90° rotation (currently unused)
  // Creates overlay, cloned comic, fullscreen toolbar
  // Exit by rotating device back to portrait (orientation handler detects and calls Rotate())
}
```
Two CSS classes: `.fullscreen-landscape` (no rotation) and `.rotate` (90deg - legacy, not used).

## Common Pitfalls

1. **Forgetting to increment CACHE_VERSION**: Users won't get updates
2. **Using `JSON.parse()` directly**: Use `UTILS.safeJSONParse()` to prevent crashes
3. **Adding orientation change listeners**: Only `resize` should trigger `clampMainToolbarInView()`, not `orientationchange` (prevents toolbar jumping)
4. **Transform conflicts**: Always set `transform: 'none'` when using absolute positioning
5. **Hardcoded storage keys**: Always use `CONFIG.STORAGE_KEYS.*`
6. **Forgetting to apply saved positions on init**: Load position BEFORE element becomes visible

## Testing Checklist
- [ ] Increment `CACHE_VERSION` in `serviceworker.js`
- [ ] Test on mobile (Chrome Android, Safari iOS)
- [ ] Verify rotation behavior (enabled/disabled setting)
- [ ] Check toolbar/settings don't move on rotation
- [ ] Test offline mode (service worker caching)
- [ ] Verify swipe navigation works
- [ ] Check localStorage persistence across refresh

## External Dependencies
- Comics scraped from `https://dirkjan.nl/cartoon/YYYYMMDD`
- Three CORS proxies in fallback chain (see `CONFIG.CORS_PROXIES`)
- Font Awesome 4.7.0 (CDN)
- Cloudflare Web Analytics (beacon script)
- No npm, no build process, no bundler - pure static files

## Deployment
Push to `main` branch → Cloudflare Pages auto-deploys from repository. No build step needed.
