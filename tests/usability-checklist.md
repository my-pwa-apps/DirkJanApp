# DirkJan Pre-Production Usability Checklist

Run this alongside `npm run test:predeploy` for changes that affect layout, navigation, sharing, settings, or PWA behavior.

- Verify the hidden H1 is not visible above the logo but remains present for screen readers.
- Verify the toolbar is usable on desktop and mobile widths.
- Verify settings open, close, and remain draggable without covering critical comic controls.
- Verify favorite add/remove state persists across refresh.
- Verify swipe navigation in both directions, rapid gestures, and disabled swipe on a physical touch device.
- Verify installed/offline PWA behavior after a service worker version bump.
- Verify portrait-to-landscape fullscreen entry, return to portrait, safe areas, and settings-open rotation.
- Verify native share-sheet cancellation and success.
- Verify dark mode and favorite/settings persistence after terminating and reopening the installed app.
- Verify the live CORS proxy can fetch a known DirkJan comic before deployment.

Run this matrix before each major release and at least quarterly:

| Date | Release/commit | Device | OS | Browser/PWA version | Install/update | Orientation/swipe | Share | Offline | Persistence | Result/notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD |  | Android phone |  | Chrome |  |  |  |  |  |  |
| YYYY-MM-DD |  | iPhone |  | Safari |  |  |  |  |  |  |

Retain completed rows in the release pull request or release notes. Do not mark real-device validation complete from emulator results.
