import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseUrl = process.env.DEMO_BASE_URL || 'http://127.0.0.1:3400/?jury=1';
const durationMs = Number(process.env.DEMO_DURATION_MS || 120000);
const session = `sauat-a29-${Date.now()}`;
const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const videoPath = path.join(outputDir, 'demo.webm');

const npx = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  : 'npx';

function cli(args, timeout = 45_000) {
  const command = process.platform === 'win32' ? process.execPath : npx;
  const commandArgs = process.platform === 'win32'
    ? [npx, '--yes', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args]
    : ['--yes', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args];
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8', timeout, windowsHide: true });
  const output = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`;
  if ((result.status ?? 2) !== 0) throw new Error(`playwright-cli ${args[0]} failed (${result.status}): ${output.slice(-1800)}`);
  return output;
}

function code(body, timeout = 60_000) {
  const normalized = body.trim().replace(/\r?\n\s*/g, ' ');
  return cli(['run-code', normalized], timeout);
}

function wait(ms) {
  code(`async page => { await page.waitForTimeout(${ms}); return ${ms}; }`, Math.max(45_000, ms + 10_000));
}

function phase(title, body, ms) {
  cli(['video-chapter', title]);
  code(`async page => { await page.evaluate((text) => window.__sauatSubtitle?.(text), ${JSON.stringify(title)}); ${body} return true; }`);
  wait(ms);
}

const phaseMs = Math.max(8_000, Math.floor((durationMs - 12_000) / 5));
let error = null;

try {
  cli(['open', baseUrl]);
  cli(['resize', '1280', '720']);
  cli(['video-start', videoPath, '--size', '1280x720']);
  code(`async page => {
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.sauat-demo-subtitle{position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);max-width:90%;padding:9px 18px;border-radius:999px;background:rgba(8,18,38,.9);color:#fff;font:600 18px/1.25 system-ui,sans-serif;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.25)}';
      document.head.appendChild(style);
      const node = document.createElement('div');
      node.className = 'sauat-demo-subtitle';
      document.body.appendChild(node);
      window.__sauatSubtitle = (text) => { node.textContent = 'SAUAT • ' + text; };
      window.__sauatSubtitle('ДЕМО • 7 ИСТОРИЙ • БЕЗ ЗВУКА');
    });
    return await page.title();
  }`);

  phase('01 • Входная диагностика', `const start = page.getByRole('button', { name: /Начать маршрут|Бағытты бастау/ }).first(); if (await start.count()) await start.click(); const diagnostic = page.getByRole('button', { name: /Открыть диагностику|Диагностиканы ашу/ }).first(); await diagnostic.waitFor({ state: 'visible' }); await diagnostic.click(); const begin = page.getByRole('button', { name: /Начать диагностику|Диагностиканы бастау/ }); await begin.waitFor({ state: 'visible' }); await begin.click();`, phaseMs);
  phase('02 • История case_001', `await page.getByRole('button', { name: 'SAUAT' }).first().click(); const story = page.locator('button[data-action="open-story"][data-story="case_001"]').first(); await story.waitFor({ state: 'visible' }); await story.click(); await page.getByRole('button', { name: /Перейти к заданиям|Тапсырмаларға өту/ }).waitFor({ state: 'visible' });`, phaseMs);
  phase('03 • Ответ и доказательство', `await page.getByRole('button', { name: /Перейти к заданиям|Тапсырмаларға өту/ }).click(); await page.locator('[data-option]').first().waitFor({ state: 'visible' }); const storyData = await page.evaluate(async () => fetch('/content/case_001.json').then((response) => response.json())); const firstTask = storyData.tasks[0]; await page.locator('[data-option="' + firstTask.correctOptionIds[0] + '"]').click(); for (const id of firstTask.acceptedEvidenceSets[0]) await page.locator('[data-evidence="' + id + '"]').click(); const check = page.locator('button[data-action="submit"]'); await check.waitFor({ state: 'visible' }); await check.click();`, phaseMs);
  phase('04 • Итоги истории', `const storyData = await page.evaluate(async () => fetch('/content/case_001.json').then((response) => response.json())); await page.locator('button[data-action="advance"]').waitFor({ state: 'visible' }); await page.locator('button[data-action="advance"]').click(); for (const [index, task] of storyData.tasks.slice(1).entries()) { await page.locator('[data-option]').first().waitFor({ state: 'visible' }); await page.locator('[data-option="' + task.correctOptionIds[0] + '"]').click(); for (const id of task.acceptedEvidenceSets[0]) await page.locator('[data-evidence="' + id + '"]').click(); const check = page.locator('button[data-action="submit"]'); await check.waitFor({ state: 'visible' }); await check.click(); await page.waitForTimeout(450); if (index < storyData.tasks.slice(1).length - 1) { await page.locator('button[data-action="advance"]').waitFor({ state: 'visible' }); await page.locator('button[data-action="advance"]').click(); } }`, phaseMs);
  phase('05 • Кабинет учителя', `const mapButton = page.locator('button[data-action="map"]').last(); await mapButton.waitFor({ state: 'visible' }); await mapButton.click(); const cabinet = page.locator('[data-testid="teacher-cabinet"]'); await cabinet.waitFor({ state: 'visible' }); await cabinet.click();`, phaseMs);
} catch (caught) {
  error = String(caught);
} finally {
  try { cli(['video-stop'], 60_000); } catch (caught) { error = error || String(caught); }
  try { cli(['close']); } catch { /* best effort cleanup */ }
}

const result = {
  synthetic: true,
  audio: false,
  note: 'СИМУЛЯЦИЯ: демонстрационный браузерный сценарий, не реальные ученики.',
  path: 'entry diagnostic → case_001 story → story summary → teacher cabinet',
  baseUrl,
  viewport: '1280x720',
  durationMs,
  videoPath,
  session,
  error
};
fs.writeFileSync(path.join(outputDir, 'demo-run.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result));
process.exitCode = error ? 1 : 0;
