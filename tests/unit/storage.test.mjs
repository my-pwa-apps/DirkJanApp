import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../storage.js', import.meta.url), 'utf8');

function loadFactory() {
  const context = { localStorage: new Map() };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.createStorageAdapter;
}

test('storage adapter persists strings and parses JSON', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const adapter = loadFactory()(storage);

  assert.equal(adapter.set('mode', 'latest'), true);
  assert.equal(adapter.get('mode'), 'latest');
  adapter.set('position', JSON.stringify({ top: 10 }));
  assert.equal(JSON.stringify(adapter.getJSON('position', null)), '{"top":10}');
  assert.equal(adapter.remove('mode'), true);
  assert.equal(adapter.get('mode'), null);
});

test('storage adapter degrades safely and reports each failed operation once', () => {
  const reports = [];
  const deniedStorage = {
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('denied'); }
  };
  const adapter = loadFactory()(deniedStorage, report => reports.push(report));

  assert.equal(adapter.get('favs', '[]'), '[]');
  assert.equal(adapter.get('favs', '[]'), '[]');
  assert.equal(adapter.set('favs', '[]'), false);
  assert.equal(adapter.set('favs', '[]'), false);
  assert.equal(adapter.remove('favs'), false);
  assert.deepEqual(reports.map(report => report.operation), ['read', 'write', 'remove']);
});

test('storage adapter returns fallback for malformed JSON', () => {
  const storage = {
    getItem: () => '{broken',
    setItem: () => {},
    removeItem: () => {}
  };
  const adapter = loadFactory()(storage);
  assert.deepEqual(adapter.getJSON('favs', []), []);
});