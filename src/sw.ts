/// <reference lib="WebWorker" />
/* eslint-disable no-restricted-globals */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, setDefaultHandler, setCatchHandler } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// 1) Activer SW immédiatement
self.skipWaiting();
clientsClaim();

// 2) Precache (injecté par Vite/Workbox à build)
precacheAndRoute(self.__WB_MANIFEST || []);

// 3) Navigation fallback pour SPA (offline)
const handler = createHandlerBoundToURL('/index.html');
registerRoute(
  ({ request, url }) => request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
  async (args) => {
    try {
      // Network first pour index.html (mise à jour quand on est en ligne)
      return await new NetworkFirst({ cacheName: 'html' }).handle(args);
    } catch {
      // Fallback SPA offline
      return handler(args);
    }
  }
);

// 4) Static assets "offline-first" (build Vite) => CacheFirst
registerRoute(
  ({ request, url }) =>
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker' ||
    (request.destination === 'document' && url.pathname.endsWith('.html')),
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, purgeOnQuotaError: true })
    ]
  })
);

// 5) Images/icônes (locales + CDN) => CacheFirst + expiration
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({ maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

// 6) Fonts (Google Fonts ou autres CDNs) => StaleWhileRevalidate
registerRoute(
  ({ url, request }) =>
    request.destination === 'font' || url.hostname.includes('fonts.gstatic.com'),
  new StaleWhileRevalidate({ cacheName: 'fonts' })
);

// 7) Appels Supabase API et endpoints externes:
// NE PAS INTERCEPTER ! Laisser le navigateur effectuer directement les requêtes fetch natives vers Supabase (Auth, REST, RPC, Edge Functions).

// 8) Catch global : si erreur offline sur navigation HTML -> retourner index.html pour navigation SPA
setCatchHandler(async ({ event }) => {
  const request = (event as FetchEvent).request;
  if (request.destination === 'document' || request.mode === 'navigate') {
    return handler({ request: new Request('/index.html') } as any);
  }
  return Response.error();
});

console.log('[SW] BSO Portal Service Worker (Workbox) activé!');

