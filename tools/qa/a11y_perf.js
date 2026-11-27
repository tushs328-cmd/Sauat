import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseUrl = process.env.QA_BASE_URL || 'http://localhost:3400';
const outputDir = process.env.QA_OUTPUT_DIR || path.join(root, 'qa', 'out');
const stamp = Date.now();
const npx = process.platform === 'win32'
  ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
  : 'npx';
const session = `a11y-perf-${stamp}`;

fs.mkdirSync(outputDir, { recursive: true });

function cli(args, timeout = 45_000) {
  const command = process.platform === 'win32' ? process.execPath : npx;
  const commandArgs = process.platform === 'win32'
    ? [npx, '--no-install', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args]
    : ['--no-install', '--package', '@playwright/cli', 'playwright-cli', `-s=${session}`, ...args];
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: 'utf8', timeout, windowsHide: true });
  const output = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error || ''}`;
  if ((result.status ?? 2) !== 0) throw new Error(`${args[0]} failed (${result.status}): ${output.slice(-1500)}`);
  return output;
}

function runCode(body, timeout = 60_000) {
  return cli(['run-code', body.trim().replace(/\r?\n\s*/g, ' ')], timeout);
}

function parseResult(output) {
  const marker = '### Result\n';
  const start = output.lastIndexOf(marker);
  if (start < 0) throw new Error(`run-code result missing: ${output.slice(-1000)}`);
  const value = output.slice(start + marker.length).split('\n### Ran Playwright code')[0].trim();
  return JSON.parse(value);
}

function audit(sessionState) {
  const result = parseResult(runCode(`async page => {
    await page.setViewportSize({ width: ${sessionState.width}, height: ${sessionState.height} });
    const label = ${JSON.stringify(sessionState.lang === 'ru' ? 'РУ Русский' : 'ҚАЗ Қазақша')};
    const language = page.getByRole('button', { name: label });
    if (await language.count()) await language.click();
    await page.waitForTimeout(250);
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      const interactive = [...document.querySelectorAll('button, a, input, select, textarea, [role="button"]')];
      const named = interactive.filter((el) => (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim());
      const smallTargets = interactive.map((el) => {
        const r = el.getBoundingClientRect();
        return { selector: el.tagName.toLowerCase(), text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 80), width: Math.round(r.width), height: Math.round(r.height) };
      }).filter((x) => x.width > 0 && x.height > 0 && (x.width < 44 || x.height < 44));
      const images = [...document.images].map((img) => ({ src: img.currentSrc || img.src, alt: img.alt, complete: img.complete, naturalWidth: img.naturalWidth }));
      return {
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        focus: (() => { const el = document.activeElement; const style = el ? getComputedStyle(el) : null; return { tag: el?.tagName || null, outline: style?.outlineStyle || null, boxShadow: style?.boxShadow || null }; })(),
        interactiveCount: interactive.length,
        unnamedInteractiveCount: interactive.length - named.length,
        smallTargets,
        images,
        emptyLeafCount: [...document.querySelectorAll('body *')].filter((el) => el.children.length === 0 && !el.getAttribute('aria-hidden') && !el.textContent?.trim()).length,
        navigation: nav ? { domContentLoaded: Math.round(nav.domContentLoadedEventEnd), domInteractive: Math.round(nav.domInteractive), loadEventEnd: Math.round(nav.loadEventEnd), responseStart: Math.round(nav.responseStart), transferSize: nav.transferSize } : null,
        resources: { count: resources.length, transferSize: resources.reduce((sum, item) => sum + (item.transferSize || 0), 0), duration: Math.round(resources.reduce((max, item) => Math.max(max, item.duration), 0)) }
      };
    });
  }`));
  return { ...sessionState, network: 'normal', audit: result };
}

function slowAudit(sessionState) {
  const result = parseResult(runCode(`async page => {
    await page.setViewportSize({ width: ${sessionState.width}, height: ${sessionState.height} });
    await page.context().route('**/*', async route => { await new Promise(resolve => setTimeout(resolve, 150)); await route.continue(); });
    const started = Date.now();
    await page.goto(${JSON.stringify(baseUrl)} + '?perfSlow=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    const elapsedToDomContentLoaded = Date.now() - started;
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
    const nav = await page.evaluate(() => { const item = performance.getEntriesByType('navigation')[0]; return item ? { domContentLoaded: Math.round(item.domContentLoadedEventEnd), domInteractive: Math.round(item.domInteractive), loadEventEnd: Math.round(item.loadEventEnd), ttiProxy: Math.round(item.domInteractive) } : null; });
    return { elapsedToDomContentLoaded, navigation: nav, bodyText: (await page.locator('body').innerText()).slice(0, 200) };
  }`, 90_000));
  return { ...sessionState, network: '150ms response delay', audit: result };
}

const results = { synthetic: true, note: 'СИМУЛЯЦИЯ: браузерный audit, не реальные ученики.', baseUrl, axeCore: 'not installed', lighthouse: 'not installed', sessions: [] };
try {
  cli(['open', baseUrl]);
  for (const lang of ['ru', 'kk']) {
    for (const [width, height] of [[360, 800], [768, 1024], [1440, 900]]) {
      const state = { lang, width, height };
      results.sessions.push(audit(state));
      if (lang === 'ru' && width === 360) results.sessions.push(slowAudit(state));
    }
  }
} finally {
  try { cli(['close']); } catch { /* best effort cleanup for this named session */ }
}

fs.writeFileSync(path.join(outputDir, 'a11y-perf.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ sessions: results.sessions.length, output: path.join(outputDir, 'a11y-perf.json') }));
