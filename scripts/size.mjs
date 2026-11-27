import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const STARTUP_GZIP_LIMIT = 1_500_000;
export const MAX_FILE_BYTES = 20_000_000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const categories = ['HTML', 'JS', 'CSS', 'content', 'icons', 'прочее'];

function walk(root, relative = '') {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    return entry.isDirectory() ? walk(root, next) : [next];
  });
}

function categoryFor(relative) {
  const normalized = relative.replaceAll(path.sep, '/');
  if (normalized.endsWith('.html')) return 'HTML';
  if (normalized.endsWith('.js')) return 'JS';
  if (normalized.endsWith('.css')) return 'CSS';
  if (normalized.startsWith('content/') && normalized.endsWith('.json')) return 'content';
  if (normalized.startsWith('icons/')) return 'icons';
  return 'прочее';
}

function isStartupFile(relative) {
  const normalized = relative.replaceAll(path.sep, '/');
  return normalized === 'index.html'
    || normalized === 'sauat.css'
    || normalized === 'manifest.webmanifest'
    || normalized === 'sw.js'
    || normalized.startsWith('js/')
    || normalized.startsWith('content/')
    || normalized.startsWith('icons/')
    || normalized.startsWith('assets/');
}

function emptySize() { return { files: 0, raw: 0, gzip: 0 }; }

function addSize(target, data) {
  target.files += 1;
  target.raw += data.length;
  target.gzip += zlib.gzipSync(data, { level: 9 }).length;
}

export function measureDist(distRoot = path.join(projectRoot, 'dist')) {
  if (!fs.existsSync(distRoot) || !fs.statSync(distRoot).isDirectory()) {
    throw new Error(`dist не найден: ${distRoot}. Сначала выполните npm run build:demo или npm run build:static.`);
  }
  const summary = Object.fromEntries(categories.map((category) => [category, emptySize()]));
  const startup = emptySize();
  const oversizedFiles = [];
  for (const relative of walk(distRoot)) {
    const data = fs.readFileSync(path.join(distRoot, relative));
    if (data.length > MAX_FILE_BYTES) oversizedFiles.push(relative.replaceAll(path.sep, '/'));
    addSize(summary[categoryFor(relative)], data);
    if (isStartupFile(relative)) addSize(startup, data);
  }
  return { categories: summary, startup, total: categories.reduce((acc, category) => {
    acc.files += summary[category].files;
    acc.raw += summary[category].raw;
    acc.gzip += summary[category].gzip;
    return acc;
  }, emptySize()), oversizedFiles };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function renderReport(result) {
  const rows = categories.map((category) => {
    const item = result.categories[category];
    return `| ${category} | ${item.files} | ${formatBytes(item.raw)} | ${formatBytes(item.gzip)} |`;
  });
  rows.push(`| **Всего dist** | **${result.total.files}** | **${formatBytes(result.total.raw)}** | **${formatBytes(result.total.gzip)}** |`);
  rows.push(`| **Стартовый набор** | **${result.startup.files}** | **${formatBytes(result.startup.raw)}** | **${formatBytes(result.startup.gzip)}** |`);
  return [
    '| Категория | Файлов | raw | gzip |',
    '|---|---:|---:|---:|',
    ...rows,
    '',
    `Лимит размера одного файла: ${MAX_FILE_BYTES.toLocaleString('ru-RU')} B.`,
    result.oversizedFiles.length === 0 ? 'File-size: PASS' : `File-size: FAIL (${result.oversizedFiles.join(', ')})`,
    `Стартовый набор: ${formatBytes(result.startup.gzip)} gzip; лимит ${formatBytes(STARTUP_GZIP_LIMIT)} gzip.`,
    result.startup.gzip <= STARTUP_GZIP_LIMIT ? 'Budget: PASS' : 'Budget: FAIL'
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = measureDist(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(renderReport(result));
  if (result.startup.gzip > STARTUP_GZIP_LIMIT || result.oversizedFiles.length > 0) process.exitCode = 1;
}
