import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askLocalMentor } from '../src/ai.js';
import { getTask } from '../src/taskBank.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(await fs.readFile(path.join(here, 'cases.json'), 'utf8'));
const report = { generatedAt: new Date().toISOString(), total: cases.length, mode: process.env.OLLAMA_URL ? 'ollama' : 'not-run', passed: 0, failed: 0, cases: [] };

if (!process.env.OLLAMA_URL) {
  report.cases = cases.map((item) => ({ ...item, status: 'not-run', reason: 'OLLAMA_URL не настроен; AI-eval не подменён офлайн-режимом' }));
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

for (const item of cases) {
  const task = getTask(item.taskId);
  const hint = await askLocalMentor({ task, level: 2 });
  const sourceTokens = item.source.toLowerCase().split(/\s+/).filter((token) => token.length > 4).slice(0, 4);
  const grounded = Boolean(hint) && sourceTokens.some((token) => hint.toLowerCase().includes(token.replace(/[.,:;!?]/g, '')));
  const row = { ...item, status: grounded ? 'passed' : 'failed', hint: hint || null };
  report.cases.push(row);
  if (grounded) report.passed += 1; else report.failed += 1;
}
console.log(JSON.stringify(report, null, 2));
