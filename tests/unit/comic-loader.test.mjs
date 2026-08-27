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
