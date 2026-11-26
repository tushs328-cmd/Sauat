async page => {
  const base = 'http://127.0.0.1:4173';
  const langs = ['ru', 'kk'];
  const personas = ['attentive', 'random', 'first', 'hint-eater', 'offline'];
  const batch = await page.evaluate(() => new URL(location.href).searchParams.get('batch') || 'all');
  const results = [];
  const issues = [];
  const numericTokens = value => String(value || '').match(/\d+(?:[.,]\d+)?/g) || [];
  const textValue = (value, lang) => value?.[lang] ?? '';

  await page.setViewportSize({ width: 360, height: 800 });
  await page.route('**/api/mentor', route => route.fulfill({ status: 503, body: '{}' }));
  const manifest = await page.evaluate(async () => (await fetch('/content/manifest.json')).json());
  const stories = await page.evaluate(async entries => Promise.all(entries.map(async entry => {
    const story = await (await fetch(`/content/${entry.file}`)).json();
    return story;
  })), manifest.stories);
  const batchStories = batch === 'all' || batch.includes('-all') ? stories : stories.filter(story => batch.includes(story.id));
  const batchLangs = batch.startsWith('ru') ? ['ru'] : batch.startsWith('kk') ? ['kk'] : langs;
  const batchPersonas = batch.includes('attentive') ? ['attentive'] : batch.includes('random') ? ['random'] : batch.includes('first') ? ['first'] : batch.includes('hint') ? ['hint-eater'] : batch.includes('offline') ? ['offline'] : personas;

  const addIssue = (type, detail, screenshot = '') => {
    issues.push({ type, detail, screenshot });
  };

  const checkClipping = async (label) => {
    const clipped = await page.locator('body *').evaluateAll(elements => elements.filter(element => {
      if (!element || element === document.body || element === document.documentElement) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (String(element.className).includes('reveal-art')) return false;
      if (box.width < 1 || box.height < 1 || style.visibility === 'hidden' || style.display === 'none') return false;
      const overflow = [style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip');
      return overflow && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
    }).map(element => ({ tag: element.tagName, className: element.className, text: (element.innerText || '').trim().slice(0, 100) })).slice(0, 8));
    if (clipped.length) addIssue('clipping', `${label}: ${JSON.stringify(clipped)}`);
    return clipped.length;
  };

  const setup = async lang => {
    await page.context().setOffline(false);
    await page.goto(`${base}/?jury=1`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-lang="${lang}"]`).click();
    await page.locator('[data-action="onboard"]').click();
    await page.locator('[data-action="open-story"]').first().waitFor();
    await checkClipping(`${lang}/map`);
  };

  const selectEvidence = async (ids) => {
    for (const id of ids) await page.locator(`[data-evidence="${id}"]`).click();
  };

  const pickAnswer = async (task, persona) => {
    let id = task.correctOptionIds[0];
    if (persona === 'random') id = task.options[Math.floor(Math.random() * task.options.length)].id;
    if (persona === 'first') id = task.options[0].id;
    if (persona === 'hint-eater') id = task.options.find(option => !task.correctOptionIds.includes(option.id))?.id || id;
    return page.locator(`[data-option="${id}"]`).click();
  };

  const pickEvidence = async (story, task, persona) => {
    const all = story.documents.flatMap(document => document.segments.map(segment => segment.id));
    let ids = task.acceptedEvidenceSets?.[0] || [];
    if (persona === 'random') ids = [all[Math.floor(Math.random() * all.length)]];
    if (persona === 'first') ids = [all[0]];
    if (persona === 'hint-eater') ids = [all.find(id => !ids.includes(id)) || all[0]];
    return selectEvidence(ids);
  };

  const openStory = async story => {
    await page.locator(`[data-action="open-story"][data-story="${story.id}"]`).last().click();
    await page.locator('[data-action="start-tasks"]').click();
  };

  for (const lang of batchLangs) {
    for (const story of batchStories) {
      for (const persona of batchPersonas) {
        const label = `${story.id}/${lang}/${persona}`;
        await setup(lang);
        await openStory(story);
        await checkClipping(`${label}/intro-task`);
        let offlineSet = false;
        let feedbackCount = 0;
        let hintLevels = [];
        let startIndex = 0;
        if (persona === 'attentive') {
          const probeTask = story.tasks[0];
          const allEvidence = story.documents.flatMap(document => document.segments.map(segment => segment.id));
          const wrongEvidence = allEvidence.find(id => !(probeTask.acceptedEvidenceSets?.[0] || []).includes(id));
          await page.locator(`[data-option="${probeTask.correctOptionIds[0]}"]`).click();
          if (wrongEvidence) await page.locator(`[data-evidence="${wrongEvidence}"]`).click();
          await page.locator('[data-action="submit"]').click();
          await page.locator('.feedback').waitFor();
          const probeFields = await page.locator('.feedback-grid span').allTextContents();
          if (probeFields.length !== 2 || !probeFields[0].includes('✓') || !probeFields[1].includes('×')) addIssue('separate-scoring', `${label}/${probeTask.id}: correct answer plus wrong evidence was not shown separately: ${JSON.stringify(probeFields)}`);
          feedbackCount += 1;
          await page.locator('[data-action="advance"]').click();
          startIndex = 1;
        }
        for (let index = startIndex; index < story.tasks.length; index += 1) {
          const task = story.tasks[index];
          if (persona === 'offline' && index === 1) {
            await page.context().setOffline(true);
            offlineSet = true;
          }
          await pickAnswer(task, persona);
          if (task.requireEvidence) await pickEvidence(story, task, persona);
          await page.locator('[data-action="submit"]').click();
          await page.locator('.feedback').waitFor();
          const feedbackGrid = page.locator('.feedback-grid span');
          const feedbackCountForTask = await feedbackGrid.count();
          if (feedbackCountForTask !== 2) addIssue('separate-scoring', `${label}/${task.id}: feedback grid has ${feedbackCountForTask} fields`);
          const expectedCorrect = persona === 'attentive';
          if (expectedCorrect) {
            const feedbackText = await page.locator('.feedback').innerText();
            const checks = (feedbackText.match(/✓/g) || []).length;
            if (checks !== 2) addIssue('false-feedback', `${label}/${task.id}: attentive answer expected two checks, got ${JSON.stringify(feedbackText)}`);
          }
          feedbackCount += 1;
          if (persona === 'hint-eater' && story.kind !== 'diagnostic') {
            for (let level = 1; level <= 3; level += 1) {
              const hintButton = page.locator('[data-action="hint"]');
              if (!(await hintButton.count())) {
                addIssue('hint-flow', `${label}/${task.id}: hint level ${level} button missing`);
                break;
              }
              await hintButton.click();
              await page.locator('.hint-box').waitFor();
              const hintLevel = await page.locator('.hint-level').innerText();
              hintLevels.push(hintLevel);
              if (!hintLevel.includes(String(level))) addIssue('hint-flow', `${label}/${task.id}: expected level ${level}, got ${hintLevel}`);
            }
          }
          await checkClipping(`${label}/${task.id}/feedback`);
          await page.locator('[data-action="advance"]').click();
          if (index < story.tasks.length - 1) await page.locator('[data-action="submit"]').waitFor();
        }
        const endView = story.kind === 'diagnostic' ? page.locator('.diagnostic-complete') : page.locator('.reveal-page');
        await endView.waitFor();
        await checkClipping(`${label}/complete`);
        if (offlineSet) await page.context().setOffline(false);
        results.push({ label, tasks: story.tasks.length, feedbackCount, hintLevels, end: story.kind === 'diagnostic' ? 'diagnostic-complete' : 'reveal' });
      }
    }
  }

  for (const story of stories) {
    const segmentIds = new Set(story.documents.flatMap(document => document.segments.map(segment => segment.id)));
    const checkBilingual = (field, value, path) => {
      if (!textValue(value, 'ru').trim() || !textValue(value, 'kk').trim()) addIssue('bilingual', `${story.id}/${path}: missing ${field} RU or KK`);
    };
    checkBilingual('title', story.title, 'title');
    checkBilingual('hook', story.hook, 'hook');
    for (const document of story.documents) {
      checkBilingual('title', document.title, `${document.id}.title`);
      for (const segment of document.segments) checkBilingual('text', segment.text, `${segment.id}`);
    }
    for (const task of story.tasks) {
      checkBilingual('question', task.question, `${task.id}.question`);
      checkBilingual('explanation', task.explanation, `${task.id}.explanation`);
      for (const option of task.options) checkBilingual('option', option.text, `${task.id}.${option.id}`);
      for (const hint of task.hints || []) {
        checkBilingual('hint', hint.text, `${task.id}.${hint.id}`);
        const ids = `${hint.text.ru} ${hint.text.kk}`.match(/\b[a-z]+\d+\b/gi) || [];
        for (const id of ids) if (!segmentIds.has(id)) addIssue('hint-alignment', `${story.id}/${task.id}/${hint.id}: unknown segment ${id}`);
      }
    }
    if (story.kind === 'diagnostic' && (story.tasks.some(task => (task.hints || []).length) || story.hints?.length)) addIssue('diagnostic-hints', `${story.id}: diagnostics must have no hints`);
  }

  await page.context().setOffline(false);
  const issueTypes = issues.reduce((counts, issue) => { counts[issue.type] = (counts[issue.type] || 0) + 1; return counts; }, {});
  return JSON.stringify({ storyCount: stories.length, batch, flowCount: results.length, expectedFlowCount: batch === 'all' ? 70 : results.length, issueCount: issues.length, issueTypes }, null, 2);
}
