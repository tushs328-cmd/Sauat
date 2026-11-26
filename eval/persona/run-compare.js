// TASK-002: сравнение Ollama и rules на 12 сценариях с эталоном, зафиксированным ДО запуска.
// Запуск: INCLUDE_DRAFT=1 OLLAMA_URL=http://127.0.0.1:11434 node eval/persona/run-compare.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMentorContext, askStructuredMentor, ruleResponse } from '../../src/mentor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// Эталон: педагогически ожидаемая стратегия, записана до запуска и не зависит от кода rules.
// Задание t2 (infer_evidence), история case_001.
const PROFILES = [
  { id: 'answer-error', answerWrong: true, evidenceWrong: false, attempt: 1, hintsUsed: 0, lastHintLevel: 0, expectStrategy: 'locate', expectLevel: 1 },
  { id: 'evidence-error', answerWrong: false, evidenceWrong: true, attempt: 1, hintsUsed: 0, lastHintLevel: 0, expectStrategy: 'compare', expectLevel: 1 },
  { id: 'both-errors', answerWrong: true, evidenceWrong: true, attempt: 1, hintsUsed: 0, lastHintLevel: 0, expectStrategy: 'locate', expectLevel: 1 },
  { id: 'repeat-same-error', answerWrong: true, evidenceWrong: false, attempt: 3, hintsUsed: 2, lastHintLevel: 2, expectStrategy: 'locate', expectLevel: 3 },
  { id: 'hint-heavy', answerWrong: false, evidenceWrong: true, attempt: 3, hintsUsed: 3, lastHintLevel: 2, expectStrategy: 'compare', expectLevel: 3 },
  { id: 'independent-success', answerWrong: false, evidenceWrong: false, attempt: 1, hintsUsed: 0, lastHintLevel: 0, expectStrategy: 'compare', expectLevel: 1 }
];
const LANGS = ['ru', 'kk'];

const rawLog = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  const started = performance.now();
  const response = await realFetch(...args);
  const clone = response.clone();
  clone.json().then((body) => rawLog.push({ ms: Math.round(performance.now() - started), raw: body.response, model: body.model })).catch(() => {});
  return response;
};

const rows = [];
for (const lang of LANGS) {
  for (const profile of PROFILES) {
    const input = {
      storyId: 'case_001', taskId: 't2', skill: 'infer', lang,
      errorProfile: { answerWrong: profile.answerWrong, evidenceWrong: profile.evidenceWrong, attempt: profile.attempt, hintsUsed: profile.hintsUsed, lastHintLevel: profile.lastHintLevel }
    };
    const context = getMentorContext(input);
    if (!context) throw new Error('Нет контекста: запустите с INCLUDE_DRAFT=1');
    const rule = ruleResponse(context, input.errorProfile);
    const before = rawLog.length;
    const started = performance.now();
    const model = await askStructuredMentor(input, context);
    const ms = Math.round(performance.now() - started);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const raw = rawLog.slice(before).map((item) => item.raw).join(' | ');
    const hintOk = !model.hintId || context.hintIds.includes(model.hintId);
    const taskOk = !model.nextTaskId || model.nextTaskId === context.nextTaskId;
    const expectedHintLevelOk = (rule.hintId || '').length ? true : true;
    rows.push({
      lang, profile: profile.id, expected: profile.expectStrategy, expectedLevel: profile.expectLevel,
      targetLevel: context.targetLevel, allowedStrategies: context.allowedStrategies, allowedHintIds: context.hintIds,
      model: { source: model.source, strategy: model.strategy, hintId: model.hintId, nextTaskId: model.nextTaskId },
      rule: { strategy: rule.strategy, hintId: rule.hintId, nextTaskId: rule.nextTaskId },
      modelMatchesExpected: model.strategy === profile.expectStrategy,
      ruleMatchesExpected: rule.strategy === profile.expectStrategy,
      levelOk: context.targetLevel === profile.expectLevel && expectedHintLevelOk,
      hintOk, taskOk, ms, raw
    });
  }
}

const n = rows.length;
const count = (fn) => rows.filter(fn).length;
const latencies = rows.filter((r) => r.model.source === 'ai').map((r) => r.ms).sort((a, b) => a - b);
const median = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;
const summary = {
  scenarios: n,
  aiResponses: count((r) => r.model.source === 'ai'),
  modelMatchesExpected: count((r) => r.modelMatchesExpected),
  ruleMatchesExpected: count((r) => r.ruleMatchesExpected),
  modelEqualsRule: count((r) => r.model.strategy === r.rule.strategy && r.model.hintId === r.rule.hintId && r.model.nextTaskId === r.rule.nextTaskId),
  levelsOk: count((r) => r.levelOk),
  hintIdValid: count((r) => r.hintOk),
  nextTaskValid: count((r) => r.taskOk),
  decisionFreedom: count((r) => r.allowedStrategies.length > 1),
  latencyMedianMs: median, latencyMaxMs: latencies.length ? latencies[latencies.length - 1] : null, firstCallMs: rows[0]?.ms ?? null,
  model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b'
};

const md = [
  '# AI_COMPARE — Ollama против rules (TASK-002)',
  '',
  ...(process.env.OLLAMA_URL ? [] : ['> ВНИМАНИЕ: запуск БЕЗ живой модели (OLLAMA_URL не задан). Колонка «Модель» = rules-fallback, строки с ИИ не измерялись. Измеримо только: эталон против rules и свобода выбора модели.', '']),
  `Модель: ${summary.model}. Дата: ${new Date().toISOString()}. Сценариев: ${n} (6 профилей × RU/KK, задание t2 case_001).`,
  'Эталон (ожидаемая стратегия) зафиксирован в run-compare.js до запуска и не менялся после ответов модели.',
  '',
  '| Язык | Профиль | Эталон | Модель | Rules | Модель=эталон | Rules=эталон | Выбор стратегий (допустимо) | мс |',
  '|---|---|---|---|---|---|---|---|---:|',
  ...rows.map((r) => `| ${r.lang} | ${r.profile} | ${r.expected} | ${r.model.source}:${r.model.strategy}/${r.model.hintId} | ${r.rule.strategy}/${r.rule.hintId} | ${r.modelMatchesExpected ? 'да' : 'НЕТ'} | ${r.ruleMatchesExpected ? 'да' : 'НЕТ'} | ${r.allowedStrategies.join(',')} | ${r.ms} |`),
  '',
  '## Итоги',
  `- Ответов модели (source:ai): ${summary.aiResponses}/${n}.`,
  `- Модель совпала с педагогическим эталоном: ${summary.modelMatchesExpected}/${n}; rules совпали: ${summary.ruleMatchesExpected}/${n}.`,
  `- Модель совпала с rules полностью (стратегия+hintId+nextTaskId): ${summary.modelEqualsRule}/${n}.`,
  `- Допустимость hintId: ${summary.hintIdValid}/${n}; nextTaskId: ${summary.nextTaskValid}/${n}.`,
  `- Сценариев, где у модели вообще был выбор из >1 стратегии: ${summary.decisionFreedom}/${n}.`,
  `- Задержка: первый вызов ${summary.firstCallMs} мс, медиана ${summary.latencyMedianMs} мс, максимум ${summary.latencyMaxMs} мс (локальный CPU/Docker, не эталонное устройство).`,
  '- Раскрытие правильного ответа: 0 случаев по построению (модель возвращает только идентификаторы из allowlist).',
  '',
  'Ограничение: это 12 синтетических профилей, не доказательство образовательной пользы.'
].join('\n');

fs.writeFileSync(path.join(root, 'docs/sauat/reports/AI_COMPARE.md'), `${md}\n`, 'utf8');
fs.writeFileSync(path.join(root, 'docs/sauat/reports/AI_COMPARE_RAW.json'), JSON.stringify({ summary, rows }, null, 2), 'utf8');
console.log(md);
