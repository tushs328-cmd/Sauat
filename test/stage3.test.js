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
  const body = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  return { response, body };
}
before(async () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-stage3-')); server = http.createServer(createApp({ dataPath: path.join(dir, 'data.json') })); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => { clearSessions(); server.close(); });

test('учитель сохраняет материал и создаёт черновики с источником', async () => {
  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  const result = await request('/api/teacher/texts', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Тестовый материал', text: 'Школа открыла лабораторию. Ученики проводят опыты по пятницам. Результаты записывают в журнал.' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.generated.length, 3);
  assert.ok(result.body.generated[0].quote);
  assert.equal(result.body.generated[0].status, 'draft');
});

test('учитель может править черновик и опубликовать его классу', async () => {
  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  const created = await request('/api/teacher/texts', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Материал для класса', text: 'В школьном саду посадили яблони. Полив проходит утром. Дежурные следят за почвой.' }) });
  const id = created.body.generated[0].id;
  const edited = await request(`/api/teacher/drafts/${id}`, { method: 'PATCH', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ question: 'Какой факт указан?', options: ['Посадили яблони.', 'Закрыли сад.'] }) });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.body.draft.question, 'Какой факт указан?');
  const published = await request('/api/teacher/assignments', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Практика', classId: 'class-7a', taskIds: [id], dueDate: '2026-11-27', published: true }) });
  assert.equal(published.response.status, 200);
  const student = login({ role: 'student', name: 'Лаура', classCode: 'SAULAT7' });
  const assignments = await request('/api/student/assignments', { headers: { 'x-session-token': student.sessionId } });
  assert.equal(assignments.body.assignments.length, 1);
  assert.equal(assignments.body.assignments[0].tasks[0].question, 'Какой факт указан?');
  assert.equal('answer' in assignments.body.assignments[0].tasks[0], false);
});

test('ученик может ответить на авторское опубликованное задание', async () => {
  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  const created = await request('/api/teacher/texts', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Ответ', text: 'В классе появилась карта. Её изучают на уроке. Карта хранится в кабинете.' }) });
  const id = created.body.generated[0].id;
  await request('/api/teacher/assignments', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ title: 'Ответ', classId: 'class-7a', taskIds: [id], published: true }) });
  const student = login({ role: 'student', name: 'Марат', classCode: 'SAULAT7' });
  const answer = await request('/api/student/answer', { method: 'POST', headers: { 'x-session-token': student.sessionId }, body: JSON.stringify({ taskId: id, answer: 0 }) });
  assert.equal(answer.response.status, 200);
  assert.equal(answer.body.correct, true);
  const overview = await request('/api/teacher/overview', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(overview.body.skillMap.find.attempts, 1);
});

test('CSV экспорт защищён ролью и содержит заголовки', async () => {
  const student = login({ role: 'student', name: 'Ермек', classCode: 'SAULAT7' });
  const denied = await request('/api/teacher/export.csv', { headers: { 'x-session-token': student.sessionId } });
  assert.equal(denied.response.status, 403);
  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  const csv = await request('/api/teacher/export.csv', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(csv.response.status, 200);
  assert.match(csv.body, /Имя/);
  assert.match(csv.body, /Навык/);
});
