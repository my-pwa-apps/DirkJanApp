import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../toolbar.js', import.meta.url), 'utf8');
const context = {};
context.globalThis = context;
vm.runInNewContext(source, context);

test('toolbar helper exposes makeDraggable without owning storage keys', () => {
  assert.equal(typeof context.TOOLBAR.makeDraggable, 'function');
  assert.doesNotMatch(source, /STORAGE_KEYS/);
  assert.doesNotMatch(source, /localStorage/);
});
