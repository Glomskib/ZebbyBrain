const CACHE_VERSION = 'zebby-v3'; // bump on deploys
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/offline.html'
  // vite will add hashed assets at build, keep this list small and stable
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Failed to cache some assets', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Navigation fallback only; NEVER cache API
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // never touch API or external
  if (url.pathname.startsWith('/api/')) return;
  if (req.method !== 'GET') return;

  // handle navigation requests (SPA routes)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/offline.html'))
    );
    return;
  }
  
  // pass-through for other GETs (Vite hashed assets are fine)
});
