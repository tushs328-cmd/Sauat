import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

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
    assert.equal(practice.length, 3, 'demo manifest must contain case_001..003');
    assert.equal(diagnostic.length, 2, 'demo manifest must contain diag_entry and diag_exit');
    assert.deepEqual(manifest.stories.map((story) => story.id), [
      'case_001', 'case_002', 'case_003', 'diag_entry_001', 'diag_exit_001'
    ]);
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

  const main = fs.readFileSync(path.join(distRoot, 'js', 'main.js'), 'utf8');
  const storage = fs.readFileSync(path.join(distRoot, 'js', 'storage.js'), 'utf8');
  const offline = fs.readFileSync(path.join(distRoot, 'js', 'offline.js'), 'utf8');
  assert.match(main, /__SAULAT_STATIC__/);
  assert.match(main, /staticUrl\(file\)/);
  assert.match(storage, /STATIC_BUILD/);
  assert.match(storage, /localStorage\.setItem\(EVENTS_KEY/);
  assert.match(offline, /new URL\('\.\.\/sw\.js', import\.meta\.url\)/);
  const mode = includeDraft ? 'demo manifest 3 practice + 2 diagnostic stories' : 'published manifest';
  console.log(`Static smoke PASS: ${base} served ${mode}, content/assets, relative SW precache and offline rules/export guards.`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
