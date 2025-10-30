const CACHE_NAME = 'bso-portal-cache-v7';
const RUNTIME_CACHE = 'bso-portal-runtime-v7';

// Assets critiques à mettre en cache lors de l'installation
const PRECACHE_CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest'
];

const addAssetToSet = (set, assetPath) => {
  if (!assetPath || typeof assetPath !== 'string') {
    return;
  }
  const normalized = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  set.add(normalized);
};

const precacheFromManifest = async (cache) => {
  const assetsToCache = new Set(PRECACHE_CORE_ASSETS);

  // Essayer de charger .vite/manifest.json (généré par Vite en production)
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
      });
      console.log('[SW] Vite manifest loaded, found', assetsToCache.size, 'assets to precache');
    }
  } catch (error) {
    console.warn('[SW] No Vite manifest found (dev mode?), will cache dynamically:', error);
  }

  // Precache tous les assets découverts
  const cachePromises = [];
  for (const url of assetsToCache) {
    const cacheRequest = cache.add(new Request(url, { cache: 'reload' }))
      .then(() => console.log('[SW] ✓ Precached:', url))
      .catch((error) => console.warn('[SW] ✗ Failed to precache:', url, error));
    cachePromises.push(cacheRequest);
  }

  await Promise.allSettled(cachePromises);
  console.log('[SW] Precache complete!');
};

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v6...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => precacheFromManifest(cache))
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
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
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request)
          .then((response) => {
            if (response && (response.status === 200 || response.status === 0)) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] CDN fetch failed:', request.url, error);
            return caches.match(request);
          });
      })
    );
    return;
  }

  // STRATÉGIE CACHE-FIRST PURE : toujours servir depuis le cache si disponible
  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then((cachedResponse) => {
        // Si en cache, retourner IMMÉDIATEMENT sans fetch
        if (cachedResponse) {
          console.log('[SW] 🎯 Cache hit:', request.url);
          return cachedResponse;
        }

        // Pas en cache : fetch depuis le réseau ET mettre en cache
        console.log('[SW] 📡 Cache miss, fetching:', request.url);
        return fetch(request)
          .then((response) => {
            // Mettre en cache seulement les réponses valides
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
                console.log('[SW] 💾 Cached:', request.url);
              });
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] ❌ Fetch failed:', request.url, error);
            // Si navigation échoue, tenter de retourner l'index.html en cache
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return caches.match(request, { ignoreSearch: true });
          });
      })
  );
});
