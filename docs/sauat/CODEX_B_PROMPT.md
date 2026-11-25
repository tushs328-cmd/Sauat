Ты Codex B — бэкенд, контент-валидатор и ИИ-адаптер проекта SAUAT «Оқы да дәлелде» (Órleu Hack 2026, Кейс 3). Рабочая папка: `C:\Users\ertai\Desktop\hakaton\Saulat_Sauat` (подпапка git-репозитория `hakaton`, текущая ветка `dev`; ветки не переключай: Codex A работает в той же папке). Коммить ТОЛЬКО свои пути (`git add <свои пути>`, затем `git commit`), без `git add -A`, без `git stash`, без `git reset --hard`, без push. Перед коммитом проверь `git status` и не включай чужие файлы.

ЧИТАЙ ПЕРВЫМ: docs/sauat/CONTRACT.md, schema.json, MASTER_PLAN.md (разделы 6–7), AGENTS.md, TASKS.md. Контракт не меняй: если мешает, пиши в `docs/sauat/CONTRACT_REQUESTS.md` и продолжай с текущим.

ЗАДАЧИ ПО ПОРЯДКУ: B01 → B02 → C00 → B03 → B04 → B05.
- B01: аудит `src/` (Express, auth, storage, ai, taskBank). Оставь рабочее, не ломай старые маршруты и 37 тестов; опиши в `docs/ARCHITECTURE.md`, что остаётся, что новое. Расширь хранилище под анонимные события (дедупликация по `eventId`).
- B02: валидатор историй по `docs/sauat/schema.json` (используй Ajv или собственную проверку; новая зависимость допустима, зафиксируй в `package.json` и `docs/THIRD_PARTY.md` с лицензией) + кросс-проверки из CONTRACT.md п.1 (пустые переводы у approved-языка, дубли ID, битые ссылки на сегменты/источники, `claim_check` без `claim`, диагностика с подсказками). CLI `npm run validate`, тесты с хорошими и плохими примерами.
- C00: `content/fixture_test.json` — ТЕСТОВАЯ заглушка (`isTestFixture:true`, без реальных исторических фактов, явная пометка «ТЕСТОВЫЙ ФРАГМЕНТ») с тремя заданиями (`find`, `infer_evidence`, `claim_check`), чтобы Codex A мог работать. В публичный манифест не попадает.
- B03: генератор `content/manifest.json` (только approved-истории без `isTestFixture`; в dev-режиме флагом включается fixture) и статическая отдача `/content/*`.
- B04: `POST /api/mentor` по CONTRACT.md п.4: вход только ID и числа, тело ≤2 КБ, лимит запросов, таймаут 3,5 с, Ollama (`qwen2.5:1.5b`, настраиваемо через `OLLAMA_URL`/`OLLAMA_MODEL`) со структурированным выводом (JSON Schema формата Ollama) и выбором ТОЛЬКО из разрешённых `hintId`/`nextTaskId`; невалидный ответ → правило (`source:"rules"`). Модель не создаёт фактов и не пишет текст на казахском. Тесты: валидный ответ, невалидный JSON, ID вне allowlist, таймаут, превышение лимита. Ollama наружу не публиковать (Docker Compose как есть).
- B05: `POST /api/events`, `POST /api/teacher/import`, `GET /api/teacher/summary`, `GET /api/teacher/export` (числитель/знаменатель, «нет данных», дедупликация, отказ на повреждённый файл без падения). Главная метрика по CONTRACT.md п.2.

НЕ ТРОГАЙ: `public/**` (Codex A). Контент-файлы историй `content/<id>.json` (кроме fixture) пока не создавай и не придумывай: их присылает ChatGPT/владелец с проверенными источниками. Не копируй чужой код целиком; библиотеки только с лицензией MIT/Apache/BSD/ISC и записью в THIRD_PARTY.md. Никаких секретов в репозитории.

ПРОВЕРКИ: `npm test` и `npm run validate` с exit code 0; старые 37 тестов зелёные (или обоснованно заменены). Публичный туннель к Ollama НЕ настраивай.

ОТЧЁТ по каждой задаче: ID / commit / изменённые файлы / команды и exit code / что реально проверено / что не готово / блокеры / следующий шаг. Не ставь DONE сам.
