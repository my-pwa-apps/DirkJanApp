import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../../main.css', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../../manifest.webmanifest', import.meta.url), 'utf8'));

test('CORS proxy fallback keeps the private worker first and uses current public fallbacks', () => {
  const proxyBlock = appSource.match(/CORS_PROXIES:\s*\[([\s\S]*?)\]/)?.[1] || '';
  assert.match(proxyBlock, /corsproxy\.garfieldapp\.workers\.dev/);
  assert.match(proxyBlock, /api\.codetabs\.com/);
  assert.match(proxyBlock, /api\.allorigins\.win/);
  assert.doesNotMatch(proxyBlock, /corsproxy\.io/);
  assert.match(appSource, /const PRIMARY_PROXY_INDEX = 0/);
  assert.match(appSource, /tryProxy\(url, primaryProxyIndex, startTime\)/);
  assert.doesNotMatch(appSource, /Promise\.race\(/);
});

test('proxy performance arrays stay aligned with configured proxies', () => {
  assert.match(appSource, /new Array\(CONFIG\.CORS_PROXIES\.length\)\.fill\(0\)/);
  assert.match(appSource, /function getPublicProxyOrder\(excludeIndex = PRIMARY_PROXY_INDEX\)/);
});

test('comic extraction supports DirkJan article and WordPress image markup', () => {
  assert.match(appSource, /<article class="cartoon"/);
  assert.match(appSource, /wp-content\\\/uploads/);
  assert.match(appSource, /error404/);
});

test('preloading does not probe beyond a known latest or current date', () => {
  assert.match(appSource, /if \(notFound \|\| !latestAvailableDate\) return/);
  assert.match(appSource, /const preloadMaxDate = new Date\(latestAvailableDate\)/);
  assert.match(appSource, /const nextPublishDate = moveToComicPublishDate\(nextDate, 1\)/);
  assert.match(appSource, /if \(nextPublishDate <= preloadMaxDate\)/);
});

test('latest comic lookup starts from today instead of the future date picker maximum', () => {
  assert.match(appSource, /function isComicPublishDate\(dateValue\)/);
  assert.match(appSource, /function moveToComicPublishDate\(dateValue, direction\)/);
  assert.match(appSource, /function getStartupComicDate\(baseDate = new Date\(\)\)/);
  assert.match(appSource, /function getLatestComicCandidateDate\(baseDate = new Date\(\)\)/);
  assert.match(appSource, /const daysUntilFriday = \(5 - candidateDate\.getDay\(\) \+ 7\) % 7/);
  assert.match(appSource, /function clampToLatestComicCandidate\(dateValue\)/);
  assert.match(appSource, /function discoverLatestAvailableComic\(\)/);
  assert.match(appSource, /return findLatestAvailableComic\(latestCandidate, searchMinDate\)/);
  assert.match(appSource, /START_LATEST: 'startlatest'/);
  assert.match(appSource, /START_MODE: 'startmode'/);
  assert.match(appSource, /function getStartupMode\(\)/);
  assert.match(appSource, /document\.getElementById\('starttoday'\)\.addEventListener\('change'/);
  assert.match(appSource, /document\.getElementById\('startlast'\)\.addEventListener\('change'/);
  assert.match(appSource, /document\.getElementById\("startlatest"\)\.checked/);
  assert.doesNotMatch(appSource, /findLatestAvailableComic\(maxDate, searchMinDate\)/);
  assert.doesNotMatch(appSource, /latestAvailableDate \|\| getLatestComicCandidateDate\(\)/);
  assert.match(appSource, /currentselectedDate = clampToLatestComicCandidate\(storedLastComic\)/);
  assert.match(appSource, /currentselectedDate = getStartupComicDate\(\)/);
  assert.match(appSource, /DisplayComic\('morph', 'random'\)/);
  assert.match(appSource, /DisplayComic\('morph', 'nearest'\)/);
  assert.doesNotMatch(appSource, /const isTap =/);
});

test('screen-reader-only headings remain visually hidden', () => {
  assert.match(cssSource, /\.visually-hidden\s*\{/);
  assert.match(cssSource, /position:\s*absolute !important/);
  assert.match(cssSource, /clip-path:\s*inset\(50%\)/);
});

test('manifest keeps PWA orientation controlled by application code', () => {
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  assert.ok(manifest.shortcuts.every(shortcut => shortcut.url.startsWith('./')));
});
