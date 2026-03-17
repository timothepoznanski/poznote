const APP_CACHE = 'poznote-static-v4.19.3';
const STATIC_ASSET_PATTERN = /\.(?:css|js|png|svg|ico|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== APP_CACHE)
        .map((cacheName) => caches.delete(cacheName))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (!STATIC_ASSET_PATTERN.test(requestUrl.pathname)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse.ok) {
        cache.put(event.request, networkResponse.clone());
      }

      return networkResponse;
    } catch (error) {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      throw error;
    }
  })());
});