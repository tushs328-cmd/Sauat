const CACHE = 'saulat-shell-v1-offline-v4';
const SHELL = [
  '/', '/index.html', '/sauat.css', '/manifest.webmanifest', '/sw.js', '/dev/fixture.json', '/icons/icon-192.svg', '/icons/icon-512.svg',
  '/js/main.js', '/js/content.js', '/js/engine.js', '/js/storage.js', '/js/offline.js', '/assets/hero_student.webp',
  '/js/i18n/index.js', '/js/i18n/ru.js', '/js/i18n/kk.js'
];

async function precachePlan() {
  let manifest = { stories: [{ file: 'dev/fixture.json', assets: [] }] };
  try {
    const response = await fetch('/content/manifest.json', { cache: 'no-store' });
    if (response.ok) manifest = await response.json();
  } catch { /* fixture fallback keeps the development shell installable */ }
  const stories = (manifest.stories || []).flatMap((entry) => [
    String(entry.file).startsWith('dev/') ? `/${entry.file}` : `/content/${entry.file}`,
    ...(entry.assets || []).map((asset) => `/${String(asset).replace(/^\/+/, '')}`)
  ]);
  return { manifest, urls: [...new Set([...SHELL, ...stories])] };
}

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const plan = await precachePlan();
  await cache.addAll(plan.urls);
  await cache.put('/content/manifest.json', new Response(JSON.stringify(plan.manifest), { headers: { 'content-type': 'application/json' } }));
  await self.skipWaiting();
})()));

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/api/events' && event.request.method === 'POST') {
    event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-saulat-offline': '1' }
    })));
    return;
  }
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    } catch {
      if (event.request.mode !== 'navigate') return Response.error();
      return (await caches.match('/', { ignoreSearch: true })) || caches.match('/index.html');
    }
  })());
});
