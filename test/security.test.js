import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';

async function withServer(options, callback) {
  const server = http.createServer(createApp({
    dataPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-security-')), 'events.json'),
    ...options
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await callback(base); } finally { server.close(); }
}

test('API security headers and configurable rate limit are enforced', async () => {
  await withServer({ apiRateLimit: 2 }, async (base) => {
    const first = await fetch(`${base}/api/health`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(first.headers.get('x-frame-options'), 'DENY');
    assert.equal(first.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(first.headers.get('content-security-policy'), /object-src 'none'/);
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    const limited = await fetch(`${base}/api/health`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
  });
});

test('API body limit and input sanitization fail closed', async () => {
  await withServer({ apiRateLimit: 100 }, async (base) => {
    const oversized = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events: [], padding: 'x'.repeat(300_000) })
    });
    assert.equal(oversized.status, 413);
    const unsafeName = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'student', name: '<script>alert(1)</script>', classCode: 'SAULAT7' })
    });
    assert.equal(unsafeName.status, 400);
  });
});
