# DirkJan Pre-Production Usability Checklist

Run this alongside `npm run test:predeploy` for changes that affect layout, navigation, sharing, settings, or PWA behavior.

- Verify the hidden H1 is not visible above the logo but remains present for screen readers.
- Verify the toolbar is usable on desktop and mobile widths.
- Verify settings open, close, and remain draggable without covering critical comic controls.
- Verify favorite add/remove state persists across refresh.
- Verify swipe navigation still works on a touch device or mobile browser emulator.
- Verify installed/offline PWA behavior after a service worker version bump.
- Verify the live CORS proxy can fetch a known DirkJan comic before deployment.
