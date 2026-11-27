import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contentDir = path.join(root, 'content');
const reportPath = path.join(root, 'docs', 'sauat', 'reports', 'KK_LINT.md');
const termDictionary = ['қорым', 'қорған', 'қабір', 'жәдігер', 'дереккөз', 'үзінді', 'ЖИ'];
const suspiciousRussian = new Set(['и', 'в', 'на', 'по', 'что', 'это', 'для', 'не', 'как', 'из', 'или', 'тоже', 'ответ', 'доказательство', 'проверить', 'подсказка', 'источник', 'страница', 'история']);

function stringsWithPair(node, key = '$', result = []) {
  if (!node || typeof node !== 'object') return result;
  if (typeof node.kk === 'string' && typeof node.ru === 'string') result.push({ key, kk: node.kk, ru: node.ru });
  if (Array.isArray(node)) node.forEach((value, index) => stringsWithPair(value, `${key}[${index}]`, result));
  else Object.entries(node).forEach(([name, value]) => stringsWithPair(value, `${key}.${name}`, result));
  return result;
}

function tokens(value, pattern) {
  return [...new Set(value.match(pattern) || [])].sort();
}

function words(value) {
  return value.toLocaleLowerCase('ru-RU').split(/[^\p{L}]+/u).filter(Boolean);
}

const files = fs.readdirSync(contentDir).filter((name) => name.endsWith('.json') && name !== 'manifest.json').sort();
const findings = [];
const stats = [];

for (const file of files) {
  const fullPath = path.join(contentDir, file);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const pairs = stringsWithPair(data);
  const fileFindings = [];
  const termCounts = Object.fromEntries(termDictionary.map((term) => [term, 0]));

  for (const pair of pairs) {
    const kkWords = words(pair.kk);
    for (const term of termDictionary) if (kkWords.includes(term.toLocaleLowerCase('kk-KZ'))) termCounts[term] += 1;
    const RussianWords = [...new Set(kkWords.filter((word) => suspiciousRussian.has(word)))];
    if (RussianWords.length) fileFindings.push(`${pair.key}: подозрительные русские слова в kk: ${RussianWords.join(', ')}`);
    const kkNumbers = tokens(pair.kk, /\d+(?:[–-]\d+)?/g);
    const ruNumbers = tokens(pair.ru, /\d+(?:[–-]\d+)?/g);
    if (kkNumbers.join('|') !== ruNumbers.join('|')) fileFindings.push(`${pair.key}: числа/даты различаются kk=[${kkNumbers.join(', ')}] ru=[${ruNumbers.join(', ')}]`);
    const kkIds = tokens(pair.kk, /\b(?:e|t|d|s)\d+\b/gi);
    const ruIds = tokens(pair.ru, /\b(?:e|t|d|s)\d+\b/gi);
    if (kkIds.join('|') !== ruIds.join('|')) fileFindings.push(`${pair.key}: ID различаются kk=[${kkIds.join(', ')}] ru=[${ruIds.join(', ')}]`);
    if (pair.kk.length >= 20 && pair.ru.length >= 20) {
      const ratio = pair.kk.length / pair.ru.length;
      if (ratio < 0.4 || ratio > 2.5) fileFindings.push(`${pair.key}: подозрительное отношение длины kk/ru=${ratio.toFixed(2)}`);
    }
  }

  for (const [index, task] of (data.tasks || []).entries()) {
    const kkOptions = task.options?.filter((option) => option.text?.kk !== undefined).length ?? 0;
    const ruOptions = task.options?.filter((option) => option.text?.ru !== undefined).length ?? 0;
    if (kkOptions !== ruOptions) fileFindings.push(`tasks[${index}].options: число вариантов kk=${kkOptions}, ru=${ruOptions}`);
  }

  stats.push({ file, pairs: pairs.length, findings: fileFindings.length, termCounts });
  findings.push(...fileFindings.map((finding) => `- ${file}: ${finding}`));
}

const totalFindings = findings.length;
const lines = [
  '# KK_LINT — W4',
  '',
  'Статический анализ RU/KK. Это не замена редактору: все найденные места требуют «ПРОВЕРИТЬ ЧЕЛОВЕКОМ». Контент не изменялся.',
  '',
  `Проверено файлов: ${files.length}; пар строк kk/ru: ${stats.reduce((sum, item) => sum + item.pairs, 0)}; замечаний: ${totalFindings}.`,
  '',
  '| Файл | Пар строк | Замечания | Термины словаря (число строк) |',
  '|---|---:|---:|---|',
  ...stats.map((item) => `| ${item.file} | ${item.pairs} | ${item.findings} | ${termDictionary.map((term) => `${term}: ${item.termCounts[term]}`).join('; ')} |`),
  '',
  '## ПРОВЕРИТЬ ЧЕЛОВЕКОМ',
  '',
  ...(findings.length ? findings : ['- Автоматических совпадений не найдено; проверить живость казахского текста и смысловой паритет вручную.']),
  '',
  'Ограничения: автоматический поиск не оценивает литературность, кальки и корректность перевода по смыслу; `ЖИ`, названия брендов и технические идентификаторы не считаются ошибками сами по себе.'
];
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ files: files.length, findings: totalFindings, report: reportPath }));

