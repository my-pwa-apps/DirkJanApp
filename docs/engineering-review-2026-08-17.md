# Engineering Review - 2026-08-17

## Executive Summary

Daily DirkJan Comics is a focused, functional static Progressive Web App with a stronger test foundation than its no-build architecture initially suggests. It successfully supports the central product loop: load a comic, navigate dates, discover random strips, save favorites, and use the experience on mobile or offline. Mocked browser tests, accessibility scans, cross-engine smoke coverage, a versioned service worker, and an allowlisted private proxy are meaningful production strengths.

The principal long-term risk is concentration. A 132 KB global browser script owns networking, persistence, navigation, animations, sharing, orientation, settings, and lifecycle behavior. Several high-value mobile paths remain untested, operational client telemetry is absent, and the observed comic LCP is poor. Before this review, the repository also lacked CI, operational documentation, deployment security headers, bounded navigation freshness, and complete upstream redirect controls.

This pass fixed the highest-confidence production defects without rewriting the application. It added network-first navigation with offline fallback, truthful service-worker failures, bounded caches, real cancellation propagation, trusted image-origin validation, startup fallback, early accessible image state, Worker timeout/redirect/size controls, structured Worker failure logs, sampled traces, CI, security headers, and an operational README. All syntax checks, 23 unit contracts, 41 default browser tests, and four cross-browser smoke tests pass.

No unresolved critical defect was found after remediation. Eight high-priority risks remain, led by modularity, LCP, storage reliability, mobile interaction coverage, CSP hardening, proxy abuse controls, client observability, and release automation.

## Project Understanding

**Software type:** Static web application and installable PWA, supported by a Cloudflare CORS proxy Worker.

**Languages and runtime:** Vanilla JavaScript, HTML, and CSS in browsers and service workers; JavaScript in the Cloudflare Workers runtime; Node.js for tests and local tooling.

**Frameworks:** No application framework or bundler. Playwright, Axe, Node test runner, and Lighthouse provide quality tooling.

**Architecture:** A static HTML shell loads one global application script and stylesheet. Browser state is held in globals and persisted in localStorage. Comic HTML is retrieved through a prioritized CORS proxy chain and parsed client-side. A service worker provides app-shell, runtime, and image caches. Cloudflare Pages hosts static files; a separately deployed Worker proxies allowlisted dirkjan.nl requests.

**Intended users and domain:** Dutch readers of Mark Retera's DirkJan comics, especially mobile/PWA users who want quick daily access, archive navigation, favorites, sharing, and offline shell access.

**Primary workflow:** Open app, load today's/latest/last comic, move through archive or random selections, optionally favorite/share it, and continue in portrait or landscape.

**Maturity:** Functional production hobby/small-product software with established regression testing, but without the modularity, observability, release controls, and performance discipline expected from a long-lived team-owned product.

**Assumptions:** Cloudflare Pages deploys `main`; the private Worker remains under the maintainer's control; comic HTML and images may change without notice; there is no account system or server-side user data; legal permission to present upstream comics is outside the repository and was not verified.

## Product Review

The implementation meets the core reader objective and offers useful secondary workflows: favorites, date selection, shuffle, sharing, theme choice, startup mode, swipe, orientation viewing, and install/offline support. The product is strongest when the upstream site and private proxy are healthy.

Weaknesses are concentrated in degraded states and discoverability. Proxy exhaustion, missing-date retry exhaustion, and storage denial do not always provide clear recovery. Several controls rely on icon/title/keyboard behavior rather than an explicit coherent interaction model. Terminology mixes "strip", "comic", and "Random". The app also does not clearly establish its unofficial status in the first-use UI.

Better product defaults are to load the newest verified publication quickly, make loading/failure/retry states explicit, keep settings out of the reading flow until requested, preserve a privacy-respecting first-party request path, and explain only state that requires action. A marketing-style onboarding screen is not warranted; the comic should remain the first screen.

## Engineering Principles

| Principle | Good | Weak | Improvement |
| --- | --- | --- | --- |
| Correct | Date clamping, missing-publication handling, and proxy fallback have browser coverage. | Global state and recursive recovery make edge behavior difficult to prove. | Extract pure state transitions and test inputs/outputs. |
| Reliable | Offline shell, multiple proxies, timeouts, update flow, and cache limits exist. | Public fallbacks, silent storage failures, and weak terminal error UI remain. | Centralize storage, use controlled failover, and expose recovery states. |
| Maintainable | CONFIG and section boundaries create local consistency. | app.js is a large coupled global module. | Extract date, network, storage, and UI modules incrementally. |
| Readable | Naming and JSDoc are generally descriptive. | Long functions mix state changes, DOM writes, fetches, and animation. | Keep orchestration thin and move details behind focused functions. |
| Simple | No build pipeline or framework complexity. | Simplicity at deployment has shifted complexity into one runtime file. | Add modules without introducing a framework unless product needs justify it. |
| Modular | Proxy Worker and service worker are separate deployable concerns. | Browser features are not modular or importable. | Establish explicit boundaries and dependency direction. |
| Reusable | CONFIG, UTILS, drag behavior, and proxy scoring are reused. | Useful logic is coupled to DOM IDs and globals. | Make pure helpers parameterized and independently testable. |
| Secure | Target hosts/protocols, redirects, response sizes, CSP baseline, and security headers are controlled. | Inline handlers weaken CSP; proxy CORS is open to all origins. | Remove inline script and apply ingress abuse controls. |
| Performant | Static shell is small in request count and cache strategies are bounded by entries. | Recorded LCP is about 6.6 seconds; comic loading has two serial upstream fetches. | Add first-party comic metadata/image discovery and enforce LCP budgets. |
| Scalable | Static hosting and edge proxy scale horizontally for current demand. | Public proxy abuse and client-side scraping create avoidable load and coupling. | Rate-limit ingress and centralize stable comic metadata at the edge. |
| Observable | Worker observability is enabled with logs and sampled traces. | Browser failures and user-visible load SLOs are not monitored. | Add privacy-preserving client failure metrics and alerts. |
| Testable | Unit contracts, mocked E2E, accessibility, offline, production, and cross-browser tests exist. | Many unit tests inspect source strings; major gesture/orientation paths are absent. | Prefer runtime behavior tests and cover mobile state machines. |
| Accessible | Semantic controls, live region, hidden heading, skip link, and Axe checks exist. | Settings/fullscreen focus transitions and complex gesture alternatives need proof. | Add focus lifecycle and keyboard-equivalent tests. |
| Consistent | CONFIG and storage keys are centralized; responsive styling is cohesive. | User terminology and storage error behavior vary. | Adopt copy and persistence conventions. |
| Robust | Date holes, corrupt favorites, stale dates, proxy failures, and offline navigation are considered. | Storage denial, partial service-worker install, and repeated upstream failure are under-specified. | Model degraded states explicitly and test them. |
| Documented | README now covers architecture, setup, testing, deployment, data, and privacy. | Decision records, SLOs, support policy, and release ownership are absent. | Add short ADRs and operational targets as complexity grows. |
| Easy to extend | New settings can follow an established pattern. | Each feature touches global state, HTML handlers, and the monolith. | Introduce feature controllers and event-based boundaries. |
| Easy to debug | Mock helpers reproduce many upstream states. | Production browser errors were mostly silent. | Add structured error taxonomy and sampled telemetry. |
| Easy to deploy | Static Pages deployment is simple and CI now validates main. | Worker/Pages ordering and cache versioning remain manual. | Automate version checks and release ordering. |
| Easy to operate | Live Worker health and production smoke scripts exist. | No stated SLO, alert, rollback, or incident procedure. | Define comic-load availability/latency targets and a rollback runbook. |

## Architecture Review

The current architecture is proportionate for an early static reader, but not for three more years of feature growth. A senior team would retain static delivery and probably vanilla browser APIs, while separating domain logic from DOM and network concerns. A complete rewrite or framework migration is not justified: it would increase regression risk without directly improving the product.

Recommended migration path:

1. Extract pure publication-date and navigation functions into an ES module with behavior tests.
2. Introduce a storage adapter and a comic repository interface over the proxy chain.
3. Move UI state transitions into small controllers for viewer, settings, and fullscreen.
4. Replace inline handlers with module event binding and tighten CSP.
5. Consider a first-party Worker metadata endpoint only after measuring LCP and upstream volatility.

Tradeoff: native modules add more files and require deliberate service-worker precaching, but remove global coupling without adding a framework or build step. A framework becomes reasonable only if the UI evolves into multiple routed views or complex synchronized components.

## Code Review

### Important Files

- `app.js`: Broad feature coverage and centralized constants, but excessive global state, long mixed-responsibility functions, direct storage calls, and under-tested orientation/gesture code.
- `serviceworker.js`: Clear three-cache design. This review corrected stale navigation, fake-success asset failures, unbounded runtime cache use, floating cache writes, and missing network bounds. Partial install diagnostics and byte-aware image limits remain.
- `proxy-worker/src/index.js`: Host/protocol allowlisting and streaming were sound foundations. This review added one timeout budget, manual redirect validation, status-aware edge caching, declared size limits, and structured errors. Origin abuse controls and runtime tests remain.
- `index.html`: Strong semantic baseline and direct first-screen utility. Inline handlers constrain CSP; settings focus semantics and mixed terminology need refinement.
- `main.css`: Responsive and feature-complete, but tightly tied to global state classes and difficult to reason about alongside complex fullscreen behavior. Visual regression coverage is limited.
- `manifest.webmanifest`: Complete install metadata and screenshots. Icon entries are duplicated and maskable assets are not clearly purpose-built.
- `offline.html`: Functional fallback; language metadata was corrected. Inline behavior/style should eventually move under the main CSP model.
- `package.json` and Playwright configs: Useful scripts and broad local coverage. CI now runs deterministic syntax/unit/Chromium checks; live, Lighthouse, and full cross-browser checks remain deliberate predeploy tasks.
- Tests: Good mocked product coverage and accessibility automation. Source-regex contracts should gradually become behavior tests; rotation, gestures, sharing, update, theme, shuffle, and import/export need coverage.
- README: Replaced during this review because the previous content was a personal profile rather than project documentation.

### Before and After Examples

**Navigation caching**

Before: documents shared cache-first behavior with CSS and JavaScript, allowing stale HTML to mask deployments indefinitely.

After: navigation is network-first with a 15-second bound, cached-document fallback, then the offline shell; static assets remain cache-first.

**Comic cancellation**

Before: navigation aborted a local controller but the signal never reached proxy fetches, so work and body reads continued.

After: the controller is combined with the request timeout and passed through every proxy attempt, preventing fallback after user cancellation and aborting body consumption.

**Worker redirects**

Before: the initial target was allowlisted but `redirect: follow` could leave that allowlist.

After: redirects are manual, limited to three, and every destination is revalidated for protocol and host under one timeout budget.

## Performance Optimizations

Highest value is removing serial discovery from first comic render. A private edge endpoint can fetch/parse/cache upstream publication metadata once and return the selected image URL, reducing browser round trips and third-party variance. This is medium-to-large effort with potentially high LCP impact.

Second, measure whether adjacent preloading competes with the selected image on constrained connections. Defer speculative loads until the primary image is complete and use connection/save-data signals. Third, introduce byte-aware image cache limits. Fourth, remove unused duplicate screenshots and verify SVG optimization. Preconnect should be added only to the private proxy after measurement because it creates a connection before explicit use.

## Security Improvements

Completed: baseline CSP, clickjacking protection, MIME sniffing protection, referrer and permissions policies, trusted image-origin validation, Worker redirect allowlisting, timeout, declared response-size rejection, and status-aware edge caching.

Remaining: remove inline script to eliminate CSP `unsafe-inline`; restrict CORS to approved app origins; add rate/WAF controls; runtime-test redirect and cache behavior; harden local test-server containment; document dependency vulnerability policy. Authentication, authorization, CSRF, SQL injection, and secrets are not applicable to the current stateless product because it has no accounts, database, mutations, or credentials in source.

## Reliability Review

The main single points of failure are the upstream publication site and private proxy. Public proxies add availability but reduce control and privacy. Browser error paths need visible recovery and telemetry. The service worker now avoids stale-document lock-in and returns truthful failures, while the Worker now has bounded upstream work and searchable errors.

Define an SLO around successful selected-comic display and latency, not merely shell availability. Monitor private Worker 5xx/504 rate, parse failures, and live health. Keep a rollback path for both Worker and Pages releases. Avoid retries that amplify upstream incidents; the existing sequential fallback is preferable to racing every provider.

## Test Review

Evidence after changes:

- Syntax checks: passed.
- Unit/source/deployment contracts: 23 passed.
- Default Playwright matrix: 41 passed, one intentionally skipped mobile duplicate of the desktop Chromium service-worker lifecycle.
- Cross-browser smoke: Chromium, Firefox, WebKit, and mobile Safari emulation all passed.

Strengths are deterministic upstream mocks, date-edge coverage, proxy fallback, corrupt-storage recovery, offline lifecycle, accessibility scans, mobile overlap checks, production smoke, and multi-engine smoke. Missing coverage is tracked in the backlog: orientation/fullscreen, swipe behavior, focus transitions, theme, shuffle, import/export, sharing, update flow, storage denial, Worker runtime behavior, and service-worker install failure.

## Maintainability Review

Repository organization is understandable, scripts are useful, generated reports are ignored, and lockfile installation is reproducible. CI and README materially improve onboarding. The next-year maintenance hotspots are app.js, manual cache versions, source-regex tests, duplicated image assets, and cross-deployment coordination.

Preventative actions are to modularize incrementally, require CI on main, automate dependency updates and cache-version checks, retain short architectural decisions, and avoid adding new global state. Do not add a framework solely to address file size; establish boundaries first.

## Biggest Strengths

1. The core reading workflow is focused and complete.
2. Mocked end-to-end coverage exercises meaningful publication and proxy edge cases.
3. Accessibility and PWA support are treated as product behavior rather than metadata only.
4. Static delivery has low operational complexity and no server-side user data exposure.
5. The private Worker starts from a narrow target-host allowlist and streams bodies.

## Critical Issues

No unresolved critical issue remains after this pass. The stale navigation cache and unrestricted redirect-following behavior were the most urgent defects and were corrected.

## High Priority Improvements

Modularize the browser application, reduce LCP, centralize storage reliability, test rotation/swipe, remove inline handlers, protect proxy ingress, add browser telemetry, and automate cache/release controls.

## Medium Priority Improvements

Add Worker runtime tests, complete feature workflow coverage, design visible failure/retry states, fix focus across fullscreen, reduce public proxy dependence, enforce byte cache limits, diagnose service-worker install failure, clean assets, automate dependencies, and harden the local server.

## Low Priority Improvements

Evaluate Workers Static Assets, clarify unofficial identity, standardize Dutch terminology, measure private-proxy preconnect, replace regex contracts over time, and establish real-device release checks.

## Cleanup Opportunities

Remove unreferenced root screenshots after confirming no external use, simplify duplicated manifest icon entries, generate purpose-built maskable icons, and move offline inline styles/behavior into shared assets as CSP is tightened.

## Refactor Opportunities

Extract publication calendar logic first, followed by storage, comic repository, viewer state, and fullscreen controller. Convert implicit global mutations into explicit state transitions. Keep each refactor behavior-preserving and gated by the existing browser suite.

## UX Improvements

Make comic loading and terminal failure explicit, provide retry/latest actions, close settings before fullscreen, restore trigger focus, normalize Dutch terms, and clarify unofficial status without adding an onboarding barrier.

## Documentation Improvements

The new README covers immediate setup and operation. Future documentation should add SLOs, Worker/Pages release ordering, rollback, supported browser/device policy, privacy decisions for fallback proxies, and short ADRs for hosting and modularization.

## Technical Debt Summary

Debt is moderate and concentrated rather than pervasive. The primary debt principal is the global browser monolith; interest appears as weak unit seams, repeated storage behavior, difficult mobile testing, and CSP constraints. Operational debt is manual version/release handling and missing browser telemetry. Asset and terminology cleanup are lower-cost secondary debt.

## Future Risks

- Upstream HTML changes can break client extraction without a product-owned API contract.
- Public proxy policy or availability can change independently.
- More features in app.js will increase regression cost nonlinearly.
- Poor LCP can worsen as upstream latency or comic image size grows.
- Browser PWA/orientation APIs will continue to vary across real devices.
- Manual cache and cross-service deployments can create stale or incompatible releases.
- Unclear rights/product identity can become a business risk as usage grows.

## Top 10 Highest Value Improvements

1. Reduce initial comic LCP with measured edge-assisted metadata/image discovery.
2. Extract date/navigation domain logic and establish module boundaries.
3. Centralize storage with quota/denial behavior and user feedback.
4. Add rotation, fullscreen, and swipe browser tests.
5. Remove inline handlers and enforce a strict CSP.
6. Restrict and rate-limit proxy ingress.
7. Add privacy-preserving browser failure telemetry and comic-load SLOs.
8. Automate cache version checks and Worker/Pages release ordering.
9. Replace public proxy dependence with controlled failover.
10. Add runtime-level Worker and service-worker failure tests.

## Backlog Summary

- Critical: 0
- High: 8
- Medium: 10
- Low: 6
- Items added: 24

The complete actionable backlog is in `BACKLOG.md`. Findings remediated in this review are documented here rather than left as unresolved backlog work.

## Overall Engineering Score

| Area | Score | What prevents 8 or higher |
| --- | ---: | --- |
| Architecture | 5.5/10 | Browser concerns are coupled through global state and large orchestration functions; deployment spans two manually coordinated surfaces. |
| Code Quality | 6.5/10 | Generally clear naming/configuration, but long mixed-responsibility functions, direct persistence, and source-string contracts limit confidence. |
| Maintainability | 5.5/10 | The monolith and manual release conventions make changes expensive despite strong section organization. |
| Performance | 5/10 | Recorded LCP is about 6.6 seconds and the primary content requires serial proxy HTML and image requests. |
| Security | 7/10 | Baseline headers and proxy boundaries are now solid; inline script, open proxy CORS, and absent abuse controls remain. |
| Reliability | 7/10 | Offline/fallback/timeout behavior is substantial; user-visible degraded states, controlled failover, and client monitoring remain weak. |
| Testing | 7/10 | Broad E2E and cross-browser foundations exist; major mobile interactions and runtime Worker semantics are still untested. |
| Documentation | 7/10 | Setup and deployment are now documented; SLO, rollback, release ownership, legal status, and architectural decisions are not. |
| Developer Experience | 7/10 | Reproducible scripts, lockfile, CI, and README exist; modular test seams, dependency automation, and release automation remain. |
| User Experience | 7/10 | The core reader is direct and feature-rich; degraded states, focus transitions, terminology, and initial content latency hold it back. |
| Scalability | 7/10 | Static/edge delivery scales well, but proxy abuse, upstream scraping, and public fallback dependence constrain operational scale. |
| Overall Product Quality | 6.5/10 | The product is useful and well-tested for its size, but performance, modularity, observability, and mobile interaction assurance are below a durable production standard. |