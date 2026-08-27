#!/usr/bin/env node
/**
 * Increment CACHE_VERSION in serviceworker.js (vN -> vN+1).
 * Usage: node scripts/bump-cache-version.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceWorkerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../serviceworker.js');
const source = await readFile(serviceWorkerPath, 'utf8');
const match = source.match(/const CACHE_VERSION = '(v)(\d+)'/);

if (!match) {
  console.error('CACHE_VERSION declaration not found in serviceworker.js');
  process.exit(1);
}

const nextVersion = `${match[1]}${Number(match[2]) + 1}`;
const updated = source.replace(/const CACHE_VERSION = 'v\d+'/, `const CACHE_VERSION = '${nextVersion}'`);
await writeFile(serviceWorkerPath, updated);
console.log(`CACHE_VERSION bumped to ${nextVersion}`);
