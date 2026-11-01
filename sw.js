const CACHE_PREFIX = 'conges-pwa-cache-';
const CACHE_NAME = `${CACHE_PREFIX}v13`; // Incrémenter la version met à jour le cache de l'application
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
  // Pas de rechargement forcé des clients actifs pendant une saisie
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Ignorer les requêtes vers l'API Google Sheets pour qu'elles passent toujours par le réseau
  if (event.request.url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retourne la version en cache si elle existe, sinon fait la requête réseau
        return response || fetch(event.request).then(fetchRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchRes.clone());
            return fetchRes;
          });
        });
      }).catch(() => {
        // En cas de coupure totale (hors ligne), renvoyer index.html pour les navigations
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});
