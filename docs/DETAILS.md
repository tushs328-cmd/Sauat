# SAUAT — DETAILS для проверяющего

Документ описывает проверяемую локальную копию проекта. Числа ниже получены из кода и команд, а не из оценок жюри или самооценки. Все истории сейчас имеют `draft`.

## Как запустить

### Windows PowerShell

Откройте чистую копию проекта, где нет незакоммиченных изменений, и выполните:

```powershell
npm ci
npm test
npm run build:demo
python -m http.server 4173 --directory dist
```

Откройте `http://127.0.0.1:4173/?jury=1`. Режим `jury=1` открывает весь demo-набор. Не открывайте `dist/index.html` через `file://`: Service Worker и относительные URL проверяются через HTTP.

### Linux/macOS shell

```bash
npm ci
npm test
npm run build:demo
python3 -m http.server 4173 --directory dist
```

Откройте тот же URL в браузере. `npm run build:static` собирает публичный production-вариант без draft-контента; `npm run build:demo` добавляет draft-истории для показа.

### Типичные ошибки

| Ошибка | Что делать |
|---|---|
| `npm ci` не выполняется | Проверьте Node.js `>=18`, наличие `package-lock.json` и повторите команду в чистой копии. |
| `Манифест контента недоступен` или сборка не проходит validate | Запустите `npm run validate`; исправляйте только показанную JSON-ошибку или предупреждение, затем повторите сборку. |
| В браузере пустой экран или 404 | Запускайте HTTP-сервер из корня проекта с `--directory dist`; не используйте `file://`. |
| Offline-пакет не готов | Откройте приложение через HTTP, дождитесь статуса «Готово офлайн», затем повторите загрузку; Service Worker недоступен на `file://`. |
| Нет Ollama | Для публичной статической сборки это штатно: работают встроенные rules-подсказки. Для локального AI-режима проверьте `OLLAMA_URL` и доступность модели. |
| Не найден PDF или видео | Проверьте пути `docs/slides/export/slides.pdf` и `docs/video/SAUAT_pitch.mp4`; `npm run check:numbers` завершится ненулевым кодом. |

## Проверка за 3 минуты

1. Выполните `npm ci`. Ожидается установка зависимостей по lock-файлу без ручного редактирования `package.json`.
2. Выполните `npm run check:numbers`. Скрипт временно собирает demo, запускает `node --test`, вызывает измеритель из `scripts/size.mjs`, считает страницы PDF через уже имеющийся `pdf-parse`, проверяет лимит файлов и сверяет числа с четырьмя документами. В согласованной чистой копии все строки таблицы должны иметь `да`, а exit code — `0`.
3. Выполните `node scripts/static-smoke.mjs --include-draft`. Ожидается `Static smoke PASS`, demo-манифест с 5 practice и 2 diagnostic, относительные URL Service Worker и локальный экспорт событий.
4. Запустите `python -m http.server 4173 --directory dist` (на Linux — `python3`) и откройте `/?jury=1`. На карте видны 5 practice и 2 diagnostic; переход по истории, заданию, подсказке и итогам не требует сервера Ollama.

## Каждый экран по порядку

| Экран | Что видит пользователь и правило | Файл кода |
|---|---|---|
| Карта | Hero, карточки practice, отдельный блок диагностики, прогресс, кабинет учителя, экспорт и ссылки «Об игре»/«О проекте». Очередность practice блокирует следующую историю; `?jury=1` открывает demo-маршрут. | `public/js/main.js`: `map`, `practiceNode`, `diagnosticCard`, `storyUnlocked` |
| История | Заголовок, hook, реконструкция/ассет, статус проверки, документы и сегменты с ID; затем кнопка перехода к заданиям. Правило — сначала прочитать источник, затем отвечать. | `public/js/main.js`: `storyIntro`, `storyImage`, `reviewBanner` |
| Задание типа «найди» | Вопрос и варианты ответа; движок сравнивает выбранные ID с `correctOptionIds`. Ошибка классифицируется как `fact_not_found`. | `public/js/main.js`: `taskScreen`; `public/js/engine.js`: `evaluateTask` |
| Задание типа «сделай вывод» | Вопрос, варианты и, если требуется контрактом, выбор доказательства из сегментов. Ответ и доказательство проверяются раздельно. | `public/js/main.js`: `taskScreen`, `evidenceGroups`; `public/js/engine.js`: `evaluateTask` |
| Задание типа «проверь утверждение» | Показывается claim и набор вариантов; доказательство проверяется отдельным набором. Ошибка доказательства получает тип `similar_not_proving`, а неверный вывод — `conclusion_beyond_data`. | `public/js/main.js`: `taskScreen`; `public/js/engine.js`: `evaluateTask`; `src/mentor.js`: стратегия `check_contradiction` |
| Подсказки | После попытки practice-истории можно открыть до трёх уровней. Подсказка содержит опору на цитату и не выдаёт готовый ответ; источник помечается как rules, offline или AI. Диагностика работает без подсказок. | `public/js/main.js`: `showHint`, `mentorBadge`; `public/js/engine.js`: `nextHint`; `src/mentor.js`, `src/ai.js` |
| Итоги practice | Награда, XP, число решённых миссий, источники, выбранные доказательства и список того, что повторить. | `public/js/main.js`: `reveal`, `storySummaryMarkup`; `public/js/storage.js`: `recordAttempt` |
| Итоги диагностики | Число верных ответов только по первой попытке, пометка «без подсказок» и пояснение, что повторные попытки не меняют результат. | `public/js/main.js`: `diagnosticComplete`; `public/js/storage.js`: `recordAttempt` |
| Кабинет учителя | Пустое состояние до импорта, экспорт JSON у ученика, импорт одного или нескольких JSON, главная диагностическая метрика, навыки и типы ошибок. | `public/js/main.js`: `results`, `summarizeEvents`, `importFiles`; `public/js/storage.js`: `exportEvents`, `importTeacherEvents` |
| Как пользоваться кабинетом | Три шага: попросить экспорт, импортировать файл, читать метрику и навыки. | `public/js/main.js`: `teacherGuideScreen`; `public/js/i18n/ru.js`, `public/js/i18n/kk.js` |
| Об игре | Объясняет проблему, маршрут «история → доказательство → подсказка» и ограничения: AI не заменяет учителя, прогресс локальный. | `public/js/main.js`: `aboutScreen`; `public/js/i18n/ru.js`, `public/js/i18n/kk.js` |
| О проекте | Показывает offline-demo, правила наставника, локальную Ollama как опциональный адаптер и ручной экспорт/импорт без обязательного аккаунта. | `public/js/main.js`: `projectScreen`; `public/js/i18n/ru.js`, `public/js/i18n/kk.js` |

## Что проверено

| Что | На каком наборе | Результат | Команда воспроизведения |
|---|---|---|---|
| Node-тесты | Репозиторий, текущий `content/` и `src/` | 72 теста, 72 pass, 0 fail | `node --test` |
| Demo-сборка | 5 practice + 2 diagnostic, fixture исключён | `dist` создан, 7 demo draft stories | `npm run build:demo` |
| Размер стартового набора | Временный demo `dist`, измерение `scripts/size.mjs` | 123,2 KB gzip; всего 126,3 KB gzip; лимит пройден | `npm run size` и `npm run check:numbers` |
| Static smoke | Demo-манифест, ассеты, относительный Service Worker, localStorage-экспорт | PASS | `node scripts/static-smoke.mjs --include-draft` |
| Валидатор контента | JSON-истории из `content/*.json` | Exit code 0; эвристические предупреждения не являются ошибками | `npm run validate` |
| Числовой контракт документов | `docs/DETAILS.md`, README и `docs/sauat/{FORM_COPYPASTE,ONE_PAGER,RELEASE_CANDIDATE}.md` | Скрипт запускается; текущий exit code 0 | `npm run check:numbers` |

Последний запуск `check:numbers` пересчитал видео как `4 992 839 B`, PDF как `266 002 B`, 10 страниц и стартовый набор как `123,2 KB gzip`; весь demo `dist` — `126,3 KB gzip`. Все проверки числового контракта завершились с exit code `0`.

## Честные пределы и ограничения

- Контентный набор состоит из 7 историй: 5 practice и 2 diagnostic; все записи имеют статус `draft`, поэтому production-сборка их не публикует без явного demo-режима.
- Казахский текст требует проверки носителем; качество перевода этим набором тестов не доказывается.
- Реальный школьный пилот и образовательный эффект не измерялись.
- Публичная сборка использует rules-наставника. Live-контракт Ollama в этой проверке не запускался; модель не заменяет валидатор ответа и ограничена allowlist-стратегиями.
- Браузерная проверка физического телефона и Safari не является результатом этой локальной проверки; static smoke не заменяет ручную кросс-браузерную проверку.
- Docker Compose описывает отдельные сети приложения и Ollama, но наличие Docker Desktop и live-запрос модели не следует считать проверенным только по файлу Compose.
- Сессии локального Express-сервера хранятся в памяти, события — в локальном JSON/локальном хранилище; это демонстрация, а не multi-school production storage.

## Переменные окружения и режимы

- Публичная статическая сборка: `npm run build:static`; draft-истории исключаются. Demo: `npm run build:demo`; build-скрипт передаёт `--include-draft` и собирает 7 историй для показа.
- `?jury=1`: читается в `public/js/main.js`, открывает истории для demo и хранит jury-прогресс отдельно от обычного прогресса.
- Локальный сервер: `npm start` запускает Express на `PORT` или на порту `3000`. `INCLUDE_DRAFT=1` разрешает draft только вне production; `SAULAT_INCLUDE_FIXTURE=1` добавляет fixture только в development.
- Ollama: `OLLAMA_URL` включает попытку подключения, `OLLAMA_MODEL` задаёт модель (по умолчанию `qwen2.5:1.5b`), `SAULAT_MENTOR_TIMEOUT_MS` ограничивает timeout наставника. Без `OLLAMA_URL` используется offline rules fallback.
- Ограничители сервера: `SAULAT_DATA_FILE`, `SAULAT_API_RATE_LIMIT`, `SAULAT_MENTOR_RATE_LIMIT`. Эти параметры не нужны публичной статической сборке.

## Использованные инструменты

По `package.json` и текущим скриптам проекта используются Node.js и npm, Express 4, Ajv 8, Multer 2, pdf-parse 1, встроенный Node test runner, Python `http.server` для локальной раздачи demo и Docker Compose для опционального Ollama-режима. В проектных документах также явно указаны Codex и Claude для разработки/QA; это описание инструментов, а не измерение качества модели.
