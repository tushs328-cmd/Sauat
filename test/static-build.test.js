import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('static build serves a subpath-safe offline bundle', () => {
  const result = spawnSync(process.execPath, ['scripts/static-smoke.mjs'], { cwd: path.resolve(process.cwd()), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Static smoke PASS/);
  const storage = fs.readFileSync(path.join(process.cwd(), 'dist', 'js', 'storage.js'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(process.cwd(), 'dist', 'sw.js'), 'utf8');
  const offline = fs.readFileSync(path.join(process.cwd(), 'dist', 'js', 'offline.js'), 'utf8');
  assert.match(storage, /Файл содержит более 500 событий/);
  assert.match(storage, /STATIC_EVENT_LIMIT = 500/);
  assert.match(serviceWorker, /saulatSaveData/);
  assert.match(serviceWorker, /SAULAT_PRECACHE_STORY/);
  assert.match(serviceWorker, /SAVE_DATA \? \[\] :/);
  assert.match(serviceWorker, /if \(SAVE_DATA &&/);
  assert.match(offline, /effectiveType === '2g'/);
  assert.match(offline, /SAULAT_PRECACHE_STORY/);
});
