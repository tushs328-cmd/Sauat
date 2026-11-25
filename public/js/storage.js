const KEY = 'sauat-progress-v1';
const LANG_KEY = 'sauat-lang';
const ONBOARDING_KEY = 'sauat-onboarded';

function blank() { return { schemaVersion: 1, xp: 0, tasks: {}, completedStories: [], history: [] }; }

export function loadProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    return value && value.schemaVersion === 1 ? { ...blank(), ...value } : blank();
  } catch { return blank(); }
}

export function saveProgress(progress) { localStorage.setItem(KEY, JSON.stringify(progress)); }
export function loadLanguage() { return localStorage.getItem(LANG_KEY) === 'kk' ? 'kk' : 'ru'; }
export function saveLanguage(lang) { localStorage.setItem(LANG_KEY, lang); }
export function hasOnboarded() { return localStorage.getItem(ONBOARDING_KEY) === '1'; }
export function finishOnboarding() { localStorage.setItem(ONBOARDING_KEY, '1'); }

export function taskProgress(progress, storyId, taskId) {
  return progress.tasks[`${storyId}:${taskId}`] || { attempts: 0, hintsUsed: 0, firstTry: null, xpAwarded: false, solved: false };
}

export function recordAttempt(progress, story, task, result) {
  const key = `${story.id}:${task.id}`;
  const previous = taskProgress(progress, story.id, task.id);
  const isFirstAttempt = previous.attempts === 0;
  const entry = { ...previous, attempts: previous.attempts + 1, firstTry: previous.firstTry ?? { ...result }, solved: previous.solved || result.complete };
  if (result.complete && !entry.xpAwarded) { entry.xpAwarded = true; progress.xp += 25; }
  progress.tasks[key] = entry;
  progress.history.push({ storyId: story.id, taskId: task.id, ...result, hintsUsed: entry.hintsUsed, firstTry: isFirstAttempt, ts: new Date().toISOString() });
  const solved = story.tasks.every((item) => taskProgress(progress, story.id, item.id).solved);
  if (solved && !progress.completedStories.includes(story.id)) progress.completedStories.push(story.id);
  saveProgress(progress);
  return entry;
}

export function recordHint(progress, storyId, taskId) {
  const key = `${storyId}:${taskId}`;
  const entry = taskProgress(progress, storyId, taskId);
  const next = { ...entry, hintsUsed: Math.min(entry.hintsUsed + 1, 3) };
  progress.tasks[key] = next;
  saveProgress(progress);
  return next;
}

export function resetProgress() { localStorage.removeItem(KEY); localStorage.removeItem(ONBOARDING_KEY); }
