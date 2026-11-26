import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createManifest, projectRoot } from '../src/content.js';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(projectRoot, 'public');
const contentRoot = path.join(projectRoot, 'content');
const distRoot = path.join(projectRoot, 'dist');

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function relativeHtml(value) {
  return value
    .replaceAll('href="/', 'href="./')
    .replaceAll('src="/', 'src="./');
}

function staticContentModule() {
  return `const STATIC_BASE = new URL('../', import.meta.url);
function resolveStaticUrl(value) {
  const text = String(value);
  return /^https?:\\/\\//i.test(text) ? text : new URL(text.replace(/^\\/+/, ''), STATIC_BASE).href;
}

async function readJson(url, options = {}) {
  const target = resolveStaticUrl(url);
  const response = await fetch(target, { cache: 'no-store', ...options });
  if (!response.ok) throw new Error(\`\${target} HTTP \${response.status}\`);
  return response.json();
}

function entryUrl(entry) { return String(entry.file).startsWith('dev/') ? \`/\${entry.file}\` : \`/content/\${entry.file}\`; }

export function manifestUrls(manifest) {
  const stories = (manifest?.stories || []).flatMap((entry) => [
    entryUrl(entry),
    ...(entry.assets || []).map((asset) => \`/\${String(asset).replace(/^\\/+/, '')}\`)
  ]);
  return [...new Set([
    '/', '/index.html', '/sauat.css', '/manifest.webmanifest', '/sw.js', '/content/manifest.json',
    '/js/main.js', '/js/content.js', '/js/engine.js', '/js/storage.js', '/js/offline.js',
    '/js/i18n/index.js', '/js/i18n/ru.js', '/js/i18n/kk.js', '/dev/fixture.json', ...stories
  ])].map(resolveStaticUrl);
}

export async function loadContent() {
  try {
    const manifest = await readJson('/content/manifest.json');
    const stories = await Promise.all((manifest.stories || []).map(async (entry) => readJson(entryUrl(entry))));
    if (stories.length) return { manifest, stories, fromFixture: false };
  } catch (error) {
    if (!navigator.onLine) throw error;
  }
  const story = await readJson('/dev/fixture.json');
  if (!story.isTestFixture) throw new Error('Ожидался тестовый fixture');
  return { manifest: { contentVersion: story.contentVersion, stories: [{ id: story.id, kind: story.kind, file: 'dev/fixture.json', assets: [] }] }, stories: [story], fromFixture: true };
}
`;
}

function staticServiceWorker(cacheVersion) {
  return `const ROOT = new URL('./', self.location.href);
const CACHE = \`saulat-static-${cacheVersion}-\${ROOT.pathname}\`;
const at = (value) => new URL(String(value).replace(/^\\/+/, ''), ROOT).href;
const SHELL = [
  '', 'index.html', 'sauat.css', 'manifest.webmanifest', 'sw.js', 'dev/fixture.json',
  'js/main.js', 'js/content.js', 'js/engine.js', 'js/storage.js', 'js/offline.js',
  'js/i18n/index.js', 'js/i18n/ru.js', 'js/i18n/kk.js'
];

async function precachePlan() {
  let manifest = { stories: [{ file: 'dev/fixture.json', assets: [] }] };
  try {
    const response = await fetch(at('content/manifest.json'), { cache: 'no-store' });
    if (response.ok) manifest = await response.json();
  } catch { /* fixture fallback keeps the static shell installable */ }
  const stories = (manifest.stories || []).flatMap((entry) => [
    String(entry.file).startsWith('dev/') ? entry.file : \`content/\${entry.file}\`,
    ...(entry.assets || []).map((asset) => String(asset).replace(/^\\/+/, ''))
  ]);
  return { manifest, urls: [...new Set([...SHELL, ...stories])].map(at) };
}

self.addEventListener('install', (event) => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const plan = await precachePlan();
  await cache.addAll(plan.urls);
  await cache.put(at('content/manifest.json'), new Response(JSON.stringify(plan.manifest), { headers: { 'content-type': 'application/json' } }));
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
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match(at(''), { ignoreSearch: true }).then((fallback) => fallback || caches.match(at('index.html'))) : Response.error())));
});
`;
}

function staticStorageModule(source) {
  return source
    .replace("const EVENTS_KEY = 'saulat-events-v1';", "const EVENTS_KEY = 'saulat-events-v1';\nconst STATIC_BUILD = globalThis.__SAULAT_STATIC__ === true;\nconst STATIC_EVENT_LIMIT = 500;\nfunction readStaticEvents() {\n  try {\n    const value = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');\n    return Array.isArray(value) ? value.slice(-STATIC_EVENT_LIMIT) : [];\n  } catch {\n    try { localStorage.removeItem(EVENTS_KEY); } catch { /* storage is unavailable */ }\n    return [];\n  }\n}\nfunction writeStaticEvents(events) {\n  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-STATIC_EVENT_LIMIT))); } catch { /* quota or disabled storage */ }\n}")
    .replace('export async function queueEvent(event) {\n  try {', "export async function queueEvent(event) {\n  if (STATIC_BUILD) {\n    const events = readStaticEvents();\n    if (!events.some((item) => item.eventId === event.eventId)) writeStaticEvents([...events, event]);\n    return;\n  }\n  try {")
    .replace('export async function exportEvents() {\n  try {', "export async function exportEvents() {\n  if (STATIC_BUILD) return readStaticEvents();\n  try {")
    .replace("  if (!incoming) throw new Error('Файл должен содержать массив events.');\n  if (incoming.some((event) => !validEvent(event)))", "  if (!incoming) throw new Error('Файл должен содержать массив events.');\n  if (incoming.length > 500) throw new Error('Файл содержит более 500 событий.');\n  if (new TextEncoder().encode(JSON.stringify(incoming)).length > 2 * 1024 * 1024) throw new Error('Файл событий больше 2 МБ.');\n  if (incoming.some((event) => !validEvent(event)))")
    .replace('export async function flushEvents() {\n  if (!navigator.onLine)', 'export async function flushEvents() {\n  if (STATIC_BUILD || !navigator.onLine)');
}

const includeDraft = process.argv.includes('--include-draft');
const manifest = createManifest({ includeDraft, includeFixture: false });
const cacheVersion = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 12);
fs.rmSync(distRoot, { recursive: true, force: true });
fs.cpSync(publicRoot, distRoot, { recursive: true });
fs.mkdirSync(path.join(distRoot, 'content'), { recursive: true });
write(path.join(distRoot, 'content', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

for (const story of manifest.stories) {
  fs.copyFileSync(path.join(contentRoot, story.file), path.join(distRoot, 'content', story.file));
}

write(path.join(distRoot, 'index.html'), relativeHtml(fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8')));
write(path.join(distRoot, 'legacy.html'), relativeHtml(fs.readFileSync(path.join(publicRoot, 'legacy.html'), 'utf8')));
write(path.join(distRoot, 'manifest.webmanifest'), fs.readFileSync(path.join(publicRoot, 'manifest.webmanifest'), 'utf8').replace('"start_url": "/"', '"start_url": "./"'));
write(path.join(distRoot, 'sw.js'), staticServiceWorker(cacheVersion));
write(path.join(distRoot, 'js', 'content.js'), staticContentModule());
write(path.join(distRoot, 'js', 'storage.js'), staticStorageModule(fs.readFileSync(path.join(publicRoot, 'js', 'storage.js'), 'utf8')));
let offline = fs.readFileSync(path.join(publicRoot, 'js', 'offline.js'), 'utf8');
offline = offline
  .replace("navigator.serviceWorker.register('/sw.js')", "navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: new URL('../', import.meta.url).pathname })")
  .replace('new URL(url, location.origin).href', 'url');
write(path.join(distRoot, 'js', 'offline.js'), offline);

let main = fs.readFileSync(path.join(publicRoot, 'js', 'main.js'), 'utf8');
main = `globalThis.__SAULAT_STATIC__ = true;\nconst STATIC_BASE = new URL('../', import.meta.url);\nconst staticUrl = (value) => new URL(String(value).replace(/^\\/+/, ''), STATIC_BASE).href;\n${main}`;
main = main.replace("? `/${file}` : file", "? staticUrl(file) : file");
main = main.replace("if (navigator.onLine) { try { const response = await fetch('/api/mentor'", "if (navigator.onLine && !globalThis.__SAULAT_STATIC__) { try { const response = await fetch('/api/mentor'");
main = main.replace("for (const file of files || []) { try { const payload = JSON.parse(await file.text());", "for (const file of files || []) { try { if (file.size > 2 * 1024 * 1024) throw new Error('Файл событий больше 2 МБ.'); const payload = JSON.parse(await file.text());");
write(path.join(distRoot, 'js', 'main.js'), main);

const mode = includeDraft ? 'demo draft' : 'published';
console.log(`Static build created: ${path.relative(projectRoot, distRoot)} (${manifest.stories.length} ${mode} stories).`);
