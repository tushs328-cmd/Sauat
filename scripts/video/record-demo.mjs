// Запись демонстрационного видео SAUAT под таймкоды озвучки (СИМУЛЯЦИЯ, не реальные ученики).
// Использование:
//   PLAYWRIGHT_CORE=<путь к node_modules/playwright-core> node scripts/video/record-demo.mjs \
//     --url http://127.0.0.1:3400/ --timings <work>/timings.json --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, item, i, all) => (item.startsWith('--') ? [...acc, [item.slice(2), all[i + 1]]] : acc), []));
const baseUrl = args.url || 'http://127.0.0.1:3400/';
const timings = JSON.parse(fs.readFileSync(args.timings, 'utf8'));
const outDir = path.resolve(args.out || '.');
fs.mkdirSync(outDir, { recursive: true });
const { chromium } = await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href);

const gap = timings.gap || 0.45;
const dur = Object.fromEntries(timings.segments.map((s) => [s.id, s.dur + gap]));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: outDir, size: { width: 1280, height: 720 } }, locale: 'ru-RU', acceptDownloads: true });
const page = await context.newPage();
const log = [];
const sleep = (ms) => page.waitForTimeout(ms);
const T0 = Date.now();

async function segment(id, action) {
  const startedAt = Date.now();
  try { await action(); } catch (error) { log.push(`${id}: ${String(error).slice(0, 160)}`); }
  const left = dur[id] * 1000 - (Date.now() - startedAt);
  if (left > 0) await sleep(left);
  else log.push(`${id}: перерасход ${(-left / 1000).toFixed(1)} c`);
}
const click = async (selector, timeout = 8000) => { const el = page.locator(selector).first(); await el.waitFor({ state: 'visible', timeout }); await el.click(); };
const slowScroll = async (selector, total, steps = 8) => { for (let i = 0; i < steps; i++) { await page.evaluate((s) => { (document.querySelector(s) || window).scrollBy?.({ top: 260, behavior: 'smooth' }); }, selector); await sleep(total / steps); } };

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: '.demo-sim{position:fixed;z-index:2147483647;pointer-events:none;left:14px;bottom:12px;padding:5px 11px;border-radius:7px;background:rgba(17,40,38,.86);color:#e8f6f1;font:600 12px/1.2 system-ui,sans-serif;letter-spacing:.02em}' });
await page.evaluate(() => { const n = document.createElement('div'); n.className = 'demo-sim'; n.id = 'demo-sim'; n.textContent = 'ДЕМОНСТРАЦИЯ · симуляция, не реальные ученики'; document.body.appendChild(n); window.__sim = (t) => { n.textContent = t; }; });

const story = await page.evaluate(async () => fetch('/content/case_001.json').then((r) => r.json()));
const task0 = story.tasks[0];
const rightOption = task0.correctOptionIds[0];
const rightEvidence = task0.acceptedEvidenceSets[0];
const allSegments = story.documents.flatMap((d) => d.segments.map((s) => s.id));
const wrongEvidence = allSegments.filter((id) => !rightEvidence.includes(id)).slice(0, 2);

// s01: проблема, первый экран
await segment('s01', async () => { await sleep(400); });
// s02: переход к историям
await segment('s02', async () => { await sleep(1500); await slowScroll(null, 3500, 4); });
// s03: история, документы, выбор ответа и фрагментов
await segment('s03', async () => {
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await click('button[data-action="open-story"][data-story="case_001"]');
  await sleep(1500); await slowScroll(null, 2500, 3);
  await click('button[data-action="start-tasks"]');
  await page.locator('[data-option]').first().waitFor({ state: 'visible' });
  await page.locator(`[data-option="${rightOption}"]`).click(); await sleep(700);
  for (const id of wrongEvidence) { await page.locator(`[data-evidence="${id}"]`).click(); await sleep(500); }
});
// s04: верный ответ, неверное доказательство — проверка
await segment('s04', async () => { await click('button[data-action="submit"]'); await sleep(1500); await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'smooth' })); });
// s05: подсказки трёх уровней (результат первой попытки сохраняется)
await segment('s05', async () => {
  for (let i = 0; i < 3; i++) {
    const hint = page.locator('button[data-action="hint"]').first();
    if (await hint.count() && await hint.isVisible()) { await hint.click(); await sleep(2600); }
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
});
// s06: остальные задания и «След доказательств»
await segment('s06', async () => {
  await sleep(600);
  await click('button[data-action="advance"]');
  for (const task of story.tasks.slice(1)) {
    await page.locator('[data-option]').first().waitFor({ state: 'visible' });
    await page.locator(`[data-option="${task.correctOptionIds[0]}"]`).click();
    for (const id of task.acceptedEvidenceSets[0]) await page.locator(`[data-evidence="${id}"]`).click();
    await click('button[data-action="submit"]'); await sleep(350);
    await click('button[data-action="advance"]');
  }
});
// s07: офлайн — отключаем сеть и продолжаем работать
await segment('s07', async () => {
  await sleep(1500);
  await page.evaluate(() => window.__sim?.('ДЕМОНСТРАЦИЯ · сеть отключена'));
  await context.setOffline(true);
  await click('button[data-action="map"]');
  await sleep(1500);
  await click('button[data-action="open-story"][data-story="case_001"]');
  await sleep(2500); await slowScroll(null, 3000, 3);
});
// s08: кабинет учителя
await segment('s08', async () => {
  await context.setOffline(false);
  await page.evaluate(() => window.__sim?.('ДЕМОНСТРАЦИЯ · симуляция, не реальные ученики'));
  await click('button[data-action="map"]'); await sleep(700);
  // ученик экспортирует результаты, учитель импортирует их в кабинет
  let exported = null;
  try {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 6000 }), page.locator('button[data-action="export"]').first().click()]);
    exported = path.join(outDir, 'session-events.json'); await download.saveAs(exported);
  } catch (error) { log.push('s08 export: ' + String(error).slice(0, 100)); }
  await click('button[data-action="results"]'); await sleep(1200);
  if (exported) { try { await page.locator('input[type="file"]').first().setInputFiles(exported); await sleep(1500); } catch (error) { log.push('s08 import: ' + String(error).slice(0, 100)); } }
  await slowScroll(null, 4500, 4);
});
// s09: ИИ-наставник и ограничения («О проекте»)
await segment('s09', async () => {
  await click('button[data-action="map"]'); await sleep(900);
  await click('button[data-action="about"]'); await sleep(1500); await slowScroll(null, 8000, 6);
});
// s10: диагностики
await segment('s10', async () => {
  await click('button[data-action="map"]'); await sleep(800);
  await page.evaluate(() => document.querySelector('.diagnostic-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(3500);
});
// s11: ограничения
await segment('s11', async () => {
  await click('button[data-action="project"]'); await sleep(1500); await slowScroll(null, 6000, 5);
});
// s12: слоган
await segment('s12', async () => {
  await click('button[data-action="map"]'); await sleep(600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(800);
});

const video = page.video();
await context.close();
const videoPath = await video.path();
await browser.close();
const result = { synthetic: true, note: 'СИМУЛЯЦИЯ: демонстрационный сценарий, не реальные ученики.', baseUrl, videoPath: path.relative(process.cwd(), videoPath), seconds: Math.round((Date.now() - T0) / 1000), issues: log };
fs.writeFileSync(path.join(outDir, 'record-result.json'), JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
