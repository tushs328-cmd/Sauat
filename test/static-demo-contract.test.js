import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

test('demo build keeps ordinary progression, jury opt-in, relative assets and versioned cache', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-demo-contract-'));
  try {
    const result = spawnSync(process.execPath, ['scripts/build-static.mjs', '--include-draft'], { cwd: process.cwd(), env: { ...process.env, SAULAT_DIST_DIR: output }, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'content', 'manifest.json'), 'utf8'));
    assert.equal(manifest.stories.length, 7);
    assert.ok(manifest.stories.every((story) => story.reviewStatus.kk === 'draft' && story.reviewStatus.ru === 'draft'));

    const index = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    const main = fs.readFileSync(path.join(output, 'js', 'main.js'), 'utf8');
    const webManifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.webmanifest'), 'utf8'));
    const serviceWorker = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
    assert.match(index, /href="\.\/sauat\.css"/);
    assert.match(index, /src="\.\/js\/main\.js"/);
    assert.equal(fs.existsSync(path.join(output, 'legacy.html')), false);
    assert.equal(fs.existsSync(path.join(output, 'app.js')), false);
    assert.equal(fs.existsSync(path.join(output, 'styles.css')), false);
    assert.deepEqual(webManifest.icons.map((icon) => icon.src), ['./icons/icon-192.svg', './icons/icon-512.svg']);
    assert.doesNotMatch(main, /if \(demoMode \|\| devMode \|\| state\.juryMode\)/);
    assert.match(main, /if \(devMode \|\| state\.juryMode\) return true/);
    assert.match(main, /taskProgress\(activeProgress\(\), state\.story\.id/);
    assert.match(main, /staticUrl\('assets\/hero_student\.webp'\)/);
    assert.match(serviceWorker, /assets\/hero_student\.webp/);
    const manifestOnly = createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 12);
    assert.doesNotMatch(serviceWorker, new RegExp(`saulat-static-${manifestOnly}-`));
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});
