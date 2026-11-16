import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../../proxy-worker/src/index.js';

const ENV = {
  ALLOWED_HOSTS: 'dirkjan.nl,www.dirkjan.nl',
  ALLOWED_ORIGINS: 'https://dirkjanapp.pages.dev,https://garfieldapp.pages.dev,http://127.0.0.1:8000',
  RATE_LIMIT_MAX: '10000'
};

function createCache() {
  const entries = new Map();
  return {
    async match(request) {
      const entry = entries.get(`${request.method}:${request.url}`);
      return entry && entry.until > Date.now() ? entry.response.clone() : undefined;
    },
    async put(request, response) {
      const ttl = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 3600);
      entries.set(`${request.method}:${request.url}`, {
        response: response.clone(), until: Date.now() + ttl * 1000
      });
    }
  };
}

async function run(request, upstreamFetch = () => { throw new Error('Unexpected upstream request'); }, env = ENV) {
  const waits = [];
  globalThis.caches = { default: createCache() };
  globalThis.fetch = upstreamFetch;
  const response = await worker.fetch(request, env, { waitUntil: promise => waits.push(promise) });
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

test('rate-limits repeated proxy requests from the same client IP', async () => {
  const limitedEnv = { ...ENV, RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' };
  const headers = { origin: 'https://dirkjanapp.pages.dev', 'cf-connecting-ip': '203.0.113.9' };
  const first = await run(proxyRequest('https://dirkjan.nl/cartoon/1', { headers }), async () => new Response('ok', { status: 200, headers: { 'content-length': '2' } }), limitedEnv);
  const second = await run(proxyRequest('https://dirkjan.nl/cartoon/2', { headers }), async () => new Response('ok', { status: 200, headers: { 'content-length': '2' } }), limitedEnv);
  const third = await run(proxyRequest('https://dirkjan.nl/cartoon/3', { headers }), async () => { throw new Error('should not fetch upstream'); }, limitedEnv);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.headers.get('retry-after'), '60');
});

test('rejects unsupported methods and blocked target hosts without upstream work', async () => {
  assert.equal((await run(proxyRequest('https://dirkjan.nl/cartoon/1', { method: 'DELETE' }))).status, 405);
  assert.equal((await run(proxyRequest('https://example.com/private'))).status, 403);
});

test('answers preflight only for configured browser origins', async () => {
  for (const origin of ['https://dirkjanapp.pages.dev', 'https://garfieldapp.pages.dev']) {
    const allowed = await run(new Request('https://proxy.example/', {
      method: 'OPTIONS',
      headers: { origin }
    }));
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  }

  const blocked = await run(new Request('https://proxy.example/', {
    method: 'OPTIONS',
    headers: { origin: 'https://attacker.example' }
  }));
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

test('metadata preserves upstream throttling and exposes Retry-After without caching it', async () => {
  let attempts = 0;
  const response = await run(new Request('https://proxy.example/-/comic-metadata?date=20260502', {
    headers: { origin: 'https://dirkjanapp.pages.dev' }
  }), async () => {
    attempts++;
    return new Response('nginx: Too Many Requests', {
      status: 429, headers: { 'retry-after': '3' }
    });
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('access-control-expose-headers'), 'Retry-After');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Upstream rate limited' });
  assert.equal(attempts, 1);
});

test('readers and metadata/HTML routes share public comic pages with canonical keys', async () => {
  globalThis.caches = { default: createCache() };
  let upstreamCount = 0;
  globalThis.fetch = async () => {
    upstreamCount++;
    return new Response('<article class="cartoon"><img src="https://dirkjan.nl/wp-content/uploads/comic.png"></article>', {
      headers: { 'content-type': 'text/html' }
    });
  };
  const waits = [];
  const ctx = { waitUntil: promise => waits.push(promise) };
  const url = 'https://proxy.example/-/comic-metadata?extra=ignored&date=20200117';
  const first = await worker.fetch(new Request(url, { headers: { origin: 'https://dirkjanapp.pages.dev' } }), ENV, ctx);
  await Promise.all(waits.splice(0));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'public, max-age=86400');
  const metadata = await worker.fetch(new Request('https://proxy.example/-/comic-metadata?date=20200117', {
    headers: { origin: 'https://garfieldapp.pages.dev', 'cache-control': 'no-cache' }
  }), ENV, ctx);
  const html = await worker.fetch(proxyRequest('https://dirkjan.nl/cartoon/20200117'), ENV, ctx);
  const head = await worker.fetch(new Request('https://proxy.example/-/comic-metadata?date=20200117', { method: 'HEAD' }), ENV, ctx);
  assert.equal(metadata.headers.get('x-proxy-cache'), 'HIT');
  assert.equal(metadata.headers.get('access-control-allow-origin'), 'https://garfieldapp.pages.dev');
  assert.equal(html.headers.get('x-proxy-cache'), 'HIT');
  assert.match(await html.text(), /article/);
  assert.equal(await head.text(), '');
  assert.equal(upstreamCount, 1);
});

test('public images without Content-Length are cached but unknown oversized streams are rejected', async () => {
  globalThis.caches = { default: createCache() };
  let upstreamCount = 0;
  let cancelled = false;
  globalThis.fetch = async request => {
    upstreamCount++;
    if (request.url.endsWith('large.png')) {
      const chunk = new Uint8Array(1024 * 1024);
      return new Response(new ReadableStream({
        pull(controller) { controller.enqueue(chunk); },
        cancel() { cancelled = true; }
      }), { headers: { 'content-type': 'image/png' } });
    }
    return new Response(new Uint8Array(500), { headers: { 'content-type': 'image/png' } });
  };
  const waits = [];
  const ctx = { waitUntil: promise => waits.push(promise) };
  const request = proxyRequest('https://dirkjan.nl/wp-content/uploads/comic.png');
  const first = await worker.fetch(request, ENV, ctx);
  await Promise.all(waits.splice(0));
  const cached = await worker.fetch(proxyRequest('https://dirkjan.nl/wp-content/uploads/comic.png', {
    headers: { 'cache-control': 'no-cache' }
  }), ENV, ctx);
  assert.equal(first.headers.get('content-length'), '500');
  assert.equal(cached.headers.get('cache-control'), 'public, max-age=86400');
  assert.equal(cached.headers.get('x-proxy-cache'), 'HIT');
  assert.equal((await cached.arrayBuffer()).byteLength, 500);
  assert.equal(upstreamCount, 1);
  const large = await worker.fetch(proxyRequest('https://dirkjan.nl/wp-content/uploads/large.png'), ENV, ctx);
  assert.equal(large.status, 413);
  assert.equal(cancelled, true);
  assert.equal(waits.length, 0);
});

test('private and cookie-bearing comic responses do not enter the shared caches', async () => {
  for (const headers of [
    { 'cache-control': 'private' }, { 'cache-control': 'no-store' },
    { 'set-cookie': 'session=example' }, { vary: '*' }, { vary: 'User-Agent' }
  ]) {
    globalThis.caches = { default: createCache() };
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts++;
      return new Response('<article class="cartoon"><img src="https://dirkjan.nl/comic.png"></article>', { headers });
    };
    const waits = [];
    const ctx = { waitUntil: promise => waits.push(promise) };
    const request = new Request('https://proxy.example/-/comic-metadata?date=20200117');
    const first = await worker.fetch(request, ENV, ctx);
    await worker.fetch(request, ENV, ctx);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(attempts, 2);
    assert.equal(waits.length, 0);
  }
});

test('missing metadata is cached briefly and can become available after expiry', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  globalThis.caches = { default: createCache() };
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    return attempts === 1 ? new Response('missing', { status: 404 }) : new Response(
      '<article class="cartoon"><img src="https://dirkjan.nl/comic.png"></article>'
    );
  };
  const waits = [];
  const ctx = { waitUntil: promise => waits.push(promise) };
  const request = new Request('https://proxy.example/-/comic-metadata?date=20300101');
  assert.equal((await worker.fetch(request, ENV, ctx)).status, 404);
  await Promise.all(waits.splice(0));
  assert.equal((await worker.fetch(request, ENV, ctx)).status, 404);
  assert.equal(attempts, 1);
  t.mock.timers.tick(61000);
  const found = await worker.fetch(request, ENV, ctx);
  await Promise.all(waits);
  assert.equal(found.status, 200);
  assert.equal(found.headers.get('cache-control'), 'public, max-age=600');
  assert.equal(attempts, 2);
});

test('soft 404 pages and non-image error bodies never poison long-lived comic caches', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  globalThis.caches = { default: createCache() };
  let pageAttempts = 0;
  let imageAttempts = 0;
  globalThis.fetch = async (request, init) => {
    assert.equal(init.cf.cacheTtlByStatus['200-299'], -1);
    if (request.url.includes('/cartoon/')) {
      pageAttempts++;
      return new Response(pageAttempts === 1
        ? '<body class="error404">Unavailable</body>'
        : '<article class="cartoon"><img src="https://dirkjan.nl/comic.png"></article>');
    }
    imageAttempts++;
    return new Response('<h1>Temporarily unavailable</h1>', { headers: { 'content-type': 'text/html' } });
  };
  const waits = [];
  const ctx = { waitUntil: promise => waits.push(promise) };
  const request = new Request('https://proxy.example/-/comic-metadata?date=20200101');
  assert.equal((await worker.fetch(request, ENV, ctx)).status, 404);
  await Promise.all(waits.splice(0));
  t.mock.timers.tick(61000);
  assert.equal((await worker.fetch(request, ENV, ctx)).status, 200);
  await Promise.all(waits.splice(0));
  assert.equal(pageAttempts, 2);
  const image = proxyRequest('https://dirkjan.nl/wp-content/uploads/comic.png');
  await worker.fetch(image, ENV, ctx);
  await worker.fetch(image, ENV, ctx);
  assert.equal(imageAttempts, 2);
  assert.equal(waits.length, 0);
});

test('edge cooldown blocks uncached dates and images, allows cached comics, and expires', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  globalThis.caches = { default: createCache() };
  let attempts = 0;
  let throttle = false;
  globalThis.fetch = async () => {
    attempts++;
    return throttle
      ? new Response('throttled', { status: 429, headers: { 'retry-after': '90' } })
      : new Response('cached comic', { headers: { 'content-type': 'image/png' } });
  };
  const waits = [];
  const ctx = { waitUntil: promise => waits.push(promise) };
  const warm = proxyRequest('https://dirkjan.nl/wp-content/uploads/warm.png');
  await worker.fetch(warm, ENV, ctx);
  await Promise.all(waits.splice(0));
  throttle = true;
  const first = await worker.fetch(proxyRequest('https://dirkjan.nl/cartoon/20200101'), ENV, ctx);
  assert.equal(first.status, 429);
  assert.equal(first.headers.get('retry-after'), '90');
  for (const request of [
    new Request('https://proxy.example/-/comic-metadata?date=20200102'),
    proxyRequest('https://www.dirkjan.nl/wp-content/uploads/cold.png')
  ]) {
    assert.equal((await worker.fetch(request, ENV, ctx)).status, 429);
  }
  const cached = await worker.fetch(warm, ENV, ctx);
  assert.equal(cached.status, 200);
  assert.equal(cached.headers.get('x-proxy-cache'), 'HIT');
  assert.equal(attempts, 2);
  t.mock.timers.tick(60000);
  assert.equal((await worker.fetch(proxyRequest('https://dirkjan.nl/cartoon/20200103'), ENV, ctx)).headers.get('retry-after'), '30');
  assert.equal(attempts, 2);
  t.mock.timers.tick(31000);
  throttle = false;
  assert.equal((await worker.fetch(proxyRequest('https://dirkjan.nl/cartoon/20200103'), ENV, ctx)).status, 200);
  await Promise.all(waits);
  assert.equal(attempts, 3);
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