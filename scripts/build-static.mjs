import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createManifest, projectRoot } from '../src/content.js';

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(projectRoot, 'public');
const contentRoot = path.join(projectRoot, 'content');
const distRoot = process.env.SAULAT_DIST_DIR ? path.resolve(process.env.SAULAT_DIST_DIR) : path.join(projectRoot, 'dist');

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, 'utf8');
}

function listFiles(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    return entry.isDirectory() ? listFiles(root, next) : [next];
  });
}

function cacheVersionFor(manifest) {
  const hash = createHash('sha256').update(JSON.stringify(manifest));
  for (const relative of listFiles(publicRoot).sort()) {
    hash.update(`public/${relative.replaceAll(path.sep, '/')}`);
    hash.update(fs.readFileSync(path.join(publicRoot, relative)));
  }
  for (const story of manifest.stories) {
    for (const relative of [story.file, ...(story.assets || [])]) {
      hash.update(`asset/${relative}`);
      hash.update(fs.readFileSync(path.join(relative.startsWith('assets/') ? publicRoot : contentRoot, relative)));
    }
  }
  hash.update(fs.readFileSync(fileURLToPath(import.meta.url)));
  return hash.digest('hex').slice(0, 12);
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
    '/js/i18n/index.js', '/js/i18n/ru.js', '/js/i18n/kk.js', '/dev/fixture.json',
    '/icons/icon-192.svg', '/icons/icon-512.svg', '/assets/hero_student.webp', ...stories
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
const SAVE_DATA = new URL(self.location.href).searchParams.get('saulatSaveData') === '1';
const CACHE = \`saulat-static-${cacheVersion}-\${SAVE_DATA ? 'lite' : 'full'}-\${ROOT.pathname}\`;
const at = (value) => new URL(String(value).replace(/^\\/+/, ''), ROOT).href;
const SHELL = [
  '', 'index.html', 'sauat.css', 'manifest.webmanifest', 'sw.js', 'dev/fixture.json',
  'js/main.js', 'js/content.js', 'js/engine.js', 'js/storage.js', 'js/offline.js',
  'js/i18n/index.js', 'js/i18n/ru.js', 'js/i18n/kk.js', 'icons/icon-192.svg', 'icons/icon-512.svg',
  'assets/hero_student.webp'
];

function safeRelative(value) {
  const relative = String(value ?? '').replace(/^\\/+/, '');
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
  if (SAVE_DATA && (/\\/content\\/[^/]+\\.json$/.test(url.pathname) || /\\/assets\\//.test(url.pathname))) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match(at(''), { ignoreSearch: true }).then((fallback) => fallback || caches.match(at('index.html'))) : Response.error())));
});
`;
}

function staticOfflineModule(source) {
  let transformed = source.replace(/\r\n?/g, '\n');
  transformed = replaceRequired(
    transformed,
    /export\s+async\s+function\s+prepareOffline\s*\(\s*manifest\s*\)\s*\{/,
    "export async function prepareOffline(manifest, selectedStory = null) {\n  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;\n  const dataSaver = Boolean(connection?.saveData) || connection?.effectiveType === '2g';",
    'offline prepareOffline signature'
  );
  transformed = replaceRequired(
    transformed,
    /navigator\.serviceWorker\.register\(\s*['\"]\/sw\.js['\"]\s*\)/,
    "navigator.serviceWorker.register((() => { const url = new URL('../sw.js', import.meta.url); if (dataSaver) url.searchParams.set('saulatSaveData', '1'); return url; })(), { scope: new URL('../', import.meta.url).pathname })",
    'offline service worker registration'
  );
  transformed = replaceRequired(
    transformed,
    /const\s+urls\s*=\s*manifestUrls\(manifest\);/,
    "if (dataSaver && selectedStory && registration.active) registration.active.postMessage({ type: 'SAULAT_PRECACHE_STORY', story: selectedStory });\n    const urls = dataSaver ? manifestUrls({ stories: selectedStory ? [selectedStory] : [] }) : manifestUrls(manifest);",
    'offline selected story plan'
  );
  return transformed;
}

function replaceRequired(source, pattern, replacement, label) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const result = normalized.replace(pattern, replacement);
  if (result === normalized) throw new Error('Static build transform failed: ' + label);
  return result;
}

function staticStorageModule(source) {
  let transformed = source.replace(/\r\n?/g, '\n');
  transformed = replaceRequired(
    transformed,
    /const\s+EVENTS_KEY\s*=\s*['"]saulat-events-v1['"]\s*;/,
    "const EVENTS_KEY = 'saulat-events-v1';\nconst STATIC_BUILD = globalThis.__SAULAT_STATIC__ === true;\nconst STATIC_EVENT_LIMIT = 500;\nfunction readStaticEvents() {\n  try {\n    const value = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');\n    return Array.isArray(value) ? value.slice(-STATIC_EVENT_LIMIT) : [];\n  } catch {\n    try { localStorage.removeItem(EVENTS_KEY); } catch { /* storage is unavailable */ }\n    return [];\n  }\n}\nfunction writeStaticEvents(events) {\n  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-STATIC_EVENT_LIMIT))); } catch { /* quota or disabled storage */ }\n}",
    'storage constants'
  );
  transformed = replaceRequired(
    transformed,
    /export\s+async\s+function\s+queueEvent\s*\(\s*event\s*\)\s*\{\s*/,
    "export async function queueEvent(event) {\n  if (STATIC_BUILD) {\n    const events = readStaticEvents();\n    if (!events.some((item) => item.eventId === event.eventId)) writeStaticEvents([...events, event]);\n    return;\n  }\n",
    'storage queueEvent'
  );
  transformed = replaceRequired(
    transformed,
    /export\s+async\s+function\s+exportEvents\s*\(\s*\)\s*\{\s*/,
    "export async function exportEvents() {\n  if (STATIC_BUILD) return readStaticEvents();\n",
    'storage exportEvents'
  );
  transformed = replaceRequired(
    transformed,
    /(export\s+async\s+function\s+importTeacherEvents\s*\(\s*payload\s*\)\s*\{\s*const\s+incoming\s*=\s*extractEvents\(payload\);)/,
    (match) => match + "\n  if (incoming.length > 500) throw new Error('Файл содержит более 500 событий.');\n  if (new TextEncoder().encode(JSON.stringify(incoming)).length > 2 * 1024 * 1024) throw new Error('Файл событий больше 2 МБ.');",
    'storage importTeacherEvents'
  );
  transformed = replaceRequired(
    transformed,
    /export\s+async\s+function\s+flushEvents\s*\(\s*\)\s*\{\s*/,
    "export async function flushEvents() {\n  if (STATIC_BUILD || !navigator.onLine) return { sent: 0 };\n",
    'storage flushEvents'
  );
  return transformed;
}

const includeDraft = process.argv.includes('--include-draft');
const manifest = createManifest({ includeDraft, includeFixture: false });
const cacheVersion = cacheVersionFor(manifest);
fs.rmSync(distRoot, { recursive: true, force: true });
fs.cpSync(publicRoot, distRoot, { recursive: true });
for (const legacyFile of ['legacy.html', 'app.js', 'styles.css']) fs.rmSync(path.join(distRoot, legacyFile), { force: true });
fs.mkdirSync(path.join(distRoot, 'content'), { recursive: true });
write(path.join(distRoot, 'content', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

for (const story of manifest.stories) {
  fs.copyFileSync(path.join(contentRoot, story.file), path.join(distRoot, 'content', story.file));
}

write(path.join(distRoot, 'index.html'), relativeHtml(fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8')));
const webManifest = JSON.parse(fs.readFileSync(path.join(publicRoot, 'manifest.webmanifest'), 'utf8'));
webManifest.start_url = './';
for (const icon of webManifest.icons || []) icon.src = `./${String(icon.src).replace(/^\/+/, '')}`;
write(path.join(distRoot, 'manifest.webmanifest'), `${JSON.stringify(webManifest, null, 2)}\n`);
write(path.join(distRoot, 'sw.js'), staticServiceWorker(cacheVersion));
write(path.join(distRoot, 'js', 'content.js'), staticContentModule());
write(path.join(distRoot, 'js', 'storage.js'), staticStorageModule(fs.readFileSync(path.join(publicRoot, 'js', 'storage.js'), 'utf8')));
let offline = fs.readFileSync(path.join(publicRoot, 'js', 'offline.js'), 'utf8');
offline = offline
  .replace('new URL(url, location.origin).href', 'url');
write(path.join(distRoot, 'js', 'offline.js'), staticOfflineModule(offline));

let main = fs.readFileSync(path.join(publicRoot, 'js', 'main.js'), 'utf8');
main = `globalThis.__SAULAT_STATIC__ = true;\nconst STATIC_BASE = new URL('../', import.meta.url);\nconst staticUrl = (value) => new URL(String(value).replace(/^\\/+/, ''), STATIC_BASE).href;\n${main}`;
main = main.replace("? `/${file}` : file", "? staticUrl(file) : file");
main = main.replace('src="/assets/hero_student.webp"', "src=\"${staticUrl('assets/hero_student.webp')}\"");
main = main.replace('if (demoMode || devMode || state.juryMode) return true;', 'if (devMode || state.juryMode) return true;');
main = main.replace('const heroStory = () => practiceStories()[0] || diagnosticStories()[0] || state.story;', "const heroStory = () => practiceStories()[0] || diagnosticStories()[0] || state.story;\nfunction activeProgress() { return state.juryMode ? (state.juryProgress ||= structuredClone(state.progress)) : state.progress; }");
main = main.replaceAll('const progress = state.juryMode && state.juryProgress ? state.juryProgress : state.progress;', 'const progress = activeProgress();');
main = main.replaceAll('state.progress.completedStories', 'activeProgress().completedStories');
main = main.replaceAll('state.progress.xp', 'activeProgress().xp');
main = main.replaceAll('taskProgress(state.progress,', 'taskProgress(activeProgress(),');
main = main.replaceAll('const progress = state.juryMode ? (state.juryProgress ||= structuredClone(state.progress)) : state.progress;', 'const progress = activeProgress();');
main = main.replace("if (navigator.onLine) { try { const response = await fetch('/api/mentor'", "if (navigator.onLine && !globalThis.__SAULAT_STATIC__) { try { const response = await fetch('/api/mentor'");
main = main.replace("for (const file of files || []) { try { const payload = JSON.parse(await file.text());", "for (const file of files || []) { try { if (file.size > 2 * 1024 * 1024) throw new Error('Файл событий больше 2 МБ.'); const payload = JSON.parse(await file.text());");
main = main.replace("prepareOffline(state.manifest)", "prepareOffline(state.manifest, state.manifest.stories.find((item) => item.id === state.story?.id) || null)");
main = main.replace("state.story = story; state.view = 'story'; return render();", "state.story = story; state.view = 'story'; void prepareOffline(state.manifest, state.manifest.stories.find((item) => item.id === story.id) || null); return render();");
write(path.join(distRoot, 'js', 'main.js'), main);

const mode = includeDraft ? 'demo draft' : 'published';
console.log(`Static build created: ${path.relative(projectRoot, distRoot)} (${manifest.stories.length} ${mode} stories).`);
