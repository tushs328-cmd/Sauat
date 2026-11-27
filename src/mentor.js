import { getManifest, getStoryForPublic } from './content.js';

const strategies = ['locate', 'compare', 'check_contradiction'];

function responseSchema(allowedStrategies, hintIds, nextTaskId) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['strategy', 'hintId', 'nextTaskId'],
    properties: {
      strategy: { type: 'string', enum: allowedStrategies },
      hintId: { type: ['string', 'null'], enum: [...hintIds, null] },
      nextTaskId: { type: ['string', 'null'], enum: [nextTaskId] }
    }
  };
}

function storyContext(storyId) {
  const manifest = getManifest();
  const entry = manifest.stories.find((story) => story.id === storyId);
  if (!entry) return null;
  const story = getStoryForPublic(entry.file);
  if (!story) return null;
  return { story, entry };
}

function allowedContext(story, taskId, errorProfile = {}) {
  const task = story.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  const taskIndex = story.tasks.findIndex((item) => item.id === taskId);
  const nextTaskIds = story.tasks.filter((item, index) => index > taskIndex).map((item) => item.id);
  const targetLevel = Math.min(Math.max(Number(errorProfile.lastHintLevel) || 0, 0) + 1, 3);
  const levelHints = task.hints.filter((hint) => hint.level === targetLevel);
  const fallbackStrategies = task.type === 'claim_check' ? ['check_contradiction'] : ['compare'];
  const desiredStrategy = strategyFor(task, errorProfile);
  const allowedStrategies = [...new Set([...levelHints.map((hint) => hint.strategy).filter(Boolean), desiredStrategy])];
  return {
    task,
    targetLevel,
    hintIds: levelHints.map((hint) => hint.id),
    nextTaskIds,
    nextTaskId: nextTaskIds[0] || null,
    allowedStrategies: allowedStrategies.length ? allowedStrategies : fallbackStrategies
  };
}

export function getMentorContext({ storyId, taskId, errorProfile }) {
  const context = storyContext(storyId);
  if (!context) return null;
  const allowed = allowedContext(context.story, taskId, errorProfile);
  if (!allowed) return null;
  return { ...context, ...allowed };
}

function strategyFor(task, errorProfile) {
  // Если ошибочны и ответ, и доказательство, сначала возвращаем ученика к исходному факту (locate).
  if (errorProfile.answerWrong) return 'locate';
  if (errorProfile.evidenceWrong) return task.type === 'claim_check' ? 'check_contradiction' : 'compare';
  return 'compare';
}

export function ruleResponse(context, errorProfile) {
  const { task, nextTaskId } = context;
  const nextLevel = Math.min(Math.max(Number(errorProfile.lastHintLevel) || 0, 0) + 1, 3);
  const allHints = task.hints.slice().sort((left, right) => left.level - right.level);
  const targetHint = allHints.find((hint) => hint.level === nextLevel) || allHints[allHints.length - 1] || null;
  return { strategy: strategyFor(task, errorProfile), hintId: targetHint?.id || null, nextTaskId, source: 'rules', taskId: task.id };
}

function isAllowedResponse(value, context) {
  return value && typeof value === 'object'
    && context.allowedStrategies.includes(value.strategy)
    && (value.hintId === null || context.hintIds.includes(value.hintId))
    && value.nextTaskId === context.nextTaskId;
}

function timeoutMs() {
  const configured = Number(process.env.SAULAT_MENTOR_TIMEOUT_MS || 3500);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 3500) : 3500;
}

function fewShotExamples(context) {
  const firstHint = context.task.hints.slice().sort((left, right) => left.level - right.level)[0]?.id || null;
  const secondHint = context.task.hints.slice().sort((left, right) => left.level - right.level)[1]?.id || firstHint;
  const thirdHint = context.task.hints.slice().sort((left, right) => left.level - right.level)[2]?.id || secondHint;
  const evidenceStrategy = context.task.type === 'claim_check' ? 'check_contradiction' : 'compare';
  return [
    { profile: { answerWrong: true, evidenceWrong: false, attempt: 1, hintsUsed: 0, lastHintLevel: 0 }, answer: { strategy: 'locate', hintId: firstHint, nextTaskId: context.nextTaskId } },
    { profile: { answerWrong: false, evidenceWrong: true, attempt: 2, hintsUsed: 1, lastHintLevel: 1 }, answer: { strategy: evidenceStrategy, hintId: secondHint, nextTaskId: context.nextTaskId } },
    { profile: { answerWrong: true, evidenceWrong: true, attempt: 3, hintsUsed: 2, lastHintLevel: 2 }, answer: { strategy: evidenceStrategy, hintId: thirdHint, nextTaskId: context.nextTaskId } },
    { profile: { answerWrong: false, evidenceWrong: false, attempt: 2, hintsUsed: 0, lastHintLevel: 1 }, answer: { strategy: context.allowedStrategies[0], hintId: secondHint, nextTaskId: context.nextTaskId } }
  ];
}

export async function askStructuredMentor(input, context, { aiReady = true } = {}) {
  const fallback = ruleResponse(context, input.errorProfile);
  const baseUrl = process.env.OLLAMA_URL;
  if (!baseUrl || !aiReady) return fallback;
  const prompt = JSON.stringify({
    role: 'Выбор стратегии подсказки. Не создавай факты и не пиши текст ученику.',
    rules: [
      'Ответ неверен → strategy locate.',
      'Доказательство неверно → strategy compare, либо check_contradiction для claim_check.',
      'Оба неверны → повторная попытка с растущим уровнем подсказки; нельзя прыгать через уровень.',
      'nextTaskId всегда должен быть следующим заданием по порядку, без пропуска.'
    ],
    input: {
      storyId: input.storyId,
      taskId: input.taskId,
      skill: input.skill,
      lang: input.lang,
      errorProfile: input.errorProfile
    },
    allowed: { hintIds: context.hintIds, nextTaskIds: [context.nextTaskId], strategies: context.allowedStrategies, level: context.targetLevel },
    fewShot: fewShotExamples(context)
  });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
        prompt,
        stream: false,
        format: responseSchema(context.allowedStrategies, context.hintIds, context.nextTaskId),
        options: { temperature: 0 }
      }),
      signal: AbortSignal.timeout(timeoutMs())
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const candidate = JSON.parse(String(payload.response || ''));
    if (!isAllowedResponse(candidate, context)) return fallback;
    return { strategy: candidate.strategy, hintId: candidate.hintId, nextTaskId: candidate.nextTaskId, source: 'ai' };
  } catch {
    return fallback;
  }
}

export { responseSchema as mentorResponseSchema };
