import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pdfParse from 'pdf-parse';
import { formatBytes, measureDist } from './size.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const documents = [
  'README.md',
  'docs/sauat/FORM_COPYPASTE.md',
  'docs/sauat/ONE_PAGER.md',
  'docs/sauat/RELEASE_CANDIDATE.md'
];
const MAX_FILE_BYTES = 20_000_000;
const EXPECTED = { stories: 7, practice: 5, diagnostic: 2, tests: 72, startupKb: 123.4, slides: 10 };

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function countStories() {
  const manifestPath = path.join(projectRoot, 'content', 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const manifestStories = Array.isArray(manifest?.stories) ? manifest.stories : [];
  if (manifestStories.length > 0) {
    return {
      source: 'content/manifest.json',
      stories: manifestStories,
      fallback: false
    };
  }

  const stories = fs.readdirSync(path.join(projectRoot, 'content'))
    .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
    .sort()
    .map((name) => ({ name, value: readJson(path.join(projectRoot, 'content', name)) }))
    .filter(({ value }) => !value.isTestFixture && ['practice', 'diagnostic'].includes(value.kind))
    .map(({ name, value }) => ({ id: value.id, kind: value.kind, file: name }));
  return { source: 'content/*.json (manifest пуст)', stories, fallback: true };
}

function runTests() {
  const result = spawnSync(process.execPath, ['--test'], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const number = (pattern) => Number(output.match(pattern)?.[1] || 0);
  return {
    exitCode: result.status ?? 1,
    tests: number(/ℹ tests (\d+)/),
    passed: number(/ℹ pass (\d+)/),
    failed: number(/ℹ fail (\d+)/)
  };
}

function buildTemporaryDemo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-number-check-'));
  const distRoot = path.join(tempRoot, 'dist');
  const result = spawnSync(process.execPath, ['scripts/build-static.mjs', '--include-draft'], {
    cwd: projectRoot,
    env: { ...process.env, SAULAT_DIST_DIR: distRoot },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.status !== 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(`demo-сборка завершилась с кодом ${result.status}: ${result.stderr || result.stdout}`);
  }
  return { tempRoot, distRoot };
}

function documentMatches(pattern) {
  return documents.filter((relative) => {
    const file = path.join(projectRoot, relative);
    return fs.existsSync(file) && pattern.test(fs.readFileSync(file, 'utf8'));
  });
}

function formatDocumentMatches(matches) {
  return matches.length ? matches.join(', ') : '—';
}

function row(number, source, pattern, calculated) {
  const matches = documentMatches(pattern);
  const matchesDocs = matches.length > 0;
  const agrees = calculated && matchesDocs;
  return { number, source, matches: formatDocumentMatches(matches), agrees };
}

const temporary = buildTemporaryDemo();
try {
  const storyCount = countStories();
  const practice = storyCount.stories.filter((story) => story.kind === 'practice').length;
  const diagnostic = storyCount.stories.filter((story) => story.kind === 'diagnostic').length;
  const tests = runTests();
  const size = measureDist(temporary.distRoot);
  const startupKb = size.startup.gzip / 1024;
  const videoPath = path.join(projectRoot, 'docs/video/SAUAT_pitch.mp4');
  const slidesPath = path.join(projectRoot, 'docs/slides/export/slides.pdf');
  const videoBytes = fs.existsSync(videoPath) ? fs.statSync(videoPath).size : null;
  const slidesBytes = fs.existsSync(slidesPath) ? fs.statSync(slidesPath).size : null;
  const slideCount = slidesBytes === null ? null : (await pdfParse(fs.readFileSync(slidesPath))).numpages;
  const filesUnderLimit = videoBytes !== null && slidesBytes !== null
    && videoBytes < MAX_FILE_BYTES && slidesBytes < MAX_FILE_BYTES;
  const videoDocumentMatches = videoBytes === null ? [] : documentMatches(new RegExp(`\\b${videoBytes}\\b`));
  const slidesDocumentMatches = slidesBytes === null ? [] : documentMatches(new RegExp(`\\b${slidesBytes}\\b`));
  const limitDocumentMatches = documentMatches(/20[\s\u00a0]*000[\s\u00a0]*000\s*(?:байт|bytes)?/iu);
  const startupMatches = documentMatches(/123[,.]4\s*(?:КБ|KB)\s*gzip/iu);
  const startupAgrees = Math.abs(startupKb - EXPECTED.startupKb) <= 0.5 && startupMatches.length > 0;
  const rows = [
    row(`${storyCount.stories.length} (practice ${practice} + diagnostic ${diagnostic})`, storyCount.source, /\b7\s+(?:истори|stories|әңгім)/iu, storyCount.stories.length === EXPECTED.stories && practice === EXPECTED.practice && diagnostic === EXPECTED.diagnostic),
    row(`${tests.tests} (pass ${tests.passed}, fail ${tests.failed})`, 'node --test; разбор ℹ tests/pass/fail', /\b72\s*\/\s*72\b/iu, tests.exitCode === 0 && tests.tests === EXPECTED.tests && tests.passed === EXPECTED.tests && tests.failed === 0),
    row(`${startupKb.toFixed(1)} KB gzip (ожидалось ≈${EXPECTED.startupKb.toFixed(1)} KB)`, 'scripts/size.mjs через временный demo dist', /123[,.]4\s*(?:КБ|KB)\s*gzip/iu, startupAgrees),
    {
      number: `${videoBytes ?? 'MISSING'} B; ${slidesBytes ?? 'MISSING'} B (< ${MAX_FILE_BYTES.toLocaleString('ru-RU')} B)`,
      source: 'docs/video/SAUAT_pitch.mp4 + docs/slides/export/slides.pdf',
      matches: `video: ${formatDocumentMatches(videoDocumentMatches)}; PDF: ${formatDocumentMatches(slidesDocumentMatches)}; лимит: ${formatDocumentMatches(limitDocumentMatches)}`,
      agrees: filesUnderLimit && videoDocumentMatches.length > 0 && slidesDocumentMatches.length > 0 && limitDocumentMatches.length > 0
    },
    row(`${slideCount ?? 'MISSING'} (PDF ${slidesBytes ?? 'MISSING'} B)`, 'pdf-parse: numpages', /\b10\s+(?:слайд\p{L}*|slides)(?=\s|$|\)|[.,])/iu, slideCount === EXPECTED.slides)
  ];

  console.log('SAUAT number check');
  console.log(`Документы: ${documents.join(', ')}`);
  console.log('| число | источник | найдено в документах | совпадает |');
  console.log('|---|---|---|---|');
  for (const item of rows) console.log(`| ${item.number} | ${item.source} | ${item.matches} | ${item.agrees ? 'да' : 'нет'} |`);
  console.log(`\nОграничение файлов: ${MAX_FILE_BYTES.toLocaleString('ru-RU')} B; видео/PDF: ${filesUnderLimit ? 'PASS' : 'FAIL'}.`);
  console.log(`Стартовый набор: ${formatBytes(size.startup.gzip)} gzip; dist-файлов ${size.total.files}; сборка: ${storyCount.fallback ? 'fallback content files' : 'manifest'}.`);

  const ok = rows.every((item) => item.agrees) && filesUnderLimit;
  process.exitCode = ok ? 0 : 1;
} finally {
  fs.rmSync(temporary.tempRoot, { recursive: true, force: true });
}
