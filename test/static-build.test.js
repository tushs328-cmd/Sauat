import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('static build serves a subpath-safe offline bundle', () => {
  const result = spawnSync(process.execPath, ['scripts/static-smoke.mjs'], { cwd: path.resolve(process.cwd()), encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Static smoke PASS/);
});
