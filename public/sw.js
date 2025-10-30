const CACHE_NAME = 'bso-portal-cache-v3';
const RUNTIME_CACHE = 'bso-portal-runtime-v3';

// Install event - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
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
        return fetch(request).then((response) => {
          // Cache CDN assets for offline use
          if (response && response.status === 200) {
            return caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, response.clone());
              return response;
            });
          }
          return response;
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
