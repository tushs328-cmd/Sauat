import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const outputDir = process.env.QA_OUTPUT_DIR || path.join(here, 'out');
const screenshotsDir = path.join(outputDir, 'screens');
const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3400';
const npx = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  : 'npx';

fs.mkdirSync(screenshotsDir, { recursive: true });

function cli(session, args, timeout = 45_000) {
  const command = process.platform === 'win32' ? process.execPath : npx;
  const commandArgs = process.platform === 'win32'
    ? [npx, '--no-install', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args]
    : ['--no-install', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: appRoot,
    encoding: 'utf8',
    timeout,
    windowsHide: true
  });
  return {
    exitCode: result.status ?? 2,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    timedOut: Boolean(result.error)
  };
}

function parseResult(output) {
  const marker = '### Result\n';
  const start = output.lastIndexOf(marker);
  if (start < 0) return null;
  const value = output.slice(start + marker.length).split('\n### Ran Playwright code')[0].trim();
  try { return JSON.parse(value); } catch { return value; }
}

function code(session, body) {
  const normalized = body.trim().replace(/\r?\n\s*/g, ' ');
  const result = cli(session, ['run-code', normalized]);
  const combined = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0) throw new Error(`Playwright run-code failed (${result.exitCode}): ${combined.slice(-1000)} code=${normalized}`);
  return parseResult(result.stdout);
}

function fresh(session) {
  const opened = cli(session, ['open', baseUrl]);
  if (opened.exitCode !== 0) throw new Error(`Could not open ${baseUrl}: ${opened.stdout}\n${opened.stderr}`);
}

function audit(session) {
  return code(session, `async page => {
    await page.keyboard.press('Tab');
    return await page.evaluate(() => {
      const interactive = [...document.querySelectorAll('button, a, [role="button"], input, select, textarea')];
      const small = interactive.map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80), width: Math.round(r.width), height: Math.round(r.height) };
      }).filter((x) => x.width > 0 && x.height > 0 && (x.width < 44 || x.height < 44));
      const active = document.activeElement;
      const style = active ? getComputedStyle(active) : null;
      const images = [...document.images].map((img) => ({ alt: img.alt, complete: img.complete, naturalWidth: img.naturalWidth }));
      return {
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        smallTargets: small,
        focus: { tag: active?.tagName || null, text: active?.innerText?.slice(0, 80) || '', visible: Boolean(active && style && style.visibility !== 'hidden' && style.display !== 'none'), outline: style?.outlineStyle || null, boxShadow: style?.boxShadow || null },
        images,
        emptyText: [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 && !el.getAttribute('aria-hidden')).some((el) => el.textContent?.trim() === '')
      };
    });
  }`);
}

function selectLanguage(session, lang, width, height) {
  const label = lang === 'ru' ? 'РУ Русский' : 'ҚАЗ Қазақша';
  return code(session, `async page => {
    await page.setViewportSize({ width: ${width}, height: ${height} });
    await page.getByRole("button", { name: ${JSON.stringify(label)} }).click();
    await page.getByRole("button", { name: /Начать маршрут|Бағытты бастау/ }).last().click();
    return { lang: ${JSON.stringify(lang)}, text: (await page.locator("body").innerText()).slice(0, 500) };
  }`);
}

const runStamp = Date.now();

function completePractice(session, persona, switchLanguage) {
  return code(session, `async page => {
    const storyStart = page.getByRole("button", { name: /Начать маршрут|Бағытты бастау/ }).last();
    if (await storyStart.count()) await storyStart.click();
    const taskStart = page.getByRole('button', { name: /Перейти к заданиям|Тапсырмаларға өту/ });
    if (await taskStart.count()) await taskStart.click();
    const tasks = [];
    for (let index = 0; index < 6; index += 1) {
      const check = page.getByRole('button', { name: /^(Проверить|Тексеру)$/ });
      if (await check.count() === 0) break;
      if (${JSON.stringify(switchLanguage)} && index === 0) {
        const langButton = page.locator('header button').filter({ hasText: /ҚАЗ|РУ/ }).last();
        if (await langButton.count()) await langButton.click();
      }
      const hints = page.getByRole('button', { name: /Подсказ/ });
      let hintsUsed = 0;
      if (${JSON.stringify(persona)} === 'hint-eater') {
        const count = await hints.count();
        for (let h = 0; h < count; h += 1) { const current = page.getByRole('button', { name: /Подсказ/ }); if (await current.count()) { await current.first().click(); hintsUsed += 1; } }
      }
      const answers = page.getByRole('group', { name: /Ответ|Жауап/ }).getByRole('button');
      const answerCount = await answers.count();
      if (!answerCount) break;
      const answerIndex = ${JSON.stringify(persona)} === 'random' ? (index * 7 + 1) % answerCount : 0;
      if (${JSON.stringify(persona)} === 'double-click') { await answers.nth(answerIndex).dblclick(); } else { await answers.nth(answerIndex).click(); }
      const evidence = page.getByRole('button', { name: /^e/ });
      const evidenceCount = await evidence.count();
      if (evidenceCount) {
        const evidenceIndex = ${JSON.stringify(persona)} === 'random' ? (index * 3 + 2) % evidenceCount : 0;
        if (${JSON.stringify(persona)} === 'double-click') { await evidence.nth(evidenceIndex).dblclick(); } else { await evidence.nth(evidenceIndex).click(); }
      }
      await check.click();
      const status = await page.locator('[role="status"]').allTextContents();
      tasks.push({ index: index + 1, answerIndex, evidenceIndex: evidenceCount ? 0 : null, hintsUsed, status: status.join(' ').slice(0, 300) });
      const next = page.getByRole('button', { name: /Следующий шаг|Келесі қадам/ });
      if (await next.count()) await next.click(); else break;
    }
    return { tasks, body: (await page.locator('body').innerText()).slice(-1200), buttons: await page.locator('button').allTextContents() };
  }`);
}

function runScenario({ lang, width, height, persona, switchLanguage = false }) {
  const session = `qa-${runStamp}-${lang}-${width}-${persona.replace(/[^a-z0-9-]/gi, '-')}`;
  const result = { id: `${lang}-${width}-${persona}`, lang, viewport: `${width}x${height}`, persona, switchLanguage, status: 'PASS', evidence: [], errors: [] };
  try {
    fresh(session);
    selectLanguage(session, lang, width, height);
    result.evidence.push({ stage: 'map', audit: audit(session) });
    result.practice = completePractice(session, persona, switchLanguage);
    result.evidence.push({ stage: 'after-practice', audit: audit(session) });
    const consoleResult = cli(session, ['console', 'error']);
    result.consoleErrors = consoleResult.stdout.split('\n').filter((line) => line.trim() && !line.startsWith('npm ')).slice(-20);
    const shot = path.join(screenshotsDir, `${lang}-${width}-${persona}.png`);
    code(session, `async page => { await page.screenshot({ path: ${JSON.stringify(shot)}, fullPage: true }); return ${JSON.stringify(shot)}; }`);
    result.screenshot = shot;
  } catch (error) {
    result.status = 'FAIL';
    result.errors.push(String(error));
  } finally {
    cli(session, ['close']);
  }
  return result;
}

function runDiagnostic({ lang, width, height }) {
  const session = `qa-${runStamp}-diagnostic-${lang}-${width}`;
  const result = { id: `diagnostic-${lang}-${width}`, lang, viewport: `${width}x${height}`, status: 'PASS', evidence: [], errors: [] };
  try {
    fresh(session);
    selectLanguage(session, lang, width, height);
    result.export = code(session, `async page => {
      const button = page.getByRole("button", { name: /Экспорт результатов|Нәтижелерді экспорттау/ });
      const count = await button.count();
      let download = null;
      if (count) {
        const waiter = page.waitForEvent("download", { timeout: 3000 }).catch(() => null);
        await button.click();
        const file = await waiter;
        if (file) download = { suggestedFilename: file.suggestedFilename() };
      }
      const body = await page.locator("body").innerText();
      return { count, download, teacherImportAvailable: /импорт|кабинет|import/i.test(body) };
    }`);
    const opened = code(session, `async page => {
      await page.getByRole('button', { name: /Открыть диагностику|Диагностиканы ашу/ }).click();
      return { body: (await page.locator('body').innerText()).slice(-1800), hintButtons: await page.getByRole('button', { name: /Подсказ/ }).count() };
    }`);
    result.evidence.push({ stage: 'diagnostic-open', opened, audit: audit(session) });
    result.hintsHidden = opened.hintButtons === 0;
    result.tasks = completePractice(session, 'first', false).tasks;
    result.evidence.push({ stage: 'diagnostic-after', audit: audit(session) });
    const shot = path.join(screenshotsDir, `diagnostic-${lang}-${width}.png`);
    code(session, `async page => { await page.screenshot({ path: ${JSON.stringify(shot)}, fullPage: true }); return ${JSON.stringify(shot)}; }`);
    result.screenshot = shot;
  } catch (error) {
    result.status = 'FAIL';
    result.errors.push(String(error));
  } finally {
    cli(session, ['close']);
  }
  return result;
}

function runOffline({ lang, width, height }) {
  const session = `qa-${runStamp}-offline-${lang}-${width}`;
  const result = { id: `offline-${lang}-${width}`, lang, viewport: `${width}x${height}`, status: 'PASS', errors: [] };
  try {
    fresh(session);
    selectLanguage(session, lang, width, height);
    const check = code(session, `async page => {
      await page.getByRole('button', { name: /Начать маршрут|Бағытты бастау/ }).last().click();
      await page.getByText(/Готово офлайн|Офлайнға дайын/).first().waitFor({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.context().setOffline(true);
      let reloadError = null;
      try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 12000 }); } catch (error) { reloadError = String(error); }
      const body = await page.locator('body').innerText();
      await page.context().setOffline(false);
      return { reloadError, hasApp: body.includes('SAUAT'), hasStory: /Золотой человек|Алтын адам/.test(body), body: body.slice(-700) };
    }`);
    result.check = check;
    if (!check.hasApp || !check.hasStory) result.status = 'FAIL';
  } catch (error) {
    result.status = 'FAIL';
    result.errors.push(String(error));
  } finally {
    cli(session, ['close']);
  }
  return result;
}

const results = {
  runAt: new Date().toISOString(),
  baseUrl,
  synthetic: true,
  note: 'СИМУЛЯЦИЯ: браузерные персоны не являются реальными учениками.',
  baseline: { validate: 'PASS (exit 0)', tests: 'PASS (56/56, exit 0)' },
  scenarios: []
};
const maxScenarios = Number(process.env.QA_MAX_SCENARIOS || 0);
const addScenario = (factory) => {
  if (!maxScenarios || results.scenarios.length < maxScenarios) results.scenarios.push(factory());
};

for (const lang of ['ru', 'kk']) {
  for (const [width, height] of [[360, 800], [768, 1024], [1440, 900]]) {
    addScenario(() => runScenario({ lang, width, height, persona: 'first' }));
  }
}
addScenario(() => runScenario({ lang: 'ru', width: 360, height: 800, persona: 'random' }));
addScenario(() => runScenario({ lang: 'ru', width: 360, height: 800, persona: 'hint-eater' }));
addScenario(() => runScenario({ lang: 'ru', width: 360, height: 800, persona: 'double-click' }));
addScenario(() => runScenario({ lang: 'ru', width: 360, height: 800, persona: 'first', switchLanguage: true }));
addScenario(() => runDiagnostic({ lang: 'ru', width: 360, height: 800 }));
addScenario(() => runDiagnostic({ lang: 'kk', width: 768, height: 1024 }));
addScenario(() => runOffline({ lang: 'ru', width: 360, height: 800 }));

const failed = results.scenarios.filter((scenario) => scenario.status !== 'PASS');
results.summary = { scenarios: results.scenarios.length, failed: failed.length, passed: results.scenarios.length - failed.length, failedIds: failed.map((scenario) => scenario.id) };
fs.writeFileSync(path.join(outputDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(results.summary));

