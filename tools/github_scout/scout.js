import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_QUERIES = path.join(HERE, 'queries.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'docs', 'scout');
const DOCS_DIR = path.join(PROJECT_ROOT, 'docs');
const CACHE_FILE = path.join(OUTPUT_DIR, '.github-cache.json');
const API_ROOT = 'https://api.github.com';

const ALLOWED_CODE_LICENSES = new Map([
  ['MIT', 'MIT'],
  ['Apache-2.0', 'Apache-2.0'],
  ['BSD-2-Clause', 'BSD-2-Clause'],
  ['BSD-3-Clause', 'BSD-3-Clause'],
  ['ISC', 'ISC'],
  ['MPL-2.0', 'MPL-2.0']
]);

const ALLOWED_DATASET_LICENSES = new Map([
  ...ALLOWED_CODE_LICENSES,
  ['CC-BY-4.0', 'CC-BY-4.0'],
  ['CC0-1.0', 'CC0-1.0']
]);

const STALE_MONTHS = 18;
const CORE_GAP_MS = 800;
const SEARCH_GAP_MS = 2600;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cliOptions(argv) {
  const options = { queries: DEFAULT_QUERIES, perQuery: null, maxRepos: null, noCache: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-cache') options.noCache = true;
    else if (arg === '--queries') options.queries = path.resolve(argv[++i]);
    else if (arg === '--per-query') options.perQuery = Number(argv[++i]);
    else if (arg === '--max-repos') options.maxRepos = Number(argv[++i]);
    else throw new Error(`Неизвестный аргумент: ${arg}`);
  }
  return options;
}

function resolveToken() {
  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN.trim(), source: 'GITHUB_TOKEN (значение не сохраняется)' };
  }
  try {
    const ghToken = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (ghToken) return { token: ghToken, source: 'gh auth token (значение не сохраняется)' };
  } catch {
    // gh не установлен или не авторизован — работаем анонимно
  }
  return { token: '', source: 'anonymous REST API' };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeCacheSafe(file, value) {
  const tmp = `${file}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(value), 'utf8');
    await fs.rename(tmp, file);
  } catch {
    // Не прерываем основной прогон из-за временной блокировки файла кэша на Windows
  }
}

function freshCacheEntry(entry) {
  return entry && entry.fetched_at && (Date.now() - Date.parse(entry.fetched_at) < 24 * 60 * 60 * 1000);
}

function encodePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

function normalizeLicense(license) {
  const raw = license?.spdx_id && license.spdx_id !== 'NOASSERTION' ? license.spdx_id : null;
  if (raw) return raw;
  const key = license?.key || license?.name || null;
  if (!key || key === 'other' || key === 'NOASSERTION') return null;
  return key;
}

function licenseAssessment(spdx, isDatasetOnly) {
  if (!spdx) {
    return { allowed: false, category: 'no-license', score: 0, badge: '⛔ Без лицензии', note: 'Лицензия не определена через SPDX — брать код/данные запрещено.' };
  }
  const table = isDatasetOnly ? ALLOWED_DATASET_LICENSES : ALLOWED_CODE_LICENSES;
  if (table.has(spdx)) {
    const note = spdx === 'MPL-2.0'
      ? 'MPL-2.0 (weak copyleft): разрешено с сохранением лицензии и раскрытием изменений модифицированных файлов.'
      : isDatasetOnly && (spdx === 'CC-BY-4.0' || spdx === 'CC0-1.0')
        ? `${spdx}: разрешённая открытая лицензия для датасета (проверить атрибуцию в README).`
        : 'Разрешённая пермиссивная лицензия.';
    return {
      allowed: true,
      category: spdx === 'MPL-2.0' ? 'weak-copyleft' : 'permissive',
      score: spdx === 'MPL-2.0' ? 12 : 15,
      badge: spdx === 'MPL-2.0' ? `⚠️ ${spdx}` : `✅ ${spdx}`,
      note
    };
  }
  if (/^(AGPL|GPL|LGPL)/i.test(spdx)) {
    return { allowed: false, category: 'copyleft', score: 0, badge: `🔴 ${spdx}`, note: '🔴 GPL/AGPL/LGPL: код в проект НЕ брать, изучать только идеи.' };
  }
  if (/^CC-BY-SA/i.test(spdx)) {
    return { allowed: false, category: 'share-alike', score: 0, badge: `🔴 ${spdx}`, note: 'ShareAlike: не брать в банк без отдельной юридической проверки.' };
  }
  return { allowed: false, category: 'restricted-or-unknown', score: 0, badge: `⚠️ ${spdx}`, note: 'Не входит в разрешённый список лицензий.' };
}

function dateAgeDays(value, now = new Date()) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now - new Date(value)) / 86400000));
}

function isStableSmallLibrary(repo, lastCommit) {
  return Boolean(lastCommit && (repo.size || 0) <= 2500 && (repo.stargazers_count || 0) >= 500 && repo.archived === false);
}

function suspiciousSignals(readme, paths, pkgJson) {
  const signals = [];
  const text = readme || '';
  const names = paths.join('\n');
  if (/(curl|wget)\s+[^\n|]+\|\s*(sh|bash)|powershell\s+-enc|invoke-webrequest\s+[^\n|]+\|/i.test(text)) {
    signals.push('README содержит удалённый pipe в shell/PowerShell');
  }
  if (/(eval\s*\(\s*(atob|base64)|base64\s*-d[^\n]+\|\s*(sh|bash)|fromcharcode\s*\()/i.test(text)) {
    signals.push('README содержит обфускацию или скрытый загрузчик');
  }
  if (/(^|\/)(obfuscat|payload|dropper|loader)[^\/]*\.(js|mjs|ts|py|ps1|sh)$/im.test(names)) {
    signals.push('дерево файлов содержит подозрительный loader/payload-файл');
  }
  if (/(^|\/)(install|bootstrap|postinstall|preinstall)[^\/]*\.(ps1|bat|cmd|sh)$/im.test(names) && /\.(min\.js|packed\.js)$/im.test(names)) {
    signals.push('установочный скрипт рядом с упакованным кодом');
  }
  if (pkgJson?.scripts) {
    for (const hook of ['preinstall', 'install', 'postinstall']) {
      const cmd = String(pkgJson.scripts[hook] || '');
      if (/(curl|wget|powershell|bash\s+-c|eval|http:\/\/|https:\/\/)/i.test(cmd)) {
        signals.push(`package.json script.${hook} содержит сетевую/shell-команду`);
      }
    }
  }
  return [...new Set(signals)];
}

function hasTestFiles(paths) {
  return paths.some((entry) =>
    /(^|\/)(__tests__|tests?|spec|fixtures)(\/|\.|$)/i.test(entry)
    || /(^|\/)(test|spec)[^/]*\.(js|mjs|ts|py|go|java|rb)$/i.test(entry)
    || /\.(test|spec)\.(js|mjs|ts|py)$/i.test(entry)
  );
}

function hasDockerfile(paths) {
  return paths.some((entry) => /(^|\/)(Dockerfile(?:\.|$)|docker-compose\.ya?ml$)/i.test(entry));
}

function scoreRelevance(repo, categories) {
  const corpus = `${repo.name} ${repo.description || ''} ${(repo.topics || []).join(' ')} ${categories.join(' ')}`.toLowerCase();
  const words = [
    'offline', 'lan', 'quiz', 'kahoot', 'classroom', 'education', 'literacy', 'reading',
    'pisa', 'assessment', 'adaptive', 'spaced', 'leitner', 'fsrs', 'ollama', 'rag',
    'citation', 'pwa', 'workbox', 'qr', 'mdns', 'bonjour', 'sqlite', 'rbac',
    'kazakh', 'qazaq', 'қазақ', 'lemmat', 'stemm', 'dataset', 'tts', 'speech', 'question'
  ];
  const hits = words.filter((word) => corpus.includes(word)).length;
  return Math.min(30, 8 + hits * 2);
}

function relevanceGate(repo, categories, readme) {
  const content = `${repo.name} ${repo.description || ''} ${(repo.topics || []).join(' ')} ${String(readme || '').slice(0, 3000)}`.toLowerCase();
  const evidence = [
    ['offline_lan_quiz', /offline|lan|local network|classroom quiz|kahoot|websocket|sse/],
    ['kahoot_like', /quiz|kahoot|classroom|poll|websocket|socket\.io/],
    ['reading_literacy', /reading|literacy|comprehension|reading trainer/],
    ['pisa_assessment', /pisa|assessment|adaptive testing|educational assessment/],
    ['adaptive_learning', /adaptive learning|spaced repetition|leitner|fsrs/],
    ['ollama_education', /ollama|local llm|tutor|education|learning/],
    ['rag_citations', /rag|retrieval augmented|citation|quoted source|paper qa/],
    ['pwa_offline_first', /pwa|offline-first|service worker|workbox/],
    ['qr_node', /\bqr\b|qrcode|qr code/],
    ['mdns_node', /mdns|bonjour|zeroconf|multicast-dns/],
    ['qr_mdns_node', /qr code|qrcode|mdns|bonjour|multicast-dns/],
    ['express_sqlite_roles', /sqlite|better-sqlite3|express/],
    ['question_generation', /question generation|generate questions|quiz|assessment/],
    ['kazakh_qa_dataset', /kazakh|qazaq|қазақ|казах|is2ai|issai/],
    ['kazakh_text_dataset', /kazakh|qazaq|қазақ|казах|is2ai|issai/],
    ['kazakh_lemmatization', /kazakh|qazaq|қазақ|казах/],
    ['kazakh_speech', /kazakh|qazaq|қазақ|казах|kazemo/]
  ];
  const applicable = evidence.filter(([id]) => categories.includes(id));
  return applicable.length === 0 || applicable.some(([, pattern]) => pattern.test(content));
}

function scoreOffline(repo, categories) {
  const corpus = `${repo.name} ${repo.description || ''} ${(repo.topics || []).join(' ')} ${categories.join(' ')}`.toLowerCase();
  let score = 3;
  if (/offline|local-first|air-gapped|self-hosted|local\b/.test(corpus)) score += 7;
  if (/lan|local network|wifi|hotspot|no internet|websocket|sse|mdns|bonjour|qr/.test(corpus)) score += 5;
  if (/pwa|service worker|workbox|sqlite|ollama|vosk|piper/.test(corpus)) score += 5;
  return Math.min(20, score);
}

function scoreIntegration(repo, flags, pkgJson) {
  let score = 2;
  if (/JavaScript|TypeScript|HTML|CSS/i.test(repo.language || '')) score += 5;
  else if (/Python/i.test(repo.language || '')) score += 3;
  if ((repo.size || 0) <= 20000) score += 3;
  if (flags.hasTests) score += 3;
  if (flags.hasDockerfile || pkgJson) score += 2;
  return Math.min(15, score);
}

function scoreQuality(repo, flags, lastCommit, now) {
  let score = Math.min(9, Math.round(Math.log10(Math.max(1, repo.stargazers_count || 0) + 1) * 2.2));
  if (flags.hasTests) score += 4;
  if (flags.hasDockerfile) score += 2;
  const age = dateAgeDays(lastCommit, now);
  if (age <= 180) score += 5;
  else if (age <= 365) score += 4;
  else if (age <= 548) score += 2;
  else if (isStableSmallLibrary(repo, lastCommit)) score += 3;
  return Math.min(20, score);
}

function useCaseFor(categories, repo, pkgJson) {
  const cat = categories.join(' ');
  const corpus = `${cat} ${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase();
  const isLib = Boolean(pkgJson?.name && !pkgJson.private && (pkgJson.main || pkgJson.exports || pkgJson.module) && !pkgJson.scripts?.start);
  const npmName = isLib ? pkgJson.name : null;

  if (/awesome-kaz-datasets/.test(corpus)) {
    return {
      use: 'Каталог открытых казахских датасетов: использовать как индекс источников, а не как готовый набор для копирования.',
      method: 'сверить первичный источник, лицензию и возрастную пригодность каждого отдельного датасета',
      chat: 'Чат A (бэкенд)',
      risk: 'Лицензия каталога не заменяет лицензию каждого корпуса; данные могут быть gated, share-alike или происходить из веб-источников.'
    };
  }
  if (/kaznerd|kazakh_tts|saida_kazakh_asr|kazakh-dictionary/.test(corpus)) {
    return {
      use: 'Открытый казахский корпус/словарь/аудиоданные для проверки лемматизатора, TTS/ASR и языкового тестирования.',
      method: 'выборочная проверка датасета (данные не переносить в банк без проверки README)',
      chat: 'Чат A (бэкенд)',
      risk: 'Проверить условия атрибуции (CC-BY-4.0 / CC0-1.0), источник текстов и соответствие школьной программе.'
    };
  }
  if (/qr_node|qr_mdns_node|mdns_node/.test(cat) || /\b(qrcode|bonjour|mdns|multicast-dns)\b/.test(corpus)) {
    return {
      use: 'LAN-вход по QR-коду (SVG без сети) и/или локальное обнаружение адреса учителя в Wi-Fi сети.',
      method: npmName ? `npm-пакет \`${npmName}\` (проверить транзитивные зависимости)` : 'копирование/адаптация логики локального QR/mDNS',
      chat: 'Чат A (бэкенд)',
      risk: 'mDNS работает не на всех школьных телефонах/роутерах — обязательно показывать прямой IP и SVG QR-код.'
    };
  }
  if (/express_sqlite_roles/.test(cat) || /\b(sqlite|rbac|better-sqlite3)\b/.test(corpus)) {
    return {
      use: 'Шаблон ролей (ученик/учитель/админ) и быстрое локальное хранение сессий/ответов в SQLite.',
      method: npmName ? `npm-пакет \`${npmName}\` или копирование middleware ролей` : 'копирование/адаптация схемы ролей и middleware',
      chat: 'Чат A (бэкенд)',
      risk: 'Проверить сборку нативного SQLite под Docker/Windows; не хранить лишние ФИО учеников.'
    };
  }
  if (/offline_lan_quiz|kahoot_like/.test(cat) || /kahoot|lan quiz|classroom quiz|live quiz/.test(corpus)) {
    return {
      use: 'Механика «живой комнаты» учителя: вход по коду класса, таймер раунда, WebSocket/SSE-синхронизация и итоги.',
      method: npmName ? `npm-пакет \`${npmName}\` или перенос архитектуры комнаты` : 'перенос архитектуры комнат/событий (без чужого UI)',
      chat: 'Чат A (бэкенд) + Чат B (интерфейс)',
      risk: 'Обязательно скрыть имена на проекторе, ограничить попытки кода класса и проверить нагрузку 30 клиентов.'
    };
  }
  if (/pwa_offline_first/.test(cat) || /pwa|workbox|service-worker|offline-first/.test(corpus)) {
    return {
      use: 'Шаблон PWA offline-first кэширования (app shell + очередь ответов + честный статус «Нет сети / Переподключение»).',
      method: npmName ? `npm-пакет \`${npmName}\` или копирование логики Service Worker` : 'копирование/адаптация шаблона Service Worker в `public/sw.js`',
      chat: 'Чат B (интерфейс)',
      risk: 'Убедиться, что кэш не ломает живые API `/api/lan/*` и не тянет внешние CDN.'
    };
  }
  if (/adaptive_learning/.test(cat) || /fsrs|leitner|spaced repetition/.test(corpus)) {
    return {
      use: 'Алгоритм интервального повторения (FSRS/Leitner) для повторения слабых навыков чтения и математики.',
      method: npmName ? `npm-пакет \`${npmName}\`` : 'копирование чистой функции расчёта интервалов (с атрибуцией)',
      chat: 'Чат A (бэкенд)',
      risk: 'Не смешивать с чужими карточками; адаптировать интервалы под школьные уроки, а не месячные циклы.'
    };
  }
  if (/ollama_education|rag_citations/.test(cat) || /ollama|rag|citation/.test(corpus)) {
    return {
      use: 'Локальный ИИ-наставник через Ollama и привязка ответа к точной цитате источника в тексте.',
      method: 'копирование паттерна промптов/цитирования (ориентир архитектуры)',
      chat: 'Чат A (бэкенд)',
      risk: 'Слабый ноутбук может не тянуть крупные модели; обязателен честный режим «Без ИИ» и проверка по тексту.'
    };
  }
  if (/reading_literacy|pisa_assessment|question_generation/.test(cat)) {
    return {
      use: 'Структура заданий функциональной грамотности, шкалы оценки и пайплайн черновой генерации вопросов по тексту.',
      method: 'только идея/формат модели оценивания (свои задания пишем сами)',
      chat: 'Чат A (бэкенд)',
      risk: 'Категорически не копировать чужие тексты и задания PISA; проверять сгенерированные вопросы правилами.'
    };
  }
  if (/kazakh_lemmatization/.test(cat) || /lemmat|stemm|morph/.test(corpus)) {
    return {
      use: 'Казахская лемматизация/стемминг для честной проверки свободных ответов учеников на казахском языке.',
      method: 'копирование словарных/морфологических правил или отдельный локальный скрипт',
      chat: 'Чат A (бэкенд)',
      risk: 'Проверить лицензию словаря и точность на школьной лексике; при сомнении выводить «не могу подтвердить по тексту».'
    };
  }
  if (/kazakh_speech/.test(cat) || /tts|speech|piper|vosk/.test(corpus)) {
    return {
      use: 'Офлайн-озвучка казахских текстов (альтернатива неполной браузерной SpeechSynthesis в сельских классах).',
      method: 'опциональный локальный модуль/контейнер или идея для этапа 2',
      chat: 'Чат A (бэкенд) + Чат B (интерфейс)',
      risk: 'Вес голосовых моделей и нагрузка на слабый ноутбук; в MVP оставить фолбэк на браузерный голос.'
    };
  }
  if (/kazakh_/.test(cat)) {
    return {
      use: 'Открытый корпус/QA-набор казахского языка для тестирования лемматизатора, оценки ИИ-подсказок и чтения.',
      method: 'выборочная проверка датасета (без слепого импорта в банк)',
      chat: 'Чат A (бэкенд)',
      risk: 'Проверить лицензию самих текстов в README, доменное соответствие 7–9 классам и качество орфографии.'
    };
  }
  return {
    use: 'Изучить архитектурную идею; код не включать без отдельного ревью.',
    method: 'идея/архитектура',
    chat: 'Чаты A/B по результату ревью',
    risk: 'Требуется ручная проверка API, зависимостей и лицензии.'
  };
}

function pickBalancedCandidates(queryBuckets, maxRepos) {
  const chosen = new Map();
  const order = [...queryBuckets.keys()];
  const cursors = new Map(order.map((id) => [id, 0]));
  let added = true;
  while (chosen.size < maxRepos && added) {
    added = false;
    for (const qId of order) {
      if (chosen.size >= maxRepos) break;
      const list = queryBuckets.get(qId) || [];
      let idx = cursors.get(qId) || 0;
      while (idx < list.length) {
        const candidate = list[idx];
        idx += 1;
        if (!chosen.has(candidate.full_name)) {
          chosen.set(candidate.full_name, candidate);
          added = true;
          break;
        }
      }
      cursors.set(qId, idx);
    }
  }
  return [...chosen.values()];
}

function selectDiverseTop15(eligibleProjects) {
  const picked = [];
  const seen = new Set();
  const priorityBuckets = [
    'offline_lan_quiz', 'kahoot_like', 'qr_node', 'mdns_node', 'qr_mdns_node', 'pwa_offline_first',
    'adaptive_learning', 'ollama_education', 'rag_citations', 'express_sqlite_roles',
    'reading_literacy', 'pisa_assessment', 'question_generation', 'kazakh_lemmatization', 'kazakh_speech'
  ];

  for (const cat of priorityBuckets) {
    const match = eligibleProjects.find((item) => !seen.has(item.name) && item.categories.includes(cat));
    if (match && picked.length < 15) {
      picked.push(match);
      seen.add(match.name);
    }
  }
  for (const item of eligibleProjects) {
    if (picked.length >= 15) break;
    if (!seen.has(item.name)) {
      picked.push(item);
      seen.add(item.name);
    }
  }
  return picked.sort((a, b) => b.score - a.score || b.stars - a.stars);
}

async function main() {
  const options = cliOptions(process.argv);
  const queryConfig = await readJson(options.queries, null);
  if (!queryConfig?.queries?.length) throw new Error('queries.json не содержит queries');

  const perQuery = Math.max(1, options.perQuery || queryConfig.per_query || 5);
  const maxRepos = Math.max(1, options.maxRepos || queryConfig.max_repositories || 40);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const cache = options.noCache ? {} : await readJson(CACHE_FILE, {});
  const { token, source: authMode } = resolveToken();
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'saulat-github-scout/2.0'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let lastSearchAt = 0;
  let lastCoreAt = 0;
  let apiCalls = 0;
  let coreRemaining = token ? 5000 : 60;
  let serverNow = new Date();

  async function apiGet(url, kind = 'core', accept = headers.Accept) {
    const cached = cache[url];
    if (!options.noCache && freshCacheEntry(cached)) return cached.value;

    const minGap = kind === 'search' ? SEARCH_GAP_MS : CORE_GAP_MS;
    const lastAt = kind === 'search' ? lastSearchAt : lastCoreAt;
    const wait = minGap - (Date.now() - lastAt);
    if (wait > 0) await sleep(wait);

    const requestOnce = async () => {
      if (kind === 'search') lastSearchAt = Date.now();
      else lastCoreAt = Date.now();
      apiCalls += 1;
      return fetch(url, { headers: { ...headers, Accept: accept } });
    };

    let response = await requestOnce();
    const dateHdr = response.headers.get('date');
    if (dateHdr && !Number.isNaN(Date.parse(dateHdr))) serverNow = new Date(dateHdr);

    const remHdr = response.headers.get('x-ratelimit-remaining');
    const resetHdr = response.headers.get('x-ratelimit-reset');
    if (kind === 'core' && remHdr !== null) coreRemaining = Number(remHdr);

    if ((response.status === 403 || response.status === 429) && resetHdr) {
      const waitMs = Math.max(1000, Number(resetHdr) * 1000 - Date.now() + 1500);
      if (waitMs <= 75000) {
        console.log(`Пауза до сброса rate limit (${Math.ceil(waitMs / 1000)}с) для ${kind}...`);
        await sleep(waitMs);
        response = await requestOnce();
        const rem2 = response.headers.get('x-ratelimit-remaining');
        if (kind === 'core' && rem2 !== null) coreRemaining = Number(rem2);
      }
    }

    if (!response.ok) {
      const rem = response.headers.get('x-ratelimit-remaining') ?? 'unknown';
      const reset = response.headers.get('x-ratelimit-reset') ?? 'unknown';
      throw new Error(`GitHub API ${response.status} для ${url} (remaining=${rem}, reset=${reset})`);
    }

    const value = accept.includes('raw') ? await response.text() : await response.json();
    if (url.includes('/git/trees/') && value?.tree) {
      const slim = { sha: value.sha, tree: value.tree.slice(0, 2000).map((t) => ({ path: t.path })) };
      cache[url] = { fetched_at: new Date().toISOString(), value: slim };
      return slim;
    }
    cache[url] = { fetched_at: new Date().toISOString(), value };
    return value;
  }

  async function fetchWebRepoTree(fullName) {
    const cacheKey = `webtree:${fullName}`;
    const cached = cache[cacheKey];
    if (!options.noCache && freshCacheEntry(cached)) return cached.value;
    await sleep(350);
    try {
      const res = await fetch(`https://github.com/${fullName}`, {
        headers: {
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'saulat-github-scout/2.0'
        }
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('json')) return null;
      const json = await res.json();
      const treeItems = json?.payload?.codeViewRepoRoute?.tree?.items || [];
      const oid = json?.payload?.codeViewRepoRoute?.refInfo?.currentOid || null;
      const slim = {
        paths: treeItems.map((item) => item.path || item.name).filter(Boolean),
        oid: oid ? String(oid).slice(0, 7) : null
      };
      cache[cacheKey] = { fetched_at: new Date().toISOString(), value: slim };
      return slim;
    } catch {
      return null;
    }
  }

  async function fetchRawText(url) {
    const cached = cache[url];
    if (!options.noCache && freshCacheEntry(cached)) return cached.value;
    await sleep(200);
    const res = await fetch(url, { headers: { 'User-Agent': 'saulat-github-scout/2.0' } });
    if (!res.ok) return null;
    const value = await res.text();
    cache[url] = { fetched_at: new Date().toISOString(), value };
    return value;
  }

  if (!token) {
    try {
      const rl = await apiGet(`${API_ROOT}/rate_limit`, 'core');
      coreRemaining = rl?.resources?.core?.remaining ?? coreRemaining;
    } catch {
      // Игнорируем сбой предварительной проверки
    }
  }

  const repoMap = new Map();
  const queryBuckets = new Map();
  const seedQueries = queryConfig.seed_repositories || [];
  const queryMeta = new Map([...queryConfig.queries, ...seedQueries].map((q) => [q.id, q]));

  for (const query of queryConfig.queries) {
    const url = `${API_ROOT}/search/repositories?q=${encodeURIComponent(query.query)}&sort=stars&order=desc&per_page=${perQuery}`;
    let result;
    try {
      result = await apiGet(url, 'search');
    } catch (error) {
      console.warn(`Пропущен запрос ${query.id}: ${error.message}`);
      continue;
    }
    const bucket = [];
    for (const repo of result.items || []) {
      if (!repo.full_name || repo.private) continue;
      const existing = repoMap.get(repo.full_name) || { repo, categories: [] };
      existing.repo = repo;
      existing.categories = [...new Set([...existing.categories, query.id])];
      repoMap.set(repo.full_name, existing);
      bucket.push(repo);
    }
    queryBuckets.set(query.id, bucket);
  }
  for (const seed of seedQueries) {
    const url = `${API_ROOT}/repos/${encodePath(seed.repo)}`;
    try {
      const repo = await apiGet(url, 'core');
      if (!repo?.full_name || repo.private) continue;
      const existing = repoMap.get(repo.full_name) || { repo, categories: [] };
      existing.repo = repo;
      existing.categories = [...new Set([...existing.categories, seed.id])];
      repoMap.set(repo.full_name, existing);
      queryBuckets.set(seed.id, [repo]);
    } catch (error) {
      console.warn(`Пропущен seed ${seed.id}: ${error.message}`);
    }
  }
  await writeCacheSafe(CACHE_FILE, cache);

  const selectedRepos = pickBalancedCandidates(queryBuckets, maxRepos);
  const records = [];

  for (const rawRepo of selectedRepos) {
    const entry = repoMap.get(rawRepo.full_name);
    const repo = entry.repo;
    const branch = repo.default_branch || 'main';
    const base = `${API_ROOT}/repos/${encodePath(repo.full_name)}`;
    let paths = [];
    let lastCommit = repo.pushed_at || null;
    let headSha = null;
    let metadataSource = 'search+raw';

    if (coreRemaining > 6) {
      try {
        const tree = await apiGet(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, 'core');
        paths = (tree.tree || []).map((item) => item.path).filter(Boolean);
        headSha = tree.sha ? String(tree.sha).slice(0, 7) : null;
        metadataSource = 'rest-tree+raw';
      } catch {
        // Фолбэк ниже
      }
    }

    if (!paths.length) {
      const webTree = await fetchWebRepoTree(repo.full_name);
      if (webTree?.paths?.length) {
        paths = webTree.paths;
        if (webTree.oid) headSha = webTree.oid;
        metadataSource = 'search+webtree+raw';
      }
    }

    if (coreRemaining > 18) {
      try {
        const commits = await apiGet(`${base}/commits?per_page=1`, 'core');
        lastCommit = commits[0]?.commit?.author?.date || commits[0]?.commit?.committer?.date || lastCommit;
        if (commits[0]?.sha) headSha = String(commits[0].sha).slice(0, 7);
      } catch {
        // Оставляем pushed_at как дату последней активности
      }
    }

    const readmeCandidates = paths.filter((p) => /^readme(\.(md|rst|txt))?$/i.test(p));
    if (!readmeCandidates.length) readmeCandidates.push('README.md', 'readme.md', 'README.rst');
    let readme = '';
    for (const candidate of readmeCandidates.slice(0, 3)) {
      const rawText = await fetchRawText(`https://raw.githubusercontent.com/${repo.full_name}/${encodeURIComponent(branch)}/${candidate}`);
      if (rawText) {
        readme = rawText;
        break;
      }
    }
    if (!readme && coreRemaining > 6) {
      try {
        readme = await apiGet(`${base}/readme`, 'core', 'application/vnd.github.raw+json');
      } catch {
        // README отсутствует
      }
    }

    let pkgJson = null;
    if (paths.includes('package.json') || /JavaScript|TypeScript/i.test(repo.language || '')) {
      const rawPkg = await fetchRawText(`https://raw.githubusercontent.com/${repo.full_name}/${encodeURIComponent(branch)}/package.json`);
      if (rawPkg) {
        try {
          pkgJson = JSON.parse(rawPkg);
        } catch {
          pkgJson = null;
        }
      }
    }

    const isKazakhDataResource = entry.categories.some((id) => id.startsWith('kazakh_'))
      && /dataset|corpus|corpora|tts|asr|dictionary|kaznerd|kazemo/i.test(`${repo.full_name} ${repo.description || ''}`);
    const isDatasetOnly = entry.categories.every((id) => queryMeta.get(id)?.kind === 'dataset') || isKazakhDataResource;
    const license = normalizeLicense(repo.license);
    const licenseInfo = licenseAssessment(license, isDatasetOnly);
    const signals = suspiciousSignals(readme, paths, pkgJson);
    const flags = { hasTests: hasTestFiles(paths), hasDockerfile: hasDockerfile(paths) };
    const stale = dateAgeDays(lastCommit, serverNow) > STALE_MONTHS * 30.5;
    const stableSmallLibrary = isStableSmallLibrary(repo, lastCommit);
    const relevant = relevanceGate(repo, entry.categories, readme);
    const eligible = !repo.archived && !signals.length && relevant && licenseInfo.allowed && (!stale || stableSmallLibrary);
    const useCase = useCaseFor(entry.categories, repo, pkgJson);

    const scores = {
      relevance: scoreRelevance(repo, entry.categories),
      offline: scoreOffline(repo, entry.categories),
      integration: scoreIntegration(repo, flags, pkgJson),
      quality: scoreQuality(repo, flags, lastCommit, serverNow),
      license: licenseInfo.score
    };
    const totalScore = Object.values(scores).reduce((sum, v) => sum + v, 0);
    const versionOrCommit = pkgJson?.version
      ? `v${pkgJson.version}${headSha ? ` (${headSha})` : ''}`
      : headSha
        ? `${branch}@${headSha}`
        : `${branch} (${String(lastCommit || '').slice(0, 10) || 'unknown'})`;

    records.push({
      name: repo.full_name,
      url: repo.html_url,
      api_url: repo.url,
      description: String(repo.description || '').slice(0, 2000),
      language: repo.language || null,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      size_kb: repo.size || 0,
      last_commit: lastCommit,
      pushed_at: repo.pushed_at || null,
      version_or_commit: versionOrCommit,
      npm_package: pkgJson?.name && !pkgJson.private ? pkgJson.name : null,
      license_spdx: license,
      license_badge: licenseInfo.badge,
      license_category: licenseInfo.category,
      license_note: licenseInfo.note,
      topics: repo.topics || [],
      categories: entry.categories,
      is_dataset: entry.categories.some((id) => queryMeta.get(id)?.kind === 'dataset'),
      readme_first_500: String(readme).slice(0, 500),
      has_tests: flags.hasTests,
      has_dockerfile: flags.hasDockerfile,
      tree_file_count: paths.length,
      metadata_source: metadataSource,
      suspicious_signals: signals,
      relevance_gate: relevant,
      archived: Boolean(repo.archived),
      stale,
      stable_small_library: stableSmallLibrary,
      eligible,
      excluded_reason: eligible
        ? null
        : repo.archived
          ? 'архивный репозиторий'
          : signals.length
            ? signals.join('; ')
            : !relevant
              ? 'поисковое совпадение не подтверждено README/описанием проекта'
            : !licenseInfo.allowed
              ? licenseInfo.note
              : 'нет коммитов за 18 месяцев и не является стабильной малой библиотекой',
      score: totalScore,
      score_breakdown: scores,
      recommended_use: useCase.use,
      integration_method: useCase.method,
      suggested_chat: useCase.chat,
      integration_risk: useCase.risk,
      safety_scope: 'Только публичные метаданные, README, package.json (как текст) и дерево файлов; код не клонировался и не запускался.'
    });
  }

  records.sort((a, b) => b.score - a.score || b.stars - a.stars);
  const eligible = records.filter((item) => item.eligible);
  const eligibleProjects = eligible.filter((item) =>
    !(/awesome-kaz-datasets|kaznerd|kazakh_tts|saida_kazakh_asr|kazakh-dictionary/i.test(item.name))
    && (!item.is_dataset || item.categories.some((id) => queryMeta.get(id)?.kind !== 'dataset'))
  );
  const recommended = selectDiverseTop15(eligibleProjects.length >= 15 ? eligibleProjects : eligible);

  const kazakhDatasetCandidates = records.filter((item) =>
    item.is_dataset && item.categories.some((id) => queryMeta.get(id)?.kind === 'dataset')
  );
  const uniqueKazakh = kazakhDatasetCandidates.filter((item, idx, arr) => arr.findIndex((x) => x.name === item.name) === idx);
  const datasets = uniqueKazakh.slice(0, 5);
  const flaggedOrExcluded = records.filter((item) => !item.eligible);

  const generatedAt = serverNow.toISOString();
  const output = {
    schema_version: 2,
    generated_at: generatedAt,
    cutoff_date: new Date(serverNow.getTime() - STALE_MONTHS * 30.5 * 86400000).toISOString(),
    auth_mode: authMode,
    api_calls_this_run: apiCalls,
    query_file: path.relative(PROJECT_ROOT, options.queries).replaceAll('\\', '/'),
    safety: { cloned: false, executed_foreign_code: false, token_saved: false },
    counts: {
      discovered_unique: repoMap.size,
      inspected: records.length,
      eligible: eligible.length,
      recommended: recommended.length,
      kazakh_datasets: datasets.length,
      kazakh_datasets_eligible: datasets.filter((item) => item.eligible).length,
      excluded: flaggedOrExcluded.length
    },
    items: records
  };

  await writeCacheSafe(CACHE_FILE, cache);
  await writeJson(path.join(OUTPUT_DIR, 'results.json'), output);
  await fs.writeFile(path.join(OUTPUT_DIR, 'results.csv'), csv(records), 'utf8');
  await fs.writeFile(path.join(DOCS_DIR, 'GITHUB_SCOUT.md'), report(output, recommended, datasets, flaggedOrExcluded), 'utf8');
  await fs.writeFile(path.join(DOCS_DIR, 'THIRD_PARTY.md'), thirdParty(recommended, datasets), 'utf8');
  await fs.writeFile(path.join(OUTPUT_DIR, 'SCOUT_DONE.md'), doneReport(output, options, queryConfig), 'utf8');

  console.log(`GitHub Scout: discovered=${repoMap.size}, inspected=${records.length}, eligible=${eligible.length}, top15=${recommended.length}, kazakh_datasets=${datasets.length}, api_calls=${apiCalls}`);
  console.log('Файлы: docs/scout/results.json, docs/scout/results.csv, docs/GITHUB_SCOUT.md, docs/THIRD_PARTY.md, docs/scout/SCOUT_DONE.md');
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""').replaceAll('\r', ' ').replaceAll('\n', ' ')}"`;
}

function csv(records) {
  const columns = [
    'name', 'url', 'description', 'language', 'stars', 'forks', 'size_kb',
    'last_commit', 'license_spdx', 'topics', 'has_tests', 'has_dockerfile',
    'eligible', 'excluded_reason', 'score', 'score_breakdown', 'suspicious_signals',
    'readme_first_500'
  ];
  return `${columns.join(',')}\n${records.map((item) => columns.map((column) =>
    csvCell(column === 'topics' || column === 'suspicious_signals' || column === 'score_breakdown'
      ? JSON.stringify(item[column])
      : item[column])
  ).join(',')).join('\n')}\n`;
}

function mdCell(value) {
  return String(value ?? '—').replaceAll('|', '\\|').replaceAll('\r', ' ').replaceAll('\n', ' ');
}

function report(output, recommended, datasets, excluded) {
  const topRows = recommended.map((item, index) =>
    `| ${index + 1} | [${mdCell(item.name)}](${item.url}) | ${item.score}/100 | ${mdCell(item.license_badge)} | ${mdCell(item.recommended_use)} | ${mdCell(item.integration_method)} | ${mdCell(item.suggested_chat)} | ${mdCell(item.integration_risk)} |`
  ).join('\n') || '| — | Подходящих результатов нет | — | — | — | — | — | — |';

  const dataRows = datasets.map((item, index) =>
    `| ${index + 1} | [${mdCell(item.name)}](${item.url}) | ${mdCell(item.license_badge)} | ${item.score}/100 | ${mdCell(item.description).slice(0, 180)} | ${item.eligible ? 'Можно рассматривать после ручной проверки README' : `Отсечён: ${mdCell(item.excluded_reason)}`} |`
  ).join('\n') || '| — | Найдено меньше пяти активных датасетов с допустимой SPDX-лицензией | — | — | — | — |';

  const excludedRows = excluded.slice(0, 15).map((item) =>
    `| [${mdCell(item.name)}](${item.url}) | ${mdCell(item.license_badge)} | ${mdCell(item.excluded_reason)} |`
  ).join('\n') || '| — | — | Отсеянных записей нет |';

  return `# GitHub Scout — материалы для «Сауат»

Сбор выполнен ${output.generated_at}. Результаты относятся к публичным GitHub-метаданным на момент сбора и не означают, что компонент уже встроен в код приложения. Всего найдено уникальных репозиториев: ${output.counts.discovered_unique}; детально проверено: ${output.counts.inspected}; прошло фильтр: ${output.counts.eligible}; в топ-15: ${output.counts.recommended}; казахских датасетов-кандидатов: ${output.counts.kazakh_datasets} (из них прошло фильтр: ${output.counts.kazakh_datasets_eligible}); отсеяно: ${output.counts.excluded}.

## Метод, фильтры и безопасность

- **Поиск:** GitHub REST API (${output.auth_mode}), шаблоны в [queries.json](../../tools/github_scout/queries.json). Токен \`GITHUB_TOKEN\` или \`gh auth token\` используется только в памяти и нигде не печатается и не сохраняется.
- **Безопасность:** чужой код не клонировался, \`npm install\` не выполнялся, чужие скрипты не запускались. Читались только метаданные API, дерево файлов, \`package.json\` (как текст) и первые 500 знаков README.
- **Фильтры:** отсеяны архивные репозитории, проекты без коммитов более ${STALE_MONTHS} месяцев (кроме стабильных малых библиотек до 2500 KB от 500 звёзд), проекты без SPDX-лицензии, подозрительные файлы/скрипты установки и copyleft-лицензии (GPL/AGPL/LGPL).
- **Контентный фильтр:** поисковое совпадение должно подтверждаться README, описанием или темами; например, общий пакетный менеджер не считается алгоритмом интервального повторения только из-за текста поискового запроса.
- **Шкала оценки (0–100):** соответствие задаче «Сауат» и LAN-режиму (0–30) + офлайн-способность (0–20) + простота подключения (0–15) + качество: звёзды, тесты, Dockerfile, свежесть (0–20) + лицензия (0–15).

## Топ-15 проектов

| № | Репозиторий | Оценка | Лицензия | Что полезно и где применить | Как подключить | Какой чат | Риски |
|---:|---|---:|---|---|---|---|---|
${topRows}

> Примечание: статус всех записей на момент отчёта — **предложено**. Для MPL-2.0 нужно сохранять уведомление о лицензии и раскрывать изменения модифицированных файлов.

## Топ-5 датасетов казахского языка

| № | Репозиторий / датасет | Лицензия | Оценка | Назначение | Статус и что проверить перед использованием |
|---:|---|---|---:|---|---|
${dataRows}

Лицензия в таблице отражает SPDX-лицензию репозитория. Кандидат с пометкой «отсечён» не предлагается для включения. Перед использованием разрешённого кандидата необходимо отдельно проверить лицензию самого корпуса в README (особенно для текстов СМИ, переводов и вопросов) и убедиться, что материалы подходят по возрасту и лексике для 7–9 классов.

## Отсеянные репозитории (в т.ч. 🔴 GPL/AGPL/LGPL и без лицензии)

Код из этой таблицы **нельзя** копировать в «Сауат». Позиции с 🔴 GPL/AGPL/LGPL допустимо изучать только как архитектурную идею.

| Репозиторий | Лицензия | Причина исключения |
|---|---|---|
${excludedRows}

## Чего НЕ делать

- **Не копировать задания PISA, официальные тексты и иллюстрации ОЭСР/тестов** — у них отдельные авторские права, а не открытая лицензия кода.
- **Не переносить чужие тексты без явной открытой лицензии** (включая репозитории с \`NOASSERTION\` или без файла \`LICENSE\`).
- **Не включать код под GPL / AGPL / LGPL / CC-BY-SA** в \`src/\` или \`public/\` — максимум изучить идею, отмечено красным (🔴).
- **Не запускать незнакомые репозитории и \`postinstall\`-скрипты**, не добавлять малоизвестные npm-пакеты с глубоким деревом зависимостей для простых задач (например, парсинг локального IP делается встроенным \`os.networkInterfaces()\`).
- **Не отправлять ответы учеников, тексты учителей и данные класса во внешние облачные API** — всё должно работать внутри локального ноутбука и Wi-Fi роутера школы.

## Честное описание для жюри

Мы использовали open-source компоненты (в текущей сборке сервера: \`express\`, \`multer\`, \`pdf-parse\` — лицензии MIT/ISC; дополнительные кандидаты из этого отчёта под лицензиями MIT, Apache-2.0, BSD и ISC помечены в \`docs/THIRD_PARTY.md\` со статусом «предложено» до фактического подключения); логика заданий, дизайн, интеграция и содержание написаны командой с помощью ИИ.

Машинные сырые результаты: [results.json](scout/results.json) и [results.csv](scout/results.csv).
`;
}

function thirdParty(recommended, datasets) {
  const candidates = [
    ...recommended.map((item) => ({ item, what: item.recommended_use })),
    ...datasets.filter((item) => item.eligible).map((item) => ({ item, what: 'Кандидатный казахский датасет для проверки/оценки (данные не копируются без ручной проверки лицензии).' }))
  ].filter(({ item }, index, list) => list.findIndex((entry) => entry.item.name === item.name) === index);

  const rows = candidates.map(({ item, what }) =>
    `| ${mdCell(item.npm_package || item.name)} | ${mdCell(item.version_or_commit)} | ${mdCell(item.license_spdx)} | [GitHub](${item.url}) | ${mdCell(what)} (${mdCell(item.integration_method)}) | предложено |`
  ).join('\n');

  return `# Third-party inventory

Ниже перечислены открытые компоненты и источники, **предложенные** по итогам GitHub Scout.
Чаты A и B при реальном подключении заменяют статус \`предложено\` на \`использовано\`, уточняют точную установленную версию из \`package-lock.json\` и удаляют неиспользованные строки.

| Имя | Версия / коммит | Лицензия | Ссылка | Что взято / может быть взято | Статус |
|---|---|---|---|---|---|
${rows || '| — | — | — | — | Подходящих кандидатов нет | предложено |'}

> Базовые уже установленные пакеты приложения (\`express\`, \`multer\`, \`pdf-parse\`) зафиксированы в \`package.json\` и \`package-lock.json\`.
`;
}

function doneReport(output, options, queryConfig) {
  return `# SCOUT_DONE

Проверка выполнена ${output.generated_at} командой \`node tools/github_scout/scout.js\`.

- [x] Запросы вынесены в \`tools/github_scout/queries.json\` (${queryConfig.queries.length} категорий: LAN-квизы, kahoot-like, чтение, PISA-assessment, spaced repetition/Leitner/FSRS, Ollama-тьютор, RAG с цитатами, PWA offline-first, QR/mDNS в Node, Express+SQLite роли, генерация вопросов, казахские датасеты QA/текстов, казахская лемматизация/стемминг, офлайн TTS/speech).
- [x] Парсер запускается одной командой (\`node tools/github_scout/scout.js\`) из корня \`Saulat_Sauat\`; есть \`tools/github_scout/README.md\`.
- [x] Используется GitHub REST API без платных сервисов (режим: ${output.auth_mode}, вызовов API в запуске: ${output.api_calls_this_run}), с паузами, кэшем и обработкой rate limit.
- [x] Токены нигде не печатаются и не сохраняются.
- [x] Собраны имя, ссылка, описание, язык, звёзды, форки, дата последнего коммита, SPDX-лицензия, размер, тесты, Dockerfile, первые 500 знаков README и темы.
- [x] Отфильтрованы архивные, устаревшие (>18 мес., кроме стабильных малых библиотек), без лицензии, copyleft (🔴 GPL/AGPL/LGPL) и подозрительные репозитории.
- [x] Ни одного чужого репозитория не клонировалось и не запускалось; код приложения (\`src/\`, \`server/\`, \`public/\`) не изменялся.
- [x] Созданы \`docs/scout/results.json\` и \`docs/scout/results.csv\`.
- [x] Создан \`docs/GITHUB_SCOUT.md\` (топ-15 с подключением/чатом/рисками, топ-5 казахских датасетов-кандидатов со статусом лицензии, отсеянные с 🔴, «чего не делать», абзац честности для жюри).
- [x] Создан \`docs/THIRD_PARTY.md\` (имя, версия/коммит, лицензия, ссылка, что взято, статус «предложено»).

Параметры запуска: \`per_query=${options.perQuery || 'из queries.json'}\`, \`max_repos=${options.maxRepos || 'из queries.json'}\`, \`cache=${options.noCache ? 'disabled' : 'enabled'}\`.
`;
}

main().catch((error) => {
  console.error(`GitHub Scout завершился с ошибкой: ${error.message}`);
  process.exitCode = 1;
});
