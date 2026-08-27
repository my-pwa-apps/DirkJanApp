# Daily DirkJan Comics

An unofficial Dutch Progressive Web App for reading DirkJan comics published on [dirkjan.nl](https://dirkjan.nl). The app supports archive navigation, random and shuffle browsing, favorites, sharing, swipe gestures, dark mode, landscape viewing, and offline app-shell access.

The comic artwork remains the property of Mark Retera and dirkjan.nl. This repository contains only the reader application and retrieves comic pages at runtime.

## Architecture

- `index.html` provides the static, semantic application shell, including the hidden landscape fullscreen template.
- `app.js` owns browser state, navigation, persistence, proxy fallback, and UI behavior.
- `comic-loader.js`, `toolbar.js`, and `animation-utils.js` extract comic fetching/blob cache, dragging, and slide/morph transitions as IIFE modules.
- `main.css` contains the responsive light/dark presentation.
- `serviceworker.js` provides versioned app-shell, runtime, and image caches.
- `proxy-worker/` contains the allowlisted Cloudflare Worker used to retrieve dirkjan.nl pages with CORS headers.
- `tests/unit/` contains source and deployment contracts.
- `tests/e2e/` contains mocked browser workflows, accessibility checks, PWA coverage, and production smoke tests.

There is no application build step. Cloudflare Pages serves the repository as static assets, while the proxy Worker is deployed separately.

## Requirements

- Node.js 22.19 or newer
- npm
- Playwright browser binaries for end-to-end tests

## Local Development

```powershell
npm ci
npx playwright install chromium
npm run serve
```

`npm run test:assets` verifies that every manifest, precache, HTML, and tile image reference exists and that root images are not orphaned.

Open `http://127.0.0.1:8000`. The application can also be started automatically by Playwright on port `8010`.

## Validation

```powershell
npm run test:syntax
npm run test:assets
npm run test:unit
npm run test:e2e
npm run test:cross-browser
npm run test:pwa
```

`npm test` runs unit tests and the default Chromium/Pixel browser matrix. `npm run test:predeploy` additionally runs Lighthouse, cross-browser coverage, and the live proxy health check; it requires network access and is intentionally broader than CI.

## Deployment

Cloudflare Pages deploys pushes to `main`. The repository-level `_headers` file defines browser security policy and cache behavior. The proxy Worker is configured in `proxy-worker/wrangler.toml` and deployed from that directory.

Every deploy that changes served application files must increment `CACHE_VERSION` in `serviceworker.js`. The version creates fresh cache namespaces and activates the in-app update flow.

Before deployment:

1. Run `npm run test:predeploy`.
2. Complete `tests/usability-checklist.md` on a mobile browser.
3. Confirm the service-worker cache version changed.
4. Confirm the live Worker health check passes.

Worker-before-Pages ordering, rollback steps, service objectives, and Cloudflare abuse-control thresholds are documented in [docs/operations.md](docs/operations.md).

## Data and Privacy

Favorites, display preferences, positions, and the last-read date are stored only in the browser's `localStorage`. Comic requests pass through the configured CORS proxy chain. Cloudflare Web Analytics is loaded by the production page.

## Support

Report application issues through the repository issue tracker. Questions about the comics or their publication belong with [dirkjan.nl](https://dirkjan.nl).