import { dictionary } from './i18n/index.js';
import { loadFixture } from './content.js';
import { evaluateTask, nextHint, taskLabel } from './engine.js';
import { finishOnboarding, hasOnboarded, loadLanguage, loadProgress, recordAttempt, recordHint, resetProgress, saveLanguage, saveProgress, taskProgress } from './storage.js';

const state = { lang: loadLanguage(), view: hasOnboarded() ? 'map' : 'onboarding', story: null, taskIndex: 0, selectedOptions: [], selectedEvidence: [], feedback: null, hint: null, progress: loadProgress() };
const app = document.querySelector('#app');
const t = (key) => dictionary(state.lang)[key] || dictionary('ru')[key] || key;
const text = (value) => value?.[state.lang] || value?.ru || '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const icon = (name) => ({ compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.6 5.1-2.7 6-6 2.7 6 2.6 2.7 6 2.6-6 6-2.6-6-2.7-2.6-6Z"/><circle cx="13.6" cy="13.8" r="1.5"/></svg>', book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c2.5-1.1 5.2-.8 8 1v13c-2.8-1.8-5.5-2.1-8-1V5.5Zm16 0c-2.5-1.1-5.2-.8-8 1v13c2.8-1.8 5.5-2.1 8-1V5.5Z"/></svg>', lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' }[name] || '');

function header({ back = false } = {}) {
  return `<header class="topbar"><button class="brand" data-action="map" type="button" aria-label="SAUAT"><span class="brand-mark">S</span><span><strong>SAUAT</strong><small>${esc(t('slogan'))}</small></span></button><div class="top-actions">${back ? `<button class="icon-button" data-action="map" type="button">← <span>${esc(t('back'))}</span></button>` : ''}<span class="xp-pill"><span class="xp-star">XP</span> ${state.progress.xp}</span><button class="language-toggle" data-action="toggle-lang" type="button">${esc(dictionary(state.lang).other)}</button></div></header>`;
}

function reviewBanner() { return `<div class="notice review-notice"><span class="status-dot"></span><span>${esc(t('review'))} · ${esc(t('fixtureNotice'))}</span></div>`; }
function render() { if (!state.story && state.view !== 'onboarding') state.view = 'map'; app.innerHTML = state.view === 'onboarding' ? onboarding() : state.view === 'map' ? map() : state.view === 'story' ? storyIntro() : state.view === 'task' ? taskScreen() : reveal(); bind(); }

function onboarding() {
  return `<div class="page onboarding"><div class="onboarding-art" aria-label="${esc(state.lang === 'ru' ? 'Реконструкция карты экспедиции' : 'Экспедиция картасының реконструкциясы')}"><div class="sun"></div><div class="mountain mountain-one"></div><div class="mountain mountain-two"></div><div class="route route-one"></div><div class="route route-two"></div><div class="artifact-seal">S</div></div><div class="onboarding-copy"><div class="eyebrow">${esc(t('eyebrow'))}</div><h1>SAUAT</h1><p class="display-title">${esc(t('slogan'))}</p><p class="lead">${esc(t('intro'))}</p><div class="reconstruction-label">Реконструкция · SAUAT</div><section class="language-card"><h2>${esc(t('chooseLang'))}</h2><div class="lang-options"><button class="lang-choice ${state.lang === 'ru' ? 'selected' : ''}" data-lang="ru" type="button"><span>РУ</span>Русский</button><button class="lang-choice ${state.lang === 'kk' ? 'selected' : ''}" data-lang="kk" type="button"><span>ҚАЗ</span>Қазақша</button></div><p>${esc(t('languageNote'))}</p></section><button class="primary-button wide" data-action="onboard" type="button">${esc(t('start'))} <span aria-hidden="true">→</span></button></div></div>`;
}

function map() {
  const solved = state.story ? state.story.tasks.filter((task) => taskProgress(state.progress, state.story.id, task.id).solved).length : 0;
  const done = state.progress.completedStories.includes(state.story?.id);
  return `<div class="app-shell">${header()}<main class="page map-page" id="main"><div class="map-heading"><div><div class="eyebrow">${esc(t('map'))}</div><h1>${esc(t('firstAdventure'))}</h1><p>${esc(t('mapIntro'))}</p></div><div class="progress-chip"><strong>${solved}/4</strong><span>${esc(t('missions'))}</span></div></div>${reviewBanner()}<section class="hero-card"><div class="hero-copy"><span class="tag teal">${esc(t('unlocked'))}</span><h2>${esc(text(state.story.title))}</h2><p>${esc(text(state.story.hook))}</p><button class="primary-button" data-action="open-story" type="button">${esc(done ? t('continue') : t('start'))} <span aria-hidden="true">→</span></button></div><div class="hero-illustration" aria-label="${esc(t('testBadge'))}"><div class="hero-orbit orbit-a"></div><div class="hero-orbit orbit-b"></div><div class="hero-card-shape">S</div><small>${esc(t('testBadge'))}</small></div></section><section class="section-heading"><div><div class="eyebrow">${esc(t('adventure'))}</div><h2>${esc(t('map'))}</h2></div><span class="muted">1/3</span></section><div class="adventure-track"><article class="adventure-node active"><div class="node-number">01</div><div class="node-line"></div><div class="node-body"><div class="node-icon">${icon('compass')}</div><div><span class="tag gold">${esc(t('unlocked'))}</span><h3>${esc(text(state.story.title))}</h3><p>${solved}/4 ${esc(t('missions'))} · ${state.progress.xp} ${esc(t('xp'))}</p></div></div></article><article class="adventure-node locked"><div class="node-number">02</div><div class="node-line"></div><div class="node-body"><div class="node-icon">${icon('lock')}</div><div><span class="tag muted-tag">${esc(t('locked'))}</span><h3>${esc(state.lang === 'ru' ? 'Путь ветра' : 'Жел бағыты')}</h3><p>${esc(state.lang === 'ru' ? 'Новая история от автора' : 'Автордың жаңа тарихы')}</p></div></div></article><article class="adventure-node locked"><div class="node-number">03</div><div class="node-body"><div class="node-icon">${icon('lock')}</div><div><span class="tag muted-tag">${esc(t('locked'))}</span><h3>${esc(state.lang === 'ru' ? 'Звёздная станция' : 'Жұлдызды станция')}</h3><p>${esc(state.lang === 'ru' ? 'Откроется после проверки' : 'Тексеруден кейін ашылады')}</p></div></article></div><section class="museum-card"><div class="museum-icon">◆</div><div><div class="eyebrow">${esc(t('museum'))}</div><h2>${esc(done ? text(state.story.reward.title) : (state.lang === 'ru' ? 'Коллекция пока ждёт' : 'Жинақ күтіп тұр'))}</h2><p>${esc(done ? text(state.story.reward.text) : (state.lang === 'ru' ? 'Заверши первое приключение, чтобы открыть артефакт.' : 'Артефактты ашу үшін бірінші приключениені аяқта.'))}</p></div></section><button class="text-button reset-button" data-action="reset" type="button">${esc(t('reset'))}</button></main></div>`;
}

function storyIntro() {
  return `<div class="app-shell">${header({ back: true })}<main class="page story-page" id="main"><div class="story-hero"><div><span class="tag teal">${esc(t('hook'))}</span><h1>${esc(text(state.story.title))}</h1><p class="story-hook">${esc(text(state.story.hook))}</p></div><div class="story-stamp">S<span>${esc(t('testBadge'))}</span></div></div>${reviewBanner()}<section class="document-section"><div class="section-heading"><div><div class="eyebrow">${esc(t('documents'))}</div><h2>${esc(t('read'))}</h2></div><span class="progress-chip">${state.story.documents.length} ${esc(t('document'))}</span></div><div class="documents">${state.story.documents.map((doc) => `<article class="document-card"><div class="document-top"><span class="doc-id">${esc(doc.id.toUpperCase())}</span><span class="tag sand">${esc(t('testBadge'))}</span></div><h3>${esc(text(doc.title))}</h3><div class="segments">${doc.segments.map((segment) => `<div class="segment"><span class="segment-id">${esc(segment.id)}</span><p>${esc(text(segment.text))}</p></div>`).join('')}</div></article>`).join('')}</div></section><button class="primary-button wide" data-action="start-tasks" type="button">${esc(t('beginTasks'))} <span aria-hidden="true">→</span></button></main></div>`;
}

function taskScreen() {
  const task = state.story.tasks[state.taskIndex];
  const progress = taskProgress(state.progress, state.story.id, task.id);
  const evidence = state.story.documents.flatMap((doc) => doc.segments);
  const feedback = state.feedback ? `<div class="feedback ${state.feedback.complete ? 'success' : state.feedback.answerCorrect ? 'partial' : 'error'}" role="status"><strong>${esc(state.feedback.complete ? t('correct') : state.feedback.answerCorrect ? t('partial') : t('wrong'))}</strong><div class="feedback-grid"><span>${esc(t('answerCorrect'))}: ${state.feedback.answerCorrect ? '✓' : '×'}</span><span>${esc(t('evidenceCorrect'))}: ${state.feedback.evidenceCorrect ? '✓' : task.requireEvidence ? '×' : '—'}</span></div>${progress.firstTry ? `<small>${esc(t('firstSaved'))}</small>` : ''}</div>` : '';
  const hint = state.hint ? `<div class="hint-box"><span class="hint-level">${esc(t('hintLevel'))} ${state.hint.level}</span><p>${esc(text(state.hint.text))}</p><small>${esc(t('sourceRules'))}</small></div>` : '';
  return `<div class="app-shell">${header({ back: true })}<main class="page task-page" id="main"><div class="task-progress"><button class="back-link" data-action="story" type="button">← ${esc(t('documents'))}</button><span>${state.taskIndex + 1}/${state.story.tasks.length}</span></div><div class="progress-bar"><i style="width:${((state.taskIndex + 1) / state.story.tasks.length) * 100}%"></i></div><section class="task-card"><div class="task-heading"><span class="tag teal">${esc(taskLabel(task, dictionary(state.lang)))}</span><span class="tag sand">${esc(t('testBadge'))}</span></div><h1>${esc(text(task.question))}</h1>${task.claim ? `<blockquote class="claim">«${esc(text(task.claim.text))}»</blockquote>` : ''}<fieldset class="answer-fieldset"><legend>${esc(t('answer'))}</legend><div class="option-grid">${task.options.map((option) => `<button class="choice ${state.selectedOptions.includes(option.id) ? 'selected' : ''}" data-option="${esc(option.id)}" type="button" aria-pressed="${state.selectedOptions.includes(option.id)}"><span class="choice-marker">${esc(option.id.toUpperCase())}</span><span>${esc(text(option.text))}</span></button>`).join('')}</div></fieldset>${task.requireEvidence ? `<fieldset class="evidence-fieldset"><legend>${esc(t('evidence'))}</legend><p class="helper">${esc(t('chooseEvidence'))}</p><div class="evidence-grid">${evidence.map((segment) => `<button class="evidence-choice ${state.selectedEvidence.includes(segment.id) ? 'selected' : ''}" data-evidence="${esc(segment.id)}" type="button" aria-pressed="${state.selectedEvidence.includes(segment.id)}"><span class="segment-id">${esc(segment.id)}</span><span>${esc(text(segment.text))}</span></button>`).join('')}</div></fieldset>` : ''}${feedback}${hint}<div class="task-actions">${state.feedback?.complete ? `<button class="primary-button wide" data-action="advance" type="button">${state.taskIndex === state.story.tasks.length - 1 ? esc(t('reveal')) : esc(t('nextTask'))} <span aria-hidden="true">→</span></button>` : `<button class="primary-button wide" data-action="submit" type="button">${esc(t('check'))}</button>`}${!state.feedback?.complete && state.feedback && progress.hintsUsed < 3 ? `<button class="secondary-button wide" data-action="hint" type="button">${esc(t('hintNext'))} · ${progress.hintsUsed + 1}</button>` : ''}</div></section></main></div>`;
}

function reveal() {
  return `<div class="app-shell">${header({ back: true })}<main class="page reveal-page" id="main"><div class="reveal-art"><div class="reveal-glow"></div><div class="artifact">S</div><div class="confetti confetti-one"></div><div class="confetti confetti-two"></div><div class="confetti confetti-three"></div></div><div class="eyebrow">${esc(t('reward'))}</div><h1>${esc(text(state.story.reward.title))}</h1><p class="lead">${esc(text(state.story.reward.text))}</p><div class="reward-stats"><span><strong>+100</strong> XP</span><span><strong>4/4</strong> ${esc(t('missions'))}</span></div><section class="sources-card"><div class="eyebrow">${esc(t('sources'))}</div>${state.story.sources.map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)} <span>↗</span></a>`).join('')}<small>${esc(t('testBadge'))} · ${esc(state.story.sources[0]?.accessedAt || '')}</small></section><button class="primary-button wide" data-action="map" type="button">${esc(t('openMap'))} <span aria-hidden="true">→</span></button></main></div>`;
}

function bind() {
  document.querySelectorAll('[data-lang]').forEach((button) => button.addEventListener('click', () => { state.lang = button.dataset.lang; saveLanguage(state.lang); render(); }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => action(button.dataset.action)));
  document.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', () => { state.selectedOptions = [button.dataset.option]; render(); }));
  document.querySelectorAll('[data-evidence]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.evidence; state.selectedEvidence = state.selectedEvidence.includes(id) ? state.selectedEvidence.filter((value) => value !== id) : [...state.selectedEvidence, id]; render(); }));
}

function action(name) {
  if (name === 'toggle-lang') { state.lang = state.lang === 'ru' ? 'kk' : 'ru'; saveLanguage(state.lang); return render(); }
  if (name === 'onboard') { finishOnboarding(); state.view = 'map'; return render(); }
  if (name === 'map') { state.view = 'map'; state.feedback = null; return render(); }
  if (name === 'open-story') { state.view = 'story'; return render(); }
  if (name === 'story') { state.view = 'story'; state.feedback = null; return render(); }
  if (name === 'start-tasks') { state.taskIndex = 0; state.selectedOptions = []; state.selectedEvidence = []; state.feedback = null; state.hint = null; state.view = 'task'; return render(); }
  if (name === 'submit') return submitTask();
  if (name === 'hint') return showHint();
  if (name === 'advance') { if (state.taskIndex === state.story.tasks.length - 1) state.view = 'reveal'; else { state.taskIndex += 1; state.selectedOptions = []; state.selectedEvidence = []; state.feedback = null; state.hint = null; } return render(); }
  if (name === 'reset' && window.confirm(t('resetConfirm'))) { resetProgress(); state.progress = loadProgress(); state.view = 'onboarding'; state.feedback = null; return render(); }
}

function submitTask() {
  const task = state.story.tasks[state.taskIndex];
  const result = evaluateTask(task, state.selectedOptions, state.selectedEvidence);
  const entry = recordAttempt(state.progress, state.story, task, result);
  state.feedback = result;
  state.hint = null;
  state.progress = loadProgress();
  if (entry.solved && result.complete) state.feedback = result;
  render();
}

function showHint() {
  const task = state.story.tasks[state.taskIndex];
  const entry = recordHint(state.progress, state.story.id, task.id);
  state.progress = loadProgress();
  state.hint = nextHint(task, entry.hintsUsed - 1);
  render();
}

async function init() {
  try { state.story = await loadFixture(); render(); }
  catch (error) { app.innerHTML = `<main class="page error-page"><h1>SAUAT</h1><p>Не удалось загрузить тестовый контент: ${esc(error.message)}</p></main>`; }
}

init();
