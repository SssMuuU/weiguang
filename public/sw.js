const CACHE = 'weiguang-v7';
const SHELL = ['/', '/manifest.webmanifest', '/icon-1024.png', '/companion-xiaoguang.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_ASSETS' || !Array.isArray(event.data.urls)) return;
  const urls = Array.from(new Set(event.data.urls)).filter((value) => {
    try {
      const url = new URL(value, self.location.origin);
      return url.origin === self.location.origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/windows/');
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.allSettled(urls.map(async (url) => {
      const request = new Request(url, { credentials: 'same-origin' });
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response);
    }))),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/windows/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/');
        return new Response('Offline resource unavailable', { status: 503, statusText: 'Offline' });
      }),
  );
});
