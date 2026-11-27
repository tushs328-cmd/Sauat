import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const includeDraft = process.argv.includes('--include-draft');
const buildArgs = ['scripts/build-static.mjs'];
if (includeDraft) buildArgs.push('--include-draft');
const build = spawnSync(process.execPath, buildArgs, { cwd: projectRoot, encoding: 'utf8' });
process.stdout.write(build.stdout || '');
process.stderr.write(build.stderr || '');
assert.equal(build.status, 0, 'static build must exit 0');

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (!url.pathname.startsWith('/demo/')) return response.writeHead(404).end();
  const relative = url.pathname.slice('/demo/'.length) || 'index.html';
  const requested = relative.endsWith('/') ? `${relative}index.html` : relative;
  const file = path.resolve(distRoot, requested);
  if (!file.startsWith(`${distRoot}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return response.writeHead(404).end();
  response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/demo/`;
try {
  const index = await (await fetch(base)).text();
  assert.match(index, /href="\.\/sauat\.css"/);
  assert.match(index, /src="\.\/js\/main\.js"/);

  const manifest = await (await fetch(`${base}content/manifest.json`)).json();
  if (includeDraft) {
    const practice = manifest.stories.filter((story) => story.kind === 'practice');
    const diagnostic = manifest.stories.filter((story) => story.kind === 'diagnostic');
    assert.ok(practice.length >= 4, 'demo manifest must contain the current practice stories');
    assert.equal(diagnostic.length, 2, 'demo manifest must contain diag_entry and diag_exit');
    assert.ok(manifest.stories.some((story) => story.id === 'case_001'), 'demo manifest must contain case_001');
    assert.ok(manifest.stories.every((story) => story.reviewStatus?.kk === 'draft' && story.reviewStatus?.ru === 'draft'));
    for (const story of manifest.stories) {
      assert.ok(fs.existsSync(path.join(distRoot, 'content', story.file)), `${story.file} must be copied to dist`);
      for (const asset of story.assets || []) assert.ok(fs.existsSync(path.join(distRoot, asset)), `${asset} must be present in dist`);
    }
  } else {
    assert.equal(manifest.stories.some((story) => story.reviewStatus?.ru === 'draft' || story.reviewStatus?.kk === 'draft'), false);
  }
  assert.equal(manifest.stories.some((story) => story.isTestFixture), false);

  const serviceWorker = await (await fetch(`${base}sw.js`)).text();
  assert.doesNotMatch(serviceWorker, /fetch\(['"]\//);
  assert.match(serviceWorker, /new URL\('\.'|new URL\(String\(value\)/);
  assert.match(serviceWorker, /cache\.addAll\(plan\.urls\)/);
  const manifestOnly = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 12);
  const cacheMatch = serviceWorker.match(/saulat-static-([a-f0-9]{12})-/);
  assert.ok(cacheMatch, 'SW cache must include a twelve-character version');
  assert.notEqual(cacheMatch[1], manifestOnly, 'SW cache must include shell/content changes, not only the manifest');

  const main = fs.readFileSync(path.join(distRoot, 'js', 'main.js'), 'utf8');
  const storage = fs.readFileSync(path.join(distRoot, 'js', 'storage.js'), 'utf8');
  const offline = fs.readFileSync(path.join(distRoot, 'js', 'offline.js'), 'utf8');
  assert.match(main, /__SAULAT_STATIC__/);
  assert.match(main, /staticUrl\(file\)/);
  assert.match(main, /file\.size > 2 \* 1024 \* 1024/);
  assert.match(storage, /STATIC_BUILD/);
  assert.match(storage, /STATIC_EVENT_LIMIT = 500/);
  assert.match(storage, /localStorage\.setItem\(EVENTS_KEY/);
  assert.match(storage, /Файл содержит более 500 событий/);
  assert.match(offline, /new URL\('\.\.\/sw\.js', import\.meta\.url\)/);
  globalThis.__SAULAT_STATIC__ = true;
  const localStore = new Map([['saulat-events-v1', '{broken']]);
  globalThis.localStorage = {
    getItem: (key) => localStore.get(key) ?? null,
    setItem: (key, value) => localStore.set(key, value),
    removeItem: (key) => localStore.delete(key)
  };
  const staticStorage = await import(pathToFileURL(path.join(distRoot, 'js', 'storage.js')).href + '?static-smoke=' + Date.now());
  await staticStorage.queueEvent({ eventId: 'stress-1' });
  await staticStorage.queueEvent({ eventId: 'stress-1' });
  assert.equal((await staticStorage.exportEvents()).length, 1, 'corrupt localStorage must recover and deduplicate');
  for (let index = 0; index < 700; index += 1) await staticStorage.queueEvent({ eventId: 'stress-' + (index + 2) });
  assert.equal((await staticStorage.exportEvents()).length, 500, 'static event queue must cap load');
  const mode = includeDraft
    ? 'demo manifest ' + manifest.stories.filter((story) => story.kind === 'practice').length + ' practice + ' + manifest.stories.filter((story) => story.kind === 'diagnostic').length + ' diagnostic stories'
    : 'published manifest';
  console.log(`Static smoke PASS: ${base} served ${mode}, content/assets, relative SW precache and offline rules/export guards.`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
