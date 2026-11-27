import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createManifest } from '../src/content.js';
import { validateContentDirectory, validateStory } from '../src/content-validator.js';

const fixturePath = path.join(process.cwd(), 'content', 'fixture_test.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function copyFixture() {
  return structuredClone(fixture);
}

test('валидный тестовый контент проходит схему и кросс-проверки', () => {
  const result = validateStory(copyFixture());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(validateContentDirectory(path.join(process.cwd(), 'content')).valid, true);
});

test('валидатор объясняет пустой approved-перевод', () => {
  const story = copyFixture();
  story.title.kk = '   ';
  const result = validateStory(story);
  assert.equal(result.valid, false);
  assert.match(result.errors.map((error) => error.message).join(' '), /пустой перевод/);
  assert.ok(result.errors.some((error) => error.suggestion));
});

test('валидатор ловит дубли, битый source/evidence и неверный option ID', () => {
  const story = copyFixture();
  story.documents[0].segments[1].id = 'e1';
  story.documents[0].segments[0].sourceId = 'missing-source';
  story.tasks[1].acceptedEvidenceSets = [['missing-segment']];
  story.tasks[0].correctOptionIds = ['z'];
  const result = validateStory(story);
  assert.equal(result.valid, false);
  const messages = result.errors.map((error) => error.message).join(' ');
  assert.match(messages, /дублируется ID сегмента/);
  assert.match(messages, /источник/);
  assert.match(messages, /сегмент доказательства/);
  assert.match(messages, /правильный вариант/);
});

test('валидатор требует claim у claim_check', () => {
  const story = copyFixture();
  delete story.tasks[2].claim;
  const result = validateStory(story);
  assert.equal(result.valid, false);
  assert.match(result.errors.map((error) => error.message).join(' '), /claim_check/);
});

test('отсутствующий image.file предупреждает draft и блокирует approved', () => {
  const draft = copyFixture();
  draft.reviewStatus = { kk: 'draft', ru: 'draft' };
  draft.image = { file: 'assets/definitely-missing.svg', alt: draft.title, credit: 'test', license: 'MIT', isReconstruction: true };
  const draftResult = validateStory(draft);
  assert.equal(draftResult.valid, true);
  assert.ok(draftResult.warnings.some((warning) => warning.keyword === 'asset-exists'));
  assert.ok(draftResult.warnings.some((warning) => /не найден/.test(warning.message)));

  const approved = copyFixture();
  approved.reviewStatus = { kk: 'approved', ru: 'approved' };
  approved.image = draft.image;
  const approvedResult = validateStory(approved);
  assert.equal(approvedResult.valid, false);
  assert.ok(approvedResult.errors.some((error) => error.keyword === 'asset-exists'));
});

test('манифест скрывает fixture по умолчанию и включает его только явным флагом', () => {
  assert.deepEqual(createManifest({ includeFixture: false }).stories, []);
  assert.deepEqual(createManifest({ includeFixture: true }).stories.map((story) => story.file), ['fixture_test.json']);
  const draftFiles = fs.readdirSync(path.join(process.cwd(), 'content'))
    .filter((file) => file.endsWith('.json') && !['manifest.json', 'fixture_test.json'].includes(file))
    .sort((left, right) => {
      const leftStory = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', left), 'utf8'));
      const rightStory = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'content', right), 'utf8'));
      return ({ practice: 0, diagnostic: 1 }[leftStory.kind] - { practice: 0, diagnostic: 1 }[rightStory.kind]) || leftStory.id.localeCompare(rightStory.id);
    });
  assert.deepEqual(createManifest({ includeDraft: true, includeFixture: false }).stories.map((story) => story.file), draftFiles);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.deepEqual(createManifest({ includeDraft: true, includeFixture: true }).stories, []);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('diagnostic требует t1/find, t2/infer, t3/evidence без подсказок', () => {
  const story = copyFixture();
  story.id = 'diag_entry';
  story.kind = 'diagnostic';
  story.tasks.forEach((task) => { task.hints = []; });
  assert.equal(validateStory(story).valid, true);
  story.tasks[2].skill = 'infer';
  const invalid = validateStory(story);
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.map((error) => error.message).join(' '), /ожидалось t3\/evidence/);
});

test('контентные эвристики возвращают предупреждения, а не ломают draft', () => {
  const story = copyFixture();
  story.reviewStatus = { kk: 'draft', ru: 'draft' };
  story.documents[0].segments.push(...Array.from({ length: 11 }, (_, index) => ({ id: `e${index + 4}`, text: { kk: `Фрагмент ${index + 4}`, ru: `Фрагмент ${index + 4}` }, sourceId: 'fixture-source' })));
  story.tasks[0].options[0].text.ru = 'Очень длинный правильный вариант ответа';
  story.tasks[0].options[1].text.ru = 'Одинаковый';
  story.tasks[0].options[2].text.ru = 'Одинаковый';
  story.tasks[0].hints[0].text.ru = 'Смотрите e99.';
  story.tasks[0].explanation.ru = 'Проверьте e99.';
  story.tasks[0].options[2].text.kk = '';
  const result = validateStory(story);
  assert.equal(result.valid, true);
  const messages = result.warnings.map((warning) => warning.message).join(' ');
  assert.match(messages, /сегментов/);
  assert.match(messages, /пропуск/);
  assert.match(messages, /самым длинным/);
  assert.match(messages, /неexist|несуществующ/);
  assert.match(messages, /одинаковый короткий/);
  assert.match(messages, /число непустых/);
});

test('diag_entry и diag_exit должны иметь одинаковую последовательность навыков', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saulat-diagnostics-'));
  const entry = copyFixture();
  entry.id = 'diag_entry';
  entry.kind = 'diagnostic';
  entry.tasks.forEach((task) => { task.hints = []; });
  const exit = structuredClone(entry);
  exit.id = 'diag_exit';
  exit.tasks[2].skill = 'infer';
  fs.writeFileSync(path.join(directory, 'diag_entry.json'), JSON.stringify(entry));
  fs.writeFileSync(path.join(directory, 'diag_exit.json'), JSON.stringify(exit));
  const result = validateContentDirectory(directory);
  assert.equal(result.valid, false);
  assert.match(result.errors.map((error) => error.message).join(' '), /ожидалось t3\/evidence/);
});
