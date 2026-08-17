import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../../proxy-worker/src/index.js', import.meta.url), 'utf8');
const wranglerConfig = await readFile(new URL('../../proxy-worker/wrangler.toml', import.meta.url), 'utf8');

test('proxy bounds upstream requests and validates every redirect', () => {
  assert.match(source, /const UPSTREAM_TIMEOUT_MS = 15000/);
  assert.match(source, /const MAX_REDIRECTS = 3/);
  assert.match(source, /redirect: 'manual'/);
  assert.match(source, /signal = AbortSignal\.timeout\(UPSTREAM_TIMEOUT_MS\)/);
  assert.match(source, /!isAllowedHost\(redirectUrl\.hostname, allowedHosts\)/);
});

test('proxy avoids caching unknown or oversized response bodies', () => {
  assert.match(source, /const MAX_CACHEABLE_RESPONSE_BYTES = 25 \* 1024 \* 1024/);
  assert.match(source, /contentLength > MAX_CACHEABLE_RESPONSE_BYTES/);
  assert.match(source, /contentLength !== null && !bypassCache/);
  assert.match(source, /'400-599': -1/);
});

test('worker configuration enables current compatibility and sampled observability', () => {
  assert.match(wranglerConfig, /compatibility_date = "2026-08-17"/);
  assert.match(wranglerConfig, /\[observability\.logs\][\s\S]*head_sampling_rate = 1/);
  assert.match(wranglerConfig, /\[observability\.traces\][\s\S]*head_sampling_rate = 0\.01/);
});

test('worker configuration preserves DirkJan and shared proxy source hosts', () => {
  const allowedHosts = wranglerConfig.match(/ALLOWED_HOSTS = "([^"]+)"/)?.[1].split(',') || [];
  for (const hostname of [
    'dirkjan.nl',
    'www.dirkjan.nl',
    'gocomics.com',
    '*.gocomics.com',
    'assets.amuniversal.com',
    'www.arcamax.com',
    'garfield.fandom.com'
  ]) {
    assert.ok(allowedHosts.includes(hostname), `${hostname} should remain allowed`);
  }
});
