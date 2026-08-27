#!/usr/bin/env node
/**
 * Deploy guard: every asset referenced by the web app manifest, the service
 * worker precache list, and browserconfig.xml must exist on disk.
 */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const problems = [];

function toRepoPath(reference) {
  return path.join(repoRoot, reference.replace(/^\.?\//, '').split(/[?#]/)[0]);
}

function checkReference(reference, source) {
  const normalized = reference === './' || reference === '/' ? './index.html' : reference;
  if (!fs.existsSync(toRepoPath(normalized))) {
    problems.push(`${source}: missing "${reference}"`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons || []) checkReference(icon.src, 'manifest.icons');
for (const shot of manifest.screenshots || []) checkReference(shot.src, 'manifest.screenshots');
for (const shortcut of manifest.shortcuts || []) {
  for (const icon of shortcut.icons || []) checkReference(icon.src, 'manifest.shortcuts');
  if (shortcut.url?.startsWith('/')) {
    problems.push(`manifest.shortcuts: "${shortcut.url}" is root-absolute and breaks subpath deployments`);
  }
}

const serviceWorker = fs.readFileSync(path.join(repoRoot, 'serviceworker.js'), 'utf8');
const precacheBlock = serviceWorker.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\];/);
if (!precacheBlock) {
  problems.push('serviceworker.js: PRECACHE_ASSETS list not found');
} else {
  for (const [, asset] of precacheBlock[1].matchAll(/'([^']+)'/g)) {
    checkReference(asset, 'serviceworker.PRECACHE_ASSETS');
  }
}

const scriptSources = ['index.html', 'offline.html']
  .flatMap(file => {
    const html = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    return [...html.matchAll(/<script[^>]+src=["'](\.\/[^"']+)["']/g)].map(([, src]) => src);
  });

for (const src of scriptSources) {
  if (precacheBlock && !precacheBlock[1].includes(`'${src}'`)) {
    problems.push(`serviceworker.PRECACHE_ASSETS: "${src}" is loaded by HTML but never precached`);
  }
}

const browserConfig = fs.readFileSync(path.join(repoRoot, 'browserconfig.xml'), 'utf8');
for (const [, src] of browserConfig.matchAll(/src="([^"]+)"/g)) {
  if (src.startsWith('/')) {
    problems.push(`browserconfig.xml: "${src}" is root-absolute and breaks subpath deployments`);
  }
  checkReference(src, 'browserconfig.xml');
}

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.ico']);
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'docs', 'screenshots']);
const REFERENCE_SOURCE_EXTENSIONS = new Set(['.html', '.js', '.cjs', '.mjs', '.css', '.webmanifest', '.json', '.xml', '.txt']);

function collectFiles(dir, predicate, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      collectFiles(path.join(dir, entry.name), predicate, found);
    } else if (predicate(entry.name)) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

const referencedText = collectFiles(repoRoot, name => REFERENCE_SOURCE_EXTENSIONS.has(path.extname(name).toLowerCase()))
  .filter(file => !file.includes(`${path.sep}tests${path.sep}`) && !file.includes(`${path.sep}scripts${path.sep}`))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');

for (const image of collectFiles(repoRoot, name => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))) {
  const relative = path.relative(repoRoot, image).split(path.sep).join('/');
  if (!referencedText.includes(relative) && !referencedText.includes(`./${relative}`)) {
    problems.push(`orphaned image: ${relative}`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log('Asset references verified.');
