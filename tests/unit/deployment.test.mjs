import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const headers = await readFile(new URL('../../_headers', import.meta.url), 'utf8');
const workflow = await readFile(new URL('../../.github/workflows/quality.yml', import.meta.url), 'utf8');
const offlinePage = await readFile(new URL('../../offline.html', import.meta.url), 'utf8');

test('Cloudflare Pages sends baseline browser security headers', () => {
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(headers, /Permissions-Policy:/);
});

test('service worker and HTML revalidate at the edge', () => {
  assert.match(headers, /\/serviceworker\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers, /\/index\.html[\s\S]*Cache-Control: no-cache, must-revalidate/);
});

test('CI gates syntax, unit contracts, and Chromium workflows', () => {
  assert.match(workflow, /npm run test:syntax/);
  assert.match(workflow, /npm run test:unit/);
  assert.match(workflow, /playwright test --project=chromium --workers=1/);
  assert.match(workflow, /timeout-minutes: 20/);
});

test('offline document declares its Dutch language', () => {
  assert.match(offlinePage, /<html lang="nl">/);
});