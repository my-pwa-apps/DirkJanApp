// Service Worker for DirkJan PWA
// Cache versioning - increment when you need to force cache refresh
const CACHE_VERSION = 'v99';
const CACHE_NAME = `dirkjan-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE = `dirkjan-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `dirkjan-images-${CACHE_VERSION}`;

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  './index.html',
  './offline.html',
  './main.css',
  './app.js',
  './manifest.webmanifest',
  './dirk-jan-tekst.svg',
  './favicon-32x32.webp',
  './android-chrome-192x192.png'
];

// Maximum cache sizes
const MAX_IMAGE_CACHE_SIZE = 50;
const MAX_RUNTIME_CACHE_SIZE = 30;

// Install event - pre-cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {
        // Pre-cache failed - app will work without offline support
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cache => cache !== CACHE_NAME && cache !== RUNTIME_CACHE && cache !== IMAGE_CACHE)
            .map(cache => caches.delete(cache))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - smart caching strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  
  if (request.method !== 'GET') return;
  
  const url = new URL(request.url);
  const { destination } = request;

  // Strategy: Cache First for app shell (HTML, CSS, JS, SVG)
  if (['document', 'style', 'script'].includes(destination) || url.pathname.endsWith('.svg')) {
    event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
    return;
  }

  // Strategy: Cache First with size limit for images (comics)
  if (destination === 'image') {
    event.respondWith(cacheFirstWithLimit(request, IMAGE_CACHE, MAX_IMAGE_CACHE_SIZE));
    return;
  }

  // Strategy: Network First for API calls and external resources
  event.respondWith(networkFirstStrategy(request, RUNTIME_CACHE));
});

// Cache First Strategy - for app shell
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    // For navigation requests, explicitly follow redirects and get final response
    const fetchRequest = request.mode === 'navigate' 
      ? new Request(request.url, { redirect: 'follow' })
      : request;
    
    const networkResponse = await fetch(fetchRequest);
    
    // Only cache successful, non-redirected responses
    if (networkResponse && networkResponse.status === 200 && !networkResponse.redirected) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // If fetch fails and it's an HTML request, return offline page
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('./offline.html');
    }
    throw error;
  }
}

// Cache First with cache size limit - for images
async function cacheFirstWithLimit(request, cacheName, maxSize) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse?.status === 200) {
      const cache = await caches.open(cacheName);
      
      // Manage cache size - remove oldest entries when limit reached
      const keys = await cache.keys();
      while (keys.length >= maxSize) {
        await cache.delete(keys.shift()); // Remove oldest (FIFO)
      }
      
      // Cache the new response
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Silently fail and return error response
    return new Response('Image not available offline', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network First Strategy - for API calls
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Listen for messages from the app
self.addEventListener('message', event => {
  if (!event.data) return;
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(cacheNames.map(cache => caches.delete(cache)));
      })
    );
  }
});
