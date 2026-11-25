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
| A01 | Каркас клиента: разбиение `public/app.js` на модули, загрузчик истории, экраны языка/карты | Codex A | S01 | DONE (на заглушке) | commit eea8a10; клиент открывается, онбординг и карта работают (проверено Claude в Chrome); грузит только `public/dev/fixture.json`, не `/content/manifest.json` |
| C01 | История «Золотой человек» (RU+KK) в формате контракта с источниками | ChatGPT + владелец | S01 | DRAFT RECEIVED | `content/case_001.json` валиден по схеме; факты e1–e11 сверены Claude с 4 источниками 25.11; KK и RU остаются `draft` до человеческой проверки |
| C00 | Тестовая заглушка `content/fixture_test.json` (`isTestFixture`) для разработки | Codex B | B02 | DONE | content/fixture_test.json, commit e4518cd |
| B06 | Закоммитить `content/case_001.json`; валидатор проверяет существование файла `image.file`; флаг `INCLUDE_DRAFT=1` включает draft-истории в manifest только в dev (в публичный манифест draft не попадают) | Codex B | C01 | DONE | commit 6f2cd00; 49/49 тестов; без флага manifest пуст, с флагом содержит case_001 (проверено Claude); предупреждение «нет assets/c01_issyk_reconstruction.svg» |
| C01v2 | История v2: учесть исследование Science Advances 2026 (пол «скорее мужской»), правки казахского, исправленные T2 и T4 | Codex (чат C01) | C01 | DONE (draft, contentVersion 3) | commits cc06609, ea2135b; 12 сегментов, ID без пропусков, ссылки в подсказках сходятся, варианты ответа выровнены, validate PASS, 49/49; казахский и русский остаются `draft` — нужна проверка человеком |
| A02 | Движок: три типа заданий, раздельная оценка ответа и доказательства, первая попытка, XP один раз | Codex A | A01,C00 | DONE (код проверен чтением) | public/js/engine.js, storage.js; ограничения: прогресс в localStorage (не IndexedDB), «+100 XP» и «4/4» зашиты в разметке |
| A03 | Дорожка из 3 приключений (CSS/SVG), хук, экран раскрытия, награда-карточка | Codex A | A02 | PARTIAL | карта, хук, раскрытие есть; 2 из 3 узлов — заглушки; на реальной истории `case_001` не проверено |
| A04 | IndexedDB (прогресс, события), Service Worker precache по манифесту, `offlineReady` на клиенте | Codex A | A02,B03 | DONE (офлайн проверен), IndexedDB НЕ ПРОВЕРЕН | commit aed918b; Claude 25.11 07:5x: SW закэшировал оболочку, `/content/manifest.json`, `case_001.json`, SVG; сервер остановлен → страница открылась, история `case_001` загрузилась и проходится (частичный балл при верном ответе и неверном доказательстве, XP 25 за задание, подсказки локально «НЕТ СЕТИ») |
| B04 | `/api/mentor` (Ollama, структурированный вывод, allowlist, таймаут, лимит, fallback по правилам) | Codex B | B01 | DONE (путь правил), ЖИВОЙ Ollama НЕ ПРОВЕРЕН | src/mentor.js, test/sauat-api.test.js; реальный вызов модели нужно проверить отдельно (задача O02) |
| A05 | UI подсказок и три состояния ИИ | Codex A | A02,B04 | PARTIAL | commit aed918b; состояние «Нет сети» и локальные подсказки проверены; режим «ИИ-наставник» с реальным ответом модели НЕ проверен (Ollama не запускалась) |
| B05 | `/api/events`, `/api/teacher/import`, `/summary`, `/export` (дедупликация по eventId) | Codex B | B01 | DONE | src/events.js, server.js; тесты в test/sauat-api.test.js |
| A06 | Минимальный кабинет учителя: импорт файла, три навыка, главная метрика | Codex A | B05 | TODO | — |
| C02 | Две другие истории: Арал, Байконур | Codex (чаты C02, C03) | C01 | DRAFT, правки в работе | case_002 (commit 223b2a7): ОШИБКА найдена Claude — e8 и reward.text датируют сообщение «6 ноября 2026», а страница gov.kz/…/1065233 от 10 сентября 2025; данные e9 (cawater PDF) Claude не смог проверить; на возврате к Codex. case_003 (9e489e9): e8 (Kazcosmos, аренда до 2050) и e9 (соглашение 1994: арендодатель/арендатор, 115 млн долл.) сверены с первоисточниками; ESA/NASA даты не перепроверялись |
| C03 | Диагностика 3+3 на жизненных текстах, без подсказок | Codex (чат C04) | C01 | DRAFT, правки в работе | diag_entry_001, diag_exit_001 (commits d060d03, 0de6bb6); замечания Claude: формат ответов выдаёт верный вариант, абсурдные дистракторы, сопоставимость пары, t3 всегда «Нет» |
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
