import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../serviceworker.js', import.meta.url), 'utf8');

test('service worker version and caches use the same deploy version', () => {
  const version = source.match(/const CACHE_VERSION = '([^']+)'/)?.[1];
  assert.match(version, /^v\d+$/);
  assert.match(source, /const CACHE_NAME = `dirkjan-cache-\$\{CACHE_VERSION\}`/);
  assert.match(source, /const RUNTIME_CACHE = `dirkjan-runtime-\$\{CACHE_VERSION\}`/);
  assert.match(source, /const IMAGE_CACHE = `dirkjan-images-\$\{CACHE_VERSION\}`/);
});

test('install precache covers the DirkJan app shell', () => {
  for (const asset of ['index.html', 'offline.html', 'main.css', 'storage.js', 'telemetry.js', 'date-utils.js', 'comic-loader.js', 'toolbar.js', 'animation-utils.js', 'app.js', 'manifest.webmanifest', 'dirk-jan-tekst.svg']) {
    assert.ok(source.includes(`'./${asset}'`), `${asset} should be precached`);
  }
  assert.match(source, /cache\.addAll\(PRECACHE_ASSETS\)/);
  const installBlock = source.match(/self\.addEventListener\('install'[\s\S]*?\n\}\);/)?.[0] || '';
  assert.doesNotMatch(installBlock, /self\.skipWaiting\(\)/);
  assert.doesNotMatch(installBlock, /\.catch\(/);
});

test('activation removes stale caches while preserving the current cache set', () => {
  assert.match(source, /cache !== CACHE_NAME && cache !== RUNTIME_CACHE && cache !== IMAGE_CACHE/);
  assert.match(source, /caches\.delete\(cache\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
});

test('third-party analytics requests are bypassed and asset failures keep an error status', () => {
  assert.match(source, /static\.cloudflareinsights\.com|cloudflareinsights\.com/);
  assert.doesNotMatch(source, /return new Response\('', \{\s*status: 200/);
  assert.match(source, /new Response\('Asset unavailable', \{\s*status: 503/);
});

test('offline and cache limits are covered by service worker strategies', () => {
  assert.match(source, /const MAX_IMAGE_CACHE_SIZE = 50/);
  assert.match(source, /const MAX_IMAGE_CACHE_BYTES = 20 \* 1024 \* 1024/);
  assert.match(source, /const MAX_CACHEABLE_IMAGE_BYTES = 5 \* 1024 \* 1024/);
  assert.match(source, /const MAX_RUNTIME_CACHE_SIZE = 30/);
  assert.match(source, /responseSize === null \|\| responseSize > MAX_CACHEABLE_IMAGE_BYTES/);
  assert.match(source, /enforceImageCacheLimits\(cache, maxSize, MAX_IMAGE_CACHE_BYTES\)/);
  assert.match(source, /entries\.length > maxEntries \|\| totalBytes > maxBytes/);
  assert.match(source, /networkFirstStrategy\(request, CACHE_NAME, '\.\/offline\.html'\)/);
  assert.match(source, /const fallbackResponse = await caches\.match\(fallbackUrl\)/);
  assert.match(source, /Image not available offline/);
});

test('navigations use bounded network-first loading with an offline fallback', () => {
  assert.match(source, /request\.mode === 'navigate' \|\| destination === 'document'/);
  assert.match(source, /networkFirstStrategy\(request, CACHE_NAME, '\.\/offline\.html'\)/);
  assert.match(source, /const NETWORK_TIMEOUT_MS = 15000/);
  assert.match(source, /function fetchWithTimeout\(request\)/);
  assert.match(source, /networkFirstStrategy\(request, RUNTIME_CACHE, null, MAX_RUNTIME_CACHE_SIZE\)/);
  assert.match(source, /function enforceCacheLimit\(cache, maxSize\)/);
});

test('update flow supports skip waiting and version messages', () => {
  assert.match(source, /event\.data\.type === 'SKIP_WAITING'/);
  assert.match(source, /event\.data\.type === 'GET_VERSION'/);
  assert.match(source, /self\.skipWaiting\(\)/);
  assert.doesNotMatch(source, /\.then\(\(\) => self\.skipWaiting\(\)\)/);
});
