async function readJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

function entryUrl(entry) { return String(entry.file).startsWith('dev/') ? `/${entry.file}` : `/content/${entry.file}`; }

export function manifestUrls(manifest) {
  const stories = (manifest?.stories || []).flatMap((entry) => [
    entryUrl(entry),
    ...(entry.assets || []).map((asset) => `/${String(asset).replace(/^\/+/, '')}`)
  ]);
  return [...new Set([
    '/', '/index.html', '/sauat.css', '/manifest.webmanifest', '/sw.js', '/content/manifest.json',
    '/js/main.js', '/js/content.js', '/js/engine.js', '/js/storage.js', '/js/offline.js',
    '/js/i18n/index.js', '/js/i18n/ru.js', '/js/i18n/kk.js', '/dev/fixture.json', ...stories
  ])];
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
