const CACHE_NAME = 'bso-portal-cache-v5';
const RUNTIME_CACHE = 'bso-portal-runtime-v5';

// Install event - activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v5...');
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
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
      .then(() => {
        console.log('[SW] Service worker activated and claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch event - CACHE FIRST strategy for offline-first app
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Chrome extensions and other non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Handle cross-origin requests (CDN assets like Tailwind, React from CDN)
  if (url.origin !== location.origin) {
    // Cache First for CDN assets (they rarely change)
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving CDN asset from cache:', request.url);
          return cachedResponse;
        }
        // Not in cache, try to fetch from network
        console.log('[SW] Fetching CDN asset from network:', request.url);
        return fetch(request)
          .then((response) => {
            // Cache CDN assets for offline use (even if status is not 200)
            // Some CDN responses might have different status codes
            if (response && (response.status === 200 || response.status === 0)) {
              return caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, response.clone());
                console.log('[SW] Cached CDN asset:', request.url);
                return response;
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] CDN fetch failed:', request.url, error);
            // Try to return from cache one more time
            return caches.match(request).then((fallbackResponse) => {
              if (fallbackResponse) {
                console.log('[SW] Serving stale CDN asset from cache:', request.url);
                return fallbackResponse;
              }
              throw error;
            });
          });
      })
    );
    return;
  }

  // CACHE FIRST strategy for same-origin requests (app assets)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', request.url);
          // Return cached version immediately
          // Update cache in background for next time
          fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, response);
                });
              }
            })
            .catch(() => {
              // Ignore fetch errors when updating cache in background
            });
          return cachedResponse;
        }

        // Not in cache, fetch from network
        console.log('[SW] Fetching from network:', request.url);
        return fetch(request)
          .then((response) => {
            // Cache successful responses
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', request.url, error);
            // If navigation request fails and not in cache, return index.html from cache
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            throw error;
          });
      })
  );
});
