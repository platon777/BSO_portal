const CACHE_NAME = 'bso-portal-cache-v2';
const RUNTIME_CACHE = 'bso-portal-runtime-v2';

// Assets to cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html'
];

// Install event - precache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - Network First with Cache Fallback strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Skip Chrome extensions and other non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    caches.open(RUNTIME_CACHE)
      .then((cache) => {
        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => {
            // If network fails, try cache
            return caches.match(request)
              .then((cachedResponse) => {
                if (cachedResponse) {
                  console.log('[SW] Serving from cache:', request.url);
                  return cachedResponse;
                }
                // If not in cache and offline, return offline page for navigation requests
                if (request.mode === 'navigate') {
                  return caches.match('/index.html');
                }
                throw new Error('Network request failed and no cache available');
              });
          });
      })
  );
});
