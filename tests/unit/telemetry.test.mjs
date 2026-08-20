import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../telemetry.js', import.meta.url), 'utf8');

function loadFactory() {
  const context = { fetch: () => Promise.resolve() };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.createTelemetry;
}

test('telemetry sends only allowlisted aggregate fields', async () => {
  const sent = [];
  const telemetry = loadFactory()({ sampleRate: 1, random: () => 0, send: payload => sent.push(payload) });
  assert.equal(telemetry.report('proxy_exhausted', 'network'), true);
  assert.equal(telemetry.report('unknown_event', 'network'), false);
  assert.equal(telemetry.report('storage_failed', 'contains a URL https://example.com'), false);
  assert.equal(JSON.stringify(sent), '[{"event":"proxy_exhausted","code":"network","count":1}]');
});

test('telemetry respects sampling', () => {
  const sent = [];
  const telemetry = loadFactory()({ sampleRate: 0.01, random: () => 0.5, send: payload => sent.push(payload) });
  assert.equal(telemetry.report('service_worker_failed', 'register'), false);
  assert.deepEqual(sent, []);
});