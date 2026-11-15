import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../comic-loader.js', import.meta.url), 'utf8');
const context = {
  URL,
  Blob,
  Response,
  AbortSignal,
  AbortController,
  setTimeout,
  clearTimeout,
  DOMException,
  fetch() { throw new Error('unexpected fetch'); }
};
context.globalThis = context;
vm.runInNewContext(source, context);
const loader = context.COMIC_LOADER;

test('extracts trusted DirkJan article and WordPress image URLs', () => {
  const article = '<article class="cartoon"><img src="https://dirkjan.nl/wp-content/uploads/comic.jpg"></article>';
  assert.equal(loader.extractComicImageUrl(article), 'https://dirkjan.nl/wp-content/uploads/comic.jpg');
  assert.equal(
    loader.extractComicImageUrl('https://dirkjan.nl/wp-content/uploads/loose.png'),
    'https://dirkjan.nl/wp-content/uploads/loose.png'
  );
  assert.equal(loader.normalizeComicImageUrl('https://evil.example/comic.jpg'), null);
  assert.equal(loader.normalizeComicImageUrl('http://dirkjan.nl/wp-content/uploads/comic.jpg'), null);
});

test('blob cache consumes matching URLs and evicts the oldest entries', () => {
  const revoked = [];
  const cache = loader.createComicBlobCache({
    maxSize: 2,
    revokeUrl: value => revoked.push(value)
  });

  cache.put('2026-05-01', { imageUrl: 'a', objectUrl: 'blob:a' });
  cache.put('2026-05-02', { imageUrl: 'b', objectUrl: 'blob:b' });
  cache.put('2026-05-03', { imageUrl: 'c', objectUrl: 'blob:c' });
  assert.equal(cache.size(), 2);
  assert.deepEqual(revoked, ['blob:a']);
  assert.equal(cache.has('2026-05-01'), false);

  const consumed = cache.consume('2026-05-02');
  assert.deepEqual(consumed, { imageUrl: 'b', objectUrl: 'blob:b' });
  assert.equal(cache.has('2026-05-02'), false);
  assert.equal(cache.consume('2026-05-02'), null);
});

test('resolveDisplayUrl reuses a matching cached blob and otherwise fetches a new one', async () => {
  const cache = loader.createComicBlobCache({ maxSize: 4, revokeUrl() {} });
  cache.put('2026-05-02', { imageUrl: 'https://dirkjan.nl/a.jpg', objectUrl: 'blob:cached' });

  const reused = await loader.resolveDisplayUrl(
    '2026-05-02',
    'https://dirkjan.nl/a.jpg',
    cache,
    null,
    { fetchWithFallback() { throw new Error('should reuse cache'); }, minImageSize: 1 }
  );
  assert.equal(reused, 'blob:cached');

  const created = await loader.resolveDisplayUrl(
    '2026-05-03',
    'https://dirkjan.nl/b.jpg',
    cache,
    null,
    {
      fetchWithFallback: async () => ({
        blob: async () => new Blob([new Uint8Array(500).fill(1)], { type: 'image/jpeg' })
      }),
      minImageSize: 400,
      createObjectUrl: () => 'blob:fresh'
    }
  );
  assert.equal(created, 'blob:fresh');
});

test('decodeComicImage resolves decoded dimensions and rejects broken, timed-out, or aborted images', async () => {
  class FakeImage {
    constructor() { this.naturalWidth = 0; this.naturalHeight = 0; }
    set src(value) {
      this._src = value;
      if (value === 'blob:hang') return;
      queueMicrotask(() => {
        if (value === 'blob:broken') { this.onerror?.(); return; }
        if (value === 'blob:good' || value === 'blob:undecodable') { this.naturalWidth = 900; this.naturalHeight = 300; }
        this.onload?.();
      });
    }
    get src() { return this._src; }
    decode() {
      return this._src === 'blob:undecodable'
        ? Promise.reject(new DOMException('Invalid image', 'EncodingError'))
        : Promise.resolve();
    }
  }

  const ok = await loader.decodeComicImage('blob:good', { ImageCtor: FakeImage });
  assert.deepEqual({ ...ok }, { width: 900, height: 300 });
  const renderable = await loader.decodeComicImage('blob:undecodable', { ImageCtor: FakeImage });
  assert.deepEqual({ ...renderable }, { width: 900, height: 300 });
  await assert.rejects(loader.decodeComicImage('blob:broken', { ImageCtor: FakeImage }), /failed to decode/);
  await assert.rejects(loader.decodeComicImage('blob:empty', { ImageCtor: FakeImage }), /empty/);
  await assert.rejects(loader.decodeComicImage('blob:hang', { ImageCtor: FakeImage, timeoutMs: 5 }), /timed out/);

  const controller = new AbortController();
  const pending = loader.decodeComicImage('blob:hang', { ImageCtor: FakeImage, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});

test('fetchComicData prefers metadata and falls back to HTML extraction', async () => {
  const metadata = await loader.fetchComicData('20260502', 'https://dirkjan.nl/cartoon/20260502', null, {
    metadataEndpoint: 'https://proxy.example/-/comic-metadata',
    fetchTimeout: 1000,
    fetchWithFallback() { throw new Error('metadata should succeed'); },
    fetchImpl: async () => new Response(JSON.stringify({
      date: '20260502',
      imageUrl: 'https://dirkjan.nl/wp-content/uploads/comic.jpg'
    }), { status: 200 })
  });
  assert.equal(metadata.notFound, false);
  assert.equal(metadata.imageUrl, 'https://dirkjan.nl/wp-content/uploads/comic.jpg');

  const htmlFallback = await loader.fetchComicData('20260502', 'https://dirkjan.nl/cartoon/20260502', null, {
    metadataEndpoint: 'https://proxy.example/-/comic-metadata',
    fetchTimeout: 1000,
    fetchImpl: async () => { throw new Error('offline metadata'); },
    fetchWithFallback: async () => new Response('<article class="cartoon"><img src="https://dirkjan.nl/wp-content/uploads/fallback.jpg"></article>')
  });
  assert.equal(htmlFallback.imageUrl, 'https://dirkjan.nl/wp-content/uploads/fallback.jpg');
  assert.equal(htmlFallback.notFound, false);
});

test('rate-limit retries recover metadata and image requests without bypassing caches', async () => {
  const requests = [];
  let metadataAttempts = 0;
  const data = await loader.fetchComicData('20260502', 'https://dirkjan.nl/cartoon/20260502', null, {
    metadataEndpoint: 'https://proxy.example/-/comic-metadata',
    fetchTimeout: 1000,
    retryOptions: { maxRetries: 2, retryDelay: 1, maxRetryDelay: 10 },
    fetchWithFallback() { throw new Error('must not refetch HTML when throttled'); },
    fetchImpl: async (url, options) => {
      requests.push(options);
      metadataAttempts++;
      return metadataAttempts === 1
        ? new Response('throttled', { status: 429, headers: { 'retry-after': '0' } })
        : Response.json({ date: '20260502', imageUrl: 'https://dirkjan.nl/comic.png' });
    }
  });
  let imageAttempts = 0;
  const objectUrl = await loader.createComicObjectUrl(data.imageUrl, {
    minImageSize: 1,
    createObjectUrl: () => 'blob:recovered',
    fetchWithFallback: url => loader.fetchWithRateLimitRetry(url, {
      fetchTimeout: 1000, maxRetries: 2, retryDelay: 1, maxRetryDelay: 10,
      fetchImpl: async (url, options) => {
        requests.push(options);
        imageAttempts++;
        return imageAttempts === 1
          ? new Response('throttled', { status: 429 })
          : new Response(new Blob(['image'], { type: 'image/png' }));
      }
    })
  });
  assert.equal(metadataAttempts, 2);
  assert.equal(imageAttempts, 2);
  assert.equal(objectUrl, 'blob:recovered');
  assert.ok(requests.every(options => options.cache === undefined));
});

test('persistent throttling is bounded and does not trigger an HTML fallback', async () => {
  let attempts = 0;
  await assert.rejects(loader.fetchComicData('20260502', 'https://dirkjan.nl/cartoon/20260502', null, {
    metadataEndpoint: 'https://proxy.example/-/comic-metadata',
    fetchTimeout: 1000,
    retryOptions: { maxRetries: 2, retryDelay: 1, maxRetryDelay: 10 },
    fetchImpl: async () => {
      attempts++;
      return new Response('throttled', { status: 429 });
    },
    fetchWithFallback() { assert.fail('must not amplify rate-limited requests'); }
  }), { name: 'RateLimitError' });
  assert.equal(attempts, 3);
});

test('long Retry-After values are not retried before the server allows it', async () => {
  for (const retryAfter of ['60', new Date(Date.now() + 60000).toUTCString()]) {
    let attempts = 0;
    await assert.rejects(loader.fetchWithRateLimitRetry('https://proxy.example/', {
      fetchTimeout: 1000, maxRetries: 2, retryDelay: 1, maxRetryDelay: 10,
      fetchImpl: async () => {
        attempts++;
        return new Response('throttled', { status: 429, headers: { 'retry-after': retryAfter } });
      }
    }), { name: 'RateLimitError' });
    assert.equal(attempts, 1);
  }
});

test('navigation cancellation interrupts backoff without retrying or fetching HTML', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const result = loader.fetchComicData('20260502', 'https://dirkjan.nl/cartoon/20260502', controller.signal, {
    metadataEndpoint: 'https://proxy.example/-/comic-metadata',
    fetchTimeout: 1000,
    retryOptions: { maxRetries: 2, retryDelay: 100, maxRetryDelay: 1000 },
    fetchImpl: async () => {
      attempts++;
      setTimeout(() => controller.abort(), 5);
      return new Response('throttled', { status: 429 });
    },
    fetchWithFallback() { assert.fail('cancelled navigation must not fetch HTML'); }
  });
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(attempts, 1);
});
