import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

// app.js has a no-growth cap: put new cohesive features in their own IIFE module instead.
const APP_LINE_CAP = 3300;
const MODULE_LINE_CAP = 800;

test('browser modules stay bounded and app.js cannot keep growing', async () => {
  const root = new URL('../../', import.meta.url);
  const files = (await readdir(root)).filter(name => name.endsWith('.js') && !name.startsWith('playwright.'));
  for (const file of files) {
    const lines = (await readFile(new URL(file, root), 'utf8')).split(/\r?\n/).length;
    const limit = file === 'app.js' ? APP_LINE_CAP : MODULE_LINE_CAP;
    assert.ok(lines <= limit, `${file}: ${lines} lines exceeds ${limit}; extract a focused module`);
  }
});
