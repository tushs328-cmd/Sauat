import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync('public/js/main.js', 'utf8');
const storage = fs.readFileSync('public/js/storage.js', 'utf8');
const kk = fs.readFileSync('public/js/i18n/kk.js', 'utf8');
const ru = fs.readFileSync('public/js/i18n/ru.js', 'utf8');
const hero = fs.statSync('public/assets/hero_student.webp');

assert.match(main, /loadDraft\(\)/, 'reload regression: draft must be loaded');
assert.match(main, /saveDraft\(/, 'reload regression: draft must be saved');
assert.match(main, /addEventListener\('popstate'/, 'navigation regression: popstate guard must exist');
assert.match(main, /history\.pushState/, 'navigation regression: browser back must stay in the app');
assert.match(storage, /const DRAFT_KEY = 'saulat-draft-v1'/, 'draft storage key is missing');
assert.match(storage, /export function clearDraft/, 'draft cleanup is missing');
assert.match(kk, /skipToGame: 'Ойынға өту'/, 'KK skip-link label is not localized');
assert.match(ru, /skipToGame: 'Перейти к игре'/, 'RU skip-link label is missing');
assert.ok(hero.size <= 150 * 1024, `onboarding illustration exceeds 150 KiB: ${hero.size}`);
assert.match(main, /hero_student\.webp/, 'onboarding illustration is not wired');
assert.match(main, /data-action="toggle-theme"/, 'theme toggle action is missing');
assert.match(storage, /THEME_KEY = 'saulat-theme-v1'/, 'theme storage key is missing');
assert.match(storage, /matchMedia\?\.\('\(prefers-color-scheme: dark\)'\)/, 'system theme preference is missing');
assert.match(fs.readFileSync('public/sw.js', 'utf8'), /hero_student\.webp/, 'hero illustration is absent from the service-worker shell');
assert.match(main, /OpenAI ImageGen/, 'project attribution is missing from the project screen');
for (const russianLabel of ['Приключение картасы', 'Прогресс', 'Приключение']) {
  assert.doesNotMatch(kk, new RegExp(russianLabel), `KK still contains ${russianLabel}`);
}
console.log('UX regression PASS: draft restore, browser back guard and KK labels are wired.');
