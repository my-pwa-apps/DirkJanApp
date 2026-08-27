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

## Hosting Decision

Cloudflare Pages remains appropriate while the app is static and the proxy deploys independently. Workers Static Assets would provide atomic static/API deployment and service bindings, but adds migration and rollback complexity. Reassess when atomic deployment materially reduces incidents or the app gains server-rendered/API features.