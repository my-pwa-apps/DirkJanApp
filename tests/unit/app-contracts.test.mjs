import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appSource = await readFile(new URL('../../app.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../../main.css', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../../manifest.webmanifest', import.meta.url), 'utf8'));

test('comic requests use only the controlled first-party proxy', () => {
  const proxyBlock = appSource.match(/CORS_PROXIES:\s*\[([\s\S]*?)\]/)?.[1] || '';
  assert.match(proxyBlock, /corsproxy\.garfieldapp\.workers\.dev/);
  assert.doesNotMatch(proxyBlock, /api\.codetabs\.com|api\.allorigins\.win|corsproxy\.io/);
  assert.match(appSource, /const PRIMARY_PROXY_INDEX = 0/);
  assert.match(appSource, /tryProxy\(url, primaryProxyIndex, startTime, signal\)/);
  assert.doesNotMatch(appSource, /Promise\.race\(/);
});

test('proxy state stays aligned with the configured first-party endpoint', () => {
  assert.match(appSource, /new Array\(CONFIG\.CORS_PROXIES\.length\)\.fill\(0\)/);
  assert.match(appSource, /function getPublicProxyOrder\(excludeIndex = PRIMARY_PROXY_INDEX\)/);
});

test('comic fetch cancellation reaches proxy requests and body reads', () => {
  assert.match(appSource, /fetchWithFallback\(url, signal = null\)/);
  assert.match(appSource, /AbortSignal\.any\(\[signal, AbortSignal\.timeout\(CONFIG\.FETCH_TIMEOUT\)\]\)/);
  assert.match(appSource, /fetchComicData\(formattedComicDate, url, fetchSignal\)/);
  assert.match(appSource, /COMIC_LOADER\.fetchComicData\(date, pageUrl, signal/);
});

test('comic extraction is delegated to the comic-loader module', () => {
  assert.match(appSource, /const \{ extractComicImageUrl, normalizeComicImageUrl \} = COMIC_LOADER/);
  assert.match(appSource, /COMIC_LOADER\.fetchComicData\(/);
  assert.match(appSource, /COMIC_LOADER\.resolveDisplayUrl\(/);
  assert.match(appSource, /COMIC_LOADER\.createComicObjectUrl\(/);
  assert.match(appSource, /isFullscreenActive\(\)/);
});

test('comic images load through the controlled proxy as revocable blob URLs', () => {
  assert.match(appSource, /async function createComicObjectUrl\(imageUrl, signal = null\)/);
  assert.match(appSource, /COMIC_ANIMATION\.animateTransition\(comicImg, displayUrl, direction/);
  assert.match(appSource, /URL\.revokeObjectURL\(previousComicObjectUrl\)/);
  assert.match(appSource, /COMIC_LOADER\.resolveDisplayUrl\(/);
  assert.match(appSource, /getComicBlobCache\(\)/);
});

test('fullscreen navigation uses the landscape filmstrip instead of the hidden portrait comic', () => {
  assert.match(appSource, /if \(rotatedComic\) \{[\s\S]*return animateRotatedComic\(rotatedComic, displayUrl, direction\)/);
  assert.match(appSource, /function animateRotatedComic\([\s\S]*return COMIC_ANIMATION\.animateTransition\(rotatedComic/);
});

test('startup discovery failures retain a usable comic view', () => {
  assert.match(appSource, /discoverLatestAvailableComic\(\)\.then\(latestDate => \{[\s\S]*?\}\)\.catch\(\(\) => \{\s*CompareDates\(\);\s*DisplayComic\(null, 'nearest'\)/);
  assert.match(appSource, /comicImg\.alt = `DirkJan strip van \$\{dateParts\.day\}-\$\{dateParts\.month\}-\$\{dateParts\.year\} laden`/);
});

test('preloading does not probe beyond a known latest or current date', () => {
  assert.match(appSource, /if \(notFound \|\| !latestAvailableDate\) return/);
  assert.match(appSource, /const preloadMaxDate = new Date\(latestAvailableDate\)/);
  assert.match(appSource, /const nextPublishDate = moveToComicPublishDate\(nextDate, 1\)/);
  assert.match(appSource, /if \(nextPublishDate <= preloadMaxDate\)/);
  assert.match(appSource, /cache\.put\(preloadFormattedDate, \{ imageUrl: comicData\.imageUrl, objectUrl \}\)/);
  assert.match(appSource, /img\.onerror = \(\) => \{[\s\S]*URL\.revokeObjectURL\(objectUrl\)/);
});

test('service worker updates wait for an explicit user prompt', () => {
  assert.match(appSource, /offerUpdate\(registration\.waiting\)/);
  assert.match(appSource, /showUpdateNotification\(\(\) => \{/);
  assert.match(appSource, /worker\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(appSource, /if \(!reloadingForUpdate\) return/);
  assert.match(appSource, /postMessage\(\{ type: 'GET_VERSION' \}/);
});

test('date picker changes use the main picker value', () => {
  assert.match(appSource, /function DateChange\(event\)/);
  assert.match(appSource, /event\?\.target\?\.value \|\| mainDatePicker\?\.value/);
});

test('landscape fullscreen hides the toolbar and always allows swipe navigation', () => {
  assert.doesNotMatch(appSource, /getElementById\(['"]fullscreen-toolbar['"]\)/);
  assert.doesNotMatch(appSource, /rotated-First|rotated-Next|rotated-DatePicker/);
  assert.match(appSource, /if \(!isFullscreenActive\(\) && !document\.getElementById\("swipe"\)\.checked\) return/);
  assert.match(appSource, /lastSwipeTime = Date\.now\(\)/);
});

test('calendar dates are parsed as local days rather than UTC midnight', () => {
  assert.match(appSource, /parseLocalDate,/);
  assert.match(appSource, /currentselectedDate = parseLocalDate\(favs\[0\]\)/);
  assert.match(appSource, /const parsed = parseLocalDate\(date\)/);
  assert.doesNotMatch(appSource, /valueAsDate = getCurrentDate\(\)/);
});

test('random shortcut is applied before latest-startup discovery', () => {
  assert.match(appSource, /const openRandomShortcut = urlParams\.get\('random'\) === 'true' && !showFavsChecked/);
  assert.match(appSource, /if \(openRandomShortcut\) \{[\s\S]*DisplayComic\('morph', 'random'\)/);
});

test('latest comic lookup starts from today instead of the future date picker maximum', () => {
  assert.match(appSource, /\} = DATE_UTILS/);
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

test('mouse button focus hides native outlines while keyboard focus stays visible', () => {
  assert.match(cssSource, /button:focus:not\(:focus-visible\)\s*\{\s*outline:\s*none/);
  assert.match(cssSource, /\.toolbar-button:focus-visible[\s\S]*?box-shadow:\s*var\(--focus-ring\)/);
});

test('manifest keeps PWA orientation controlled by application code', () => {
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  assert.ok(manifest.shortcuts.every(shortcut => shortcut.url.startsWith('./')));
});
