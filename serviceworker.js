// Name and version for our cache
const CACHE_NAME = 'pwa-cache-v1';
// Offline fallback page (make sure you have this file available)
const OFFLINE_URL = '/offline.html';

// During install, pre-cache the offline fallback page.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

// Activate event – cleanup old caches if necessary.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch event – serve from cache, and dynamically cache new requests.
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Return cached response if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // Else fetch from network
      return fetch(event.request)
        .then(networkResponse => {
          // Only cache successful responses (status 200)
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          // Clone the response to cache it
          const clonedResponse = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clonedResponse);
          });

          return networkResponse;
        })
        .catch(error => {
          // If network fetch fails and the request is for an HTML page,
          // return the offline fallback page.
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_URL);
          }
          // Otherwise, just propagate the error.
          throw error;
        });
    })
  );
});
