const CACHE_NAME = 'bso-portal-cache-v10';
const RUNTIME_CACHE = 'bso-portal-runtime-v10';

// Core assets that MUST work offline
const PRECACHE_CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

// Helper to determine if we're in production (built files)
const isProduction = () => {
  return self.location.hostname !== 'localhost' && !self.location.hostname.startsWith('192.168');
};

const addAssetToSet = (set, assetPath) => {
  if (!assetPath || typeof assetPath !== 'string') {
    return;
  }
  const normalized = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  set.add(normalized);
};

const precacheFromManifest = async (cache) => {
  const assetsToCache = new Set(PRECACHE_CORE_ASSETS);

  // Only try to load Vite manifest in production
  if (isProduction()) {
    try {
      const response = await fetch('/.vite/manifest.json', { cache: 'no-store' });
      if (response.ok) {
        const manifest = await response.json();
        Object.values(manifest).forEach((entry) => {
          if (!entry) return;
          addAssetToSet(assetsToCache, entry.file);
          if (Array.isArray(entry.css)) {
            entry.css.forEach((cssFile) => addAssetToSet(assetsToCache, cssFile));
          }
          if (Array.isArray(entry.assets)) {
            entry.assets.forEach((asset) => addAssetToSet(assetsToCache, asset));
          }
          if (Array.isArray(entry.imports)) {
            entry.imports.forEach((imp) => {
              // Find the imported module in the manifest
              const importedEntry = Object.values(manifest).find(e => e.name === imp || e.file === imp);
              if (importedEntry) {
                addAssetToSet(assetsToCache, importedEntry.file);
              }
            });
          }
        });
        console.log('[SW] Production: precaching', assetsToCache.size, 'assets from manifest');
      }
    } catch (error) {
      console.warn('[SW] Failed to load Vite manifest:', error);
    }
  } else {
    console.log('[SW] Dev mode: using runtime caching strategy');
  }

  // Precache all discovered assets
  const results = await Promise.allSettled(
    Array.from(assetsToCache).map((url) =>
      cache.add(new Request(url, { cache: 'reload' }))
        .then(() => {
          console.log('[SW] ✓ Precached:', url);
          return url;
        })
        .catch((error) => {
          console.warn('[SW] ✗ Failed to precache:', url, error);
          return null;
        })
    )
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
  console.log(`[SW] Precache complete: ${successful}/${assetsToCache.size} assets cached`);
};

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v10...');
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => precacheFromManifest(cache)));
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v10...');
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      ))
      .then(() => {
        console.log('[SW] Service worker activated and claiming clients');
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and non-http(s) requests
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  // Skip Vite HMR and special dev requests
  if (!isProduction()) {
    if (url.pathname.includes('@vite') ||
        url.pathname.includes('__vite') ||
        url.pathname.includes('.vite') ||
        url.search.includes('import') ||
        url.search.includes('t=')) {
      return; // Let browser handle it normally
    }
  }

  // Skip Supabase API calls - let them fail fast offline
  if (url.hostname.includes('supabase')) {
    return; // Don't cache API calls
  }

  // Handle external origins (CDN, fonts, etc.)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] 🎯 CDN cache hit:', url.href);
          return cachedResponse;
        }
        return fetch(request, { cache: 'no-cache' })
          .then((response) => {
            // Cache successful responses from CDNs
            if (response && response.ok) {
              const responseClone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => {
                cache.put(request, responseClone);
                console.log('[SW] 💾 Cached CDN resource:', url.href);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] ❌ CDN fetch failed (offline?):', url.href);
            // Return cached version if available
            return caches.match(request);
          });
      })
    );
    return;
  }

  // Handle same-origin requests with Cache-First strategy
  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then((cachedResponse) => {
        if (cachedResponse) {
          console.log('[SW] 🎯 Cache hit:', url.pathname);
          return cachedResponse;
        }

        console.log('[SW] 📡 Cache miss, fetching:', url.pathname);
        return fetch(request, { cache: 'no-cache' })
          .then((response) => {
            // Only cache successful responses
            if (response && response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
                console.log('[SW] 💾 Cached:', url.pathname);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] ❌ Fetch failed (offline?):', url.pathname);

            // If navigation request fails, try to serve cached index.html
            if (request.mode === 'navigate') {
              console.log('[SW] 🔄 Serving cached index.html for navigation');
              return caches.match('/index.html');
            }

            // Try to serve from cache without ignoreSearch
            return caches.match(request).then(cached => {
              if (cached) return cached;

              // Return a basic offline page for failed requests
              return new Response('Offline - Resource not available', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'text/plain'
                })
              });
            });
          });
      })
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }

  // Allow app to trigger a cache refresh
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(CACHE_NAME).then(cache => {
      urls.forEach(url => {
        cache.add(url).then(() => {
          console.log('[SW] 💾 Manually cached:', url);
        }).catch(err => {
          console.warn('[SW] Failed to manually cache:', url, err);
        });
      });
    });
  }
});
