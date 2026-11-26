const DB_NAME = 'saulat-client';
const DB_VERSION = 2;
const PROGRESS_KEY = 'saulat-progress-v1';
const LANG_KEY = 'saulat-lang';
const ONBOARDING_KEY = 'saulat-onboarded';
const EVENTS_KEY = 'saulat-events-v1';
const ERROR_TYPES = ['fact_not_found', 'similar_not_proving', 'conclusion_beyond_data'];

function blank() { return { schemaVersion: 1, xp: 0, tasks: {}, completedStories: [], history: [] }; }
function localProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    return value && value.schemaVersion === 1 ? { ...blank(), ...value } : blank();
  } catch { return blank(); }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступен'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'eventId' });
      if (!db.objectStoreNames.contains('eventArchive')) db.createObjectStore('eventArchive', { keyPath: 'eventId' });
      if (!db.objectStoreNames.contains('teacherEvents')) db.createObjectStore('teacherEvents', { keyPath: 'eventId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB не открылся'));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  try { return await requestValue(db.transaction(storeName, 'readonly').objectStore(storeName).get(key)); } finally { db.close(); }
}

async function idbPut(storeName, value) {
  const db = await openDb();
  try { await requestValue(db.transaction(storeName, 'readwrite').objectStore(storeName).put(value)); } finally { db.close(); }
}

async function idbDelete(storeName, key) {
  const db = await openDb();
  try { await requestValue(db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key)); } finally { db.close(); }
}

async function idbAll(storeName) {
  const db = await openDb();
  try { return await requestValue(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()); } finally { db.close(); }
}

export async function loadProgress() {
  try {
    const stored = await idbGet('progress', 'state');
    if (stored?.value) return { ...blank(), ...stored.value };
    const migrated = localProgress();
    await idbPut('progress', { key: 'state', value: migrated });
    localStorage.removeItem(PROGRESS_KEY);
    return migrated;
  } catch { return localProgress(); }
}

export async function saveProgress(progress) {
  try { await idbPut('progress', { key: 'state', value: progress }); localStorage.removeItem(PROGRESS_KEY); }
  catch { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }
}

export function loadLanguage() { return localStorage.getItem(LANG_KEY) === 'kk' ? 'kk' : 'ru'; }
export function saveLanguage(lang) { localStorage.setItem(LANG_KEY, lang); }
export function hasOnboarded() { return localStorage.getItem(ONBOARDING_KEY) === '1'; }
export function finishOnboarding() { localStorage.setItem(ONBOARDING_KEY, '1'); }

export function taskProgress(progress, storyId, taskId) {
  return progress.tasks[`${storyId}:${taskId}`] || { attempts: 0, hintsUsed: 0, firstTry: null, xpAwarded: false, xpEarned: 0, solved: false };
}

export async function recordAttempt(progress, story, task, result, { persist = true, selectedOptions = [], selectedEvidence = [] } = {}) {
  const key = `${story.id}:${task.id}`;
  const previous = taskProgress(progress, story.id, task.id);
  const isFirstAttempt = previous.attempts === 0;
  const earnedBefore = Number(previous.xpEarned || (previous.xpAwarded ? 25 : 0));
  const earnedNow = story.kind === 'practice' && result.complete && !previous.xpAwarded ? 25 : 0;
  const entry = { ...previous, attempts: previous.attempts + 1, firstTry: previous.firstTry ?? { ...result }, selectedOptionIds: [...selectedOptions], selectedEvidenceIds: [...selectedEvidence], solved: previous.solved || result.complete, xpAwarded: previous.xpAwarded || earnedNow > 0, xpEarned: earnedBefore + earnedNow };
  progress.xp += earnedNow;
  progress.tasks[key] = entry;
  progress.history.push({ storyId: story.id, taskId: task.id, ...result, hintsUsed: entry.hintsUsed, firstTry: isFirstAttempt, ts: new Date().toISOString() });
  const solved = story.tasks.every((item) => taskProgress(progress, story.id, item.id).solved);
  if (solved && !progress.completedStories.includes(story.id)) progress.completedStories.push(story.id);
  if (persist) await saveProgress(progress);
  return { ...entry, isFirstAttempt };
}

export async function recordHint(progress, storyId, taskId, { persist = true } = {}) {
  const key = `${storyId}:${taskId}`;
  const entry = taskProgress(progress, storyId, taskId);
  const next = { ...entry, hintsUsed: Math.min(entry.hintsUsed + 1, 3) };
  progress.tasks[key] = next;
  if (persist) await saveProgress(progress);
  return next;
}

export async function getAnonId() {
  try {
    const stored = await idbGet('meta', 'anonId');
    if (stored?.value) return stored.value;
    const value = globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await idbPut('meta', { key: 'anonId', value });
    return value;
  } catch { return 'local-anonymous'; }
}

export async function queueEvent(event) {
  try { await idbPut('events', event); await idbPut('eventArchive', event); }
  catch {
    const events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    if (!events.some((item) => item.eventId === event.eventId)) localStorage.setItem(EVENTS_KEY, JSON.stringify([...events, event]));
  }
}

export async function exportEvents() {
  try {
    const archived = await idbAll('eventArchive');
    const pending = await idbAll('events');
    const byId = new Map([...archived, ...pending].map((event) => [event.eventId, event]));
    return [...byId.values()].sort((left, right) => String(left.ts).localeCompare(String(right.ts)));
  } catch {
    try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); } catch { return []; }
  }
}

function validEvent(event) {
  return event && typeof event === 'object' && typeof event.eventId === 'string' && event.eventId.length > 0
    && typeof event.anonId === 'string' && typeof event.ts === 'string' && Number.isInteger(event.contentVersion)
    && typeof event.storyId === 'string' && typeof event.taskId === 'string'
    && ['find', 'infer', 'evidence'].includes(event.skill) && ['practice', 'diagnostic', 'jury'].includes(event.mode)
    && Number.isInteger(event.attempt) && event.attempt > 0 && typeof event.answerCorrect === 'boolean'
    && typeof event.evidenceCorrect === 'boolean' && Number.isInteger(event.hintsUsed) && event.hintsUsed >= 0
    && typeof event.firstTry === 'boolean' && ['kk', 'ru'].includes(event.lang)
    && (!('errorType' in event) || event.errorType === null || ERROR_TYPES.includes(event.errorType))
    && ['ai', 'rules', 'none'].includes(event.mentorSource);
}

function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.events)) return payload.events;
  return null;
}

export async function loadTeacherEvents() {
  try { return await idbAll('teacherEvents'); } catch { return []; }
}

export async function importTeacherEvents(payload) {
  const incoming = extractEvents(payload);
  if (!incoming) throw new Error('Файл должен содержать массив events.');
  if (incoming.some((event) => !validEvent(event))) throw new Error('Файл содержит повреждённое или несовместимое событие.');
  const existing = new Set((await loadTeacherEvents()).map((event) => event.eventId));
  const batch = new Set();
  let accepted = 0;
  let duplicates = 0;
  for (const event of incoming) {
    if (existing.has(event.eventId) || batch.has(event.eventId)) { duplicates += 1; continue; }
    batch.add(event.eventId);
    await idbPut('teacherEvents', event);
    accepted += 1;
  }
  return { accepted, duplicates, rejected: 0 };
}

export async function flushEvents() {
  if (!navigator.onLine) return { sent: 0 };
  let events;
  try { events = await idbAll('events'); } catch { events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); }
  if (!events.length) return { sent: 0 };
  // Старый сервер принимает прежнюю схему; расширенное событие остаётся в локальном архиве
  // и экспортируется учителю, а в telemetry отправляется совместимое представление.
  const batch = events.slice(0, 500);
  const response = await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: batch.map(({ errorType, ...event }) => event) }), signal: AbortSignal.timeout(3500) });
  if (!response.ok) throw new Error(`events HTTP ${response.status}`);
  if (response.headers.get('x-saulat-offline') === '1') throw new Error('events deferred while offline');
  for (const event of batch) { try { await idbDelete('events', event.eventId); } catch { /* local fallback is best effort */ } }
  localStorage.removeItem(EVENTS_KEY);
  return response.json();
}

export async function resetProgress() {
  try { await idbDelete('progress', 'state'); } catch { /* fallback below */ }
  try { const events = await idbAll('events'); for (const event of events) await idbDelete('events', event.eventId); } catch { /* fallback below */ }
  try { const events = await idbAll('eventArchive'); for (const event of events) await idbDelete('eventArchive', event.eventId); } catch { /* fallback below */ }
  localStorage.removeItem(PROGRESS_KEY); localStorage.removeItem(EVENTS_KEY); localStorage.removeItem(ONBOARDING_KEY);
}
