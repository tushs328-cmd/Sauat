import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContentDirectory } from './content-validator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..');
export const contentDir = path.join(projectRoot, 'content');
export const manifestPath = path.join(contentDir, 'manifest.json');

function includeFixtureByDefault() {
  return process.env.SAULAT_INCLUDE_FIXTURE === '1' && process.env.NODE_ENV !== 'production';
}

function includeDraftByDefault() {
  return process.env.INCLUDE_DRAFT === '1' && process.env.NODE_ENV !== 'production';
}

export function createManifest({ includeFixture = includeFixtureByDefault(), includeDraft = includeDraftByDefault() } = {}) {
  const result = validateContentDirectory(contentDir);
  if (!result.valid) {
    const error = new Error('Нельзя собрать манифест: контент не прошёл validate.');
    error.diagnostics = result.errors;
    throw error;
  }
  const dev = process.env.NODE_ENV !== 'production';
  const stories = result.stories
    .filter((story) => {
      if (story.isTestFixture) return includeFixture && dev;
      const approved = story.reviewStatus.kk === 'approved' && story.reviewStatus.ru === 'approved';
      const draft = story.reviewStatus.kk === 'draft' || story.reviewStatus.ru === 'draft';
      return approved || (includeDraft && dev && draft);
    })
    .map((story) => ({
      id: story.id,
      kind: story.kind,
      file: story.file,
      assets: story.image?.file ? [story.image.file] : [],
      reviewStatus: story.reviewStatus,
      title: story.title
    }))
    .sort((left, right) => {
      const kindOrder = { practice: 0, diagnostic: 1 };
      return (kindOrder[left.kind] - kindOrder[right.kind]) || left.id.localeCompare(right.id);
    });
  const contentVersion = result.stories.reduce((version, story) => Math.max(version, story.contentVersion), 1);
  return { contentVersion, stories };
}

export function writeManifest(options = {}) {
  fs.mkdirSync(contentDir, { recursive: true });
  const manifest = createManifest(options);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export function getManifest(options = {}) {
  return createManifest(options);
}

export function getStoryForPublic(fileName, options = {}) {
  const manifest = getManifest(options);
  const entry = manifest.stories.find((story) => story.file === fileName);
  if (!entry) return null;
  const resolved = path.resolve(contentDir, entry.file);
  if (path.dirname(resolved) !== path.resolve(contentDir)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const manifest = writeManifest({ includeFixture: process.argv.includes('--include-fixture'), includeDraft: process.env.INCLUDE_DRAFT === '1' && process.env.NODE_ENV !== 'production' });
  console.log(`Манифест создан: ${manifest.stories.length} историй.`);
}
