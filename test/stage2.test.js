import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';
import { clearSessions, login } from '../src/auth.js';

let server;
let base;

async function request(url, options = {}) {
  const response = await fetch(`${base}${url}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  return { response, body: await response.json().catch(() => ({})) };
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-stage2-'));
  server = http.createServer(createApp({ dataPath: path.join(dir, 'data.json') }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { clearSessions(); server.close(); });

test('новая и legacy главные страницы доступны без внешних URL', async () => {
  const response = await fetch(`${base}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Сауат/);
  assert.match(html, /\/sauat\.css/);
  assert.doesNotMatch(html, /https?:\/\//);

  const legacy = await fetch(`${base}/legacy.html`);
  const legacyHtml = await legacy.text();
  assert.equal(legacy.status, 200);
  assert.match(legacyHtml, /Сауат/);
  assert.match(legacyHtml, /styles\.css/);
  assert.doesNotMatch(legacyHtml, /https?:\/\//);
});

test('язык влияет на адаптивно выбранное задание', async () => {
  const user = login({ role: 'student', name: 'Айша', classCode: 'SAULAT7' });
  const result = await request('/api/student/next-task?lang=kz', { headers: { 'x-session-token': user.sessionId } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.task.lang, 'kz');
});

test('неверный ответ не раскрывает готовое объяснение', async () => {
  const user = login({ role: 'student', name: 'Олег', classCode: 'SAULAT7' });
  const result = await request('/api/student/answer', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-1', answer: 2 }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.correct, false);
  assert.equal(result.body.explanation, null);
  assert.ok(result.body.quote);
});

test('свободный метод наставника требует попытку только на третьем уровне', async () => {
  const user = login({ role: 'student', name: 'Назерке', classCode: 'SAULAT7' });
  const first = await request('/api/student/mentor', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-1', level: 1, attempted: false }) });
  assert.equal(first.body.requiresAttempt, undefined);
  assert.equal(first.body.readyAnswer, false);
  const third = await request('/api/student/mentor', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-1', level: 3, attempted: false }) });
  assert.equal(third.body.requiresAttempt, true);
});
