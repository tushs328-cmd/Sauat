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
async function request(url, options = {}) { const response = await fetch(`${base}${url}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); return { response, body: await response.json().catch(() => ({})) }; }
before(async () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-stage6-')); server = http.createServer(createApp({ dataPath: path.join(dir, 'data.json') })); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { clearSessions(); server.close(); });

test('банк отдаёт график и таблицу как структурированный визуальный источник', async () => { const user = login({ role: 'student', name: 'График', classCode: 'SAULAT7' }); const table = await request('/api/tasks?limit=60', { headers: { 'x-session-token': user.sessionId } }); const tasks = table.body.tasks; assert.ok(tasks.some((task) => task.visual?.type === 'table')); assert.ok(tasks.some((task) => task.visual?.type === 'bar')); });
test('свободный ответ проверяется правилами по ключевым понятиям', async () => { const user = login({ role: 'student', name: 'Свободный', classCode: 'SAULAT7' }); const result = await request('/api/student/answer', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-5', text: 'проверка фильтров' }) }); assert.equal(result.response.status, 200); assert.equal(result.body.correct, true); });
test('неподтверждённый свободный ответ не считается верным', async () => { const user = login({ role: 'student', name: 'Проверка', classCode: 'SAULAT7' }); const result = await request('/api/student/answer', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-5', text: 'мне кажется, всё хорошо' }) }); assert.equal(result.body.correct, false); assert.match(result.body.feedback, /подтвердить/); });
test('публичный свободный ответ не раскрывает ключевые слова', async () => { const user = login({ role: 'student', name: 'Без ключей', classCode: 'SAULAT7' }); const result = await request('/api/tasks?limit=60', { headers: { 'x-session-token': user.sessionId } }); const free = result.body.tasks.find((task) => task.id === 'read-water-5'); assert.equal(free.answerMode, 'free'); assert.equal('keywords' in free, false); });
test('интерфейс содержит SVG-рендер и свободное поле', () => { const app = fs.readFileSync(path.join(process.cwd(), 'public', 'app.js'), 'utf8'); assert.match(app, /renderVisual/); assert.match(app, /free-answer/); });
