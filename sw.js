const CACHE_PREFIX = 'conges-pwa-cache-';
const CACHE_NAME = `${CACHE_PREFIX}v21`; // Incrémenter la version met à jour le cache de l'application
const URLS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './engine.js',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(URLS_TO_CACHE);
      })
  );
  // Active le nouveau Service Worker sans forcer de location.reload() sur la page en cours
  if (typeof self.skipWaiting === 'function') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    }).then(() => {
      if (self.clients && typeof self.clients.claim === 'function') {
        return self.clients.claim();
      }
    })
  );
});

self.addEventListener('fetch', event => {
  // Ignorer les requêtes vers l'API Google Sheets pour qu'elles passent toujours par le réseau
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  // Stratégie Network-First avec repli sur le cache hors-ligne :
  // garantit que les mises à jour d'interface sont visibles dès le rafraîchissement en ligne.
  event.respondWith(
    fetch(event.request)
      .then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      })
      .catch(() => {
        return caches.match(event.request).then(cachedRes => {
          if (cachedRes) return cachedRes;
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
