# Orientation Lock & Auto-Fullscreen Feature

## Overview
The app locks to portrait orientation and automatically enters fullscreen comic viewing mode when the device is rotated to landscape. This provides an intuitive, natural viewing experience while maintaining a stable UI.

## Changes Made

### 1. Manifest Update (`manifest.webmanifest`)
```json
"orientation": "portrait"  // Changed from "any" to "portrait"
```
- **Purpose**: Locks the app interface to portrait
- **Effect**: App UI stays in portrait mode, preventing layout shifts
- **Benefit**: Stable, predictable interface

### 2. Smart Orientation Handler (`app.js`)

#### Enhanced Rotate Function:
```javascript
function Rotate(applyRotation = true)
```
- New parameter `applyRotation` (default: true)
- When `true`: Applies 90° rotation (for portrait device + manual tap)
- When `false`: Fullscreen without rotation (for landscape device orientation)

#### Automatic Fullscreen Trigger:
```javascript
window.addEventListener('orientationchange', function() {
  const isLandscape = orientation.includes('landscape') || 
                      Math.abs(window.orientation) === 90;
  
  if (isLandscape) {
    Rotate(false); // Fullscreen without rotation
  } else {
    // Exit fullscreen when returning to portrait
  }
});
```

### 3. New CSS Class (`main.css`)
```css
.fullscreen-landscape {
  /* Fullscreen centered without rotation transform */
  transform: translate(-50%, -50%);
}
```

## User Experience

### Portrait Device (Normal):
1. **Manual Tap**: User taps comic → Enters fullscreen with 90° rotation
2. **Auto-Landscape**: Device rotates to landscape → Auto-enters fullscreen (NO rotation)
3. **Return to Portrait**: Device rotates back → Auto-exits fullscreen

### Landscape Device Rotation Flow:
1. User rotates device to landscape
2. App UI stays portrait (locked)
3. Comic **automatically** enters fullscreen mode
4. Comic displays in natural landscape orientation (no 90° rotation needed)
5. Toolbar appears at bottom
6. User rotates back to portrait → Auto-exits fullscreen

## Technical Details

### Two Display Modes:

1. **Portrait Mode with Rotation** (Manual tap in portrait)
   - CSS class: `.rotate`
   - Transform: `rotate(90deg)`
   - Use case: User taps comic in portrait orientation
   - Result: Comic rotates 90° for landscape viewing

2. **Fullscreen Landscape Mode** (Auto-trigger on device rotation)
   - CSS class: `.fullscreen-landscape`
   - Transform: `translate(-50%, -50%)` (centered, no rotation)
   - Use case: Device rotates to landscape
   - Result: Comic displays naturally in landscape

### Orientation Detection:
- Modern API: `screen.orientation.type.includes('landscape')`
- Legacy fallback: `Math.abs(window.orientation) === 90`
- 300ms delay ensures orientation change completes
- Works on both iOS and Android

### Smart State Management:
- Tracks whether in fullscreen mode
- Distinguishes between rotated and landscape fullscreen
- Auto-exits fullscreen when returning to portrait
- Prevents conflicts between manual and auto triggers

## Benefits

1. **Intuitive UX**: Rotate device → Comic fills screen naturally
2. **Dual Mode**: Manual tap OR device rotation both work
3. **No Double Rotation**: Landscape device = no CSS rotation needed
4. **Stable UI**: App interface never rotates
5. **Natural Interaction**: Like YouTube, Photos, Netflix apps
6. **Automatic**: No button needed - just rotate device
7. **Reversible**: Rotate back to portrait → Auto-exits fullscreen

## Testing Checklist

- [ ] Portrait mode: Tap comic → Enters fullscreen with 90° rotation
- [ ] Landscape rotation: Device rotates → Auto-enters fullscreen (no CSS rotation)
- [ ] Return to portrait: Device rotates back → Auto-exits fullscreen
- [ ] In fullscreen: Toolbar remains accessible at bottom
- [ ] Swipe gestures work in fullscreen mode
- [ ] Can manually exit fullscreen by tapping comic
- [ ] Works in PWA installed mode
- [ ] Works in browser mode
- [ ] No conflicts between manual tap and device rotation

## Browser Support

### Modern Browsers:
- Chrome/Edge 38+
- Firefox 43+
- Safari 13+ (iOS)
- Opera 25+

### PWA Mode:
- Orientation lock applies when installed as PWA
- Auto-fullscreen works best in PWA mode
- Browser mode may vary based on browser settings

## Notes

- App UI stays locked in portrait orientation
- Device rotation triggers fullscreen mode automatically
- Two rotation modes: CSS rotated (manual) vs fullscreen landscape (auto)
- 300ms delay ensures smooth orientation transitions
- Mimics behavior of media apps (YouTube, Photos, etc.)
- Provides natural, intuitive user experience
