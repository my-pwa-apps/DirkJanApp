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
  for (const asset of ['index.html', 'offline.html', 'main.css', 'app.js', 'manifest.webmanifest', 'dirk-jan-tekst.svg']) {
    assert.ok(source.includes(`'./${asset}'`), `${asset} should be precached`);
  }
  assert.match(source, /cache\.addAll\(PRECACHE_ASSETS\)/);
  assert.match(source, /self\.skipWaiting\(\)/);
});

test('activation removes stale caches while preserving the current cache set', () => {
  assert.match(source, /cache !== CACHE_NAME && cache !== RUNTIME_CACHE && cache !== IMAGE_CACHE/);
  assert.match(source, /caches\.delete\(cache\)/);
  assert.match(source, /self\.clients\.claim\(\)/);
});

test('offline and cache limits are covered by service worker strategies', () => {
  assert.match(source, /const MAX_IMAGE_CACHE_SIZE = 50/);
  assert.match(source, /const MAX_RUNTIME_CACHE_SIZE = 30/);
  assert.match(source, /while \(keys\.length >= maxSize\)/);
  assert.match(source, /return caches\.match\('\.\/offline\.html'\)/);
  assert.match(source, /Image not available offline/);
});

test('update flow supports skip waiting messages', () => {
  assert.match(source, /event\.data\.type === 'SKIP_WAITING'/);
  assert.match(source, /self\.skipWaiting\(\)/);
});
