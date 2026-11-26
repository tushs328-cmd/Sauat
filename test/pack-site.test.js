import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packSite } from '../scripts/pack-site.mjs';

function centralNames(buffer) {
  const names = [];
  let offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  for (; offset >= 0 && offset + 46 <= buffer.length;) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

test('pack-site creates a readable zip with forward-slash entries and size guard', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-pack-'));
  const dist = path.join(root, 'dist');
  const output = path.join(root, 'dist.zip');
  fs.mkdirSync(path.join(dist, 'js', 'i18n'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<main>SAUAT</main>');
  fs.writeFileSync(path.join(dist, 'js', 'i18n', 'ru.js'), 'export default {};');

  const result = packSite({ distRoot: dist, output, maxBytes: 1024 * 1024 });
  assert.equal(result.files, 2);
  assert.ok(result.zipBytes > 0);
  assert.ok(result.zipBytes <= 1024 * 1024);
  assert.deepEqual(centralNames(fs.readFileSync(output)), ['index.html', 'js/i18n/ru.js']);
  assert.doesNotMatch(fs.readFileSync(output).toString('binary'), /js\\i18n/);
});

test('pack-site rejects an archive above the configured limit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-pack-limit-'));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'payload.bin'), Buffer.alloc(4096, 0x41));
  assert.throws(() => packSite({ distRoot: dist, output: path.join(root, 'dist.zip'), maxBytes: 64 }), /слишком большой/);
});

test('pack-site rejects an invalid size limit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-pack-invalid-limit-'));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), 'ok');
  assert.throws(() => packSite({ distRoot: dist, output: path.join(root, 'dist.zip'), maxBytes: Number.NaN }), /положительным целым числом/);
});
