import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../date-utils.js', import.meta.url), 'utf8');
const context = {};
context.globalThis = context;
vm.runInNewContext(source, context);

function localDate(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('publication dates skip Sundays in either direction', () => {
  const dates = context.createDateUtils(() => new Date(2026, 4, 3));
  assert.equal(dates.isComicPublishDate(new Date(2026, 4, 3)), false);
  assert.equal(localDate(dates.moveToComicPublishDate(new Date(2026, 4, 3), -1)), '2026-05-02');
  assert.equal(localDate(dates.moveToComicPublishDate(new Date(2026, 4, 3), 1)), '2026-05-04');
});

test('startup and latest candidates use today and the Friday publication window', () => {
  const dates = context.createDateUtils(() => new Date(2026, 4, 3, 12));
  assert.equal(localDate(dates.getStartupComicDate()), '2026-05-02');
  assert.equal(localDate(dates.getLatestComicCandidateDate()), '2026-05-08');
});

test('stored dates are normalized and clamped to the latest candidate', () => {
  const dates = context.createDateUtils(() => new Date(2026, 4, 2, 12));
  assert.equal(localDate(dates.clampToLatestComicCandidate('2026-05-09')), '2026-05-08');
  assert.equal(localDate(dates.clampToLatestComicCandidate('2026-05-03')), '2026-05-02');
  assert.equal(localDate(dates.clampToLatestComicCandidate('invalid')), '2026-05-08');
});

test('ISO calendar dates stay on the intended local day', () => {
  const dates = context.createDateUtils(() => new Date(2026, 4, 2, 12));
  const parsed = dates.parseLocalDate('2026-05-02');
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 4);
  assert.equal(parsed.getDate(), 2);
  assert.equal(localDate(parsed), '2026-05-02');
  assert.equal(localDate(dates.parseLocalDate('20260508')), '2026-05-08');
});