# Engineering Backlog

## Review 2026-08-17

- [ ] Split the browser application into cohesive modules

Priority: High

Category: Architecture

Area: Browser application

Affected files: app.js, index.html

Problem: Navigation, persistence, proxy selection, animation, orientation, sharing, and settings are coupled in a 132 KB global script. Large functions such as DisplayComic and Rotate share mutable state and cannot be imported independently.

Impact: Changes have a broad regression surface, code ownership is unclear, and behavior-level unit testing is impractical.

Recommended solution: Incrementally extract pure date/navigation logic, storage, network, and UI controllers into ES modules while keeping the existing HTML entry point stable.

Acceptance criteria: No module exceeds an agreed complexity threshold; shared mutable globals are reduced; extracted logic has behavior-based unit tests; all browser tests remain green.

Estimated effort: Large

Business value: High

Technical debt reduction: High

- [ ] Reduce comic Largest Contentful Paint below 2.5 seconds

Priority: High

Category: Performance

Area: Initial comic loading

Affected files: app.js, index.html, tests/support/lighthouse-audit.cjs, tests/lighthouse-report.json

Problem: The recorded Lighthouse LCP is approximately 6.6 seconds because first render waits on proxy discovery, HTML download and parsing, then a separate image request.

Impact: Mobile users see the app shell quickly but wait too long for the primary content, harming perceived quality and search performance.

Recommended solution: Profile the live dependency chain, expose a cacheable latest-comic metadata endpoint in the private Worker, preload only the selected comic image, and add a realistic LCP budget.

Acceptance criteria: P75 lab LCP is below 2.5 seconds on the agreed mobile profile; no extra speculative comic requests delay the selected image; the budget fails CI on regression.

Estimated effort: Large

Business value: High

Technical debt reduction: Medium

- [x] Centralize resilient browser storage writes

Priority: High

Category: Reliability

Area: User preferences and favorites

Affected files: app.js

Problem: Many localStorage writes are direct and several catches silently ignore quota, privacy-mode, or permission failures.

Impact: Favorites and settings can appear saved and then disappear without explanation; failures are difficult to diagnose.

Recommended solution: Add one storage adapter that validates reads, reports critical write failures once, and distinguishes required user data from best-effort UI position data.

Acceptance criteria: All storage access uses the adapter; quota and denied-storage tests exist; favorite write failures produce a localized non-blocking error; boot remains functional without storage.

Estimated effort: Medium

Business value: High

Technical debt reduction: High

- [x] Cover rotation and swipe state machines with browser tests

Priority: High

Category: Testing

Area: Mobile interaction

Affected files: app.js, main.css, tests/e2e/

Problem: Orientation-driven fullscreen and portrait/fullscreen swipe behavior cover hundreds of lines but have no behavioral regression tests.

Impact: The app's most device-specific workflow can break during unrelated navigation or layout changes.

Recommended solution: Add Playwright tests for landscape entry and exit, rapid swipe cancellation, disabled swipe, toolbar stability, and portrait restoration using emulation plus a small real-device checklist.

Acceptance criteria: Tests cover fullscreen entry/exit, both swipe directions, disabled state, rapid gestures, and settings-open rotation; Chromium and WebKit smoke coverage passes.

Estimated effort: Medium

Business value: High

Technical debt reduction: High

- [x] Remove inline event handlers and tighten Content Security Policy

Priority: High

Category: Security

Area: Browser security boundary

Affected files: index.html, offline.html, app.js, _headers

Problem: Inline onclick/oninput handlers and inline generated markup require script-src 'unsafe-inline', weakening the new CSP.

Impact: A future HTML injection defect would have a larger XSS blast radius than necessary.

Recommended solution: Bind events with addEventListener, move inline styles into main.css, replace string-built actionable markup with DOM construction, and remove 'unsafe-inline' from script-src.

Acceptance criteria: No inline JavaScript handlers remain; script-src omits 'unsafe-inline'; structured data still renders; all interactions and the offline retry work under CSP.

Estimated effort: Medium

Business value: Medium

Technical debt reduction: High

- [ ] Protect the public proxy against cross-site abuse

Priority: High

Category: Security

Area: Cloudflare Worker ingress

Affected files: proxy-worker/src/index.js, proxy-worker/wrangler.toml

Problem: Any browser origin can consume the public proxy and there is no rate or bot-abuse policy, even though target hosts are restricted.

Impact: Third parties can consume Worker capacity, create cost, and degrade comic availability for intended users.

Recommended solution: Define production and local allowed origins, return no CORS grant to unknown browser origins, and add a Cloudflare rate-limiting or WAF rule with monitored thresholds.

Acceptance criteria: Known app origins and local development work; unknown Origin requests receive no CORS access; non-browser health checks remain possible; abuse metrics and an alert threshold are documented.

Estimated effort: Medium

Business value: High

Technical debt reduction: Medium

- [x] Add browser-side operational error telemetry

Priority: High

Category: Reliability

Area: Production diagnostics

Affected files: app.js, index.html

Problem: Most production failures are intentionally silent unless DEBUG_LOGGING is enabled, and no aggregate signal reports proxy exhaustion, comic parse failures, storage failures, or update failures.

Impact: Regressions are discovered through users rather than telemetry and intermittent failures cannot be correlated.

Recommended solution: Define privacy-preserving error events and send sampled counts through an approved first-party endpoint or analytics custom events without dates, favorites, or URLs.

Acceptance criteria: A documented event taxonomy exists; key failure paths emit sampled events; no user content or persistent identifier is sent; alerts cover sustained comic-load failure rate.

Estimated effort: Medium

Business value: High

Technical debt reduction: Medium

- [ ] Automate cache version and release ordering

Priority: High

Category: Developer Experience

Area: Deployment

Affected files: serviceworker.js, .github/workflows/quality.yml, README.md

Problem: CACHE_VERSION is manually incremented and the repository does not prove that proxy changes deploy before browser code depending on them or that Pages waits for quality checks.

Impact: A forgotten version can strand users on stale assets; incorrect deployment order can create temporary incompatibility.

Recommended solution: Add a CI diff check or generated version, make quality checks required for main, and document or automate Worker-before-Pages release ordering.

Acceptance criteria: Served-file changes fail CI without a version change or generate one automatically; main is protected by the quality job; release ordering has an executable or documented rollback path.

Estimated effort: Medium

Business value: High

Technical debt reduction: High

- [x] Add runtime-level tests for the Cloudflare Worker

Priority: Medium

Category: Testing

Area: Proxy Worker

Affected files: proxy-worker/src/index.js, proxy-worker/wrangler.toml, tests/unit/proxy-worker.test.mjs, package.json

Problem: Current Worker tests are source contracts and do not execute Cache API behavior, redirect handling, HEAD requests, CORS, timeouts, or streaming in the Workers runtime.

Impact: Regex checks can pass while runtime semantics are broken.

Recommended solution: Add @cloudflare/vitest-pool-workers tests with mocked upstreams and generated Wrangler types.

Acceptance criteria: Runtime tests cover allowed/blocked hosts, allowed/blocked redirects, timeout 504, oversized 413, cache hit/miss, bypass-cache, OPTIONS, HEAD, and method rejection.

Estimated effort: Medium

Business value: Medium

Technical debt reduction: High

- [x] Expand behavioral coverage for secondary features

Priority: Medium

Category: Testing

Area: Browser workflows

Affected files: app.js, tests/e2e/app.spec.js, tests/e2e/usability.spec.js, tests/e2e/pwa-offline.spec.js

Problem: Keyboard shortcuts, dark mode persistence, shuffle history, favorite import/export, share fallbacks, update prompts, and preload bounds lack end-to-end tests.

Impact: Useful user workflows can regress without blocking deployment.

Recommended solution: Add focused mocked Playwright scenarios and avoid combining unrelated features in a single long test.

Acceptance criteria: Each listed workflow has at least one success case and its most important failure/restore case; tests run deterministically without live network access.

Estimated effort: Medium

Business value: Medium

Technical debt reduction: High

- [x] Provide explicit comic loading, retry, and terminal error states

Priority: Medium

Category: UX

Area: Comic viewer

Affected files: app.js, index.html, main.css

Problem: After proxy exhaustion or ten missing-date retries, the image alt text changes but sighted users receive little actionable status and no dedicated retry command.

Impact: Users can mistake network or publication gaps for a frozen application.

Recommended solution: Model loading, unavailable, offline, and failed states in one status component with retry and return-to-latest actions.

Acceptance criteria: Every terminal load path has visible and announced status; retry does not duplicate in-flight work; controls remain keyboard accessible; mocked failure tests pass.

Estimated effort: Medium

Business value: High

Technical debt reduction: Medium

- [x] Correct focus and settings state across fullscreen transitions

Priority: Medium

Category: Accessibility

Area: Settings and landscape mode

Affected files: app.js, index.html, main.css, tests/e2e/usability.spec.js

Problem: Settings is visually dialog-like but does not consistently move/restore focus, and entering fullscreen while settings is open can leave hidden interactive state.

Impact: Keyboard and assistive-technology users can lose context or reach controls that are no longer visible.

Recommended solution: Treat settings as a non-modal disclosure or a true modal consistently, restore focus to its trigger, and close it before fullscreen entry.

Acceptance criteria: Focus enters and exits predictably; Escape closes settings; hidden controls are not tabbable; fullscreen transition tests include an open settings panel.

Estimated effort: Medium

Business value: Medium

Technical debt reduction: Medium

- [x] Reduce dependence on public CORS fallback services

Priority: Medium

Category: Reliability

Area: Comic network path

Affected files: app.js, README.md

Problem: When the private Worker fails, requests and target URLs are sent through third-party public proxies with independent privacy, availability, and caching policies.

Impact: Reliability becomes unpredictable and users' requested comic dates are disclosed to additional operators.

Recommended solution: Operate a second controlled Worker endpoint or fail transparently after the private Worker, then document the chosen privacy tradeoff.

Acceptance criteria: Production fallback is first-party or explicitly approved; privacy documentation matches behavior; failover health is tested; public proxy removal does not reduce core availability below the target SLO.

Estimated effort: Medium

Business value: Medium

Technical debt reduction: Medium

- [x] Enforce a byte-aware client image cache budget

Priority: Medium

Category: Performance

Area: Service worker storage

Affected files: serviceworker.js, tests/unit/serviceworker.test.mjs

Problem: The image cache is limited to 50 entries but not total bytes, so large comics can consume excessive device storage.

Impact: Mobile browsers may evict the entire origin storage or deny later writes.

Recommended solution: Track declared response sizes or maintain cache metadata, skip abnormally large images, and evict oldest entries until both count and byte budgets are met.

Acceptance criteria: A documented byte ceiling exists; oversized responses are not cached; eviction tests cover count and byte thresholds; offline favorites remain unaffected.

Estimated effort: Medium

Business value: Medium

Technical debt reduction: Medium

- [x] Surface service-worker install and cache failures

Priority: Medium

Category: Reliability

Area: PWA lifecycle

Affected files: serviceworker.js, app.js, tests/e2e/pwa-offline.spec.js

Problem: Precache installation errors are swallowed, so the Worker can activate without a complete offline shell and without telling the app.

Impact: Offline support appears installed but fails later, and diagnostics cannot identify the missing asset.

Recommended solution: Fail installation atomically for required assets or record a structured degraded state that the client can display and report.

Acceptance criteria: Required precache failure prevents an incomplete activation or produces a visible degraded state; the failed asset is logged; an end-to-end test covers the condition.

Estimated effort: Medium

Business value: Medium

Technical debt reduction: Medium

- [x] Remove duplicate and obsolete image artifacts

Priority: Medium

Category: Cleanup

Area: Static assets and manifest

Affected files: Screenshot1.jpg, Screenshot1.webp, Screenshot2.jpg, Screenshot2.png, Screenshot2.webp, screenshots/, manifest.webmanifest

Problem: More than 2 MB of root screenshots duplicate manifest screenshots, and each manifest icon size repeats PNG/WebP entries for both any and maskable purposes without dedicated safe-zone artwork.

Impact: Repository noise obscures intentional assets and maskable icons may crop poorly despite duplicated declarations.

Recommended solution: Verify external references, remove unused root screenshots, retain one optimized screenshot set, and create purpose-built maskable icons or simplify purposes.

Acceptance criteria: Every retained asset has a manifest, HTML, metadata, or documentation reference; installability remains valid; maskable icons pass a safe-zone check; repository size is reduced.

Estimated effort: Small

Business value: Low

Technical debt reduction: Medium

- [x] Automate dependency maintenance and vulnerability review

Priority: Medium

Category: Developer Experience

Area: npm toolchain

Affected files: package.json, package-lock.json, .github/

Problem: Playwright, Axe, and Lighthouse are pinned but there is no automated update or vulnerability-review workflow.

Impact: Browser compatibility and security fixes can lag, while large upgrades become harder.

Recommended solution: Configure Dependabot or Renovate with grouped test-tool updates and require the quality workflow for merges.

Acceptance criteria: Monthly or weekly update PRs are created; lockfile changes are reviewed; npm audit policy and exception handling are documented; browser tests gate upgrades.

Estimated effort: Small

Business value: Medium

Technical debt reduction: Medium

- [x] Harden local static-server path containment

Priority: Medium

Category: Security

Area: Test infrastructure

Affected files: tests/support/static-server.cjs

Problem: Path containment uses a string startsWith check, which can accept a sibling path sharing the repository name prefix on some crafted paths.

Impact: The local test server could disclose a file outside the repository to another local client.

Recommended solution: Validate path.relative(root, filePath) is neither absolute nor starts with '..', and add traversal tests for encoded and platform-specific separators.

Acceptance criteria: Direct, encoded, and sibling-prefix traversal attempts return 403; normal assets continue to load on Windows and Linux.

Estimated effort: Small

Business value: Low

Technical debt reduction: Medium

- [x] Evaluate migration from Pages to Workers Static Assets

Priority: Low

Category: Architecture

Area: Hosting

Affected files: README.md, _headers, serviceworker.js

Problem: Cloudflare recommends Workers Static Assets for new development, while this project remains on Pages with a separately deployed proxy Worker.

Impact: The project may miss newer platform controls and keeps two deployment models, though Pages remains supported.

Recommended solution: Run a time-boxed comparison of cost, custom headers, atomic deployment, rollback, and service-binding options before deciding.

Acceptance criteria: A decision record compares staying on Pages with migration; no migration occurs without measurable operational benefit and a rollback plan.

Estimated effort: Small

Business value: Low

Technical debt reduction: Low

- [x] Clarify unofficial product identity and rights statement in the UI

Priority: Low

Category: Documentation

Area: Product and legal clarity

Affected files: index.html, README.md

Problem: The footer credits the rights holder, but the first-use UI does not clearly state that the reader is unofficial and independent.

Impact: Users may infer endorsement or ownership, creating avoidable trust and brand risk.

Recommended solution: Confirm the desired wording with the maintainer and add a concise non-intrusive statement near the footer or settings information.

Acceptance criteria: The product identity is clear without disrupting reading; rights and source links remain visible; approved wording is documented.

Estimated effort: Small

Business value: Medium

Technical debt reduction: Low

- [x] Standardize Dutch product terminology

Priority: Low

Category: UX

Area: User-facing copy

Affected files: index.html, app.js, offline.html, manifest.webmanifest

Problem: The interface mixes Dutch terms such as strip with English terms such as comic and Random.

Impact: Copy feels inconsistent and can be less clear for the intended Dutch audience.

Recommended solution: Define a small terminology guide and update visible labels, status text, shortcut names, and errors consistently.

Acceptance criteria: User-facing copy uses the approved terms; accessible names match visible meaning; snapshots and selectors are updated without relying on unstable wording.

Estimated effort: Small

Business value: Low

Technical debt reduction: Low

- [x] Evaluate privacy-aware connection warmup

Priority: Low

Category: Performance

Area: Network startup

Affected files: index.html, app.js

Problem: The first private proxy request pays DNS and TLS setup, but preconnect would also contact a third party before the user requests a comic.

Impact: There may be a modest first-load latency opportunity with a privacy tradeoff.

Recommended solution: Measure dns/tcp/tls timing in production and add preconnect only for the first-party proxy if it materially improves LCP and aligns with privacy policy.

Acceptance criteria: A measured before/after result supports the decision; no public fallback is preconnected speculatively; privacy documentation remains accurate.

Estimated effort: Small

Business value: Low

Technical debt reduction: Low

- [ ] Replace source-regex contracts with behavior-based module tests

Priority: Low

Category: Testing

Area: Unit test design

Affected files: tests/unit/app-contracts.test.mjs, tests/unit/serviceworker.test.mjs, tests/unit/proxy-worker.test.mjs

Problem: Many tests assert source strings, making harmless refactors fail while some semantic defects remain undetectable.

Impact: The suite can discourage cleanup and overstate behavioral confidence.

Recommended solution: As code is modularized, import pure functions and execute service-worker/Worker handlers in realistic runtimes; retain regex tests only for deployment invariants.

Acceptance criteria: Core date, extraction, navigation, cache, and proxy policies are tested through inputs and outputs; source contracts are limited to version/configuration requirements.

Estimated effort: Large

Business value: Medium

Technical debt reduction: High

- [ ] Establish periodic real-device mobile validation

Priority: Low

Category: Testing

Area: Mobile release quality

Affected files: tests/usability-checklist.md, README.md

Problem: Pixel and iPhone emulation cannot reproduce all installed-PWA, orientation, safe-area, share-sheet, and storage behaviors.

Impact: Device-specific regressions may reach production despite green automation.

Recommended solution: Define a short quarterly and pre-major-release matrix for current Android Chrome and iOS Safari devices, recording version and results.

Acceptance criteria: The checklist covers installation, update, orientation, swipe, share, offline, dark mode, and persistence; results are retained with release notes.

Estimated effort: Small

Business value: Medium

Technical debt reduction: Low

## Review 2026-08-20

This review revalidated the full repository against the product, architecture, security, reliability, performance, accessibility, testing, and operational criteria from the 2026-08-17 review. Existing unresolved findings remain above and were not duplicated. The service-worker install and local static-server containment items were completed during this review.

- [x] Cancel proxy upstream work when the client disconnects

Priority: Medium

Category: Performance

Area: Cloudflare Worker request lifecycle

Affected files: proxy-worker/src/index.js, proxy-worker/wrangler.toml, tests/unit/proxy-worker.test.mjs

Problem: The proxy bounded upstream requests with a timeout but did not propagate the incoming request signal, so navigation cancellation or a client disconnect could leave upstream fetch and redirect processing running.

Impact: Abandoned requests consumed Worker duration and upstream capacity for up to 15 seconds, increasing cost and avoidable load during rapid navigation or unreliable mobile connections.

Recommended solution: Enable incoming request signals and combine request cancellation with the existing timeout for every upstream attempt.

Acceptance criteria: The Worker enables request signals in its compatibility configuration; every upstream fetch receives a signal composed from request.signal and the 15-second timeout; syntax and focused proxy contracts pass.

Estimated effort: Small

Business value: Medium

Technical debt reduction: Low

- [x] Remove known vulnerabilities from the quality toolchain

Priority: Medium

Category: Security

Area: npm development dependencies

Affected files: package.json, package-lock.json, README.md, .github/workflows/quality.yml

Problem: The Lighthouse 12 dependency tree contained 23 known vulnerabilities, including seven high-severity findings in Puppeteer, WebSocket, archive extraction, and supporting packages. Non-breaking lockfile updates could not remove the vulnerable transitive chain.

Impact: The affected packages were development-only, but they process remote pages and execute in local and CI environments, leaving maintainers and build agents exposed to avoidable risk.

Recommended solution: Upgrade Lighthouse, Playwright, and Axe to current secure releases; raise the Node baseline required by Lighthouse 13; keep automated dependency maintenance as a separate unresolved preventative item.

Acceptance criteria: npm audit reports zero vulnerabilities; package engines, CI, and README require Node 22.19 or newer; syntax, unit, browser, cross-browser, and Lighthouse checks pass on the upgraded toolchain.

Estimated effort: Small

Business value: Medium

Technical debt reduction: Medium

### Review outcome

New unresolved items: 0

Completed items: 4

The remaining highest-value work is unchanged: reduce comic LCP, split the browser monolith incrementally, centralize resilient storage, test mobile interaction state machines, remove inline handlers and tighten CSP, restrict proxy browser origins and add abuse controls, add browser telemetry, and automate cache/release checks.

## Remediation outcome 2026-08-20

The repository-controlled portions of 16 previously unresolved findings are implemented and validated. The full local matrix passes with 45 unit/runtime tests, 32 Chromium tests, 31 mobile Chromium tests plus one expected service-worker skip, 4 cross-browser tests, zero known npm vulnerabilities, and Lighthouse scores of 0.84 performance, 1.00 accessibility, and 0.96 best practices.

Six findings remain open because their full acceptance criteria are not yet evidenced:

- Browser modularization is underway through `storage.js`, `telemetry.js`, and `date-utils.js`, but `app.js` remains above the intended complexity threshold.
- The new cacheable Worker metadata route removes HTML parsing from the browser critical path, but the current pre-deployment Lighthouse run measured 4.2-second LCP. Deploy the Worker first and remeasure before tightening the 5-second regression ceiling to the 2.5-second target.
- Origin restrictions and abuse thresholds are implemented/documented; the Cloudflare WAF/rate-limit rule still requires account-side activation and observation.
- Cache-version CI and release ordering/rollback are implemented/documented; required GitHub branch protection and Pages deployment gating require repository-admin configuration.
- Behavior tests now cover storage, date policy, telemetry, and Worker runtime semantics, but remaining service-worker and browser source contracts still need extraction/runtime conversion.
- The physical Android/iPhone validation matrix is defined but cannot be marked complete until results are recorded from actual devices.