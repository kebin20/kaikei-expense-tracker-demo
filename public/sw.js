// Replaced by the production build with a content-addressed cache and asset graph.
const CACHE_NAME = 'kaikei-shell-v40';
const APP_ENTRY = '__KAIKEI_APP_ENTRY__';
const PRECACHE_ASSETS = [];
const NAVIGATION_CACHE_KEY = '/__kaikei-latest-page';
const OFFLINE_URL = '/offline.html';
const SHELL = [OFFLINE_URL, '/favicon.ico?v=21', '/favicon-32x32-v21.png'];
const isShellCache = (key) => key.startsWith('kaikei-shell-');

async function cacheAsset(cache, path) {
  if (await cache.match(path)) return;
  const response = await fetch(path, {
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-cache',
  });
  const type = response.headers.get('content-type') || '';
  if (
    !response.ok ||
    (path.endsWith('.js') && !/(?:javascript|ecmascript)/i.test(type)) ||
    (path.endsWith('.css') && !/text\/css/i.test(type))
  )
    throw new Error('The replacement app files are not ready.');
  await cache.put(path, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // A failed install leaves the previous worker and its files intact.
      await Promise.all(
        [...SHELL, ...PRECACHE_ASSETS].map((path) => cacheAsset(cache, path)),
      );
      // Stage the matching document too, so the first reopen after an update
      // does not need a second refresh to find the new interface.
      await stageCurrentPage(await fetchCurrentPage('/'), false);
      if (!(await cache.match(NAVIGATION_CACHE_KEY)))
        throw new Error('The replacement app page is not ready.');
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Retain the previous offline page while this version has no page.
      if ('navigationPreload' in self.registration)
        await self.registration.navigationPreload
          .enable()
          .catch(() => undefined);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

async function pruneOldShells() {
  // Other tabs may still need older lazy chunks. Always retain one previous shell.
  if (
    (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .length > 1
  )
    return;
  const previous = (await caches.keys()).filter(
    (key) => isShellCache(key) && key !== CACHE_NAME,
  );
  let keep;
  for (const key of [...previous].reverse()) {
    if (await (await caches.open(key)).match(NAVIGATION_CACHE_KEY)) {
      keep = key;
      break;
    }
  }
  // A partial cache from a failed install is not a working rollback version.
  await Promise.all(
    previous.filter((key) => key !== keep).map((key) => caches.delete(key)),
  );
}

async function fetchCurrentPage(request, preloadResponse) {
  try {
    return (
      (await Promise.resolve(preloadResponse).catch(() => null)) ||
      (await fetch(request))
    );
  } catch {
    return null;
  }
}

async function stageCurrentPage(response, prune = true) {
  try {
    if (
      response &&
      response.ok &&
      !response.redirected &&
      /text\/html/i.test(response.headers.get('content-type') || '')
    ) {
      // Clone before returning/consuming the network body. The caller may have
      // finished reading it by the time background assets finish warming.
      const stagedResponse = response.clone();
      const html = await stagedResponse.clone().text();
      // Do not cache sign-in/error HTML or a different deployment's entry point.
      if (APP_ENTRY === '__KAIKEI_APP_ENTRY__' || !html.includes(APP_ENTRY))
        return;
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(PRECACHE_ASSETS.map((path) => cacheAsset(cache, path)));
      await cache.put(NAVIGATION_CACHE_KEY, stagedResponse);
      if (prune) await pruneOldShells();
    }
  } catch {
    // Keep the previous complete shell if asset/cache staging fails.
  }
}

async function loadCachedNavigation() {
  const complete = async (page, cache) => {
    if (!page) return false;
    const html = await page.clone().text();
    const paths = [
      ...html.matchAll(
        /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi,
      ),
    ]
      .map((match) => new URL(match[1], self.location.origin))
      .filter(
        (url) =>
          url.origin === self.location.origin &&
          url.pathname.startsWith('/_next/static/') &&
          /\.(?:js|css)$/.test(url.pathname),
      );
    if (!paths.length) return false;
    // Validate only referenced entry files, without enumerating every asset or
    // old cache. Never memoize availability: iOS may evict cached files later.
    const present = await Promise.all(
      paths.map((url) => cache.match(url.href)),
    );
    return present.every(Boolean);
  };
  const currentCache = await caches.open(CACHE_NAME);
  const page = await currentCache.match(NAVIGATION_CACHE_KEY);
  if (await complete(page, currentCache)) return page;
  const previous = (await caches.keys())
    .filter((key) => isShellCache(key) && key !== CACHE_NAME)
    .reverse();
  for (const key of previous) {
    const cache = await caches.open(key);
    const cached = await cache.match(NAVIGATION_CACHE_KEY);
    if (await complete(cached, cache)) return cached;
  }
  return null;
}

async function loadOfflinePage() {
  const currentCache = await caches.open(CACHE_NAME);
  return (await currentCache.match(OFFLINE_URL)) || Response.error();
}

async function loadCurrentPage(networkResponse) {
  const cached = await loadCachedNavigation().catch(() => null);
  if (!cached) return (await networkResponse) || loadOfflinePage();
  return cached;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // RSC requests/other documents must not receive the root app shell.
    if (url.pathname !== '/') return;
    const recovering = url.searchParams.has('kaikei-recover');
    const networkResponse = fetchCurrentPage(
      recovering ? new Request(request, { cache: 'reload' }) : request,
      event.preloadResponse,
    );
    // Lifetime is registered synchronously. A missing-cache launch returns HTML
    // immediately; only committing the next offline shell waits for lazy files.
    event.waitUntil(
      networkResponse.then((response) => stageCurrentPage(response)),
    );
    event.respondWith(
      recovering
        ? networkResponse.then(
            (response) => response || loadCurrentPage(Promise.resolve(null)),
          )
        : loadCurrentPage(networkResponse),
    );
    return;
  }

  if (!/\.(?:js|css|png|webp|avif|svg|ico|woff2)$/.test(url.pathname)) return;
  const resource = caches
    .match(request)
    .catch(() => null)
    .then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        if (response.status === 404 && /\.(?:js|css)$/.test(url.pathname)) {
          const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          clients.forEach((client) =>
            client.postMessage?.({ type: 'KAIKEI_ASSET_MISSING' }),
          );
        }
        if (
          response.ok &&
          !response.redirected &&
          !/text\/html/i.test(response.headers.get('content-type') || '')
        ) {
          await (
            await caches.open(CACHE_NAME)
          )
            .put(request, response.clone())
            .catch(() => undefined);
        }
        return response;
      });
    });
  event.waitUntil(resource.then(() => undefined).catch(() => undefined));
  event.respondWith(resource);
});
