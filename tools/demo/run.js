import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseUrl = process.env.DEMO_BASE_URL || 'http://localhost:3400';
const durationMs = Number(process.env.DEMO_DURATION_MS || 180000);
const cliOverheadMs = 42_000;
const outputDir = path.resolve(process.env.DEMO_OUTPUT_DIR || path.join(root, 'docs', 'demo'));
const videoPath = path.join(outputDir, process.env.DEMO_VIDEO_NAME || 'sauat-demo.webm');
const session = `sauat-demo-${Date.now()}`;
const npx = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  : 'npx';

fs.mkdirSync(outputDir, { recursive: true });

function cli(args, timeout = 45_000) {
  const command = process.platform === 'win32' ? process.execPath : npx;
  const commandArgs = process.platform === 'win32'
    ? [npx, '--no-install', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args]
    : ['--no-install', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`;
  if ((result.status ?? 2) !== 0) throw new Error(`playwright-cli ${args[0]} failed (${result.status}): ${output.slice(-1500)}`);
  return output;
}

function code(body, timeout = 45_000) {
  const normalized = body.trim().replace(/\r?\n\s*/g, ' ');
  return cli(['run-code', normalized], timeout);
}

function wait(ms) {
  code(`async page => { await page.waitForTimeout(${ms}); return ${ms}; }`, Math.max(45_000, ms + 10_000));
}

const phase = async (title, body, ms) => {
  cli(['video-chapter', title]);
  code(`async page => { await page.evaluate((text) => window.__sauatSubtitle?.(text), ${JSON.stringify(title)}); ${body} return true; }`, 60_000);
  if (ms > 0) wait(ms);
};

let error = null;
try {
  cli(['open', baseUrl]);
  cli(['resize', '1440', '900']);
  cli(['video-start', videoPath]);
  code(`async page => {
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = '.sauat-demo-subtitle{position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);max-width:90%;padding:9px 18px;border-radius:999px;background:rgba(8,18,38,.9);color:#fff;font:600 18px/1.25 system-ui,sans-serif;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.25)}';
      document.head.appendChild(style);
      const node = document.createElement('div');
      node.className = 'sauat-demo-subtitle';
      document.body.appendChild(node);
      window.__sauatSubtitle = (text) => { node.textContent = 'САУАТ • ' + text; };
      window.__sauatSubtitle('ДЕМО • СИМУЛЯЦИЯ');
    });
    await page.waitForTimeout(1000);
    return { title: await page.title() };
  }`);

  const scriptedDurationMs = Math.max(10000, durationMs - cliOverheadMs);
  const phaseMs = Math.max(2000, Math.floor((scriptedDurationMs - 18000) / 5));
  await phase('01 • Карта маршрута', `await page.waitForTimeout(1000);`, phaseMs);
  await phase('02 • История «Золотой человек»', `const start = page.getByRole('button', { name: /Начать маршрут|Бағытты бастау/ }).last(); if (await start.count()) await start.click();`, phaseMs);
  await phase('03 • Задания и подсказка', `const tasks = page.getByRole('button', { name: /Перейти к заданиям|Тапсырмаларға өту/ }); if (await tasks.count()) await tasks.click(); const hint = page.getByRole('button', { name: /Подсказ|Көмек/ }); if (await hint.count()) await hint.first().click();`, phaseMs);
  await phase('04 • Ответы ученика', `for (let i = 0; i < 6; i += 1) { const answers = page.getByRole('group', { name: /Ответ|Жауап/ }).getByRole('button'); if (!(await answers.count())) break; await answers.first().click(); const evidence = page.getByRole('button', { name: /^e/ }); if (await evidence.count()) await evidence.first().click(); const check = page.getByRole('button', { name: /^(Проверить|Тексеру)$/ }); if (!(await check.count())) break; await check.click(); const next = page.getByRole('button', { name: /Следующий шаг|Келесі қадам/ }); if (!(await next.count())) break; await next.click(); }`, phaseMs);
  await phase('05 • Результат и экспорт', `const exportButton = page.getByRole('button', { name: /Экспорт результатов|Нәтижелерді экспорттау/ }); if (await exportButton.count()) await exportButton.click();`, phaseMs);
  await phase('06 • Финальный кадр', `await page.waitForTimeout(1000);`, Math.max(0, scriptedDurationMs - (phaseMs * 5 + 18000)));
} catch (caught) {
  error = String(caught);
} finally {
  try { cli(['video-stop'], 60_000); } catch (caught) { error = error || String(caught); }
  try { cli(['close']); } catch { /* best effort cleanup for this named session */ }
}

const result = { synthetic: true, note: 'СИМУЛЯЦИЯ: демонстрационный браузерный сценарий, не реальные ученики.', baseUrl, durationMs, videoPath, session, error };
fs.writeFileSync(path.join(outputDir, 'demo-run.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result));
process.exitCode = error ? 1 : 0;
