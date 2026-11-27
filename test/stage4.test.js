import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';
import { askLocalMentor } from '../src/ai.js';
import { clearSessions, login } from '../src/auth.js';

let server;
let base;
async function get(url, headers = {}) { const response = await fetch(`${base}${url}`, { headers }); return { response, body: await response.text() }; }
async function json(url, options = {}) { const response = await fetch(`${base}${url}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); return { response, body: await response.json().catch(() => ({})) }; }
before(async () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-stage4-')); server = http.createServer(createApp({ dataPath: path.join(dir, 'data.json') })); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { clearSessions(); server.close(); });

test('PWA manifest и service worker доступны локально', async () => {
  const manifest = await get('/manifest.webmanifest');
  assert.equal(manifest.response.status, 200);
  assert.match(manifest.body, /"short_name": "Сауат"/);
  const worker = await get('/sw.js');
  assert.equal(worker.response.status, 200);
  assert.match(worker.body, /saulat-shell-v1/);
});

test('Docker Compose не публикует Ollama наружу', () => {
  const compose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
  assert.match(compose, /saulat_internal:/);
  assert.match(compose, /internal: true/);
  assert.match(compose, /qwen2\.5:1\.5b/);
  assert.doesNotMatch(compose, /-\s*["']?11434:/);
});

test('без настроенной Ollama наставник остаётся офлайн-функцией', async () => {
  const original = process.env.OLLAMA_URL;
  delete process.env.OLLAMA_URL;
  const result = await askLocalMentor({ task: { question: 'x', quote: 'y', options: ['a'], answer: 0 }, level: 2 });
  if (original) process.env.OLLAMA_URL = original;
  assert.equal(result, null);
});

test('резервная копия включает черновики и восстанавливается только администратором', async () => {
  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  await json('/api/teacher/texts', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Бэкап', text: 'В школе работает кружок. Он встречается по средам. Ученики ведут журнал.' }) });
  const admin = login({ role: 'admin', classCode: 'ADMIN1' });
  const backup = await json('/api/admin/backup', { headers: { 'x-session-token': admin.sessionId } });
  assert.equal(backup.response.status, 200);
  assert.ok(Array.isArray(backup.body.state.draftTasks));
  const student = login({ role: 'student', name: 'Камила', classCode: 'SAULAT7' });
  const denied = await json('/api/admin/restore', { method: 'POST', headers: { 'x-session-token': student.sessionId }, body: JSON.stringify(backup.body) });
  assert.equal(denied.response.status, 403);
  const restored = await json('/api/admin/restore', { method: 'POST', headers: { 'x-session-token': admin.sessionId }, body: JSON.stringify(backup.body) });
  assert.equal(restored.response.status, 200);
});
