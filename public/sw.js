// BSO Portal Service Worker - Dynamic Cache Strategy
// Version: v13
const CACHE_NAME = 'bso-portal-dynamic-cache-v13';

console.log('[SW] BSO Portal Service Worker v13 loading...');

// ====== INSTALLATION ======
self.addEventListener('install', (event) => {
  console.log('[SW] Installation du Service Worker v13...');

  // Active immédiatement le SW
  self.skipWaiting();

  // Pré-cache seulement les fichiers critiques
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pré-cache des fichiers critiques...');
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.webmanifest'
      ]).catch(err => {
        console.warn('[SW] Erreur pré-cache:', err);
      });
    })
  );
});

// ====== ACTIVATION ======
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation du Service Worker v13...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Ancien cache supprimé:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service Worker activé et prêt');
      return self.clients.claim();
    })
  );
});

// ====== INTERCEPTION DES REQUÊTES (Dynamic Caching) ======
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore les requêtes non-GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignore les requêtes non-HTTP(S)
  if (!request.url.startsWith('http')) {
    return;
  }

  // Ignore les hot reload de Vite en dev
  if (url.pathname.includes('@vite') ||
      url.pathname.includes('__vite') ||
      url.search.includes('import') ||
      url.search.includes('t=')) {
    return;
  }

  // Ignore les appels API Supabase
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // STRATÉGIE: Cache-First avec fallback réseau et mise en cache dynamique
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Retourne la réponse depuis le cache si elle existe
        console.log('[SW] 🎯 Cache hit:', url.pathname);
        return cachedResponse;
      }

      // Sinon, récupère la ressource depuis le réseau
      console.log('[SW] 📡 Fetching:', url.pathname);
      return fetch(request)
        .then((networkResponse) => {
          // Vérifie que la réponse est valide
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          // Met en cache la nouvelle ressource
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
            console.log('[SW] 💾 Cached:', url.pathname);
          });

          return networkResponse;
        })
        .catch((error) => {
          console.error('[SW] ❌ Fetch failed:', url.pathname, error.message);

          // Si c'est une navigation (chargement de page), essaie de servir index.html
          if (request.mode === 'navigate') {
            return caches.match('/index.html').then(response => {
              if (response) {
                console.log('[SW] 🏠 Serving cached index.html for navigation');
                return response;
              }
              return new Response('Application hors ligne', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
          }

          // Pour les autres ressources, retourne une erreur
          return new Response('Ressource non disponible hors ligne', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});

// ====== GESTION DES MESSAGES ======
self.addEventListener('message', (event) => {
  console.log('[SW] Message reçu:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_CACHE_STATUS') {
    caches.open(CACHE_NAME).then(cache => {
      cache.keys().then(keys => {
        const urls = keys.map(k => k.url);
        event.ports[0].postMessage({
          cacheVersion: CACHE_NAME,
          cachedUrls: urls,
          count: keys.length
        });
      });
    });
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
    });
  }
});

console.log('[SW] Service Worker v13 chargé et prêt!');
