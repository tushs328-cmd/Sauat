const CACHE = 'saulat-shell-v1';
const SHELL = [
  '/', '/index.html', '/sauat.css', '/manifest.webmanifest', '/dev/fixture.json',
  '/js/main.js', '/js/content.js', '/js/engine.js', '/js/storage.js', '/js/offline.js',
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
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('/') : Response.error())));
});
