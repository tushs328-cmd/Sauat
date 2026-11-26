import { dictionary } from './i18n/index.js';
import { loadContent } from './content.js';
import { evaluateTask, nextHint, taskLabel } from './engine.js';
import { prepareOffline } from './offline.js';
import { clearDraft, exportEvents, finishOnboarding, flushEvents, getAnonId, hasOnboarded, importTeacherEvents, loadDraft, loadLanguage, loadProgress, loadTeacherEvents, queueEvent, recordAttempt, recordHint, resetProgress, saveDraft, saveLanguage, taskProgress } from './storage.js';

const params = new URLSearchParams(location.search);
const devMode = params.get('dev') === '1';
const demoMode = globalThis.__SAULAT_STATIC__ === true;
let historyArmed = false;
const state = {
  lang: loadLanguage(), view: hasOnboarded() ? 'map' : 'onboarding', stories: [], story: null, manifest: null,
  taskIndex: 0, selectedOptions: [], selectedEvidence: [], feedback: null, hint: null, mentorState: 'none', mentorSource: 'none',
  progress: { schemaVersion: 1, xp: 0, tasks: {}, completedStories: [], history: [] }, juryProgress: null, teacherEvents: [], importMessage: '', errorMessage: '', offlineReady: false, offlineState: 'checking', juryMode: params.get('jury') === '1', demoMode
};
const app = document.querySelector('#app');
const t = (key) => dictionary(state.lang)[key] || dictionary('ru')[key] || key;
const text = (value) => value?.[state.lang] || value?.ru || '';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const featureCopy = {
  ru: {
    evidenceTrailTitle: 'След доказательств', evidenceTrailIntro: 'Сверь ответ с текстом истории: цвет показывает, как сработало доказательство.',
    evidenceLegendCorrect: 'выбрано и нужно', evidenceLegendExtra: 'выбрано, но не доказывает', evidenceLegendMissed: 'нужно было выбрать', evidenceLegendNeutral: 'не выбрано', evidenceMeaning: 'Что это доказывает',
    errorDiagnosis: 'Диагноз ответа', errorTypeFactNotFound: 'Не нашёл факт', errorTypeSimilarNotProving: 'Выбрал похожее, но не доказывающее', errorTypeConclusionBeyondData: 'Вывод шире данных',
    errorPatternsTitle: 'Типы ошибок', errorPatternsEmpty: 'В импортированных первых попытках ошибок не найдено.', frequentError: 'Частая ошибка', repeatOnLesson: 'Что повторить на уроке',
    repeatFact: 'Искать точный факт и сверять его с фрагментом.', repeatEvidence: 'Отделять похожий фрагмент от доказательства ответа.', repeatInference: 'Не делать вывод шире того, что сказано в тексте.'
  },
  kk: {
    evidenceTrailTitle: 'Дәлел ізі', evidenceTrailIntro: 'Жауапты тарих мәтінімен салыстыр: түс дәлелдің қалай жұмыс істегенін көрсетеді.',
    evidenceLegendCorrect: 'таңдалды және қажет', evidenceLegendExtra: 'таңдалды, бірақ дәлелдемейді', evidenceLegendMissed: 'таңдау керек еді', evidenceLegendNeutral: 'таңдалмады', evidenceMeaning: 'Бұл нені дәлелдейді',
    errorDiagnosis: 'Жауап диагнозы', errorTypeFactNotFound: 'Фактіні таппады', errorTypeSimilarNotProving: 'Ұқсас, бірақ дәлелдемейтін үзіндіні таңдады', errorTypeConclusionBeyondData: 'Қорытынды деректен кең',
    errorPatternsTitle: 'Қате түрлері', errorPatternsEmpty: 'Импортталған бірінші әрекеттерден қате табылмады.', frequentError: 'Жиі кездесетін қате', repeatOnLesson: 'Сабақта қайталау керек',
    repeatFact: 'Нақты фактіні тауып, оны үзіндімен салыстыру.', repeatEvidence: 'Ұқсас үзіндіні жауаптың дәлелінен ажырату.', repeatInference: 'Қорытындыны мәтіндегі деректен кеңейтпеу.'
  }
};
const f = (key) => featureCopy[state.lang]?.[key] || featureCopy.ru[key] || key;
function flushPendingEvents() { if (!globalThis.__SAULAT_STATIC__) flushEvents().catch(() => {}); }
const icon = (name) => ({ compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13.6 5.1-2.7 6-6 2.7 6 2.6 2.7 6 2.6-6 6-2.6-6-2.7-2.6-6Z"/><circle cx="13.6" cy="13.8" r="1.5"/></svg>', lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>', teacher: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v4c2 2 8 2 10 0v-4M21 10v6"/></svg>' }[name] || '');
const practiceStories = () => state.stories.filter((story) => story.kind === 'practice');
const diagnosticStories = () => state.stories.filter((story) => story.kind === 'diagnostic');
const heroStory = () => practiceStories()[0] || diagnosticStories()[0] || state.story;
const practiceComplete = () => practiceStories().length > 0 && practiceStories().every((story) => state.progress.completedStories.includes(story.id));

function header({ back = false } = {}) {
  const offlineLabel = state.offlineReady ? t('offlineReady') : state.offlineState === 'error' ? t('offlineNotReady') : t('offlineChecking');
  const hideXp = state.view === 'results' || state.story?.kind === 'diagnostic';
  return `<header class="topbar"><button class="brand" data-action="map" type="button" aria-label="SAUAT"><span class="brand-mark">S</span><span><strong>SAUAT</strong><small>${esc(t('slogan'))}</small></span></button><div class="top-actions">${back ? `<button class="icon-button" data-action="map" type="button">← <span>${esc(t('back'))}</span></button>` : ''}${state.demoMode ? `<span class="demo-badge">${esc(t('demoMode'))}</span>` : ''}${state.juryMode ? `<span class="jury-badge">${esc(t('juryMode'))}</span>` : ''}<span class="offline-status ${state.offlineReady ? 'ready' : ''}" aria-live="polite"><span class="status-dot"></span>${esc(offlineLabel)}</span>${hideXp ? '' : `<span class="xp-pill"><span class="xp-star">XP</span> ${state.progress.xp}</span>`}<button class="language-toggle" data-action="toggle-lang" type="button">${esc(dictionary(state.lang).other)}</button></div></header>`;
}

function storyBadge(story) { return story?.isTestFixture ? `<span class="tag sand">${esc(t('testBadge'))}</span>` : ''; }
function storyImage(story, className = 'story-image') {
  const image = story?.image;
  const file = image?.file ? String(image.file).replace(/^\/+/, '') : '';
  const src = file && !/^https?:\/\//i.test(file) ? `/${file}` : file;
  const alt = text(image?.alt) || t('reconstructionFallback');
  const caption = image?.isReconstruction ? t('reconstruction') : image?.credit || t('reconstructionFallback');
  return `<figure class="${className}">${src ? `<img src="${esc(src)}" alt="${esc(alt)}">` : ''}<div class="story-placeholder"${src ? ' hidden' : ''}><span aria-hidden="true">◇</span><strong>${esc(t('reconstruction'))}</strong><small>${esc(t('reconstructionFallback'))}</small></div><figcaption>${esc(caption)}</figcaption></figure>`;
}
function reviewBanner(story) {
  const kkStatus = story?.reviewStatus?.kk;
  const status = story?.reviewStatus?.[state.lang];
  const message = kkStatus && kkStatus !== 'approved' ? t('kkReview') : status && status !== 'approved' ? `${t('review')} · ${status}` : '';
  return message ? `<div class="notice review-notice" role="status"><span class="status-dot"></span><span>${esc(message)}</span></div>` : '';
}
function taskTotals(story) {
  const total = story?.tasks?.length || 0;
  const progress = state.juryMode && state.juryProgress ? state.juryProgress : state.progress;
  const solved = story?.tasks?.filter((task) => taskProgress(progress, story.id, task.id).solved).length || 0;
  const xp = story?.kind === 'practice' ? story.tasks.reduce((sum, task) => sum + Number(taskProgress(progress, story.id, task.id).xpEarned || 0), 0) : 0;
  return { total, solved, xp };
}
function journeyTotals() {
  const stories = practiceStories();
  const tasks = stories.flatMap((story) => (story.tasks || []).map((task) => ({ story, task })));
  const solved = tasks.filter(({ story, task }) => taskProgress(state.progress, story.id, task.id).solved).length;
  return { storiesDone: stories.filter((story) => state.progress.completedStories.includes(story.id)).length, storiesTotal: stories.length, tasksDone: solved, tasksTotal: tasks.length, xp: state.progress.xp };
}
function storyUnlocked(story) {
  if (!story) return false;
  if (demoMode || devMode || state.juryMode) return true;
  if (story.kind === 'practice') {
    const list = practiceStories();
    const index = list.findIndex((item) => item.id === story.id);
    return index <= 0 || state.progress.completedStories.includes(list[index - 1]?.id);
  }
  const list = diagnosticStories();
  const index = list.findIndex((item) => item.id === story.id);
  if (index === 0) return true;
  return practiceComplete() && (index <= 1 || state.progress.completedStories.includes(list[index - 1]?.id));
}
function render() {
  if (!state.story && !['onboarding', 'results', 'error', 'about', 'project'].includes(state.view)) state.view = 'map';
  app.innerHTML = state.view === 'onboarding' ? onboarding() : state.view === 'map' ? map() : state.view === 'story' ? storyIntro() : state.view === 'task' ? taskScreen() : state.view === 'reveal' ? reveal() : state.view === 'diagnostic-complete' ? diagnosticComplete() : state.view === 'about' ? aboutScreen() : state.view === 'project' ? projectScreen() : state.view === 'teacher-guide' ? teacherGuideScreen() : state.view === 'error' ? errorScreen() : results();
  const skipLink = document.querySelector('.skip-link');
  if (skipLink) skipLink.textContent = t('skipToGame');
  if (state.view === 'map') {
    const totals = journeyTotals();
    app.querySelector('.map-heading')?.insertAdjacentHTML('afterend', `<div class="map-progress-strip" aria-label="${esc(t('progress'))}"><span><strong>${totals.storiesDone}/${totals.storiesTotal}</strong> ${esc(t('progressStories'))}</span><span><strong>${totals.tasksDone}/${totals.tasksTotal}</strong> ${esc(t('progressTasks'))}</span><span class="map-reward"><strong>${totals.xp} XP</strong> ${esc(t('rewardTease'))}</span></div>`);
  }
  if (state.view === 'reveal') app.querySelector('.sources-card')?.insertAdjacentHTML('beforebegin', storySummaryMarkup());
  bind();
  document.querySelectorAll('.story-image img, .hero-image img, .reveal-image img').forEach((image) => image.addEventListener('error', () => { image.hidden = true; image.parentElement.classList.add('missing'); image.parentElement.querySelector('.story-placeholder')?.removeAttribute('hidden'); }));
  if (state.view === 'story' || state.view === 'task') saveDraft({ view: state.view, storyId: state.story?.id, taskIndex: state.taskIndex, selectedOptions: state.selectedOptions, selectedEvidence: state.selectedEvidence, feedback: state.feedback, hint: state.hint, mentorState: state.mentorState, mentorSource: state.mentorSource });
}
function armAppHistory() {
  if (historyArmed) return;
  history.replaceState({ saulat: true, view: state.view }, '', location.href);
  history.pushState({ saulat: true, guard: true }, '', location.href);
  historyArmed = true;
}

function storySummaryMarkup() {
  const progress = state.juryMode && state.juryProgress ? state.juryProgress : state.progress;
  const evidenceById = new Map(state.story.documents.flatMap((doc) => doc.segments).map((segment) => [segment.id, segment]));
  const rows = state.story.tasks.map((task, index) => {
    const entry = taskProgress(progress, state.story.id, task.id); const evidence = (entry.selectedEvidenceIds || []).map((id) => evidenceById.get(id)).filter(Boolean); const first = entry.firstTry || {};
    return `<article class="summary-row"><div class="summary-row-head"><span class="summary-index">${String(index + 1).padStart(2, '0')}</span><strong>${esc(taskLabel(task, dictionary(state.lang)))}</strong><span class="summary-status ${first.complete ? 'is-good' : 'needs-repeat'}">${esc(first.complete ? t('summaryFound') : t('summaryRepeat'))}</span></div><p>${esc(text(task.question))}</p><div class="summary-evidence"><span>${esc(t('summaryEvidenceTitle'))}</span><p>${evidence.length ? evidence.map((segment) => `${esc(segment.id)} · ${esc(text(segment.text))}`).join('<br>') : esc(t('noEvidenceSelected'))}</p></div></article>`;
  }).join('');
  const repeat = state.story.tasks.filter((task) => !taskProgress(progress, state.story.id, task.id).firstTry?.complete);
  return `<section class="story-summary"><div class="eyebrow">${esc(t('storySummary'))}</div><h2>${esc(t('summaryFoundTitle'))}</h2><p class="summary-intro">${esc(t('summaryIntro'))}</p><div class="summary-list">${rows}</div><section class="repeat-card"><h3>${esc(t('repeatTitle'))}</h3>${repeat.length ? `<ul>${repeat.map((task) => `<li>${esc(text(task.question))}</li>`).join('')}</ul>` : `<p>${esc(t('repeatNone'))}</p>`}</section></section>`;
}

function onboarding() {
  return `<div class="page onboarding"><div class="onboarding-art" aria-label="${esc(state.lang === 'ru' ? 'Реконструкция карты экспедиции' : 'Экспедиция картасының реконструкциясы')}"><div class="sun"></div><div class="mountain mountain-one"></div><div class="mountain mountain-two"></div><div class="route route-one"></div><div class="route route-two"></div><div class="artifact-seal">S</div></div><div class="onboarding-copy"><div class="eyebrow">${esc(t('eyebrow'))}</div><h1>SAUAT</h1><p class="display-title">${esc(t('slogan'))}</p><p class="lead">${esc(t('intro'))}</p><div class="reconstruction-label">${esc(t('reconstruction'))} · SAUAT</div><section class="language-card"><h2>${esc(t('chooseLang'))}</h2><div class="lang-options"><button class="lang-choice ${state.lang === 'ru' ? 'selected' : ''}" data-lang="ru" type="button"><span>РУ</span>Русский</button><button class="lang-choice ${state.lang === 'kk' ? 'selected' : ''}" data-lang="kk" type="button"><span>ҚАЗ</span>Қазақша</button></div><p>${esc(t('languageNote'))}</p></section><button class="primary-button wide" data-action="onboard" type="button">${esc(t('start'))} <span aria-hidden="true">→</span></button></div></div>`;
}

function practiceNode(story, index, list) {
  const unlocked = storyUnlocked(story); const totals = taskTotals(story);
  const action = unlocked ? `<button class="node-open" data-action="open-story" data-story="${esc(story.id)}" type="button" aria-label="${esc(text(story.title))}">${icon('compass')}</button>` : `<span class="node-open locked-icon">${icon('lock')}</span>`;
  return `<article class="adventure-node ${unlocked ? 'active' : 'locked'}" data-story-id="${esc(story.id)}"><div class="node-number">${String(index + 1).padStart(2, '0')}</div>${index < list.length - 1 ? '<div class="node-line"></div>' : ''}<div class="node-body">${action}<div><span class="tag ${unlocked ? 'gold' : 'muted-tag'}">${esc(unlocked ? t('unlocked') : t('locked'))}</span><h3>${esc(text(story.title))}</h3><p>${totals.solved}/${totals.total} ${esc(t('missions'))} · ${totals.xp} ${esc(t('xp'))}</p></div></div></article>`;
}
function diagnosticCard(story, index, list) {
  const unlocked = storyUnlocked(story); const label = index === 0 ? t('diagnosticEntry') : index === list.length - 1 ? t('diagnosticExit') : `${t('diagnostic')} ${index + 1}`; const totals = taskTotals(story);
  return `<article class="diagnostic-card ${unlocked ? 'active' : 'locked'}"><div class="diagnostic-card-top"><span class="tag ${unlocked ? 'teal' : 'muted-tag'}">${esc(unlocked ? t('unlocked') : t('locked'))}</span><span class="diagnostic-label">${esc(label)}</span></div><h3>${esc(text(story.title))}</h3><p>${esc(text(story.hook))}</p><small>${totals.solved}/${totals.total} ${esc(t('diagnosticTasks'))}</small>${unlocked ? `<button class="secondary-button" data-action="open-story" data-story="${esc(story.id)}" type="button">${esc(t('openDiagnostic'))} →</button>` : ''}</article>`;
}
function map() {
  const practices = practiceStories(); const diagnostics = diagnosticStories(); const focus = heroStory(); const focusTotals = taskTotals(focus); const done = focus && state.progress.completedStories.includes(focus.id);
  const juryControl = state.juryMode ? `<button class="text-button jury-link" data-action="exit-jury" type="button">${esc(t('exitJury'))}</button>` : `<a class="text-button jury-link" href="?jury=1">${esc(t('juryMode'))}</a>`;
  return `<div class="app-shell">${header()}<main class="page map-page" id="main"><div class="map-heading"><div><div class="eyebrow">${esc(t('map'))}</div><h1>${esc(text(focus?.title))}</h1><p>${esc(t('mapIntro'))}</p></div><div class="progress-chip"><strong>${focusTotals.solved}/${focusTotals.total}</strong><span>${esc(focus?.kind === 'diagnostic' ? t('diagnosticTasks') : t('missions'))}</span></div></div>${reviewBanner(focus)}${focus ? `<section class="hero-card"><div class="hero-copy"><span class="tag teal">${esc(focus.kind === 'diagnostic' ? t('diagnostic') : t('unlocked'))}</span>${storyBadge(focus)}<h2>${esc(text(focus.title))}</h2><p>${esc(text(focus.hook))}</p>${storyUnlocked(focus) ? `<button class="primary-button" data-action="open-story" data-story="${esc(focus.id)}" type="button">${esc(done ? t('continue') : t('start'))} <span aria-hidden="true">→</span></button>` : ''}</div>${storyImage(focus, 'hero-image')}</section>` : ''}${practices.length ? `<section class="section-heading"><div><div class="eyebrow">${esc(t('adventure'))}</div><h2>${esc(t('practiceStories'))}</h2></div><span class="muted">${practices.length}</span></section><div class="adventure-track" data-story-count="${practices.length}">${practices.map((story, index) => practiceNode(story, index, practices)).join('')}</div>` : ''}${diagnostics.length ? `<section class="diagnostic-section"><div class="section-heading"><div><div class="eyebrow">${esc(t('assessment'))}</div><h2>${esc(t('diagnostic'))}</h2></div><span class="muted">${diagnostics.length}</span></div><div class="diagnostic-grid">${diagnostics.map((story, index) => diagnosticCard(story, index, diagnostics)).join('')}</div></section>` : ''}<section class="teacher-actions"><button class="primary-button teacher-cabinet-button" data-action="results" data-testid="teacher-cabinet" type="button">${icon('teacher')}<span>${esc(t('teacherCabinet'))}</span></button><button class="secondary-button" data-action="export" data-testid="export-results" type="button">${esc(t('exportResults'))}</button><button class="secondary-button" data-action="teacher-guide" type="button">${esc(t('teacherGuideLink'))}</button><p class="teacher-hint">${esc(t('teacherFlow'))}</p></section><div class="map-footer-actions">${juryControl}<button class="text-button info-link" data-action="about" type="button">${esc(t('aboutLink'))}</button><button class="text-button info-link" data-action="project" type="button">${esc(t('projectLink'))}</button><button class="text-button reset-button" data-action="reset" type="button">${esc(t('reset'))}</button></div></main></div>`;
}

function aboutScreen() {
  return `<div class="app-shell">${header({ back: true })}<main class="page info-page" id="main"><div class="eyebrow">${esc(t('aboutEyebrow'))}</div><h1>${esc(t('aboutTitle'))}</h1><p class="lead">${esc(t('aboutIntro'))}</p><div class="info-grid"><section class="info-card"><h2>${esc(t('aboutProblemTitle'))}</h2><p>${esc(t('aboutProblem'))}</p></section><section class="info-card"><h2>${esc(t('aboutHowTitle'))}</h2><p class="flow-line">${esc(t('aboutHowFlow'))}</p><p>${esc(t('aboutHowText'))}</p></section><section class="info-card"><h2>${esc(t('aboutLimitsTitle'))}</h2><p>${esc(t('aboutLimits'))}</p></section></div><button class="primary-button wide" data-action="map" type="button">${esc(t('openMap'))}</button></main></div>`;
}
function projectScreen() {
  return `<div class="app-shell">${header({ back: true })}<main class="page info-page" id="main"><div class="eyebrow">${esc(t('projectEyebrow'))}</div><h1>${esc(t('projectTitle'))}</h1><p class="lead">${esc(t('projectIntro'))}</p><section class="info-card ai-disclosure-card"><h2>${esc(t('projectToolsTitle'))}</h2><p class="ai-disclosure">${esc(t('aiDisclosure'))}</p><p>${esc(t('projectTools'))}</p></section><section class="info-card"><h2>${esc(t('projectTrustTitle'))}</h2><p>${esc(t('projectTrust'))}</p></section><button class="primary-button wide" data-action="map" type="button">${esc(t('openMap'))}</button></main></div>`;
}
function errorScreen() {
  return `<main class="page error-page" id="main" aria-live="assertive"><div class="eyebrow">SAUAT</div><h1>${esc(t('contentErrorTitle'))}</h1><p class="lead">${esc(state.errorMessage || t('contentErrorText'))}</p><p class="error-detail">${esc(navigator.onLine ? t('contentErrorHint') : t('offlineErrorHint'))}</p><button class="primary-button" data-action="retry" type="button">${esc(t('retry'))}</button></main>`;
}
function teacherGuideScreen() {
  const steps = [
    [t('teacherStep1Title'), t('teacherStep1Text')],
    [t('teacherStep2Title'), t('teacherStep2Text')],
    [t('teacherStep3Title'), t('teacherStep3Text')]
  ];
  return `<div class="app-shell">${header({ back: true })}<main class="page info-page teacher-guide-page" id="main"><div class="eyebrow">${esc(t('teacherGuideEyebrow'))}</div><h1>${esc(t('teacherGuideTitle'))}</h1><p class="lead">${esc(t('teacherGuideIntro'))}</p><ol class="guide-steps">${steps.map(([title, body], index) => `<li class="guide-step"><span class="guide-step-number">${index + 1}</span><div><h2>${esc(title)}</h2><p>${esc(body)}</p></div></li>`).join('')}</ol><button class="primary-button wide" data-action="map" type="button">${esc(t('openMap'))}</button></main></div>`;
}

function storyIntro() {
  const diagnostic = state.story.kind === 'diagnostic';
  return `<div class="app-shell">${header({ back: true })}<main class="page story-page" id="main"><div class="story-hero"><div><span class="tag teal">${esc(diagnostic ? t('diagnostic') : t('hook'))}</span>${storyBadge(state.story)}<h1>${esc(text(state.story.title))}</h1><p class="story-hook">${esc(text(state.story.hook))}</p></div>${storyImage(state.story, 'story-image')}</div>${reviewBanner(state.story)}<section class="document-section"><div class="section-heading"><div><div class="eyebrow">${esc(t('documents'))}</div><h2>${esc(t('read'))}</h2></div><span class="progress-chip">${state.story.documents.length} ${esc(t('document'))}</span></div><div class="documents">${state.story.documents.map((doc) => `<article class="document-card"><div class="document-top"><span class="doc-id">${esc(doc.id.toUpperCase())}</span>${storyBadge(state.story)}</div><h3>${esc(text(doc.title))}</h3><div class="segments">${doc.segments.map((segment) => `<div class="segment"><span class="segment-id">${esc(segment.id)}</span><p>${esc(text(segment.text))}</p></div>`).join('')}</div></article>`).join('')}</div></section><button class="primary-button wide" data-action="start-tasks" type="button">${esc(diagnostic ? t('beginDiagnostic') : t('beginTasks'))} <span aria-hidden="true">→</span></button></main></div>`;
}
function evidenceGroups(story, selected) {
  return story.documents.map((doc) => `<section class="evidence-group"><h3>${esc(text(doc.title) || doc.id.toUpperCase())}</h3><div class="evidence-grid">${doc.segments.map((segment) => `<button class="evidence-choice ${selected.includes(segment.id) ? 'selected' : ''}" data-evidence="${esc(segment.id)}" type="button" aria-pressed="${selected.includes(segment.id)}"><span class="segment-id">${esc(segment.id)}</span><span>${esc(text(segment.text))}</span></button>`).join('')}</div></section>`).join('');
}
function errorTypeLabel(type) { return f(type === 'fact_not_found' ? 'errorTypeFactNotFound' : type === 'similar_not_proving' ? 'errorTypeSimilarNotProving' : 'errorTypeConclusionBeyondData'); }
function evidenceTrail(task) {
  const selected = new Set(state.selectedEvidence);
  const needed = new Set(task.acceptedEvidenceSets?.[0] || []);
  const segmentClass = (id) => selected.has(id) && needed.has(id) ? 'is-correct' : selected.has(id) ? 'is-extra' : needed.has(id) ? 'is-missed' : 'is-neutral';
  const segmentLabel = (id) => selected.has(id) && needed.has(id) ? f('evidenceLegendCorrect') : selected.has(id) ? f('evidenceLegendExtra') : needed.has(id) ? f('evidenceLegendMissed') : f('evidenceLegendNeutral');
  const segments = state.story.documents.flatMap((doc) => doc.segments.map((segment) => `<article class="evidence-trace ${segmentClass(segment.id)}"><div><strong>${esc(segment.id)}</strong><span>${esc(segmentLabel(segment.id))}</span></div><p>${esc(text(segment.text))}</p></article>`)).join('');
  return `<section class="evidence-trail" aria-label="${esc(f('evidenceTrailTitle'))}"><div class="eyebrow">${esc(f('evidenceTrailTitle'))}</div><p class="evidence-trail-intro">${esc(f('evidenceTrailIntro'))}</p><div class="evidence-trail-legend"><span class="is-correct">${esc(f('evidenceLegendCorrect'))}</span><span class="is-extra">${esc(f('evidenceLegendExtra'))}</span><span class="is-missed">${esc(f('evidenceLegendMissed'))}</span></div><div class="evidence-trace-list">${segments}</div><div class="evidence-meaning"><strong>${esc(f('evidenceMeaning'))}</strong><p>${esc(text(task.explanation))}</p></div></section>`;
}
function mentorBadge() { const label = state.mentorState === 'ai' ? t('mentorAi') : state.mentorState === 'offline' ? t('mentorOffline') : t('mentorRules'); return `<div class="ai-disclosure" role="note">${esc(t('aiDisclosure'))}</div><span class="mentor-state ${state.mentorState}"><span class="status-dot"></span>${esc(label)}</span>`; }
function taskScreen() {
  const task = state.story.tasks[state.taskIndex]; const diagnostic = state.story.kind === 'diagnostic'; const progress = taskProgress(state.progress, state.story.id, task.id);
  const feedback = state.feedback ? `<div class="feedback ${state.feedback.complete ? 'success' : state.feedback.answerCorrect ? 'partial' : 'error'}" role="status"><strong>${esc(state.feedback.complete ? t('correct') : state.feedback.answerCorrect ? t('partial') : t('wrong'))}</strong><div class="feedback-grid"><span>${esc(t('answerCorrect'))}: ${state.feedback.answerCorrect ? '✓' : '×'}</span><span>${esc(t('evidenceCorrect'))}: ${state.feedback.evidenceCorrect ? '✓' : task.requireEvidence ? '×' : '—'}</span></div>${state.feedback.firstAttempt ? `<small>${esc(t('firstSaved'))}</small>` : ''}</div>` : '';
  const diagnosis = state.feedback && !state.feedback.complete ? `<div class="error-diagnosis" role="note"><span class="eyebrow">${esc(f('errorDiagnosis'))}</span><strong data-error-type="${esc(state.feedback.errorType || '')}">${esc(errorTypeLabel(state.feedback.errorType))}</strong></div>` : '';
  const explanation = diagnostic && state.feedback ? `<div class="explanation"><span class="eyebrow">${esc(t('explanation'))}</span><p>${esc(text(task.explanation))}</p></div>` : '';
  const hint = !diagnostic && state.hint ? `<div class="hint-box">${mentorBadge()}<span class="hint-level">${esc(t('hintLevel'))} ${state.hint.level}</span><p>${esc(text(state.hint.text))}</p><small>${esc(state.mentorState === 'offline' ? t('mentorOffline') : state.mentorState === 'ai' ? t('mentorAi') : t('mentorRules'))}</small></div>` : '';
  const action = state.feedback ? `<button class="primary-button wide" data-action="advance" type="button">${esc(state.taskIndex === state.story.tasks.length - 1 ? (diagnostic ? t('finishDiagnostic') : t('reveal')) : t('nextTask'))} <span aria-hidden="true">→</span></button>` : `<button class="primary-button wide" data-action="submit" type="button">${esc(t('check'))}</button>`;
  const hintButton = !diagnostic && !state.feedback?.complete && state.feedback && progress.hintsUsed < 3 ? `<button class="secondary-button wide" data-action="hint" type="button">${esc(t('hintNext'))} · ${progress.hintsUsed + 1}</button>` : '';
  return `<div class="app-shell">${header({ back: true })}<main class="page task-page" id="main"><div class="task-progress"><button class="back-link" data-action="story" type="button">← ${esc(t('documents'))}</button><span>${state.taskIndex + 1}/${state.story.tasks.length}</span></div><div class="progress-bar"><i style="width:${((state.taskIndex + 1) / state.story.tasks.length) * 100}%"></i></div>${reviewBanner(state.story)}<section class="task-card"><div class="task-heading"><span class="tag teal">${esc(taskLabel(task, dictionary(state.lang)))}</span>${storyBadge(state.story)}${diagnostic ? `<span class="tag sand">${esc(t('diagnosticNoHints'))}</span>` : ''}</div><h1>${esc(text(task.question))}</h1>${task.claim ? `<blockquote class="claim">«${esc(text(task.claim.text))}»</blockquote>` : ''}<fieldset class="answer-fieldset"><legend>${esc(t('answer'))}</legend><div class="option-grid">${task.options.map((option) => `<button class="choice ${state.selectedOptions.includes(option.id) ? 'selected' : ''}" data-option="${esc(option.id)}" type="button" aria-pressed="${state.selectedOptions.includes(option.id)}"><span class="choice-marker">${esc(option.id.toUpperCase())}</span><span>${esc(text(option.text))}</span></button>`).join('')}</div></fieldset>${task.requireEvidence ? `<fieldset class="evidence-fieldset"><legend>${esc(t('evidence'))}</legend><p class="helper">${esc(t('chooseEvidence'))}</p>${evidenceGroups(state.story, state.selectedEvidence)}</fieldset>` : ''}${feedback}${diagnosis}${state.feedback ? evidenceTrail(task) : ''}${explanation}${hint}<div class="task-actions">${action}${hintButton}</div></section></main></div>`;
}

function reveal() {
  const totals = taskTotals(state.story);
  return `<div class="app-shell">${header({ back: true })}<main class="page reveal-page" id="main"><div class="reveal-art">${storyImage(state.story, 'reveal-image')}<div class="reveal-glow"></div><div class="artifact">S</div><div class="confetti confetti-one"></div><div class="confetti confetti-two"></div><div class="confetti confetti-three"></div></div>${reviewBanner(state.story)}<div class="eyebrow">${esc(t('reward'))}</div><h1>${esc(text(state.story.reward.title))}</h1><p class="lead">${esc(text(state.story.reward.text))}</p><div class="reward-stats"><span><strong>+${totals.xp}</strong> XP</span><span><strong>${totals.solved}/${totals.total}</strong> ${esc(t('missions'))}</span></div><section class="sources-card"><div class="eyebrow">${esc(t('sources'))}</div>${state.story.sources.map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noreferrer">${esc(source.title)} <span>↗</span></a>`).join('')}<small>${storyBadge(state.story)} · ${esc(state.story.sources[0]?.accessedAt || '')}</small></section><button class="primary-button wide" data-action="map" type="button">${esc(t('openMap'))} <span aria-hidden="true">→</span></button></main></div>`;
}
function diagnosticComplete() {
  const totals = taskTotals(state.story); const activeProgress = state.juryMode && state.juryProgress ? state.juryProgress : state.progress; const firstAttempts = activeProgress.history.filter((entry) => entry.storyId === state.story.id && entry.firstTry); const correct = firstAttempts.filter((entry) => entry.complete).length;
  return `<div class="app-shell">${header({ back: true })}<main class="page diagnostic-complete" id="main"><div class="completion-mark">✓</div><div class="eyebrow">${esc(t('diagnostic'))}</div><h1>${esc(t('diagnosticFinished'))}</h1><p class="lead">${esc(text(state.story.title))}</p><div class="reward-stats"><span><strong>${correct}/${totals.total}</strong> ${esc(t('correctAnswers'))}</span><span>${esc(t('firstAttemptOnly'))}</span></div><p class="diagnostic-note">${esc(t('diagnosticScoreNote'))}</p><button class="primary-button wide" data-action="map" type="button">${esc(t('openMap'))} <span aria-hidden="true">→</span></button></main></div>`;
}

function eventErrorType(event) {
  if (event.errorType) return event.errorType;
  if (event.answerCorrect && event.evidenceCorrect) return null;
  if (!event.answerCorrect && event.skill === 'find') return 'fact_not_found';
  if (!event.evidenceCorrect) return 'similar_not_proving';
  return 'conclusion_beyond_data';
}
function summarizeEvents(events) {
  const classEvents = events.filter((event) => event.mode !== 'jury');
  const first = classEvents.filter((event) => event.firstTry);
  const skills = Object.fromEntries(['find', 'infer', 'evidence'].map((skill) => { const rows = first.filter((event) => event.skill === skill); const num = rows.filter((event) => event.answerCorrect && (skill === 'find' || event.evidenceCorrect)).length; return [skill, { num, den: rows.length }]; }));
  const diagnostic = first.filter((event) => event.mode === 'diagnostic');
  const counts = new Map();
  for (const event of first) { const type = eventErrorType(event); if (type) counts.set(type, (counts.get(type) || 0) + 1); }
  const errorTypes = [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([type, count]) => ({ type, count }));
  return { totalEvents: classEvents.length, skills, errorTypes, mainMetric: { num: diagnostic.filter((event) => event.answerCorrect && event.evidenceCorrect && event.hintsUsed === 0).length, den: diagnostic.length } };
}
function ratio(metric) { return metric.den ? `${metric.num}/${metric.den}` : t('noData'); }
function results() {
  const summary = summarizeEvents(state.teacherEvents);
  const empty = state.teacherEvents.length === 0 ? `<p class="empty-state" role="status">${esc(t('emptyCabinet'))}</p>` : '';
  const errorCards = summary.errorTypes.length ? summary.errorTypes.map(({ type, count }) => `<article class="error-pattern"><span>${esc(f('frequentError'))}</span><strong>${esc(errorTypeLabel(type))}</strong><b>${count}</b></article>`).join('') : `<p class="error-patterns-empty">${esc(f('errorPatternsEmpty'))}</p>`;
  const repeat = summary.errorTypes[0] ? f(summary.errorTypes[0].type === 'fact_not_found' ? 'repeatFact' : summary.errorTypes[0].type === 'similar_not_proving' ? 'repeatEvidence' : 'repeatInference') : f('errorPatternsEmpty');
  return `<div class="app-shell">${header({ back: true })}<main class="page results-page" id="main"><div class="eyebrow">${esc(t('teacherCabinet'))}</div><h1>${esc(t('results'))}</h1><p class="lead">${esc(t('resultsIntro'))}</p><section class="results-tools"><button class="primary-button" data-action="export" data-testid="export-results" type="button">${esc(t('exportResults'))}</button><button class="secondary-button" data-action="teacher-guide" type="button">${esc(t('teacherGuideLink'))}</button><label class="file-picker" data-testid="import-results"><span>${esc(t('importResults'))}</span><input data-import-files type="file" accept="application/json,.json" multiple></label><p class="import-message" role="status" aria-live="polite">${esc(state.importMessage)}</p></section>${empty}<section class="metric-card"><div class="eyebrow">${esc(t('mainMetric'))}</div><strong>${esc(ratio(summary.mainMetric))}</strong><p>${esc(t('mainMetricHint'))}</p></section><section class="skills-card"><div class="section-heading"><h2>${esc(t('skills'))}</h2><span>${summary.totalEvents} ${esc(t('events'))}</span></div><div class="skill-grid">${[['find', t('find')], ['infer', t('infer')], ['evidence', t('evidence')]].map(([key, label]) => `<article><span>${esc(label)}</span><strong>${esc(ratio(summary.skills[key]))}</strong></article>`).join('')}</div></section><section class="error-patterns"><div class="section-heading"><div><h2>${esc(f('errorPatternsTitle'))}</h2></div></div><div class="error-pattern-grid">${errorCards}</div><div class="lesson-repeat"><strong>${esc(f('repeatOnLesson'))}</strong><p>${esc(repeat)}</p></div></section></main></div>`;
}

function bind() {
  document.querySelectorAll('[data-lang]').forEach((button) => button.addEventListener('click', () => { state.lang = button.dataset.lang; saveLanguage(state.lang); render(); }));
  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => void action(button.dataset.action, button.dataset.story)));
  document.querySelectorAll('[data-option]').forEach((button) => button.addEventListener('click', () => { state.selectedOptions = [button.dataset.option]; render(); }));
  document.querySelectorAll('[data-evidence]').forEach((button) => button.addEventListener('click', () => { const id = button.dataset.evidence; state.selectedEvidence = state.selectedEvidence.includes(id) ? state.selectedEvidence.filter((value) => value !== id) : [...state.selectedEvidence, id]; render(); }));
  document.querySelector('[data-import-files]')?.addEventListener('change', (event) => void importFiles(event.target.files));
}
async function action(name, storyId) {
  if (name === 'toggle-lang') { state.lang = state.lang === 'ru' ? 'kk' : 'ru'; saveLanguage(state.lang); return render(); }
  if (name === 'onboard') { finishOnboarding(); state.view = 'map'; return render(); }
  if (name === 'map') { clearDraft(); state.view = 'map'; state.story = heroStory(); state.feedback = null; return render(); }
  if (name === 'results') { state.view = 'results'; state.teacherEvents = await loadTeacherEvents(); return render(); }
  if (name === 'about' || name === 'project') { state.view = name; return render(); }
  if (name === 'teacher-guide') { state.view = 'teacher-guide'; return render(); }
  if (name === 'retry') { state.errorMessage = ''; state.offlineState = 'checking'; state.view = 'map'; return init(); }
  if (name === 'exit-jury') { const next = new URL(location.href); next.searchParams.delete('jury'); history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`); state.juryMode = false; state.view = 'map'; state.story = heroStory(); return render(); }
  if (name === 'export') return downloadResults();
  if (name === 'open-story') { const story = state.stories.find((item) => item.id === storyId); if (!story || !storyUnlocked(story)) return; state.story = story; state.view = 'story'; return render(); }
  if (name === 'story') { state.view = 'story'; state.feedback = null; return render(); }
  if (name === 'start-tasks') { if (!storyUnlocked(state.story)) return; state.taskIndex = state.story.tasks.findIndex((task) => !taskProgress(state.progress, state.story.id, task.id).solved); if (state.taskIndex < 0) { state.view = state.story.kind === 'diagnostic' ? 'diagnostic-complete' : 'reveal'; return render(); } state.selectedOptions = []; state.selectedEvidence = []; state.feedback = null; state.hint = null; state.mentorState = 'none'; state.mentorSource = 'none'; state.view = 'task'; return render(); }
  if (name === 'submit') return submitTask();
  if (name === 'hint') return showHint();
  if (name === 'advance') { if (state.taskIndex === state.story.tasks.length - 1) state.view = state.story.kind === 'diagnostic' ? 'diagnostic-complete' : 'reveal'; else { state.taskIndex += 1; state.selectedOptions = []; state.selectedEvidence = []; state.feedback = null; state.hint = null; state.mentorState = 'none'; state.mentorSource = 'none'; } return render(); }
  if (name === 'reset' && window.confirm(t('resetConfirm'))) { await resetProgress(); clearDraft(); state.progress = await loadProgress(); state.view = 'onboarding'; state.feedback = null; return render(); }
}
async function submitTask() {
  const task = state.story.tasks[state.taskIndex]; if (state.story.kind === 'diagnostic' && state.feedback) return;
  const progress = state.juryMode ? (state.juryProgress ||= structuredClone(state.progress)) : state.progress; const result = evaluateTask(task, state.selectedOptions, state.selectedEvidence); const entry = await recordAttempt(progress, state.story, task, result, { persist: !state.juryMode, selectedOptions: state.selectedOptions, selectedEvidence: state.selectedEvidence }); state.feedback = { ...result, firstAttempt: entry.isFirstAttempt }; state.hint = null;
  const event = { eventId: globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`, anonId: await getAnonId(), ts: new Date().toISOString(), contentVersion: state.manifest?.contentVersion || state.story.contentVersion, storyId: state.story.id, taskId: task.id, skill: task.skill, mode: state.juryMode ? 'jury' : state.story.kind, attempt: entry.attempts, answerCorrect: result.answerCorrect, evidenceCorrect: result.evidenceCorrect, errorType: result.errorType, hintsUsed: entry.hintsUsed, firstTry: entry.isFirstAttempt, lang: state.lang, mentorSource: state.story.kind === 'diagnostic' ? 'none' : state.mentorSource };
  await queueEvent(event); flushPendingEvents(); render();
}
async function showHint() {
  if (state.story.kind === 'diagnostic') return;
  const progress = state.juryMode ? (state.juryProgress ||= structuredClone(state.progress)) : state.progress; const task = state.story.tasks[state.taskIndex]; const entry = await recordHint(progress, state.story.id, task.id, { persist: !state.juryMode }); const errorProfile = { answerWrong: Boolean(state.feedback && !state.feedback.answerCorrect), evidenceWrong: Boolean(state.feedback && !state.feedback.evidenceCorrect), attempt: entry.attempts || 1, hintsUsed: entry.hintsUsed, lastHintLevel: Math.max(0, entry.hintsUsed - 1) };
  state.mentorSource = 'rules'; state.mentorState = navigator.onLine ? 'rules' : 'offline'; let hint = nextHint(task, entry.hintsUsed - 1);
  if (navigator.onLine) { try { const response = await fetch('/api/mentor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storyId: state.story.id, taskId: task.id, skill: task.skill, errorProfile, lang: state.lang }), signal: AbortSignal.timeout(3500) }); if (!response.ok) throw new Error(`mentor HTTP ${response.status}`); const result = await response.json(); const remoteHint = task.hints.find((item) => item.id === result.hintId); if (remoteHint) hint = remoteHint; if (result.source === 'ai') { state.mentorState = 'ai'; state.mentorSource = 'ai'; } } catch { state.mentorState = 'offline'; } }
  state.hint = hint; render();
}
async function downloadResults() { const events = await exportEvents(); const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), events }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'saulat-events.json'; link.click(); URL.revokeObjectURL(url); }
async function importFiles(files) {
  const messages = [];
  for (const file of files || []) { try { const payload = JSON.parse(await file.text()); const result = await importTeacherEvents(payload); messages.push(`${file.name}: ${t('importAccepted')} ${result.accepted}, ${t('duplicates')} ${result.duplicates}`); } catch (error) { messages.push(`${file.name}: ${t('importRejected')} — ${error.message}`); } }
  state.teacherEvents = await loadTeacherEvents(); state.importMessage = messages.join(' · '); render();
}
async function init() {
  try {
    state.progress = await loadProgress(); const bundle = await loadContent(); state.manifest = bundle.manifest; state.stories = bundle.stories; state.story = heroStory();
    const draft = loadDraft(); const draftStory = draft && state.stories.find((story) => story.id === draft.storyId);
    if (draftStory && (draft.view === 'story' || draft.view === 'task')) {
      state.story = draftStory; state.view = draft.view; state.taskIndex = Math.min(Math.max(0, Number(draft.taskIndex) || 0), Math.max(0, draftStory.tasks.length - 1));
      state.selectedOptions = Array.isArray(draft.selectedOptions) ? draft.selectedOptions : []; state.selectedEvidence = Array.isArray(draft.selectedEvidence) ? draft.selectedEvidence : [];
      state.feedback = draft.feedback || null; state.hint = draft.hint || null; state.mentorState = draft.mentorState || 'none'; state.mentorSource = draft.mentorSource || 'none';
    } else if (draft) clearDraft();
    state.teacherEvents = await loadTeacherEvents(); state.offlineReady = await prepareOffline(state.manifest); state.offlineState = state.offlineReady ? 'ready' : 'error'; render(); flushPendingEvents();
  }
  catch (error) { state.offlineState = 'error'; state.errorMessage = error.message || t('contentErrorText'); state.view = 'error'; state.story = null; render(); }
}
window.addEventListener('online', () => { state.offlineState = state.offlineReady ? 'ready' : 'checking'; render(); flushPendingEvents(); });
window.addEventListener('offline', () => { state.offlineState = 'error'; render(); });
window.addEventListener('popstate', () => {
  if (!historyArmed) return;
  clearDraft(); state.view = 'map'; state.story = heroStory(); state.feedback = null; state.hint = null; render();
  history.pushState({ saulat: true, guard: true }, '', location.href);
});
armAppHistory();
init();
