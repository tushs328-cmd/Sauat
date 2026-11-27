import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';
import { clearSessions, login } from '../src/auth.js';
import { getMentorContext } from '../src/mentor.js';

process.env.SAULAT_INCLUDE_FIXTURE = '1';

let server;
let base;
let dataPath;
const originalOllamaUrl = process.env.OLLAMA_URL;
const originalTimeout = process.env.SAULAT_MENTOR_TIMEOUT_MS;

async function request(url, options = {}) {
  const response = await fetch(`${base}${url}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  return { response, body };
}

function input(taskId = 't1') {
  return { storyId: 'fixture_test', taskId, skill: 'find', errorProfile: { answerWrong: true, evidenceWrong: false, attempt: 1, hintsUsed: 0, lastHintLevel: 0 }, lang: 'ru' };
}

async function mockOllama(handler, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/api/generate')) return handler(options);
    return originalFetch(url, options);
  };
  try { return await callback(); } finally { globalThis.fetch = originalFetch; }
}

before(async () => {
  dataPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-sauat-api-')), 'events.json');
  server = http.createServer(createApp({
    dataPath,
    mentorContextResolver: (mentorInput) => mentorInput.storyId === 'diag_stub'
      ? { story: { kind: 'diagnostic' }, hintIds: [], nextTaskIds: [], task: { id: mentorInput.taskId } }
      : getMentorContext(mentorInput)
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  clearSessions();
  server.close();
  if (originalOllamaUrl === undefined) delete process.env.OLLAMA_URL; else process.env.OLLAMA_URL = originalOllamaUrl;
  if (originalTimeout === undefined) delete process.env.SAULAT_MENTOR_TIMEOUT_MS; else process.env.SAULAT_MENTOR_TIMEOUT_MS = originalTimeout;
  delete process.env.SAULAT_INCLUDE_FIXTURE;
});

test('content API отдаёт манифест и fixture только в dev-флаге', async () => {
  const health = await request('/api/health');
  assert.equal(health.body.includeDraft, false);
  const manifest = await request('/content/manifest.json');
  assert.equal(manifest.response.status, 200);
  assert.deepEqual(manifest.body.stories.map((story) => story.id), ['fixture_test']);
  const story = await request('/content/fixture_test.json');
  assert.equal(story.response.status, 200);
  assert.equal(story.body.isTestFixture, true);
});

test('INCLUDE_DRAFT включает case_001 только в dev и mentor принимает t1–t4 allowlist hints', async () => {
  process.env.INCLUDE_DRAFT = '1';
  delete process.env.OLLAMA_URL;
  const health = await request('/api/health');
  assert.equal(health.body.includeDraft, true);
  const manifest = await request('/content/manifest.json');
  const manifestIds = manifest.body.stories.map((story) => story.id);
  for (const id of ['case_001', 'case_002', 'diag_entry_001', 'diag_exit_001', 'fixture_test']) assert.ok(manifestIds.includes(id), `${id} отсутствует в manifest`);
  assert.ok(manifest.body.stories.every((story) => story.reviewStatus && story.title));
  const firstDiagnostic = manifest.body.stories.findIndex((story) => story.kind === 'diagnostic');
  assert.ok(manifest.body.stories.slice(0, firstDiagnostic).every((story) => story.kind === 'practice'));
  assert.ok(manifest.body.stories.slice(firstDiagnostic).every((story) => story.kind === 'diagnostic'));

  const caseStory = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', 'case_001.json'), 'utf8'));
  for (const task of caseStory.tasks) {
    const result = await request('/api/mentor', {
      method: 'POST',
      body: JSON.stringify({ storyId: 'case_001', taskId: task.id, skill: task.skill, errorProfile: { answerWrong: true, evidenceWrong: false, attempt: 1, hintsUsed: 0, lastHintLevel: 0 }, lang: 'ru' })
    });
    assert.equal(result.response.status, 200, task.id);
    assert.equal(result.body.source, 'rules');
    assert.ok(task.hints.some((hint) => hint.id === result.body.hintId), `${task.id}: hintId вне allowlist`);
  }
  process.env.INCLUDE_DRAFT = '0';
  const hidden = await request('/content/case_001.json');
  assert.equal(hidden.response.status, 404);
});

test('mentor без Ollama честно использует rules fallback', async () => {
  delete process.env.OLLAMA_URL;
  const result = await request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.source, 'rules');
  assert.equal(result.body.hintId, 'h1');
});

test('mentor запрещён для diagnostic-историй', async () => {
  const result = await request('/api/mentor', {
    method: 'POST',
    body: JSON.stringify({ storyId: 'diag_stub', taskId: 't1', skill: 'find', errorProfile: { answerWrong: true, evidenceWrong: false, attempt: 1, hintsUsed: 0, lastHintLevel: 0 }, lang: 'ru' })
  });
  assert.equal(result.response.status, 400);
});

test('mentor принимает только allowlisted structured response', async () => {
  process.env.OLLAMA_URL = 'http://ollama.test';
  let seenPrompt = '';
  const valid = await mockOllama(async (options) => {
    const sent = JSON.parse(options.body);
    seenPrompt = sent.prompt;
    return new Response(JSON.stringify({ response: JSON.stringify({ strategy: 'locate', hintId: 'h1', nextTaskId: 't2' }) }), { status: 200, headers: { 'content-type': 'application/json' } });
  }, () => request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) }));
  assert.equal(valid.body.source, 'ai');
  assert.equal(valid.body.nextTaskId, 't2');
  assert.doesNotMatch(seenPrompt, /Бумажный мост|ТЕСТОВЫЙ ФРАГМЕНТ/);
  const promptObject = JSON.parse(seenPrompt);
  assert.equal(promptObject.fewShot.length, 4);
  assert.match(promptObject.rules.join(' '), /nextTaskId/);

  const invalidJson = await mockOllama(async () => new Response(JSON.stringify({ response: '{bad json' }), { status: 200 }), () => request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) }));
  assert.equal(invalidJson.body.source, 'rules');
  const invalidId = await mockOllama(async () => new Response(JSON.stringify({ response: JSON.stringify({ strategy: 'locate', hintId: 'h3', nextTaskId: 't2' }) }), { status: 200 }), () => request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) }));
  assert.equal(invalidId.body.source, 'rules');
  assert.equal(invalidId.body.hintId, 'h1');
});

test('rules mentor raises hint level one step and never skips next task', async () => {
  process.env.INCLUDE_DRAFT = '1';
  delete process.env.OLLAMA_URL;
  const requestFor = (lastHintLevel) => request('/api/mentor', { method: 'POST', body: JSON.stringify({ storyId: 'case_001', taskId: 't2', skill: 'infer', errorProfile: { answerWrong: true, evidenceWrong: false, attempt: lastHintLevel + 1, hintsUsed: lastHintLevel, lastHintLevel }, lang: 'ru' }) });
  const first = await requestFor(0);
  const second = await requestFor(1);
  const third = await requestFor(2);
  assert.deepEqual([first.body.hintId, second.body.hintId, third.body.hintId], ['t2_h1', 't2_h2', 't2_h3']);
  assert.equal(first.body.strategy, 'locate');
  assert.deepEqual([first.body.nextTaskId, second.body.nextTaskId, third.body.nextTaskId], ['t3', 't3', 't3']);
  process.env.INCLUDE_DRAFT = '0';
});

test('mentor timeout, body limit и rate limit не раскрывают модель', async () => {
  process.env.OLLAMA_URL = 'http://ollama.test';
  process.env.SAULAT_MENTOR_TIMEOUT_MS = '10';
  const timeout = await mockOllama(async (options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')))), () => request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) }));
  assert.equal(timeout.body.source, 'rules');
  const tooLarge = await fetch(`${base}/api/mentor`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input(), padding: 'x'.repeat(2200) }) });
  assert.equal(tooLarge.status, 413);
  delete process.env.OLLAMA_URL;
  let last;
  for (let index = 0; index < 31; index += 1) last = await request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) });
  assert.equal(last.response.status, 429);
});

test('events deduplicate, import safely and calculate main metric', async () => {
  const event = { eventId: 'event-1', anonId: 'anon-a', ts: new Date().toISOString(), contentVersion: 1, storyId: 'fixture_test', taskId: 't1', skill: 'find', mode: 'practice', attempt: 1, answerCorrect: true, evidenceCorrect: true, hintsUsed: 0, firstTry: true, lang: 'ru', mentorSource: 'none' };
  const first = await request('/api/events', { method: 'POST', body: JSON.stringify({ events: [event] }) });
  assert.deepEqual(first.body, { accepted: 1, duplicates: 0, rejected: 0 });
  const duplicate = await request('/api/events', { method: 'POST', body: JSON.stringify({ events: [event] }) });
  assert.deepEqual(duplicate.body, { accepted: 0, duplicates: 1, rejected: 0 });

  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  const event2 = { ...event, eventId: 'event-2', anonId: 'anon-b', taskId: 't2', skill: 'infer', mode: 'diagnostic', evidenceCorrect: true, mentorSource: 'rules', errorType: 'fact_not_found' };
  const imported = await request('/api/teacher/import', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ events: [event2] }) });
  assert.deepEqual(imported.body, { accepted: 1, duplicates: 0, rejected: 0 });
  const entryEvent = { ...event, eventId: 'event-3', anonId: 'anon-c', storyId: 'diag_entry', answerCorrect: false, mode: 'diagnostic' };
  const exitEvent = { ...event, eventId: 'event-4', anonId: 'anon-d', storyId: 'diag_exit', taskId: 't3', skill: 'evidence', mode: 'diagnostic' };
  const diagnostics = await request('/api/events', { method: 'POST', body: JSON.stringify({ events: [entryEvent, exitEvent] }) });
  assert.deepEqual(diagnostics.body, { accepted: 2, duplicates: 0, rejected: 0 });
  const diagnosticDuplicate = await request('/api/events', { method: 'POST', body: JSON.stringify({ events: [entryEvent] }) });
  assert.deepEqual(diagnosticDuplicate.body, { accepted: 0, duplicates: 1, rejected: 0 });
  const summary = await request('/api/teacher/summary', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(summary.body.mainMetric.num, 2);
  assert.equal(summary.body.mainMetric.den, 3);
  assert.equal(summary.body.skills.find.num, 0);
  assert.equal(summary.body.skills.find.den, 1);
  assert.equal(summary.body.skills.evidence.num, 1);
  assert.equal(summary.body.diagnostic.entry.mainMetric.num, 0);
  assert.equal(summary.body.diagnostic.entry.mainMetric.den, 1);
  assert.equal(summary.body.diagnostic.entry.skills.infer.display, 'нет данных');
  assert.equal(summary.body.diagnostic.exit.mainMetric.num, 1);
  assert.equal(summary.body.diagnostic.exit.mainMetric.den, 1);
  assert.equal(summary.body.learners, 3);
  const exported = await request('/api/teacher/export', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(exported.body.events.length, 4);
  const csv = await request('/api/teacher/export.csv', { headers: { 'x-session-token': teacher.sessionId } });
  assert.match(csv.body, /Навык/);
  assert.match(csv.body, /firstTry/);
  assert.match(csv.body, /errorType/);
  assert.match(csv.body, /fact_not_found/);
  assert.doesNotMatch(csv.body, /Имя|Класс|anon-a|anon-b/);

  const form = new FormData();
  form.append('file', new Blob(['{ broken'], { type: 'application/json' }), 'broken.json');
  const damaged = await fetch(`${base}/api/teacher/import`, { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: form });
  assert.equal(damaged.status, 400);
  const damagedBody = await damaged.json();
  assert.equal(damagedBody.accepted, 0);
  const after = await request('/api/teacher/summary', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(after.body.learners, 3);
});

test('teacher import handles 500 events, duplicates, broken and oversized files', async () => {
  const teacher = login({ role: 'teacher', classCode: 'USTAZ7' });
  const baseEvent = {
    anonId: 'load-anon',
    ts: new Date().toISOString(),
    contentVersion: 1,
    storyId: 'fixture_test',
    taskId: 't1',
    skill: 'find',
    mode: 'practice',
    attempt: 1,
    answerCorrect: true,
    evidenceCorrect: true,
    hintsUsed: 0,
    firstTry: true,
    lang: 'ru',
    mentorSource: 'none'
  };
  const events = Array.from({ length: 500 }, (_, index) => ({ ...baseEvent, eventId: 'load-' + index, anonId: 'load-anon-' + index }));
  const upload = (payload, name = 'events.json') => {
    const form = new FormData();
    form.append('file', new Blob([typeof payload === 'string' ? payload : JSON.stringify(payload)], { type: 'application/json' }), name);
    return fetch(base + '/api/teacher/import', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: form });
  };

  const loaded = await upload({ events });
  assert.equal(loaded.status, 200);
  assert.deepEqual(await loaded.json(), { accepted: 500, duplicates: 0, rejected: 0 });

  const duplicate = await upload({ events }, 'duplicates.json');
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { accepted: 0, duplicates: 500, rejected: 0 });

  const broken = await upload('{broken', 'broken.json');
  assert.equal(broken.status, 400);
  assert.equal((await broken.json()).accepted, 0);

  const oversized = await upload('x'.repeat(2 * 1024 * 1024 + 1), 'oversized.json');
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).accepted, 0);
});
