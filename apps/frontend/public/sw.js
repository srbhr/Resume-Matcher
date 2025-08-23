const STATIC_CACHE = 'rm-static-v2';
const RUNTIME_CACHE = 'rm-runtime-v1';
const OFFLINE_FALLBACK = '/offline.html';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  OFFLINE_FALLBACK
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.hostname.includes('localhost:8000');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isApiRequest(url)) {
    // Network-first for API (GET)
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'offline' }), { headers: { 'Content-Type': 'application/json' }, status: 503 });
      }
    })());
    return;
  }

  if (req.destination === 'document') {
    // Stale-while-revalidate for HTML
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => null);
  if (cached) { void fetchPromise; return cached; }
      const fresh = await fetchPromise;
      if (fresh) return fresh;
      return (await caches.open(STATIC_CACHE)).match(OFFLINE_FALLBACK);
    })());
    return;
  }

  // Asset strategy: Cache-first for static assets
  if (['style','script','font','image'].includes(req.destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Fallback generic: try cache then network
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      if (req.destination === 'image') {
        return new Response('', { status: 204 });
      }
      return (await caches.open(STATIC_CACHE)).match(OFFLINE_FALLBACK);
    }
  })());
});
