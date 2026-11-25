import { dictionary } from './i18n/index.js';
import { loadContent } from './content.js';
import { evaluateTask, nextHint, taskLabel } from './engine.js';
import { prepareOffline } from './offline.js';
import { finishOnboarding, flushEvents, getAnonId, hasOnboarded, loadLanguage, loadProgress, queueEvent, recordAttempt, recordHint, resetProgress, saveLanguage, taskProgress } from './storage.js';

const state = {
  lang: loadLanguage(), view: hasOnboarded() ? 'map' : 'onboarding', stories: [], story: null, manifest: null,
  taskIndex: 0, selectedOptions: [], selectedEvidence: [], feedback: null, hint: null, mentorState: 'none', mentorSource: 'none',
  progress: { schemaVersion: 1, xp: 0, tasks: {}, completedStories: [], history: [] }, offlineReady: false, offlineState: 'checking'
};
const app = document.querySelector('#app');
const t = (key) => dictionary(state.lang)[key] || dictionary('ru')[key] || key;
const text = (value) => value?.[state.lang] || value?.ru || '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const icon = (name) => ({ compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.6 5.1-2.7 6-6 2.7 6 2.6 2.7 6 2.6-6 6-2.6-6-2.7-2.6-6Z"/><circle cx="13.6" cy="13.8" r="1.5"/></svg>', lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' }[name] || '');

function header({ back = false } = {}) {
  const offlineLabel = state.offlineReady ? t('offlineReady') : state.offlineState === 'error' ? t('offlineNotReady') : t('offlineChecking');
  return `<header class="topbar"><button class="brand" data-action="map" type="button" aria-label="SAUAT"><span class="brand-mark">S</span><span><strong>SAUAT</strong><small>${esc(t('slogan'))}</small></span></button><div class="top-actions">${back ? `<button class="icon-button" data-action="map" type="button">← <span>${esc(t('back'))}</span></button>` : ''}<span class="offline-status ${state.offlineReady ? 'ready' : ''}"><span class="status-dot"></span>${esc(offlineLabel)}</span><span class="xp-pill"><span class="xp-star">XP</span> ${state.progress.xp}</span><button class="language-toggle" data-action="toggle-lang" type="button">${esc(dictionary(state.lang).other)}</button></div></header>`;
}

function storyBadge(story) { return story?.isTestFixture ? `<span class="tag sand">${esc(t('testBadge'))}</span>` : ''; }
function storyImage(story, className = 'story-image') {
  if (!story?.image?.file) return '';
  const file = String(story.image.file).replace(/^\/+/, '');
  return `<figure class="${className}"><img src="/${esc(file)}" alt="${esc(text(story.image.alt))}"><figcaption>${story.image.isReconstruction ? 'Реконструкция · SAUAT' : esc(story.image.credit || '')}</figcaption></figure>`;
}
function reviewBanner(story) {
  const notices = [];
  if (story?.reviewStatus?.[state.lang] !== 'approved') notices.push(`${t('review')} · ${story?.reviewStatus?.[state.lang] || 'draft'}`);
  if (story?.isTestFixture) notices.push(t('fixtureNotice'));
  return notices.length ? `<div class="notice review-notice"><span class="status-dot"></span><span>${esc(notices.join(' · '))}</span></div>` : '';
}
function taskTotals(story) {
  const total = story?.tasks?.length || 0;
  const solved = story?.tasks?.filter((task) => taskProgress(state.progress, story.id, task.id).solved).length || 0;
  const xp = story?.tasks?.reduce((sum, task) => sum + Number(taskProgress(state.progress, story.id, task.id).xpEarned || 0), 0) || 0;
  return { total, solved, xp };
}
function render() {
  if (!state.story && state.view !== 'onboarding') state.view = 'map';
  app.innerHTML = state.view === 'onboarding' ? onboarding() : state.view === 'map' ? map() : state.view === 'story' ? storyIntro() : state.view === 'task' ? taskScreen() : reveal();
  bind();
}

function onboarding() {
  return `<div class="page onboarding"><div class="onboarding-art" aria-label="${esc(state.lang === 'ru' ? 'Реконструкция карты экспедиции' : 'Экспедиция картасының реконструкциясы')}"><div class="sun"></div><div class="mountain mountain-one"></div><div class="mountain mountain-two"></div><div class="route route-one"></div><div class="route route-two"></div><div class="artifact-seal">S</div></div><div class="onboarding-copy"><div class="eyebrow">${esc(t('eyebrow'))}</div><h1>SAUAT</h1><p class="display-title">${esc(t('slogan'))}</p><p class="lead">${esc(t('intro'))}</p><div class="reconstruction-label">Реконструкция · SAUAT</div><section class="language-card"><h2>${esc(t('chooseLang'))}</h2><div class="lang-options"><button class="lang-choice ${state.lang === 'ru' ? 'selected' : ''}" data-lang="ru" type="button"><span>РУ</span>Русский</button><button class="lang-choice ${state.lang === 'kk' ? 'selected' : ''}" data-lang="kk" type="button"><span>ҚАЗ</span>Қазақша</button></div><p>${esc(t('languageNote'))}</p></section><button class="primary-button wide" data-action="onboard" type="button">${esc(t('start'))} <span aria-hidden="true">→</span></button></div></div>`;
}

function map() {
  const totals = taskTotals(state.story);
  const storyCount = Math.max(1, state.stories.length);
  const realNodes = state.stories.slice(0, 3).map((story, index) => {
    const storyTotals = taskTotals(story);
    const unlocked = index === 0 || state.progress.completedStories.includes(state.stories[index - 1]?.id);
    return `<article class="adventure-node ${unlocked ? 'active' : 'locked'}"><div class="node-number">${String(index + 1).padStart(2, '0')}</div>${index < Math.min(3, state.stories.length) - 1 ? '<div class="node-line"></div>' : ''}<div class="node-body"><div class="node-icon">${icon(unlocked ? 'compass' : 'lock')}</div><div><span class="tag ${unlocked ? 'gold' : 'muted-tag'}">${esc(unlocked ? t('unlocked') : t('locked'))}</span><h3>${esc(text(story.title))}</h3><p>${storyTotals.solved}/${storyTotals.total} ${esc(t('missions'))} · ${storyTotals.xp} ${esc(t('xp'))}</p></div></div></article>`;
  });
  while (realNodes.length < 3) {
    const index = realNodes.length;
    realNodes.push(`<article class="adventure-node locked"><div class="node-number">${String(index + 1).padStart(2, '0')}</div>${index < 2 ? '<div class="node-line"></div>' : ''}<div class="node-body"><div class="node-icon">${icon('lock')}</div><div><span class="tag muted-tag">${esc(t('locked'))}</span><h3>${esc(index === 1 ? (state.lang === 'ru' ? 'Следующая история' : 'Келесі тарих') : (state.lang === 'ru' ? 'Новая экспедиция' : 'Жаңа экспедиция'))}</h3><p>${esc(state.lang === 'ru' ? 'Откроется после проверки' : 'Тексеруден кейін ашылады')}</p></div></div></article>`);
  }
  const done = state.progress.completedStories.includes(state.story?.id);
  return `<div class="app-shell">${header()}<main class="page map-page" id="main"><div class="map-heading"><div><div class="eyebrow">${esc(t('map'))}</div><h1>${esc(text(state.story.title))}</h1><p>${esc(t('mapIntro'))}</p></div><div class="progress-chip"><strong>${totals.solved}/${totals.total}</strong><span>${esc(t('missions'))}</span></div></div>${reviewBanner(state.story)}<section class="hero-card"><div class="hero-copy"><span class="tag teal">${esc(t('unlocked'))}</span><h2>${esc(text(state.story.title))}</h2><p>${esc(text(state.story.hook))}</p><button class="primary-button" data-action="open-story" data-story="${esc(state.story.id)}" type="button">${esc(done ? t('continue') : t('start'))} <span aria-hidden="true">→</span></button></div>${storyImage(state.story, 'hero-image')}</section><section class="section-heading"><div><div class="eyebrow">${esc(t('adventure'))}</div><h2>${esc(t('map'))}</h2></div><span class="muted">1/${storyCount}</span></section><div class="adventure-track">${realNodes.join('')}</div><section class="museum-card"><div class="museum-icon">◆</div><div><div class="eyebrow">${esc(t('museum'))}</div><h2>${esc(done ? text(state.story.reward.title) : (state.lang === 'ru' ? 'Коллекция пока ждёт' : 'Жинақ күтіп тұр'))}</h2><p>${esc(done ? text(state.story.reward.text) : (state.lang === 'ru' ? 'Заверши первое приключение, чтобы открыть артефакт.' : 'Артефактты ашу үшін бірінші приключениені аяқта.'))}</p></div></section><button class="text-button reset-button" data-action="reset" type="button">${esc(t('reset'))}</button></main></div>`;
}

function storyIntro() {
  return `<div class="app-shell">${header({ back: true })}<main class="page story-page" id="main"><div class="story-hero"><div><span class="tag teal">${esc(t('hook'))}</span>${storyBadge(state.story)}<h1>${esc(text(state.story.title))}</h1><p class="story-hook">${esc(text(state.story.hook))}</p></div>${storyImage(state.story, 'story-image')}</div>${reviewBanner(state.story)}<section class="document-section"><div class="section-heading"><div><div class="eyebrow">${esc(t('documents'))}</div><h2>${esc(t('read'))}</h2></div><span class="progress-chip">${state.story.documents.length} ${esc(t('document'))}</span></div><div class="documents">${state.story.documents.map((doc) => `<article class="document-card"><div class="document-top"><span class="doc-id">${esc(doc.id.toUpperCase())}</span>${storyBadge(state.story)}</div><h3>${esc(text(doc.title))}</h3><div class="segments">${doc.segments.map((segment) => `<div class="segment"><span class="segment-id">${esc(segment.id)}</span><p>${esc(text(segment.text))}</p></div>`).join('')}</div></article>`).join('')}</div></section><button class="primary-button wide" data-action="start-tasks" type="button">${esc(t('beginTasks'))} <span aria-hidden="true">→</span></button></main></div>`;
}

function mentorBadge() {
  const label = state.mentorState === 'ai' ? t('mentorAi') : state.mentorState === 'offline' ? t('mentorOffline') : t('mentorRules');
  return `<span class="mentor-state ${state.mentorState}"><span class="status-dot"></span>${esc(label)}</span>`;
}

function taskScreen() {
  const task = state.story.tasks[state.taskIndex];
  const progress = taskProgress(state.progress, state.story.id, task.id);
  const evidence = state.story.documents.flatMap((doc) => doc.segments);
  const feedback = state.feedback ? `<div class="feedback ${state.feedback.complete ? 'success' : state.feedback.answerCorrect ? 'partial' : 'error'}" role="status"><strong>${esc(state.feedback.complete ? t('correct') : state.feedback.answerCorrect ? t('partial') : t('wrong'))}</strong><div class="feedback-grid"><span>${esc(t('answerCorrect'))}: ${state.feedback.answerCorrect ? '✓' : '×'}</span><span>${esc(t('evidenceCorrect'))}: ${state.feedback.evidenceCorrect ? '✓' : task.requireEvidence ? '×' : '—'}</span></div>${progress.firstTry ? `<small>${esc(t('firstSaved'))}</small>` : ''}</div>` : '';
  const hint = state.hint ? `<div class="hint-box">${mentorBadge()}<span class="hint-level">${esc(t('hintLevel'))} ${state.hint.level}</span><p>${esc(text(state.hint.text))}</p><small>${esc(state.mentorState === 'offline' ? t('mentorOffline') : state.mentorState === 'ai' ? t('mentorAi') : t('mentorRules'))}</small></div>` : '';
  return `<div class="app-shell">${header({ back: true })}<main class="page task-page" id="main"><div class="task-progress"><button class="back-link" data-action="story" type="button">← ${esc(t('documents'))}</button><span>${state.taskIndex + 1}/${state.story.tasks.length}</span></div><div class="progress-bar"><i style="width:${((state.taskIndex + 1) / state.story.tasks.length) * 100}%"></i></div><section class="task-card"><div class="task-heading"><span class="tag teal">${esc(taskLabel(task, dictionary(state.lang)))}</span>${storyBadge(state.story)}</div><h1>${esc(text(task.question))}</h1>${task.claim ? `<blockquote class="claim">«${esc(text(task.claim.text))}»</blockquote>` : ''}<fieldset class="answer-fieldset"><legend>${esc(t('answer'))}</legend><div class="option-grid">${task.options.map((option) => `<button class="choice ${state.selectedOptions.includes(option.id) ? 'selected' : ''}" data-option="${esc(option.id)}" type="button" aria-pressed="${state.selectedOptions.includes(option.id)}"><span class="choice-marker">${esc(option.id.toUpperCase())}</span><span>${esc(text(option.text))}</span></button>`).join('')}</div></fieldset>${task.requireEvidence ? `<fieldset class="evidence-fieldset"><legend>${esc(t('evidence'))}</legend><p class="helper">${esc(t('chooseEvidence'))}</p><div class="evidence-grid">${evidence.map((segment) => `<button class="evidence-choice ${state.selectedEvidence.includes(segment.id) ? 'selected' : ''}" data-evidence="${esc(segment.id)}" type="button" aria-pressed="${state.selectedEvidence.includes(segment.id)}"><span class="segment-id">${esc(segment.id)}</span><span>${esc(text(segment.text))}</span></button>`).join('')}</div></fieldset>` : ''}${feedback}${hint}<div class="task-actions">${state.feedback?.complete ? `<button class="primary-button wide" data-action="advance" type="button">${state.taskIndex === state.story.tasks.length - 1 ? esc(t('reveal')) : esc(t('nextTask'))} <span aria-hidden="true">→</span></button>` : `<button class="primary-button wide" data-action="submit" type="button">${esc(t('check'))}</button>`}${!state.feedback?.complete && state.feedback && progress.hintsUsed < 3 ? `<button class="secondary-button wide" data-action="hint" type="button">${esc(t('hintNext'))} · ${progress.hintsUsed + 1}</button>` : ''}</div></section></main></div>`;
}

function reveal() {
  const totals = taskTotals(state.story);
  return `<div class="app-shell">${header({ back: true })}<main class="page reveal-page" id="main"><div class="reveal-art">${storyImage(state.story, 'reveal-image')}<div class="reveal-glow"></div><div class="artifact">S</div><div class="confetti confetti-one"></div><div class="confetti confetti-two"></div><div class="confetti confetti-three"></div></div>${reviewBanner(state.story)}<div class="eyebrow">${esc(t('reward'))}</div><h1>${esc(text(state.story.reward.title))}</h1><p class="lead">${esc(text(state.story.reward.text))}</p><div class="reward-stats"><span><strong>+${totals.xp}</strong> XP</span><span><strong>${totals.solved}/${totals.total}</strong> ${esc(t('missions'))}</span></div><section class="sources-card"><div class="eyebrow">${esc(t('sources'))}</div>${state.story.sources.map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)} <span>↗</span></a>`).join('')}<small>${storyBadge(state.story)} · ${esc(state.story.sources[0]?.accessedAt || '')}</small></section><button class="primary-button wide" data-action="map" type="button">${esc(t('openMap'))} <span aria-hidden="true">→</span></button></main></div>`;
}

function bind() {
  document.querySelectorAll('[data-lang]').forEach((button) => button.addEventListener('click', () => { state.lang = button.dataset.lang; saveLanguage(state.lang); render(); }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => void action(button.dataset.action, button.dataset.story)));
  document.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', () => { state.selectedOptions = [button.dataset.option]; render(); }));
  document.querySelectorAll('[data-evidence]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.evidence; state.selectedEvidence = state.selectedEvidence.includes(id) ? state.selectedEvidence.filter((value) => value !== id) : [...state.selectedEvidence, id]; render(); }));
}

async function action(name, storyId) {
  if (name === 'toggle-lang') { state.lang = state.lang === 'ru' ? 'kk' : 'ru'; saveLanguage(state.lang); return render(); }
  if (name === 'onboard') { finishOnboarding(); state.view = 'map'; return render(); }
  if (name === 'map') { state.view = 'map'; state.feedback = null; return render(); }
  if (name === 'open-story') { state.story = state.stories.find((story) => story.id === storyId) || state.story; state.view = 'story'; return render(); }
  if (name === 'story') { state.view = 'story'; state.feedback = null; return render(); }
  if (name === 'start-tasks') { state.taskIndex = 0; state.selectedOptions = []; state.selectedEvidence = []; state.feedback = null; state.hint = null; state.mentorState = 'none'; state.mentorSource = 'none'; state.view = 'task'; return render(); }
  if (name === 'submit') return submitTask();
  if (name === 'hint') return showHint();
  if (name === 'advance') { if (state.taskIndex === state.story.tasks.length - 1) state.view = 'reveal'; else { state.taskIndex += 1; state.selectedOptions = []; state.selectedEvidence = []; state.feedback = null; state.hint = null; state.mentorState = 'none'; state.mentorSource = 'none'; } return render(); }
  if (name === 'reset' && window.confirm(t('resetConfirm'))) { await resetProgress(); state.progress = await loadProgress(); state.view = 'onboarding'; state.feedback = null; return render(); }
}

async function submitTask() {
  const task = state.story.tasks[state.taskIndex];
  const result = evaluateTask(task, state.selectedOptions, state.selectedEvidence);
  const entry = await recordAttempt(state.progress, state.story, task, result);
  state.feedback = result;
  state.hint = null;
  const event = { eventId: globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`, anonId: await getAnonId(), ts: new Date().toISOString(), contentVersion: state.manifest?.contentVersion || state.story.contentVersion, storyId: state.story.id, taskId: task.id, skill: task.skill, mode: state.story.kind, attempt: entry.attempts, answerCorrect: result.answerCorrect, evidenceCorrect: result.evidenceCorrect, hintsUsed: entry.hintsUsed, firstTry: entry.isFirstAttempt, lang: state.lang, mentorSource: state.mentorSource };
  await queueEvent(event);
  flushEvents().catch(() => {});
  render();
}

async function showHint() {
  const task = state.story.tasks[state.taskIndex];
  const entry = await recordHint(state.progress, state.story.id, task.id);
  const errorProfile = { answerWrong: Boolean(state.feedback && !state.feedback.answerCorrect), evidenceWrong: Boolean(state.feedback && !state.feedback.evidenceCorrect), attempt: entry.attempts || 1, hintsUsed: entry.hintsUsed, lastHintLevel: Math.max(0, entry.hintsUsed - 1) };
  state.mentorSource = 'rules';
  state.mentorState = navigator.onLine ? 'rules' : 'offline';
  let hint = nextHint(task, entry.hintsUsed - 1);
  if (navigator.onLine) {
    try {
      const response = await fetch('/api/mentor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: state.story.id, taskId: task.id, skill: task.skill, errorProfile, lang: state.lang }), signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new Error(`mentor HTTP ${response.status}`);
      const result = await response.json();
      const remoteHint = task.hints.find((item) => item.id === result.hintId);
      if (remoteHint) hint = remoteHint;
      if (result.source === 'ai') { state.mentorState = 'ai'; state.mentorSource = 'ai'; }
    } catch { state.mentorState = 'offline'; }
  }
  state.hint = hint;
  render();
}

async function init() {
  try {
    state.progress = await loadProgress();
    const bundle = await loadContent();
    state.manifest = bundle.manifest;
    state.stories = bundle.stories;
    state.story = state.stories[0];
    state.offlineReady = await prepareOffline(state.manifest);
    state.offlineState = state.offlineReady ? 'ready' : 'error';
    render();
    flushEvents().catch(() => {});
  } catch (error) {
    state.offlineState = 'error';
    app.innerHTML = `<main class="page error-page"><h1>SAUAT</h1><p>Не удалось загрузить историю: ${esc(error.message)}</p></main>`;
  }
}

window.addEventListener('online', () => { state.offlineState = state.offlineReady ? 'ready' : 'checking'; render(); flushEvents().catch(() => {}); });
window.addEventListener('offline', () => { state.offlineState = 'error'; render(); });
init();
