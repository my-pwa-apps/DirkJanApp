import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../proxy-worker/src/index.js', import.meta.url), 'utf8');
const wranglerConfig = await readFile(new URL('../../proxy-worker/wrangler.toml', import.meta.url), 'utf8');

test('proxy bounds upstream requests and validates every redirect', () => {
  assert.match(source, /const UPSTREAM_TIMEOUT_MS = 15000/);
  assert.match(source, /const MAX_REDIRECTS = 3/);
  assert.match(source, /redirect: 'manual'/);
  assert.match(source, /AbortSignal\.any\(\[\s*request\.signal,\s*AbortSignal\.timeout\(UPSTREAM_TIMEOUT_MS\)\s*\]\)/);
  assert.match(source, /!isAllowedHost\(redirectUrl\.hostname, allowedHosts\)/);
});

test('proxy avoids caching unknown or oversized response bodies', () => {
  assert.match(source, /const MAX_CACHEABLE_RESPONSE_BYTES = 25 \* 1024 \* 1024/);
  assert.match(source, /contentLength > MAX_CACHEABLE_RESPONSE_BYTES/);
  assert.match(source, /contentLength !== null && !bypassCache/);
  assert.match(source, /'400-599': -1/);
});

test('worker configuration enables current compatibility and sampled observability', () => {
  assert.match(wranglerConfig, /compatibility_date = "2026-08-20"/);
  assert.match(wranglerConfig, /compatibility_flags = \["enable_request_signal"\]/);
  assert.match(wranglerConfig, /\[observability\.logs\][\s\S]*head_sampling_rate = 1/);
  assert.match(wranglerConfig, /\[observability\.traces\][\s\S]*head_sampling_rate = 0\.01/);
});

test('worker configuration preserves DirkJan and shared proxy source hosts', () => {
  const allowedHosts = wranglerConfig.match(/ALLOWED_HOSTS = "([^"]+)"/)?.[1].split(',') || [];
  for (const hostname of [
    'dirkjan.nl',
    'www.dirkjan.nl',
    'gocomics.com',
    '*.gocomics.com',
    'assets.amuniversal.com',
    'www.arcamax.com',
    'garfield.fandom.com'
  ]) {
    assert.ok(allowedHosts.includes(hostname), `${hostname} should remain allowed`);
  }
});

test('proxy grants browser CORS only to configured application origins', () => {
  assert.match(wranglerConfig, /ALLOWED_ORIGINS = "https:\/\/dirkjanapp\.pages\.dev,[^"]+"/);
  assert.match(source, /const allowedOrigins = getAllowedOrigins\(env\)/);
  assert.match(source, /origin && allowedOrigins\.has\(origin\)/);
  assert.doesNotMatch(source, /let requestAllowedOrigins/);
  assert.match(source, /else if \(!origin\)/);
});

test('browser telemetry is origin-restricted, bounded, and schema allowlisted', () => {
  assert.match(source, /const MAX_TELEMETRY_BYTES = 1024/);
  assert.match(source, /requestUrl\.pathname === '\/-\/telemetry'/);
  assert.match(source, /!origin \|\| !allowedOrigins\.has\(origin\)/);
  assert.match(source, /Object\.keys\(payload\)\.length === 3/);
  assert.match(source, /TELEMETRY_EVENTS\.has\(payload\?\.event\)/);
});

test('comic metadata has a cacheable trusted-image route', () => {
  assert.match(source, /requestUrl\.pathname === '\/-\/comic-metadata'/);
  assert.match(source, /extractTrustedComicImageUrl\(html\)/);
  assert.match(source, /metadata\.headers\.set\('cache-control'/);
  assert.match(source, /ctx\.waitUntil\(cache\.put\(cacheKey, metadata\.clone\(\)\)\)/);
});

test('proxy applies a per-IP request budget before upstream work', () => {
  assert.match(source, /const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 120/);
  assert.match(source, /if \(isRateLimited\(request, env\)\)/);
  assert.match(source, /jsonResponse\(\{ error: 'Too many requests' \}, 429\)/);
});
