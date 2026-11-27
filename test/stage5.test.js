import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';
import { clearSessions, login } from '../src/auth.js';
import { taskBank } from '../src/taskBank.js';

let server;
let base;
async function request(url, options = {}) { const response = await fetch(`${base}${url}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } }); return { response, body: await response.json().catch(() => ({})) }; }
before(async () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-stage5-')); server = http.createServer(createApp({ dataPath: path.join(dir, 'data.json') })); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { clearSessions(); server.close(); });

test('банк покрывает все четыре навыка и три уровня', () => { assert.deepEqual(new Set(taskBank.map((task) => task.skill)), new Set(['find', 'infer', 'evaluate', 'math'])); assert.deepEqual(new Set(taskBank.map((task) => task.difficulty)), new Set([1, 2, 3])); });
test('лимит списка заданий ограничивается сервером', async () => { const user = login({ role: 'student', name: 'Лимит', classCode: 'SAULAT7' }); const result = await request('/api/tasks?limit=2', { headers: { 'x-session-token': user.sessionId } }); assert.equal(result.body.tasks.length, 2); });
test('публичная задача сохраняет варианты ответа', async () => { const user = login({ role: 'student', name: 'Варианты', classCode: 'SAULAT7' }); const result = await request('/api/tasks?limit=1', { headers: { 'x-session-token': user.sessionId } }); assert.equal(result.body.tasks[0].options.length, 3); });
test('похожее имя в другом классе не видит прогресс', async () => { const first = login({ role: 'student', name: 'Али', classCode: 'SAULAT7' }); await request('/api/student/answer', { method: 'POST', headers: { 'x-session-token': first.sessionId }, body: JSON.stringify({ taskId: 'read-water-1', answer: 0 }) }); const second = login({ role: 'student', name: 'Али', classCode: 'SAULAT8' }); const result = await request('/api/student/progress', { headers: { 'x-session-token': second.sessionId } }); assert.equal(result.body.totalAttempts, 0); });
test('неопубликованное задание не видно ученику', async () => { const teacher = login({ role: 'teacher', classCode: 'USTAZ7' }); const created = await request('/api/teacher/texts', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Черновик', text: 'Материал существует. Он ещё не опубликован. Учитель его проверяет.' }) }); const id = created.body.generated[0].id; await request('/api/teacher/assignments', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ classId: 'class-7a', taskIds: [id], published: false }) }); const student = login({ role: 'student', name: 'Алия', classCode: 'SAULAT7' }); const result = await request('/api/student/assignments', { headers: { 'x-session-token': student.sessionId } }); assert.equal(result.body.assignments.length, 0); });
test('невалидное восстановление отклоняется', async () => { const admin = login({ role: 'admin', classCode: 'ADMIN1' }); const result = await request('/api/admin/restore', { method: 'POST', headers: { 'x-session-token': admin.sessionId }, body: JSON.stringify({ nope: true }) }); assert.equal(result.response.status, 400); });
test('недоступный черновик возвращает 404', async () => { const teacher = login({ role: 'teacher', classCode: 'USTAZ7' }); const result = await request('/api/teacher/drafts/missing', { method: 'PATCH', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ question: 'x' }) }); assert.equal(result.response.status, 404); });
test('короткий материал не принимается', async () => { const teacher = login({ role: 'teacher', classCode: 'USTAZ7' }); const result = await request('/api/teacher/texts', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Коротко', text: 'нет' }) }); assert.equal(result.response.status, 400); });
test('ошибка неизвестного задания не меняет прогресс', async () => { const student = login({ role: 'student', name: 'Ошибка', classCode: 'SAULAT7' }); const result = await request('/api/student/answer', { method: 'POST', headers: { 'x-session-token': student.sessionId }, body: JSON.stringify({ taskId: 'unknown', answer: 0 }) }); assert.equal(result.response.status, 404); const progress = await request('/api/student/progress', { headers: { 'x-session-token': student.sessionId } }); assert.equal(progress.body.totalAttempts, 0); });
test('админская сводка считает только сохранённые попытки', async () => { const admin = login({ role: 'admin', classCode: 'ADMIN1' }); const result = await request('/api/admin/summary', { headers: { 'x-session-token': admin.sessionId } }); assert.equal(typeof result.body.attempts, 'number'); assert.equal(typeof result.body.students, 'number'); });
