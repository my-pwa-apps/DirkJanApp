
const OFFLINE_VERSION = 2;
const CACHE_NAME = 'offline';
const OFFLINE_URL = 
[
  "./index.html",
  "./dirk-jan-tekst.svg",
  "./mail.webp",
  "./pwa-pass-3.svg",
  "./swiped-events.min.js",    
  "./app.js",
  "./main.css",
  "./serviceworker.js",
  "./mstile-150x150.webp",
  "./favicon.ico",
  "./favicon-32x32.webp",
  "./favicon-16x16.webp",
  "./apple-touch-icon.webp",
  "./android-chrome-192x192.webp",
  "./android-chrome-256x256.webp",
  "./android-chrome-512x512.webp",
  "./dirkjantransparent.webp"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(OFFLINE_URL, {cache: 'reload'}));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
   
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
  })());

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
 
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }

        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch (error) {
       
        console.log('Fetch failed; returning offline page instead.', error);

        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(OFFLINE_URL);
        return cachedResponse;
      }
    })());
  }
});