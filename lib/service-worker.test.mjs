import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (
  await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
)
  .replace(
    "const APP_ENTRY = '__KAIKEI_APP_ENTRY__';",
    "const APP_ENTRY = '/_next/static/chunks/entry.js';",
  )
  .replace(
    'const PRECACHE_ASSETS = [];',
    "const PRECACHE_ASSETS = ['/_next/static/chunks/entry.js', '/_next/static/chunks/lazy.js'];",
  );
const origin = 'https://kaikei.test';
const page = () =>
  new Response('<script src="/_next/static/chunks/entry.js"></script>', {
    headers: { 'content-type': 'text/html' },
  });
function harness() {
  const handlers = {},
    stores = new Map();
  const key = (request) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href;
  let skipped = 0,
    clients = 1;
  const messages = [];
  let inventories = 0;
  const opened = [];
  const cacheApi = {
    keys: async () => {
      inventories++;
      return [...stores.keys()];
    },
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      opened.push(name);
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        keys: async () => [...data.keys()].map((url) => new Request(url)),
        match: async (request) => data.get(key(request))?.clone(),
        put: async (request, response) => {
          data.set(key(request), response.clone());
        },
      };
    },
    match: async (request) => {
      for (const data of stores.values())
        if (data.has(key(request))) return data.get(key(request)).clone();
    },
  };
  const runtime = {
    fetch: async (request) =>
      (typeof request === 'string' ? request : request.url).endsWith('/')
        ? page()
        : new Response('asset', {
            headers: { 'content-type': 'application/javascript' },
          }),
    caches: cacheApi,
    URL,
    Request,
    Response,
    self: {
      location: { origin },
      registration: { navigationPreload: { enable: async () => {} } },
      clients: {
        claim: async () => {},
        matchAll: async () =>
          Array.from({ length: clients }, () => ({
            postMessage: (value) => messages.push(value),
          })),
      },
      skipWaiting: async () => {
        skipped++;
      },
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
    },
  };
  vm.runInNewContext(source, runtime);
  function dispatch(name, request) {
    const waits = [];
    let response;
    handlers[name]({
      request,
      preloadResponse: Promise.resolve(undefined),
      waitUntil: (task) => waits.push(task),
      respondWith: (task) => {
        response = task;
      },
    });
    return { response, done: () => Promise.all(waits) };
  }
  const navigate = (search = '') => {
    const request = new Request(origin + '/' + search);
    Object.defineProperty(request, 'mode', { value: 'navigate' });
    return dispatch('fetch', request);
  };
  return {
    runtime,
    messages,
    opened,
    inventories: () => inventories,
    stores,
    cacheApi,
    dispatch,
    navigate,
    skipped: () => skipped,
    multipleClients: () => {
      clients = 2;
    },
  };
}
test('incomplete cached HTML is not served when referenced JS/CSS files are missing', async () => {
  const h = harness();
  const cache = await h.cacheApi.open('kaikei-shell-v39');
  await cache.put(
    '/__kaikei-latest-page',
    new Response('<script src="/_next/static/old.js"></script>'),
  );
  const event = h.navigate();
  assert.match(
    await (await Promise.resolve(event.response)).text(),
    /entry.js/,
  );
  await event.done();
});

test('a complete current shell is returned before network staging without inspecting older caches', async () => {
  const h = harness();
  const cache = await h.cacheApi.open('kaikei-shell-v40');
  await cache.put('/__kaikei-latest-page', page());
  await cache.put('/_next/static/chunks/entry.js', new Response('entry'));
  await h.cacheApi.open('kaikei-shell-v39');
  h.opened.length = 0;
  let release;
  h.runtime.fetch = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const event = h.navigate();
  assert.match(
    await (await Promise.resolve(event.response)).text(),
    /entry.js/,
  );
  assert.equal(h.inventories(), 0);
  assert.deepEqual(h.opened, ['kaikei-shell-v40']);
  release(
    new Response('sign in', { headers: { 'content-type': 'text/html' } }),
  );
  await event.done();
});

test('a later asset eviction is rechecked rather than hidden by memoized shell availability', async () => {
  const h = harness();
  const cache = await h.cacheApi.open('kaikei-shell-v40');
  await cache.put('/__kaikei-latest-page', page());
  await cache.put('/_next/static/chunks/entry.js', new Response('entry'));
  h.runtime.fetch = async () =>
    new Response('fresh network document', {
      headers: { 'content-type': 'text/html' },
    });
  const first = h.navigate();
  assert.match(
    await (await Promise.resolve(first.response)).text(),
    /entry.js/,
  );
  await first.done();
  h.stores
    .get('kaikei-shell-v40')
    .delete(origin + '/_next/static/chunks/entry.js');
  const second = h.navigate();
  assert.equal(
    await (await Promise.resolve(second.response)).text(),
    'fresh network document',
  );
  await second.done();
});
test('explicit matching-shell recovery bypasses cached HTML and requests a fresh document', async () => {
  const h = harness();
  const cache = await h.cacheApi.open('kaikei-shell-v40');
  await cache.put('/__kaikei-latest-page', page());
  await cache.put('/_next/static/chunks/entry.js', new Response('asset'));
  let requestedCache;
  h.runtime.fetch = async (request) => {
    if (request.url?.includes('kaikei-recover')) {
      requestedCache = request.cache;
      return new Response(
        '<script src="/_next/static/chunks/entry.js"></script>fresh',
        { headers: { 'content-type': 'text/html' } },
      );
    }
    return new Response('asset', {
      headers: { 'content-type': 'application/javascript' },
    });
  };
  const event = h.navigate('?kaikei-recover=1');
  assert.match(await (await Promise.resolve(event.response)).text(), /fresh/);
  assert.equal(requestedCache, 'reload');
  await event.done();
});
test('missing static assets notify open apps without deleting any device or shell storage', async () => {
  const h = harness();
  const cache = await h.cacheApi.open('kaikei-shell-v39');
  await cache.put('/retained.svg', new Response('retained'));
  h.runtime.fetch = async () => new Response('missing', { status: 404 });
  const event = h.dispatch(
    'fetch',
    new Request(origin + '/_next/static/missing.js'),
  );
  assert.equal((await Promise.resolve(event.response)).status, 404);
  await event.done();
  assert.deepEqual(JSON.parse(JSON.stringify(h.messages)), [
    { type: 'KAIKEI_ASSET_MISSING' },
  ]);
  assert.ok(await cache.match('/retained.svg'));
});
test('activation and offline launch retain a previous working shell', async () => {
  const h = harness();
  await (
    await h.cacheApi.open('kaikei-shell-v39')
  ).put('/__kaikei-latest-page', page());
  await (
    await h.cacheApi.open('kaikei-shell-v39')
  ).put('/_next/static/chunks/entry.js', new Response('entry'));
  h.runtime.fetch = async () => {
    throw new Error('offline');
  };
  await h.dispatch('activate').done();
  const launch = h.navigate();
  assert.match(
    await (await Promise.resolve(launch.response)).text(),
    /entry.js/,
  );
  await launch.done();
  assert.ok(h.stores.has('kaikei-shell-v39'));
});
test('failed precache cannot skip to a broken replacement or remove old assets', async () => {
  const h = harness();
  await h.cacheApi.open('kaikei-shell-v39');
  h.runtime.fetch = async () =>
    new Response('sign in', { headers: { 'content-type': 'text/html' } });
  await assert.rejects(h.dispatch('install').done());
  assert.equal(h.skipped(), 0);
  assert.ok(h.stores.has('kaikei-shell-v39'));
});
test('a replacement without matching app HTML cannot activate even with valid assets', async () => {
  const h = harness();
  await h.cacheApi.open('kaikei-shell-v39');
  h.runtime.fetch = async (request) =>
    request === '/'
      ? new Response('sign in', { headers: { 'content-type': 'text/html' } })
      : new Response('asset', {
          headers: { 'content-type': 'application/javascript' },
        });
  await assert.rejects(h.dispatch('install').done());
  assert.equal(h.skipped(), 0);
  assert.ok(h.stores.has('kaikei-shell-v39'));
});
test('successful replacement warms lazy chunks before committing HTML and keeps rollback shell', async () => {
  const h = harness();
  await h.cacheApi.open('kaikei-shell-v38');
  await (
    await h.cacheApi.open('kaikei-shell-v39')
  ).put('/__kaikei-latest-page', page());
  await h.dispatch('install').done();
  const launch = h.navigate();
  await Promise.resolve(launch.response);
  await launch.done();
  assert.equal(h.skipped(), 1);
  const cache = await h.cacheApi.open('kaikei-shell-v40');
  assert.ok(await cache.match('/_next/static/chunks/lazy.js'));
  assert.ok(await cache.match('/__kaikei-latest-page'));
  assert.ok(h.stores.has('kaikei-shell-v39'));
  assert.equal(h.stores.has('kaikei-shell-v38'), false);
});
test('sign-in HTML and other deployment HTML never replace the working page', async () => {
  for (const html of ['Sign in', '<script src="/other-build.js"></script>']) {
    const h = harness();
    const cache = await h.cacheApi.open('kaikei-shell-v40');
    await cache.put('/__kaikei-latest-page', page());
    h.runtime.fetch = async () =>
      new Response(html, { headers: { 'content-type': 'text/html' } });
    const launch = h.navigate();
    await Promise.resolve(launch.response);
    await launch.done();
    assert.match(
      await (await cache.match('/__kaikei-latest-page')).text(),
      /entry.js/,
    );
  }
});
test('multiple open tabs retain older versions; APIs and writes are never cached', async () => {
  const h = harness();
  await h.cacheApi.open('kaikei-shell-v38');
  await h.cacheApi.open('kaikei-shell-v39');
  h.multipleClients();
  const launch = h.navigate();
  await Promise.resolve(launch.response);
  await launch.done();
  assert.ok(h.stores.has('kaikei-shell-v38'));
  for (const request of [
    new Request(origin + '/api/ledger'),
    new Request(origin + '/api/ledger', { method: 'POST' }),
  ]) {
    const event = h.dispatch('fetch', request);
    assert.equal(event.response, undefined);
    await event.done();
  }
});
test('runtime asset writes remain inside the fetch event lifetime', async () => {
  const h = harness();
  const event = h.dispatch('fetch', new Request(origin + '/icon.svg'));
  assert.equal((await Promise.resolve(event.response)).status, 200);
  await event.done();
  assert.ok(
    await (await h.cacheApi.open('kaikei-shell-v40')).match('/icon.svg'),
  );
});
test('failed-install leftovers never displace the previous working rollback shell', async () => {
  const h = harness();
  await (
    await h.cacheApi.open('kaikei-shell-v39')
  ).put('/__kaikei-latest-page', page());
  await h.cacheApi.open('kaikei-shell-incomplete');
  const launch = h.navigate();
  await Promise.resolve(launch.response);
  await launch.done();
  assert.ok(h.stores.has('kaikei-shell-v39'));
  assert.equal(h.stores.has('kaikei-shell-incomplete'), false);
});
test('cache quota errors cannot discard successful network HTML', async () => {
  const h = harness();
  const open = h.cacheApi.open;
  h.cacheApi.open = async (name) => {
    const cache = await open(name);
    return {
      ...cache,
      put: async () => {
        throw new Error('quota');
      },
    };
  };
  const launch = h.navigate();
  assert.match(
    await (await Promise.resolve(launch.response)).text(),
    /entry.js/,
  );
  await launch.done();
});

test('missing-cache launch returns network HTML before a slow lazy asset finishes', async () => {
  const h = harness();
  const fetch = h.runtime.fetch;
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  h.runtime.fetch = async (request) =>
    request === '/_next/static/chunks/lazy.js' ? delayed : fetch(request);
  const launch = h.navigate();
  const response = await Promise.race([
    Promise.resolve(launch.response),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('HTML waited for lazy asset')), 200),
    ),
  ]);
  assert.match(await response.text(), /entry.js/);
  const cache = await h.cacheApi.open('kaikei-shell-v40');
  assert.equal(await cache.match('/__kaikei-latest-page'), undefined);
  release(
    new Response('asset', {
      headers: { 'content-type': 'application/javascript' },
    }),
  );
  await launch.done();
  assert.ok(await cache.match('/__kaikei-latest-page'));
});

test('install still waits for the complete asset graph before activation', async () => {
  const h = harness();
  const fetch = h.runtime.fetch;
  let release;
  const delayed = new Promise((resolve) => {
    release = resolve;
  });
  h.runtime.fetch = (request) =>
    request === '/_next/static/chunks/lazy.js' ? delayed : fetch(request);
  const install = h.dispatch('install');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(h.skipped(), 0);
  release(
    new Response('asset', {
      headers: { 'content-type': 'application/javascript' },
    }),
  );
  await install.done();
  assert.equal(h.skipped(), 1);
});

test('failed background warming returns usable HTML without committing an incomplete offline page', async () => {
  const h = harness();
  const fetch = h.runtime.fetch;
  h.runtime.fetch = (request) =>
    request === '/_next/static/chunks/lazy.js'
      ? Promise.reject(new Error('asset offline'))
      : fetch(request);
  const launch = h.navigate();
  assert.match(
    await (await Promise.resolve(launch.response)).text(),
    /entry.js/,
  );
  await launch.done();
  assert.equal(
    await (
      await h.cacheApi.open('kaikei-shell-v40')
    ).match('/__kaikei-latest-page'),
    undefined,
  );
});
