import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const defaultSchemaPath = path.join(projectRoot, 'docs', 'sauat', 'schema.json');
const defaultContentDir = path.join(projectRoot, 'content');

const schema = JSON.parse(fs.readFileSync(defaultSchemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function diagnostic(instancePath, message, suggestion, keyword = 'contract') {
  return { instancePath, message, suggestion, keyword };
}

function displayPath(instancePath) {
  return instancePath || '/';
}

function addDuplicateErrors(errors, values, basePath, label) {
  const seen = new Map();
  values.forEach((value, index) => {
    if (typeof value !== 'string') return;
    if (seen.has(value)) {
      errors.push(diagnostic(`${basePath}/${index}/id`, `дублируется ${label} «${value}»`, `Оставьте один уникальный ${label} или переименуйте ID.`));
    } else {
      seen.set(value, index);
    }
  });
}

function checkBilingualValues(value, approvedLanguages, instancePath, errors) {
  if (!value || typeof value !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(value, 'kk') || Object.prototype.hasOwnProperty.call(value, 'ru')) {
    for (const language of approvedLanguages) {
      if (typeof value[language] === 'string' && !value[language].trim()) {
        errors.push(diagnostic(`${instancePath}/${language}`, `пустой перевод для approved-языка ${language}`, 'Заполните перевод или смените reviewStatus на draft/reviewed до проверки.'));
      }
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object') {
      checkBilingualValues(child, approvedLanguages, `${instancePath}/${key}`, errors);
    }
  }
}

function crossValidateStory(story) {
  const errors = [];
  const approvedLanguages = ['kk', 'ru'].filter((language) => story.reviewStatus?.[language] === 'approved');
  checkBilingualValues(story, approvedLanguages, '', errors);

  addDuplicateErrors(errors, story.documents.map((document) => document.id), '/documents', 'ID документа');
  addDuplicateErrors(errors, story.sources.map((source) => source.id), '/sources', 'ID источника');
  addDuplicateErrors(errors, story.tasks.map((task) => task.id), '/tasks', 'ID задания');

  const segmentIds = [];
  const sourceIds = new Set(story.sources.map((source) => source.id));
  story.documents.forEach((document, documentIndex) => {
    addDuplicateErrors(errors, document.segments.map((segment) => segment.id), `/documents/${documentIndex}/segments`, 'ID сегмента в документе');
    document.segments.forEach((segment, segmentIndex) => {
      if (segmentIds.includes(segment.id)) {
        errors.push(diagnostic(`/documents/${documentIndex}/segments/${segmentIndex}/id`, `дублируется ID сегмента «${segment.id}»`, 'ID сегмента должен быть уникальным во всей истории.'));
      }
      segmentIds.push(segment.id);
      if (segment.sourceId && !sourceIds.has(segment.sourceId)) {
        errors.push(diagnostic(`/documents/${documentIndex}/segments/${segmentIndex}/sourceId`, `источник «${segment.sourceId}» не найден`, 'Добавьте источник с таким id в sources или исправьте ссылку.'));
      }
    });
  });
  const segmentIdSet = new Set(segmentIds);

  story.tasks.forEach((task, taskIndex) => {
    addDuplicateErrors(errors, task.options.map((option) => option.id), `/tasks/${taskIndex}/options`, 'ID варианта');
    addDuplicateErrors(errors, task.hints.map((hint) => hint.id), `/tasks/${taskIndex}/hints`, 'ID подсказки');
    const optionIds = new Set(task.options.map((option) => option.id));
    for (const optionId of task.correctOptionIds) {
      if (!optionIds.has(optionId)) {
        errors.push(diagnostic(`/tasks/${taskIndex}/correctOptionIds`, `правильный вариант «${optionId}» отсутствует`, 'Используйте ID из options.'));
      }
    }
    for (const [setIndex, evidenceSet] of task.acceptedEvidenceSets.entries()) {
      for (const evidenceId of evidenceSet) {
        if (!segmentIdSet.has(evidenceId)) {
          errors.push(diagnostic(`/tasks/${taskIndex}/acceptedEvidenceSets/${setIndex}`, `сегмент доказательства «${evidenceId}» не найден`, 'Используйте существующий ID из documents[].segments[].id.'));
        }
      }
    }
    if (task.type === 'claim_check' && !task.claim) {
      errors.push(diagnostic(`/tasks/${taskIndex}/claim`, 'для claim_check отсутствует claim', 'Добавьте claim.text на двух языках и claim.isTrue.'));
    }
    if (['infer_evidence', 'claim_check'].includes(task.type) && !task.requireEvidence) {
      errors.push(diagnostic(`/tasks/${taskIndex}/requireEvidence`, `${task.type} требует requireEvidence=true`, 'Включите проверку доказательства для этого типа задания.'));
    }
    if (story.kind === 'diagnostic' && task.hints.length) {
      errors.push(diagnostic(`/tasks/${taskIndex}/hints`, 'диагностическое задание не может содержать подсказки', 'Удалите hints: диагностика считается без подсказок.'));
    }
    const levels = task.hints.map((hint) => hint.level);
    if (new Set(levels).size !== levels.length) {
      errors.push(diagnostic(`/tasks/${taskIndex}/hints`, 'уровни подсказок повторяются', 'Оставьте не более одной подсказки каждого уровня 1–3.'));
    }
  });
  return errors;
}

function warningDiagnostic(instancePath, message, suggestion) {
  return diagnostic(instancePath, message, suggestion, 'content-warning');
}

function contentWarnings(story) {
  const warnings = [];
  if (!story || !Array.isArray(story.documents) || !Array.isArray(story.tasks)) return warnings;
  const segments = story.documents.flatMap((document) => Array.isArray(document.segments) ? document.segments : []);
  if (segments.length > 12) {
    warnings.push(warningDiagnostic('/documents', `в истории ${segments.length} сегментов`, 'Сократите материал или разделите историю на более короткие документы.'));
  }
  const numbers = segments.map((segment) => /^e(\d+)$/.exec(segment.id || '')?.[1]).filter(Boolean).map(Number);
  if (numbers.length && numbers.some((number, index) => number !== index + 1)) {
    warnings.push(warningDiagnostic('/documents/segments', 'пропуск в нумерации сегментов', 'Используйте последовательные ID e1, e2, e3 без пропусков.'));
  }
  const segmentIds = new Set(segments.map((segment) => segment.id));
  const referencePattern = /(?:^|[^\p{L}\p{N}_])([eе]\d+)(?![\p{L}\p{N}_])/giu;
  for (const [taskIndex, task] of story.tasks.entries()) {
    if (!Array.isArray(task.options)) continue;
    const correctIds = new Set(task.correctOptionIds || []);
    for (const language of ['ru', 'kk']) {
      const optionTexts = task.options.map((option) => String(option.text?.[language] || '').trim());
      const translatedCount = optionTexts.filter(Boolean).length;
      if (translatedCount !== task.options.length) {
        warnings.push(warningDiagnostic(`/tasks/${taskIndex}/options`, `не совпадает число непустых options для ${language}`, 'Заполните каждый вариант на обоих языках.'));
      }
      const maxLength = Math.max(0, ...optionTexts.map((text) => text.length));
      if (maxLength > 0 && task.options.some((option, optionIndex) => correctIds.has(option.id) && optionTexts[optionIndex].length === maxLength)) {
        warnings.push(warningDiagnostic(`/tasks/${taskIndex}/correctOptionIds`, `корректный вариант является самым длинным в ${language}`, 'Проверьте, не выдаёт ли длина варианта правильный ответ.'));
      }
      const shortTexts = new Map();
      optionTexts.forEach((text, optionIndex) => {
        const normalized = text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
        if (normalized.length > 0 && normalized.length <= 80) {
          const previous = shortTexts.get(normalized);
          if (previous !== undefined) {
            warnings.push(warningDiagnostic(`/tasks/${taskIndex}/options/${optionIndex}`, `варианты ${language} имеют одинаковый короткий текст`, 'Сделайте варианты различимыми по смыслу.'));
          } else {
            shortTexts.set(normalized, optionIndex);
          }
        }
      });
    }
    const referencedTexts = [...(task.hints || []).map((hint) => hint.text), task.explanation];
    referencedTexts.forEach((bilingual, textIndex) => {
      for (const language of ['ru', 'kk']) {
        const text = String(bilingual?.[language] || '');
        for (const match of text.matchAll(referencePattern)) {
          const reference = match[1].replace(/^е/i, 'e');
          if (!segmentIds.has(reference)) {
            warnings.push(warningDiagnostic(`/tasks/${taskIndex}/${textIndex === referencedTexts.length - 1 ? 'explanation' : 'hints'}`, `ссылка на несуществующий сегмент «${reference}»`, 'Исправьте ссылку на существующий segment ID.'));
          }
        }
      }
    });
  }
  return warnings;
}

function diagnosticStoryErrors(story) {
  if (story?.kind !== 'diagnostic') return [];
  const errors = [];
  const expected = [
    { id: 't1', skill: 'find' },
    { id: 't2', skill: 'infer' },
    { id: 't3', skill: 'evidence' }
  ];
  if (!Array.isArray(story.tasks) || story.tasks.length !== expected.length) {
    errors.push(diagnostic('/tasks', 'diagnostic-история должна содержать ровно три задания', 'Используйте t1/find, t2/infer и t3/evidence.'));
    return errors;
  }
  story.tasks.forEach((task, index) => {
    if (task.id !== expected[index].id || task.skill !== expected[index].skill) {
      errors.push(diagnostic(`/tasks/${index}`, `ожидалось ${expected[index].id}/${expected[index].skill}, получено ${task.id}/${task.skill}`, 'Сохраните сопоставимый порядок навыков входной и итоговой диагностики.'));
    }
    if (task.hints.length !== 0) {
      errors.push(diagnostic(`/tasks/${index}/hints`, 'diagnostic-история не должна содержать hints', 'Удалите подсказки из диагностического задания.'));
    }
  });
  return errors;
}

function imageIssue(story) {
  if (!story?.image?.file || typeof story.image.file !== 'string') return null;
  const publicDir = path.resolve(projectRoot, 'public');
  const resolved = path.resolve(publicDir, story.image.file);
  const relative = path.relative(publicDir, resolved);
  const isOutsidePublic = relative.startsWith('..') || path.isAbsolute(relative);
  const missing = isOutsidePublic || !fs.existsSync(resolved);
  if (!missing) return null;
  const approved = story.reviewStatus?.kk === 'approved' && story.reviewStatus?.ru === 'approved';
  return {
    severity: approved ? 'error' : 'warning',
    instancePath: '/image/file',
    message: `файл изображения «${story.image.file}» ${isOutsidePublic ? 'выходит за пределы public/' : 'не найден в public/'}`,
    suggestion: approved ? 'Добавьте ассет в public/ до approved-публикации.' : 'Добавьте ассет перед переводом истории в approved.',
    keyword: 'asset-exists'
  };
}

export function validateStory(story, { source = 'story' } = {}) {
  const errors = [];
  if (!validateSchema(story)) {
    for (const error of validateSchema.errors || []) {
      errors.push(diagnostic(error.instancePath || error.schemaPath, error.message || 'не соответствует схеме', 'Сверьте структуру с docs/sauat/schema.json.', error.keyword));
    }
  }
  if (story && typeof story === 'object' && Array.isArray(story.documents) && Array.isArray(story.sources) && Array.isArray(story.tasks)) {
    errors.push(...crossValidateStory(story));
    errors.push(...diagnosticStoryErrors(story));
  }
  const warnings = contentWarnings(story);
  const imageDiagnostic = imageIssue(story);
  if (imageDiagnostic?.severity === 'error') errors.push(imageDiagnostic);
  if (imageDiagnostic?.severity === 'warning') warnings.push(imageDiagnostic);
  return { valid: errors.length === 0, source, errors, warnings };
}

export function listContentFiles(contentDir = defaultContentDir) {
  if (!fs.existsSync(contentDir)) return [];
  return fs.readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'manifest.json')
    .map((entry) => path.join(contentDir, entry.name))
    .sort();
}

export function validateContentDirectory(contentDir = defaultContentDir) {
  const errors = [];
  const warnings = [];
  const stories = [];
  const storyIds = new Map();
  for (const filePath of listContentFiles(contentDir)) {
    let story;
    try {
      story = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      errors.push(diagnostic(filePath, `не удалось прочитать JSON: ${error.message}`, 'Исправьте JSON и повторите npm run validate.', 'json'));
      continue;
    }
    const result = validateStory(story, { source: filePath });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (result.valid) {
      if (storyIds.has(story.id)) {
        errors.push(diagnostic(filePath, `дублируется ID истории «${story.id}»`, `ID уже используется в ${storyIds.get(story.id)}.`));
      } else {
        storyIds.set(story.id, filePath);
      }
      stories.push({ ...story, file: path.basename(filePath) });
    }
  }
  const entry = stories.find((story) => /^diag_entry(?:_|$)/.test(story.id) && story.kind === 'diagnostic');
  const exit = stories.find((story) => /^diag_exit(?:_|$)/.test(story.id) && story.kind === 'diagnostic');
  if (entry && exit) {
    const entrySkills = entry.tasks.map((task) => task.skill).join(',');
    const exitSkills = exit.tasks.map((task) => task.skill).join(',');
    if (entrySkills !== exitSkills) {
      errors.push(diagnostic('/tasks', `diag_entry и diag_exit несопоставимы по навыкам: ${entrySkills} против ${exitSkills}`, 'Сделайте одинаковую последовательность find, infer, evidence.'));
    }
  }
  return { valid: errors.length === 0, errors, warnings, stories };
}

export function formatDiagnostics(result) {
  const lines = [];
  if (result.valid) lines.push('Контент валиден.');
  for (const warning of result.warnings || []) lines.push(`WARNING ${warning.source || ''}${displayPath(warning.instancePath)}: ${warning.message}. Подсказка: ${warning.suggestion}`);
  for (const error of result.errors || []) lines.push(`ERROR ${error.source || ''}${displayPath(error.instancePath)}: ${error.message}. Подсказка: ${error.suggestion}`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = validateContentDirectory(process.argv.includes('--content-dir') ? process.argv[process.indexOf('--content-dir') + 1] : defaultContentDir);
  console.log(formatDiagnostics(result));
  process.exitCode = result.valid ? 0 : 1;
}
