import { execFileSync } from 'node:child_process';

const base = process.env.CACHE_CHECK_BASE;
const head = process.env.CACHE_CHECK_HEAD || 'HEAD';

if (!base || /^0+$/.test(base)) {
  console.log('Cache version check skipped: no comparison base was provided.');
  process.exit(0);
}

const changedFiles = execFileSync('git', ['diff', '--name-only', base, head], {
  encoding: 'utf8'
}).trim().split(/\r?\n/).filter(Boolean);

const servedFiles = new Set([
  'app.js',
  'date-utils.js',
  'storage.js',
  'telemetry.js',
  'comic-loader.js',
  'toolbar.js',
  'animation-utils.js',
  'index.html',
  'offline.html',
  'main.css',
  'manifest.webmanifest'
]);
const servedChange = changedFiles.some(file => servedFiles.has(file));
const versionChanged = changedFiles.includes('serviceworker.js');

if (servedChange && !versionChanged) {
  console.error('Served application files changed without updating CACHE_VERSION in serviceworker.js.');
  process.exit(1);
}

console.log('Cache version change policy passed.');