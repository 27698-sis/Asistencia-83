/**
 * sw.js — Service Worker CEM N°83
 * Soporte offline + caché de assets
 */

const CACHE_NAME = 'cem83-v1.0.1';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/db.js',
  './js/app.js',
  './js/export.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@300;400;500;600&display=swap'
];

/* ---- INSTALL: cachear assets ---- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Cacheando assets...');
      return cache.addAll(ASSETS.map(url => {
        // Para Google Fonts usamos no-cors
        if (url.startsWith('https://fonts.googleapis.com')) {
          return new Request(url, { mode: 'no-cors' });
        }
        return url;
      })).catch(err => {
        console.warn('[SW] Error al cachear algunos assets:', err);
      });
    })
  );
  self.skipWaiting();
});

/* ---- ACTIVATE: limpiar caches viejos ---- */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] Eliminando caché viejo:', key);
              return caches.delete(key);
            })
      )
    )
  );
  self.clients.claim();
});

/* ---- FETCH: cache-first para assets, network-first para el resto ---- */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejar GET
  if (request.method !== 'GET') return;

  // Para assets locales: cache-first
  if (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Fallback: si es navegación, devolver index.html
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
    return;
  }
});

/* ---- MENSAJE: forzar actualización ---- */
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
