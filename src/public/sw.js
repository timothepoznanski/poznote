/*
 * Poznote service worker.
 *
 * It sits next to index.php so its scope is the whole app (the previous one,
 * pwa/sw.js, only controlled /pwa/ and so never saw a page). Three jobs, and
 * nothing else goes through a cache: API calls, PHP fragments and uploads hit
 * the network exactly as without a service worker.
 *
 *  1. Static assets (js, css, images, fonts, and the concatenated bundles
 *     index_css.php / index_js.php / dark_mode_css.php): network first, the
 *     cached copy when the network fails.
 *  2. Page navigations: always the network. When the server cannot be reached
 *     (no connection, or a reverse proxy answering 502/503/504), the offline
 *     page (offline.php, stored by js/offline-sync.js) is served in its place:
 *     opening Poznote without a network shows the notes kept on the device.
 *  3. Note attachments (api/v1/notes/{id}/attachments/{id}): network first,
 *     then the pictures js/offline-sync.js keeps for the offline notes.
 *
 * The cache names are shared with js/offline-store.js.
 */
const STATIC_CACHE = 'poznote-static-v5';
const SHELL_CACHE = 'poznote-offline-shell';
const MEDIA_CACHE_PREFIX = 'poznote-offline-media-';
const STATIC_ASSET_PATTERN = /(?:\.(?:css|js|png|svg|ico|woff2?|ttf)|\/(?:index_css|index_js|dark_mode_css)\.php)$/i;
const ATTACHMENT_PATTERN = /\/api\/v1\/notes\/\d+\/attachments\/[^/]+$/;

// Navigations that must never be answered by the offline page: the SSO round
// trip only makes sense with the server. A logout that cannot reach the
// server does get the offline page, which signs out on the device
// (js/offline-app.js) and has the server session closed later.
const NO_FALLBACK_PAGES = ['oidc_login.php', 'oidc_callback.php'];

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name !== STATIC_CACHE && name !== SHELL_CACHE && !name.startsWith(MEDIA_CACHE_PREFIX))
        .map((name) => caches.delete(name))
    );

    // Lets the browser start the page request while the worker boots.
    if (self.registration.navigationPreload) {
      try {
        await self.registration.navigationPreload.enable();
      } catch (e) {
        // Not supported everywhere; navigations simply wait for the worker.
      }
    }

    await self.clients.claim();
  })());
});

// The asset an URL names, whatever its version: path and query string
// without the ?v= cache buster (index_css.php?group=core and ?group=modals
// are two different assets).
function assetIdentity(url) {
  const params = new URLSearchParams(url.search);
  params.delete('v');
  params.delete('m');
  return url.pathname + '?' + params.toString();
}

// Remove cached entries of the same asset from an earlier release.
async function dropOtherVersions(cache, url) {
  const identity = assetIdentity(url);
  const keys = await cache.keys();
  await Promise.all(keys.map((request) => {
    const cachedUrl = new URL(request.url);
    if (cachedUrl.search !== url.search && assetIdentity(cachedUrl) === identity) {
      return cache.delete(request);
    }
    return null;
  }));
}

async function handleStaticAsset(request, requestUrl) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Assets are versioned with a ?v= query string, so each release stores
      // a brand-new entry. Drop the other versions of the same path first,
      // otherwise the cache keeps every build ever fetched.
      await dropOtherVersions(cache, requestUrl);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request)
      // The offline page's own assets live in the shell cache.
      || await caches.match(request, { cacheName: SHELL_CACHE });
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// The offline page loads its assets with URLs relative to the app root, so
// it can only stand in for a page of that directory. A deeper one (admin/,
// a pretty share URL) is sent to index.php, which gets the offline page.
async function offlineShellResponse(requestUrl) {
  try {
    const cache = await caches.open(SHELL_CACHE);
    const shell = await cache.match(scopeUrl('offline.php'));
    if (!shell) {
      return undefined;
    }
    const relativePath = requestUrl.href.slice(self.registration.scope.length).split(/[?#]/)[0];
    if (!requestUrl.href.startsWith(self.registration.scope) || relativePath.includes('/')) {
      return Response.redirect(scopeUrl('index.php'), 302);
    }
    return shell;
  } catch (e) {
    return undefined;
  }
}

// The response of a navigation: the preloaded one when the browser started
// it (navigation preload), the network otherwise. Every navigation is answered
// from here, even the ones without fallback, so the page is never requested
// twice (a preload the worker ignores is a second request to the server).
async function networkResponse(event) {
  const preloaded = await event.preloadResponse;
  if (preloaded) {
    // Firefox settles a preload that could not reach the server with an
    // error response instead of rejecting: that is a network failure too.
    if (preloaded.type === 'error') {
      throw new TypeError('Navigation preload failed');
    }
    return preloaded;
  }
  return fetch(event.request);
}

async function handleNavigation(event, allowFallback) {
  if (!allowFallback) {
    return networkResponse(event);
  }
  try {
    const response = await networkResponse(event);
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      const shell = await offlineShellResponse(new URL(event.request.url));
      if (shell) {
        return shell;
      }
    }
    return response;
  } catch (error) {
    const shell = await offlineShellResponse(new URL(event.request.url));
    if (shell) {
      return shell;
    }
    throw error;
  }
}

async function cachedAttachment(request) {
  const cacheNames = (await caches.keys()).filter((name) => name.startsWith(MEDIA_CACHE_PREFIX));
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const cachedResponse = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }
  }
  return undefined;
}

// Network first. The kept copy also stands in when the server answers but
// cannot serve the file right now: session expired while offline (401), or
// the server itself failing (5xx). A missing file (404) is not papered over.
async function handleAttachment(event) {
  const request = event.request;
  let response;
  try {
    response = await (request.mode === 'navigate' ? networkResponse(event) : fetch(request));
  } catch (error) {
    const cachedResponse = await cachedAttachment(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
  if (response.status === 401 || response.status >= 500) {
    const cachedResponse = await cachedAttachment(request);
    if (cachedResponse) {
      return cachedResponse;
    }
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.method === 'GET' && ATTACHMENT_PATTERN.test(requestUrl.pathname)) {
    event.respondWith(handleAttachment(event));
    return;
  }

  if (request.mode === 'navigate') {
    const page = requestUrl.pathname.split('/').pop();
    // Only a top-level page: an iframe (audio player, embed) must not turn
    // into a second copy of the offline page.
    const allowFallback = request.destination === 'document'
      && !NO_FALLBACK_PAGES.includes(page)
      && !requestUrl.pathname.includes('/api/');
    event.respondWith(handleNavigation(event, allowFallback));
    return;
  }

  if (request.method === 'GET' && STATIC_ASSET_PATTERN.test(requestUrl.pathname)) {
    event.respondWith(handleStaticAsset(request, requestUrl));
  }
});
