import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { measureDist, renderReport, STARTUP_GZIP_LIMIT } from '../scripts/size.mjs';

test('size report separates payload categories and enforces the startup budget', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-size-'));
  fs.mkdirSync(path.join(root, 'js'), { recursive: true });
  fs.mkdirSync(path.join(root, 'content'), { recursive: true });
  fs.mkdirSync(path.join(root, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<main>demo</main>');
  fs.writeFileSync(path.join(root, 'js', 'main.js'), 'console.log("demo");');
  fs.writeFileSync(path.join(root, 'content', 'manifest.json'), '{}');
  fs.writeFileSync(path.join(root, 'icons', 'icon.svg'), '<svg/>');

  const result = measureDist(root);
  assert.equal(result.categories.HTML.files, 1);
  assert.equal(result.categories.JS.files, 1);
  assert.equal(result.categories.content.files, 1);
  assert.equal(result.categories.icons.files, 1);
  assert.ok(result.startup.gzip <= STARTUP_GZIP_LIMIT);
  assert.match(renderReport(result), /Стартовый набор/);
  assert.match(renderReport(result), /Budget: PASS/);
});
