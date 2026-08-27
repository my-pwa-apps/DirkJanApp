import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const headers = await readFile(new URL('../../_headers', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../../.github/workflows/quality.yml', import.meta.url), 'utf8');
const offlinePage = await readFile(new URL('../../offline.html', import.meta.url), 'utf8');
const staticServer = await readFile(new URL('../support/static-server.cjs', import.meta.url), 'utf8');
const cacheVersionCheck = await readFile(new URL('../../scripts/check-cache-version.mjs', import.meta.url), 'utf8');

test('Cloudflare Pages sends baseline browser security headers', () => {
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(headers, /Permissions-Policy:/);
  assert.doesNotMatch(headers, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(headers, /api\.codetabs\.com|api\.allorigins\.win/);
});

test('service worker and HTML revalidate at the edge', () => {
  assert.match(headers, /\/serviceworker\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers, /\/index\.html[\s\S]*Cache-Control: no-cache, must-revalidate/);
});

test('CI gates syntax, unit contracts, and Chromium workflows', () => {
  assert.match(workflow, /node-version: 22\.19/);
  assert.match(workflow, /npm run test:syntax/);
  assert.match(workflow, /npm run test:assets/);
  assert.match(workflow, /npm run test:unit/);
  assert.match(workflow, /npm run check:cache-version/);
  assert.match(workflow, /npm audit --audit-level=moderate/);
  assert.match(workflow, /playwright test --project=chromium --workers=1/);
  assert.match(workflow, /timeout-minutes: 20/);
});

test('CI cache policy covers every served application source', () => {
  for (const file of ['app.js', 'date-utils.js', 'storage.js', 'telemetry.js', 'comic-loader.js', 'toolbar.js', 'animation-utils.js', 'index.html', 'offline.html', 'main.css', 'manifest.webmanifest']) {
    assert.ok(cacheVersionCheck.includes(`'${file}'`), `${file} should require a cache version update`);
  }
  assert.match(cacheVersionCheck, /changedFiles\.includes\('serviceworker\.js'\)/);
});

test('offline document declares its Dutch language', () => {
  assert.match(offlinePage, /<html lang="nl">/);
});

test('local static server rejects paths outside the repository root', () => {
  assert.match(staticServer, /path\.relative\(root, filePath\)/);
  assert.match(staticServer, /relativePath\.startsWith\('\.\.'\) \|\| path\.isAbsolute\(relativePath\)/);
  assert.doesNotMatch(staticServer, /filePath\.startsWith\(root\)/);
});