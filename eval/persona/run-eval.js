import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMentorContext, askStructuredMentor, ruleResponse } from '../../src/mentor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../..');
const profiles = JSON.parse(fs.readFileSync(path.join(here, 'profiles.json'), 'utf8'));

function sameDecision(left, right) {
  return left.strategy === right.strategy && left.hintId === right.hintId && left.nextTaskId === right.nextTaskId;
}

function line(result) {
  const model = `${result.model.source}:${result.model.strategy}/${result.model.hintId || '-'}->${result.model.nextTaskId || '-'}`;
  const rule = `${result.rule.strategy}/${result.rule.hintId || '-'}->${result.rule.nextTaskId || '-'}`;
  return `| ${result.profile.id} | ${model} | ${rule} | ${result.match ? 'yes' : 'no'} |`;
}

async function main() {
  const results = [];
  for (const profile of profiles) {
    const input = {
      storyId: 'case_001',
      taskId: profile.taskId,
      skill: 'infer',
      lang: 'ru',
      errorProfile: {
        answerWrong: profile.answerWrong,
        evidenceWrong: profile.evidenceWrong,
        attempt: profile.attempt,
        hintsUsed: profile.hintsUsed,
        lastHintLevel: profile.lastHintLevel
      }
    };
    const context = getMentorContext(input);
    if (!context) throw new Error(`Не найдена история/задача для профиля ${profile.id}. Запустите с INCLUDE_DRAFT=1.`);
    const rule = ruleResponse(context, input.errorProfile);
    const model = await askStructuredMentor(input, context);
    results.push({ profile, model, rule, match: sameDecision(model, rule) });
  }
  const markdown = [
    '# SAUAT mentor persona eval',
    '',
    `Model: ${process.env.OLLAMA_MODEL || 'qwen2.5:1.5b'}; source: ${results.some((result) => result.model.source === 'ai') ? 'ai' : 'rules fallback'}.`,
    '',
    '| Профиль | Модель | Правило | Совпало |',
    '|---|---|---|---|',
    ...results.map(line),
    '',
    `AI responses: ${results.filter((result) => result.model.source === 'ai').length}/${results.length}.`,
    `Matches with rule: ${results.filter((result) => result.match).length}/${results.length}.`
  ].join('\n');
  const outIndex = process.argv.indexOf('--out');
  const outputPath = outIndex >= 0 && process.argv[outIndex + 1] ? path.resolve(process.argv[outIndex + 1]) : path.join(here, 'results.md');
  fs.writeFileSync(outputPath, `${markdown}\n`, 'utf8');
  console.log(markdown);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
