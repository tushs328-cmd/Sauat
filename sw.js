const ROOT = new URL('./', self.location.href);
const SAVE_DATA = new URL(self.location.href).searchParams.get('saulatSaveData') === '1';
const CACHE = `saulat-static-03513b497af7-${SAVE_DATA ? 'lite' : 'full'}-${ROOT.pathname}`;
const at = (value) => new URL(String(value).replace(/^\/+/, ''), ROOT).href;
const SHELL = [
  '', 'index.html', 'sauat.css', 'manifest.webmanifest', 'sw.js', 'dev/fixture.json',
  'js/main.js', 'js/content.js', 'js/engine.js', 'js/storage.js', 'js/offline.js',
  'js/i18n/index.js', 'js/i18n/ru.js', 'js/i18n/kk.js', 'icons/icon-192.svg', 'icons/icon-512.svg',
  'assets/hero_student.webp'
];

function safeRelative(value) {
  const relative = String(value ?? '').replace(/^\/+/, '');
  return relative && !relative.split('/').includes('..') && !/^https?:/i.test(relative) ? relative : null;
}

function storyUrls(entry) {
  const file = String(entry?.file ?? '');
  const storyFile = file.startsWith('dev/') ? file : 'content/' + file;
  return [storyFile, ...(entry?.assets || [])].map(safeRelative).filter(Boolean).map(at);
}

async function precachePlan() {
  let manifest = { stories: [{ file: 'dev/fixture.json', assets: [] }] };
  try {
    const response = await fetch(at('content/manifest.json'), { cache: 'no-store' });
    if (response.ok) manifest = await response.json();
  } catch { /* fixture fallback keeps the static shell installable */ }
  const stories = SAVE_DATA ? [] : (manifest.stories || []).flatMap(storyUrls);
  return { manifest, urls: [...new Set([...SHELL, ...stories])].map(at) };
}

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const plan = await precachePlan();
  await cache.addAll(plan.urls);
  await cache.put(at('content/manifest.json'), new Response(JSON.stringify(plan.manifest), { headers: { 'content-type': 'application/json' } }));
  await self.skipWaiting();
})()));

self.addEventListener('message', (event) => {
  if (!SAVE_DATA || event.data?.type !== 'SAULAT_PRECACHE_STORY') return;
  event.waitUntil((async () => {
    const urls = storyUrls(event.data.story);
    if (!urls.length) return;
    const cache = await caches.open(CACHE);
    await cache.addAll(urls);
  })());
});

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (SAVE_DATA && (/\/content\/[^/]+\.json$/.test(url.pathname) || /\/assets\//.test(url.pathname))) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match(at(''), { ignoreSearch: true }).then((fallback) => fallback || caches.match(at('index.html'))) : Response.error())));
});
