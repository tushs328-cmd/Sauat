import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';
import { clearSessions, login } from '../src/auth.js';
import { getTask, publicTask, taskBank, taskCounts } from '../src/taskBank.js';

let server;
let base;
let dataPath;

async function request(url, options = {}) {
  const response = await fetch(`${base}${url}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  return { response, body };
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-stage1-'));
  dataPath = path.join(dir, 'data.json');
  server = http.createServer(createApp({ dataPath }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => { clearSessions(); server.close(); });

test('банк содержит 60 заданий требуемых типов', () => {
  assert.equal(taskBank.length, 60);
  assert.equal(taskCounts.reading, 30);
  assert.equal(taskCounts.math, 20);
  assert.equal(taskCounts.mixed, 10);
  assert.ok(taskCounts.kz >= 15);
  assert.equal(new Set(taskBank.map((task) => task.id)).size, 60);
});

test('задания имеют источник и безопасный публичный вид', () => {
  const task = getTask('read-water-1');
  assert.ok(task.text.length > 40);
  assert.ok(task.quote.length > 10);
  const safe = publicTask(task);
  assert.equal('answer' in safe, false);
  assert.equal('explanation' in safe, false);
});

test('вход ученика принимает только имя и код класса', () => {
  const user = login({ role: 'student', name: 'Аян', classCode: 'SAULAT7' });
  assert.equal(user.role, 'student');
  assert.equal(user.classId, 'class-7a');
  assert.throws(() => login({ role: 'student', name: 'a@b.kz', classCode: 'SAULAT7' }), /без почты/);
  assert.throws(() => login({ role: 'student', name: 'Аян', classCode: 'wrong' }), /код класса/);
});

test('health сообщает честный офлайн-режим', async () => {
  const { response, body } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.mode, /Без ИИ/);
});

test('API логин возвращает сессию и режим', async () => {
  const { response, body } = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ role: 'student', name: 'Меруерт', classCode: 'SAULAT7' }) });
  assert.equal(response.status, 200);
  assert.equal(body.user.role, 'student');
  assert.ok(body.user.sessionId);
  assert.match(body.mode, /Без ИИ/);
});

test('защищённый список задач требует вход', async () => {
  const unauth = await request('/api/tasks');
  assert.equal(unauth.response.status, 401);
  const user = login({ role: 'student', name: 'Дана', classCode: 'SAULAT7' });
  const result = await request('/api/tasks?subject=math&lang=kz', { headers: { 'x-session-token': user.sessionId } });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.tasks.length > 0);
  assert.equal(result.body.tasks.every((task) => task.subject === 'math' && task.lang === 'kz'), true);
});

test('следующее задание подбирается по навыку', async () => {
  const user = login({ role: 'student', name: 'Илья', classCode: 'SAULAT7' });
  const result = await request('/api/student/next-task', { headers: { 'x-session-token': user.sessionId } });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.task.id);
  assert.ok(result.body.recommendation.skill);
});

test('ученик отвечает, а прогресс считает результат', async () => {
  const user = login({ role: 'student', name: 'Сая', classCode: 'SAULAT7' });
  const answer = await request('/api/student/answer', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-1', answer: 0 }) });
  assert.equal(answer.response.status, 200);
  assert.equal(answer.body.correct, true);
  assert.match(answer.body.quote, /Совет школы/);
  const progress = await request('/api/student/progress', { headers: { 'x-session-token': user.sessionId } });
  assert.equal(progress.body.totalAttempts, 1);
  assert.equal(progress.body.accuracy, 100);
  assert.equal(progress.body.skills.find.attempts, 1);
});

test('наставник не раскрывает разбор до первой попытки', async () => {
  const user = login({ role: 'student', name: 'Рауан', classCode: 'SAULAT7' });
  const result = await request('/api/student/mentor', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-3', level: 3, attempted: false }) });
  assert.equal(result.body.requiresAttempt, true);
  assert.ok(result.body.quote);
  const after = await request('/api/student/mentor', { method: 'POST', headers: { 'x-session-token': user.sessionId }, body: JSON.stringify({ taskId: 'read-water-3', level: 3, attempted: true }) });
  assert.equal(after.body.readyAnswer, false);
  assert.match(after.body.message, /Разбор/);
});

test('роли ограничивают teacher и admin API', async () => {
  const student = login({ role: 'student', name: 'Тимур', classCode: 'SAULAT7' });
  const denied = await request('/api/teacher/overview', { headers: { 'x-session-token': student.sessionId } });
  assert.equal(denied.response.status, 403);
  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  const overview = await request('/api/teacher/overview', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(overview.response.status, 200);
  const admin = login({ role: 'admin', classCode: 'ADMIN1' });
  const summary = await request('/api/admin/summary', { headers: { 'x-session-token': admin.sessionId } });
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.classes.length, 3);
});
