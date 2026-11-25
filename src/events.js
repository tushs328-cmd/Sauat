const allowedEventKeys = new Set(['eventId', 'anonId', 'ts', 'contentVersion', 'storyId', 'taskId', 'skill', 'mode', 'attempt', 'answerCorrect', 'evidenceCorrect', 'hintsUsed', 'firstTry', 'lang', 'mentorSource']);
const skills = ['find', 'infer', 'evidence'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringId(value, pattern = /^[A-Za-z0-9_-]+$/) {
  return typeof value === 'string' && value.length > 0 && value.length <= 120 && pattern.test(value);
}

function eventError(path, message) {
  return { path, message };
}

export function validateEvent(event) {
  const errors = [];
  if (!isObject(event)) return { valid: false, errors: [eventError('/', 'событие должно быть объектом')] };
  for (const key of Object.keys(event)) {
    if (!allowedEventKeys.has(key)) errors.push(eventError(`/${key}`, 'поле запрещено'));
  }
  const required = ['eventId', 'anonId', 'ts', 'contentVersion', 'storyId', 'taskId', 'skill', 'mode', 'attempt', 'answerCorrect', 'evidenceCorrect', 'hintsUsed', 'firstTry', 'lang', 'mentorSource'];
  for (const key of required) if (!(key in event)) errors.push(eventError(`/${key}`, 'обязательное поле отсутствует'));
  if (!stringId(event.eventId)) errors.push(eventError('/eventId', 'нужен короткий безопасный ID'));
  if (!stringId(event.anonId)) errors.push(eventError('/anonId', 'нужен анонимный ID'));
  if (typeof event.ts !== 'string' || Number.isNaN(Date.parse(event.ts))) errors.push(eventError('/ts', 'нужна дата ISO-8601'));
  if (!Number.isInteger(event.contentVersion) || event.contentVersion < 1) errors.push(eventError('/contentVersion', 'нужна положительная версия контента'));
  if (!stringId(event.storyId, /^[a-z0-9_]+$/)) errors.push(eventError('/storyId', 'нужен ID истории без свободного текста'));
  if (!stringId(event.taskId, /^t[0-9]+$/)) errors.push(eventError('/taskId', 'нужен ID задания вида t1'));
  if (!skills.includes(event.skill)) errors.push(eventError('/skill', 'допустимы find, infer, evidence'));
  if (!['practice', 'diagnostic'].includes(event.mode)) errors.push(eventError('/mode', 'допустимы practice и diagnostic'));
  if (!Number.isInteger(event.attempt) || event.attempt < 1) errors.push(eventError('/attempt', 'номер попытки должен быть положительным числом'));
  if (typeof event.answerCorrect !== 'boolean') errors.push(eventError('/answerCorrect', 'нужно boolean'));
  if (typeof event.evidenceCorrect !== 'boolean') errors.push(eventError('/evidenceCorrect', 'нужно boolean'));
  if (!Number.isInteger(event.hintsUsed) || event.hintsUsed < 0) errors.push(eventError('/hintsUsed', 'нужно неотрицательное число'));
  if (typeof event.firstTry !== 'boolean') errors.push(eventError('/firstTry', 'нужно boolean'));
  if (!['kk', 'ru'].includes(event.lang)) errors.push(eventError('/lang', 'допустимы kk и ru'));
  if (!['ai', 'rules', 'none'].includes(event.mentorSource)) errors.push(eventError('/mentorSource', 'допустимы ai, rules и none'));
  return { valid: errors.length === 0, errors };
}

export function extractEvents(payload) {
  if (Array.isArray(payload)) return payload;
  if (isObject(payload) && Array.isArray(payload.events)) return payload.events;
  return null;
}

export function ingestEvents(storage, incoming) {
  const state = storage.read();
  const existingIds = new Set((state.events || []).map((event) => event.eventId));
  const batchIds = new Set();
  const acceptedEvents = [];
  const rejected = [];
  let duplicates = 0;
  for (const [index, event] of incoming.entries()) {
    const result = validateEvent(event);
    if (!result.valid) {
      rejected.push({ index, errors: result.errors });
      continue;
    }
    if (existingIds.has(event.eventId) || batchIds.has(event.eventId)) {
      duplicates += 1;
      continue;
    }
    batchIds.add(event.eventId);
    acceptedEvents.push(event);
  }
  if (acceptedEvents.length) {
    storage.update((nextState) => {
      nextState.events = [...(nextState.events || []), ...acceptedEvents];
      return nextState;
    });
  }
  return { accepted: acceptedEvents.length, duplicates, rejected: rejected.length, rejectedDetails: rejected };
}

function ratio(num, den) {
  return { num, den, ...(den === 0 ? { display: 'нет данных' } : {}) };
}

export function summarizeEvents(events) {
  const firstAttempts = events.filter((event) => event.firstTry);
  const skillsSummary = Object.fromEntries(skills.map((skill) => {
    const rows = firstAttempts.filter((event) => event.skill === skill);
    const num = rows.filter((event) => event.answerCorrect && (skill === 'find' || event.evidenceCorrect)).length;
    return [skill, ratio(num, rows.length)];
  }));
  const diagnostic = firstAttempts.filter((event) => event.mode === 'diagnostic');
  const mainNum = diagnostic.filter((event) => event.answerCorrect && event.evidenceCorrect && event.hintsUsed === 0).length;
  return { skills: skillsSummary, mainMetric: ratio(mainNum, diagnostic.length), learners: new Set(events.map((event) => event.anonId)).size };
}

