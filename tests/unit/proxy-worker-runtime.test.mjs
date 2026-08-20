import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../../proxy-worker/src/index.js';

const ENV = {
  ALLOWED_HOSTS: 'dirkjan.nl,www.dirkjan.nl',
  ALLOWED_ORIGINS: 'https://dirkjanapp.pages.dev,http://127.0.0.1:8000'
};

function createCache() {
  const entries = new Map();
  return {
    async match(request) {
      return entries.get(`${request.method}:${request.url}`)?.clone();
    },
    async put(request, response) {
      entries.set(`${request.method}:${request.url}`, response.clone());
    }
  };
}

async function run(request, upstreamFetch = () => { throw new Error('Unexpected upstream request'); }) {
  const waits = [];
  globalThis.caches = { default: createCache() };
  globalThis.fetch = upstreamFetch;
  const response = await worker.fetch(request, ENV, { waitUntil: promise => waits.push(promise) });
  await Promise.all(waits);
  return response;
}

function proxyRequest(target, options = {}) {
  return new Request(`https://proxy.example/?url=${encodeURIComponent(target)}`, {
    headers: { origin: 'https://dirkjanapp.pages.dev', ...options.headers },
    method: options.method || 'GET',
    body: options.body
  });
}

test('rejects unsupported methods and blocked target hosts without upstream work', async () => {
  assert.equal((await run(proxyRequest('https://dirkjan.nl/cartoon/1', { method: 'DELETE' }))).status, 405);
  assert.equal((await run(proxyRequest('https://example.com/private'))).status, 403);
});

test('answers preflight only for configured browser origins', async () => {
  const allowed = await run(new Request('https://proxy.example/', {
    method: 'OPTIONS',
    headers: { origin: 'https://dirkjanapp.pages.dev' }
  }));
  const blocked = await run(new Request('https://proxy.example/', {
    method: 'OPTIONS',
    headers: { origin: 'https://attacker.example' }
  }));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://dirkjanapp.pages.dev');
  assert.equal(blocked.headers.get('access-control-allow-origin'), null);
});

test('serves cache hits and honors browser cache bypass', async () => {
  const cache = createCache();
  globalThis.caches = { default: cache };
  let fetchCount = 0;
  globalThis.fetch = async request => {
    fetchCount += 1;
    return new Response(`response-${fetchCount}`, {
      status: 200,
      headers: { 'content-length': '10', 'content-type': 'text/plain' }
    });
  };
  const waits = [];
  const context = { waitUntil: promise => waits.push(promise) };
  const first = await worker.fetch(proxyRequest('https://dirkjan.nl/cartoon/1'), ENV, context);
  await Promise.all(waits.splice(0));
  const cached = await worker.fetch(proxyRequest('https://dirkjan.nl/cartoon/1'), ENV, context);
  const bypassed = await worker.fetch(proxyRequest('https://dirkjan.nl/cartoon/1', {
    headers: { 'cache-control': 'no-cache' }
  }), ENV, context);
  assert.equal(first.headers.get('x-proxy-cache'), 'MISS');
  assert.equal(cached.headers.get('x-proxy-cache'), 'HIT');
  assert.equal(await cached.text(), 'response-1');
  assert.equal(await bypassed.text(), 'response-2');
});

test('preserves HEAD semantics and does not cache HEAD responses', async () => {
  let method;
  const response = await run(proxyRequest('https://dirkjan.nl/cartoon/1', { method: 'HEAD' }), async request => {
    method = request.method;
    return new Response(null, { status: 200, headers: { 'content-length': '0' } });
  });
  assert.equal(method, 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('blocks disallowed redirects, maps timeouts, and rejects declared oversized bodies', async () => {
  const redirected = await run(proxyRequest('https://dirkjan.nl/cartoon/1'), async () => new Response(null, {
    status: 302,
    headers: { location: 'https://example.com/private' }
  }));
  const timedOut = await run(proxyRequest('https://dirkjan.nl/cartoon/1'), async () => {
    throw new DOMException('Timed out', 'TimeoutError');
  });
  let cancelled = false;
  const oversized = await run(proxyRequest('https://dirkjan.nl/cartoon/1'), async () => new Response(new ReadableStream({
    cancel() { cancelled = true; }
  }), {
    status: 200,
    headers: { 'content-length': String(26 * 1024 * 1024) }
  }));
  assert.equal(redirected.status, 502);
  assert.equal(timedOut.status, 504);
  assert.equal(oversized.status, 413);
  assert.equal(cancelled, true);
});

test('telemetry accepts only bounded allowlisted aggregate events', async () => {
  const validBody = JSON.stringify({ event: 'proxy_exhausted', code: 'network', count: 1 });
  const valid = await run(new Request('https://proxy.example/-/telemetry', {
    method: 'POST',
    headers: { origin: 'https://dirkjanapp.pages.dev', 'content-type': 'application/json' },
    body: validBody
  }));
  const invalid = await run(new Request('https://proxy.example/-/telemetry', {
    method: 'POST',
    headers: { origin: 'https://dirkjanapp.pages.dev', 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'proxy_exhausted', code: 'network', count: 1, url: 'private' })
  }));
  assert.equal(valid.status, 204);
  assert.equal(invalid.status, 400);
});

test('comic metadata extracts a trusted image and is cached', async () => {
  const cache = createCache();
  globalThis.caches = { default: cache };
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return new Response('<article class="cartoon"><img src="https://dirkjan.nl/wp-content/uploads/comic.png"></article>', { status: 200 });
  };
  const waits = [];
  const request = new Request('https://proxy.example/-/comic-metadata?date=20260502', {
    headers: { origin: 'https://dirkjanapp.pages.dev' }
  });
  const first = await worker.fetch(request, ENV, { waitUntil: promise => waits.push(promise) });
  await Promise.all(waits);
  const second = await worker.fetch(request, ENV, { waitUntil: () => {} });
  assert.deepEqual(await first.json(), { date: '20260502', imageUrl: 'https://dirkjan.nl/wp-content/uploads/comic.png' });
  assert.equal(second.headers.get('x-proxy-cache'), 'HIT');
  assert.equal(fetchCount, 1);
});

test('follows allowed redirects and revalidates the destination host', async () => {
  const requestedUrls = [];
  const response = await run(proxyRequest('https://dirkjan.nl/start'), async request => {
    requestedUrls.push(request.url);
    if (request.url.endsWith('/start')) {
      return new Response(null, { status: 302, headers: { location: 'https://www.dirkjan.nl/final' } });
    }
    return new Response('redirected', { status: 200, headers: { 'content-length': '10' } });
  });
  assert.deepEqual(requestedUrls, ['https://dirkjan.nl/start', 'https://www.dirkjan.nl/final']);
  assert.equal(await response.text(), 'redirected');
});