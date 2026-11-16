# Operations

## Service Objectives

- Comic display success: at least 99.5% over 30 days, excluding confirmed upstream outages.
- Private proxy 5xx/504 rate: alert when above 2% for 10 minutes.
- Browser terminal load failures: alert when above 3% for 15 minutes after telemetry is provisioned.
- Mobile lab LCP target: below 2.5 seconds at p75 on the agreed profile.

CI currently enforces a 5-second LCP regression ceiling. Tighten it to 2.5 seconds only after the metadata Worker route is deployed and a fresh lab run demonstrates the target consistently.

## Release Order

1. Run `npm run test:predeploy`.
2. Deploy `proxy-worker/` first when its contract changes.
3. Run `npm run test:workers` against the deployed Worker.
4. Deploy Cloudflare Pages only after Worker health passes.
5. Verify the production smoke test and service-worker update prompt.

Pages must not deploy browser code that depends on an unavailable Worker contract. Configure the repository's `Quality` workflow as a required status check for `main` in GitHub branch protection.

## Rollback

1. Roll back Pages to its previous successful deployment.
2. Roll back the Worker only after the restored Pages version no longer depends on the newer Worker contract.
3. Increment `CACHE_VERSION` in the rollback commit so installed clients receive the restored shell.
4. Run production smoke and live Worker health checks.

## Proxy Abuse Controls

The Worker grants browser CORS only to configured `ALLOWED_ORIGINS`. Originless health checks remain supported.

The Worker also applies an in-process per-IP budget (default 120 requests per minute, overridable with `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`). This is a backstop, not a substitute for edge WAF rules: isolate counts reset on deploy and are not shared across Worker instances.

Configure a Cloudflare rate-limiting rule for the Worker hostname:

- Match proxy GET/HEAD requests.
- Block or managed-challenge clients exceeding 120 requests per minute per IP for 10 minutes.
- Exclude verified bots and the documented health-check user agent only when necessary.
- Alert on sustained blocks above 100 per five minutes or Worker 429 responses above 1%.

These dashboard rules require Cloudflare account access and cannot be activated from this repository alone.

## Privacy

Production comic traffic uses only the controlled first-party Worker. Browser telemetry must contain only an allowlisted event name and coarse error code; dates, URLs, favorites, free text, IP-derived identifiers, and persistent IDs are prohibited.

## Upstream Throttling

The comic origin can return nginx HTTP 429 responses during browsing bursts. The metadata route preserves that status and exposes `Retry-After` through CORS. Neither HTTP service errors nor throttling trigger duplicate HTML requests or a backward discovery scan.

### Shared edge caching

- The HTML and metadata routes reuse the same public comic-page cache. Metadata keys include only the date, so query ordering and extra parameters do not fragment it.
- Successful dated pages and metadata are cached for 10 minutes, or 24 hours when the comic date is more than seven days old. Public image responses are cached for 24 hours.
- Missing metadata is cached for only 60 seconds, including WordPress `error404` pages returned as HTTP 200. Malformed pages and non-image error bodies are not put in long-lived comic caches.
- Comic bodies are bounded to 25 MiB, including responses without `Content-Length`. Cookie-bearing, private, `no-store`, and differently negotiated responses are not shared. Upstream comic subrequests bypass the implicit fetch cache; only validated responses enter the explicit cache.
- Browser `no-cache`/`no-store` request headers do not force public comic cache misses. Other shared-proxy hosts retain their previous cache behavior.

After an upstream 429, the Worker stores an internal cooldown marker for at least 60 seconds, or longer when `Retry-After` requires it. Other uncached DirkJan requests at that edge receive HTTP 429 with the remaining wait instead of contacting the origin. Cached comics remain available. The HTTP 429 itself is `no-store`; the marker is separate from comic content.

Cloudflare's Cache API is data-center-local and evictable. This is best-effort shared caching/cooldown protection, not global coordination or a distributed lock: simultaneous cold misses can still reach the origin. No Durable Object or other new Cloudflare resource is required.

### Browser request budget

The loader coalesces identical in-flight requests within a tab, including their body reads. Each consumer receives an independent response; cancelling one navigation does not cancel other consumers. Successful metadata is reused for 10 minutes and missing metadata for 60 seconds in a bounded in-memory cache.

Cooldown expiry is persisted through the storage adapter, so other tabs and reloads respect it. An HTTP 429 without usable `Retry-After` starts a 60-second cooldown; numeric and HTTP-date values are honored. Cached metadata remains usable. Short server-requested waits can still recover automatically: retries are bounded to two, with 1.5-second exponential backoff and a five-second maximum wait. Longer waits show the recovery controls without retrying early.

Automatic adjacent-comic preloads have been removed. Background latest discovery probes only the newest candidate; a full backward search happens only for explicit latest navigation or latest startup mode. Failed network/service requests stop discovery rather than probing additional dates. A successful latest-mode startup therefore needs one metadata request and one image request, with no speculative image requests.

## Hosting Decision

Cloudflare Pages remains appropriate while the app is static and the proxy deploys independently. Workers Static Assets would provide atomic static/API deployment and service bindings, but adds migration and rollback complexity. Reassess when atomic deployment materially reduces incidents or the app gains server-rendered/API features.