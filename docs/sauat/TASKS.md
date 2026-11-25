# TASKS — финальный список (старт разработки 25.11.2026, без Олжаса)

Состав: Владелец (вы, фронтенд и продукт) + Codex A + Codex B + Claude (контракт, ревью, интеграция, TASKS) + Antigravity (QA) + ChatGPT (истории, источники, содержание). Олжас подключится позже к блоку O (независимый). DONE только с evidence (commit, тест, скриншот). Контракт: `CONTRACT.md`, схема: `schema.json`. Дедлайн сдачи: 27.11, 23:00 (по Положению), цель 21:00.

## Владение файлами (один владелец на файл)
- **Codex A:** `public/**` (игровой движок, экраны, дизайн, Service Worker, IndexedDB), `public/assets/**`, `docs/PITCH.md`, `docs/DEMO_SCRIPT.md`.
- **Codex B:** `src/**`, `test/**`, `eval/**`, `content/schema-check/**` и валидатор, `content/manifest.json` (генерируется), `package.json`, `Dockerfile`, `docker-compose.yml`, `docs/AI_CARD.md`, `docs/ARCHITECTURE.md`.
- **Контент `content/<id>.json`:** один файл = один владелец; пишет ChatGPT/владелец, вносит Codex B по согласованию.
- **Claude:** `docs/sauat/CONTRACT.md`, `schema.json`, `TASKS.md`, `docs/sauat/QA_REPORT.md`.
- **Блок O (Олжас, позже):** только `ops/**`, `eval/persona/**`, `content/<свои истории>`, `docs/friend/**`.

## Статусы
| ID | Задача | Владелец | Зависит | Статус | Evidence |
|---|---|---|---|---|---|
| S00 | Снимок прежней работы (тег `v0-quiz-prototype`, ветка `archive/quiz-prototype`) | Claude | — | DONE | commit ab5c82c |
| S01 | Контракт, схема, задачи | Claude | — | DONE | docs/sauat/CONTRACT.md, schema.json |
| B01 | Аудит `src/`: что оставить, расширить хранилище под события | Codex B | S01 | DONE | commit e4518cd; 47/47 тестов (проверено Claude на копии) |
| B02 | Валидатор историй по `schema.json` + кросс-проверки, CLI `npm run validate`, тесты | Codex B | S01 | DONE | `npm run validate` → «Контент валиден» на case_001 и fixture; тесты в test/sauat-content.test.js |
| B03 | `content/manifest.json` генератор и статическая отдача `/content/*` | Codex B | B02 | DONE (с оговоркой) | manifest пуст, т.к. case_001 в статусе draft; нужен dev-флаг (см. B06) |
| A01 | Каркас клиента: разбиение `public/app.js` на модули, загрузчик истории, экраны языка/карты | Codex A | S01 | TODO | — |
| C01 | История «Золотой человек» (RU+KK) в формате контракта с источниками | ChatGPT + владелец | S01 | DRAFT RECEIVED | `content/case_001.json` валиден по схеме; факты e1–e11 сверены Claude с 4 источниками 25.11; KK и RU остаются `draft` до человеческой проверки |
| C00 | Тестовая заглушка `content/fixture_test.json` (`isTestFixture`) для разработки | Codex B | B02 | DONE | content/fixture_test.json, commit e4518cd |
| B06 | Закоммитить `content/case_001.json`; валидатор проверяет существование файла `image.file`; флаг `INCLUDE_DRAFT=1` включает draft-истории в manifest только в dev (в публичный манифест draft не попадают) | Codex B | C01 | TODO | — |
| A02 | Движок: три типа заданий, раздельная оценка ответа и доказательства, первая попытка, XP один раз | Codex A | A01,C00 | TODO | — |
| A03 | Дорожка из 3 приключений (CSS/SVG), хук, экран раскрытия, награда-карточка | Codex A | A02 | TODO | — |
| A04 | IndexedDB (прогресс, события), Service Worker precache по манифесту, `offlineReady` на клиенте | Codex A | A02,B03 | TODO | — |
| B04 | `/api/mentor` (Ollama, структурированный вывод, allowlist, таймаут, лимит, fallback по правилам) | Codex B | B01 | DONE (путь правил), ЖИВОЙ Ollama НЕ ПРОВЕРЕН | src/mentor.js, test/sauat-api.test.js; реальный вызов модели нужно проверить отдельно (задача O02) |
| A05 | UI подсказок и три состояния ИИ | Codex A | A02,B04 | TODO | — |
| B05 | `/api/events`, `/api/teacher/import`, `/summary`, `/export` (дедупликация по eventId) | Codex B | B01 | DONE | src/events.js, server.js; тесты в test/sauat-api.test.js |
| A06 | Минимальный кабинет учителя: импорт файла, три навыка, главная метрика | Codex A | B05 | TODO | — |
| C02 | Две другие истории: Арал, Байконур | ChatGPT + владелец | C01 | TODO | — |
| C03 | Диагностика 3+3 на жизненных текстах, без подсказок | ChatGPT + владелец | C01 | TODO | — |
| Q01 | Независимое QA (Chrome): Q01–Q11 из `ANTIGRAVITY.md` | Antigravity | A04,A05 | TODO | — |
| R01 | Публичная ссылка (хостинг статики + Express при возможности), README, attribution, THIRD_PARTY | Владелец + Codex B | Q01 | TODO | — |
| R02 | Презентация ≤10 слайдов, видео ≤3:00 | Владелец | R01 | TODO | — |
| R03 | Форма hackathon.kz: черновик, проверка, отправка по слову владельца | Владелец + Claude | R01,R02 | TODO | — |
| O01–O05 | Блок Олжаса (см. `docs/friend/BACKEND_BLOCK.md`) | Олжас | S01 | OPEN | — |

## Ворота
- Первый результат: работающая история «Золотой человек» от хука до награды на RU (KK при готовности проверки) — к 25.11, 18:00.
- 26.11, 12:00: три истории, ИИ, офлайн.
- 27.11, 12:00: заморозка функций. Публичный туннель к Ollama настраивается ТОЛЬКО по отдельному разрешению владельца.

Формат отчёта по задаче: ID / commit / изменённые пути / команды и exit code / фактический результат / блокеры / следующий шаг.
