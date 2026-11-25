import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../src/server.js';
import { clearSessions, login } from '../src/auth.js';

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
  server = http.createServer(createApp({ dataPath }));
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
  const manifest = await request('/content/manifest.json');
  assert.equal(manifest.response.status, 200);
  assert.deepEqual(manifest.body.stories.map((story) => story.id), ['fixture_test']);
  const story = await request('/content/fixture_test.json');
  assert.equal(story.response.status, 200);
  assert.equal(story.body.isTestFixture, true);
});

test('mentor без Ollama честно использует rules fallback', async () => {
  delete process.env.OLLAMA_URL;
  const result = await request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.source, 'rules');
  assert.equal(result.body.hintId, 'h1');
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

  const invalidJson = await mockOllama(async () => new Response(JSON.stringify({ response: '{bad json' }), { status: 200 }), () => request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) }));
  assert.equal(invalidJson.body.source, 'rules');
  const invalidId = await mockOllama(async () => new Response(JSON.stringify({ response: JSON.stringify({ strategy: 'locate', hintId: 'not-allowed', nextTaskId: null }) }), { status: 200 }), () => request('/api/mentor', { method: 'POST', body: JSON.stringify(input()) }));
  assert.equal(invalidId.body.source, 'rules');
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
  const event2 = { ...event, eventId: 'event-2', anonId: 'anon-b', taskId: 't2', skill: 'infer', mode: 'diagnostic', evidenceCorrect: true, mentorSource: 'rules' };
  const imported = await request('/api/teacher/import', { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: JSON.stringify({ events: [event2] }) });
  assert.deepEqual(imported.body, { accepted: 1, duplicates: 0, rejected: 0 });
  const summary = await request('/api/teacher/summary', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(summary.body.mainMetric.num, 1);
  assert.equal(summary.body.mainMetric.den, 1);
  assert.equal(summary.body.learners, 2);
  const exported = await request('/api/teacher/export', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(exported.body.events.length, 2);

  const form = new FormData();
  form.append('file', new Blob(['{ broken'], { type: 'application/json' }), 'broken.json');
  const damaged = await fetch(`${base}/api/teacher/import`, { method: 'POST', headers: { 'x-session-token': teacher.sessionId }, body: form });
  assert.equal(damaged.status, 400);
  const damagedBody = await damaged.json();
  assert.equal(damagedBody.accepted, 0);
  const after = await request('/api/teacher/summary', { headers: { 'x-session-token': teacher.sessionId } });
  assert.equal(after.body.learners, 2);
});
