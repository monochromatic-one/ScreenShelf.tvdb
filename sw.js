/* ScreenShelf — Service Worker */
const CACHE_NAME = 'screenshelf-v30';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install — precache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache TVDB API — network only
  if (url.hostname === 'api4.thetvdb.com') {
    return; // let browser handle normally (no intercept)
  }

  // For navigation requests (HTML) — network-first, fallback to cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          // Update cache with fresh index.html
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy)).catch(()=>{});
          caches.open(CACHE_NAME).then((c) => c.put('./', copy.clone())).catch(()=>{});
          return res;
        })
        .catch(() => caches.match('./index.html').then((c) => c || caches.match('./')))
    );
    return;
  }

  // For same-origin static assets — cache-first, network fallback + cache update (stale-while-revalidate)
  if (url.origin === location.origin) {
    // Skip non-GET or chrome-extension etc
    if (req.method !== 'GET') return;

    // Don't cache service worker itself
    if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('sw.js')) return;

    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            // Only cache successful, same-origin, basic/opaque? Check ok
            if (networkRes && networkRes.status === 200) {
              const resClone = networkRes.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, resClone)).catch(()=>{});
            }
            return networkRes;
          })
          .catch(() => cached); // if network fails, use cached

        // Return cached immediately if available (stale-while-revalidate), else wait for network
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Cross-origin (fonts, images) — stale-while-revalidate
  if (req.method === 'GET' && (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'artworks.thetvdb.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetched = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(()=>{});
          }
          return res;
        }).catch(()=> cached);
        return cached || fetched;
      })
    );
    return;
  }

  // Default: network-first
});
