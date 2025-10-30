const CACHE_NAME = 'bso-portal-cache-v6';
const RUNTIME_CACHE = 'bso-portal-runtime-v6';

const PRECACHE_CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json'
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

  try {
    const response = await fetch('/manifest.json', { cache: 'no-store' });
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
    }
  } catch (error) {
    console.warn('[SW] Unable to fetch build manifest for precache:', error);
  }

  for (const url of assetsToCache) {
    try {
      await cache.add(new Request(url, { cache: 'reload' }));
      console.log('[SW] Precached asset:', url);
    } catch (error) {
      console.warn('[SW] Failed to precache asset:', url, error);
    }
  }
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

  event.respondWith(
    caches.match(request, { ignoreSearch: true })
      .then((cachedResponse) => {
        if (cachedResponse) {
          fetch(request)
            .then((response) => {
              if (response && response.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, response));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch((error) => {
            console.error('[SW] Fetch failed:', request.url, error);
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            return caches.match(request, { ignoreSearch: true });
          });
      })
  );
});
