const CACHE_VERSION = 'v12';
const CACHE_NAME = `bso-portal-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE = `bso-portal-runtime-${CACHE_VERSION}`;

console.log(`[SW] Service Worker ${CACHE_VERSION} loading...`);

// ====== INSTALLATION: PRE-CACHE ALL ASSETS ======
self.addEventListener('install', (event) => {
  console.log(`[SW] Installing ${CACHE_VERSION}...`);

  // Force immediate activation
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Always cache these core files
      const coreFiles = ['/', '/index.html', '/manifest.webmanifest'];

      console.log('[SW] Caching core files...');
      await Promise.allSettled(
        coreFiles.map(url =>
          cache.add(url)
            .then(() => console.log(`[SW] ✓ Cached: ${url}`))
            .catch(err => console.error(`[SW] ✗ Failed to cache: ${url}`, err))
        )
      );

      // Try to load and cache ALL assets from Vite manifest
      try {
        const manifestResponse = await fetch('/.vite/manifest.json');
        if (manifestResponse.ok) {
          const manifest = await manifestResponse.json();
          console.log('[SW] Manifest loaded:', manifest);

          // Collect ALL files from manifest
          const allFiles = new Set();

          Object.values(manifest).forEach((entry) => {
            if (entry.file) {
              // entry.file is like "assets/index-xxx.js", we need to add "/" prefix
              const url = entry.file.startsWith('/') ? entry.file : `/${entry.file}`;
              allFiles.add(url);
              console.log('[SW] Adding to cache:', url);
            }
            if (entry.css) {
              entry.css.forEach(css => {
                const url = css.startsWith('/') ? css : `/${css}`;
                allFiles.add(url);
                console.log('[SW] Adding CSS to cache:', url);
              });
            }
            if (entry.assets) {
              entry.assets.forEach(asset => {
                const url = asset.startsWith('/') ? asset : `/${asset}`;
                allFiles.add(url);
                console.log('[SW] Adding asset to cache:', url);
              });
            }
          });

          console.log(`[SW] Found ${allFiles.size} assets in manifest, caching...`);

          // Cache ALL assets
          const cachePromises = Array.from(allFiles).map(url =>
            cache.add(url)
              .then(() => {
                console.log(`[SW] ✓ Cached: ${url}`);
                return url;
              })
              .catch(err => {
                console.error(`[SW] ✗ Failed to cache: ${url}`, err);
                return null;
              })
          );

          const results = await Promise.allSettled(cachePromises);
          const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
          console.log(`[SW] Precache complete: ${successful}/${allFiles.size} assets cached`);
        } else {
          console.warn('[SW] Manifest not found, using runtime caching only');
        }
      } catch (error) {
        console.error('[SW] Failed to load manifest:', error);
      }
    })()
  );
});

// ====== ACTIVATION: CLEANUP OLD CACHES ======
self.addEventListener('activate', (event) => {
  console.log(`[SW] Activating ${CACHE_VERSION}...`);

  event.waitUntil(
    (async () => {
      // Delete all old caches
      const cacheNames = await caches.keys();
      const currentCaches = [CACHE_NAME, RUNTIME_CACHE];

      await Promise.all(
        cacheNames.map(cacheName => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );

      // Take control of all clients immediately
      await self.clients.claim();
      console.log('[SW] Service worker activated and controlling all clients');
    })()
  );
});

// ====== FETCH: CACHE-FIRST STRATEGY ======
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions and non-http(s)
  if (!request.url.startsWith('http')) {
    return;
  }

  // Skip Vite HMR (dev mode only)
  if (url.pathname.includes('@vite') ||
      url.pathname.includes('__vite') ||
      url.search.includes('import') ||
      url.search.includes('t=')) {
    return;
  }

  // Skip Supabase API calls - let them fail fast
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // CACHE-FIRST STRATEGY FOR EVERYTHING ELSE
  event.respondWith(
    (async () => {
      try {
        // 1. Try cache FIRST (ignoring query strings for flexibility)
        const cachedResponse = await caches.match(request, {
          ignoreSearch: true,
          ignoreVary: true
        });

        if (cachedResponse) {
          console.log(`[SW] 🎯 CACHE HIT: ${url.pathname}`);
          return cachedResponse;
        }

        // 2. Not in cache, try network
        console.log(`[SW] 📡 CACHE MISS - Fetching: ${url.pathname}`);

        const networkResponse = await fetch(request, {
          cache: 'no-cache'
        });

        // 3. Cache successful responses
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(
            url.origin === self.location.origin ? CACHE_NAME : RUNTIME_CACHE
          );

          // Clone response before caching
          cache.put(request, networkResponse.clone());
          console.log(`[SW] 💾 CACHED: ${url.pathname}`);
        }

        return networkResponse;

      } catch (error) {
        // 4. Network failed, try cache again (without ignoreSearch)
        console.error(`[SW] ❌ FETCH FAILED: ${url.pathname}`, error.message);

        const fallbackCache = await caches.match(request);
        if (fallbackCache) {
          console.log(`[SW] 🔄 Serving from cache after network failure: ${url.pathname}`);
          return fallbackCache;
        }

        // 5. If navigation, serve index.html from cache
        if (request.mode === 'navigate') {
          const indexCache = await caches.match('/index.html');
          if (indexCache) {
            console.log('[SW] 🏠 Serving cached index.html for navigation');
            return indexCache;
          }
        }

        // 6. Last resort: return error response
        return new Response(
          JSON.stringify({
            error: 'Offline',
            message: 'Cette ressource n\'est pas disponible hors ligne',
            url: url.pathname
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    })()
  );
});

// ====== MESSAGE HANDLER ======
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skipping waiting...');
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    console.log(`[SW] Manual cache request for ${urls.length} URLs`);

    caches.open(CACHE_NAME).then(cache => {
      urls.forEach(url => {
        cache.add(url)
          .then(() => console.log(`[SW] ✓ Manually cached: ${url}`))
          .catch(err => console.warn(`[SW] ✗ Failed to manually cache: ${url}`, err));
      });
    });
  }

  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    caches.open(CACHE_NAME).then(cache => {
      cache.keys().then(keys => {
        event.ports[0].postMessage({
          cacheVersion: CACHE_VERSION,
          cachedUrls: keys.map(k => k.url),
          count: keys.length
        });
      });
    });
  }
});

console.log(`[SW] Service Worker ${CACHE_VERSION} loaded and ready!`);
