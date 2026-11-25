import { getManifest, getStoryForPublic } from './content.js';

const mentorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['strategy', 'hintId', 'nextTaskId'],
  properties: {
    strategy: { type: 'string', enum: ['locate', 'compare', 'check_contradiction'] },
    hintId: { type: ['string', 'null'] },
    nextTaskId: { type: ['string', 'null'] }
  }
};

const strategies = ['locate', 'compare', 'check_contradiction'];

function storyContext(storyId) {
  const manifest = getManifest();
  const entry = manifest.stories.find((story) => story.id === storyId);
  if (!entry) return null;
  const story = getStoryForPublic(entry.file);
  if (!story) return null;
  return { story, entry };
}

function allowedContext(story, taskId) {
  const task = story.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  const taskIndex = story.tasks.findIndex((item) => item.id === taskId);
  return {
    task,
    hintIds: task.hints.map((hint) => hint.id),
    nextTaskIds: story.tasks.filter((item, index) => index > taskIndex).map((item) => item.id)
  };
}

export function getMentorContext({ storyId, taskId }) {
  const context = storyContext(storyId);
  if (!context) return null;
  const allowed = allowedContext(context.story, taskId);
  if (!allowed) return null;
  return { ...context, ...allowed };
}

function ruleResponse(context, errorProfile) {
  const { task, hintIds, nextTaskIds } = context;
  const nextHintIndex = Math.min(Math.max(Number(errorProfile.lastHintLevel) || 0, 0), hintIds.length - 1);
  const hintId = hintIds.length ? hintIds[nextHintIndex] : null;
  const strategy = errorProfile.evidenceWrong ? 'check_contradiction' : errorProfile.answerWrong ? 'locate' : 'compare';
  return { strategy, hintId, nextTaskId: nextTaskIds[0] || null, source: 'rules', taskId: task.id };
}

function isAllowedResponse(value, context) {
  return value && typeof value === 'object'
    && strategies.includes(value.strategy)
    && (value.hintId === null || context.hintIds.includes(value.hintId))
    && (value.nextTaskId === null || context.nextTaskIds.includes(value.nextTaskId));
}

function timeoutMs() {
  const configured = Number(process.env.SAULAT_MENTOR_TIMEOUT_MS || 3500);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 3500) : 3500;
}

export async function askStructuredMentor(input, context) {
  const fallback = ruleResponse(context, input.errorProfile);
  const baseUrl = process.env.OLLAMA_URL;
  if (!baseUrl) return fallback;
  const prompt = JSON.stringify({
    role: 'Выбор стратегии подсказки. Не создавай факты и не пиши текст ученику.',
    input: {
      storyId: input.storyId,
      taskId: input.taskId,
      skill: input.skill,
      lang: input.lang,
      errorProfile: input.errorProfile
    },
    allowed: { hintIds: context.hintIds, nextTaskIds: context.nextTaskIds, strategies }
  });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
        prompt,
        stream: false,
        format: mentorResponseSchema,
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

export { mentorResponseSchema };
