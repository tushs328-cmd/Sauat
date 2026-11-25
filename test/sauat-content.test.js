import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('манифест скрывает fixture по умолчанию и включает его только явным флагом', () => {
  assert.deepEqual(createManifest({ includeFixture: false }).stories, []);
  assert.deepEqual(createManifest({ includeFixture: true }).stories.map((story) => story.file), ['fixture_test.json']);
});
