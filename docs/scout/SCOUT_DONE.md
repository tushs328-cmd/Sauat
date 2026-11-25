# SCOUT_DONE

Проверка выполнена 2026-11-24T20:13:23.000Z командой `node tools/github_scout/scout.js`.

- [x] Запросы вынесены в `tools/github_scout/queries.json` (16 категорий: LAN-квизы, kahoot-like, чтение, PISA-assessment, spaced repetition/Leitner/FSRS, Ollama-тьютор, RAG с цитатами, PWA offline-first, QR/mDNS в Node, Express+SQLite роли, генерация вопросов, казахские датасеты QA/текстов, казахская лемматизация/стемминг, офлайн TTS/speech).
- [x] Парсер запускается одной командой (`node tools/github_scout/scout.js`) из корня `Saulat_Sauat`; есть `tools/github_scout/README.md`.
- [x] Используется GitHub REST API без платных сервисов (режим: anonymous REST API, вызовов API в запуске: 5), с паузами, кэшем и обработкой rate limit.
- [x] Токены нигде не печатаются и не сохраняются.
- [x] Собраны имя, ссылка, описание, язык, звёзды, форки, дата последнего коммита, SPDX-лицензия, размер, тесты, Dockerfile, первые 500 знаков README и темы.
- [x] Отфильтрованы архивные, устаревшие (>18 мес., кроме стабильных малых библиотек), без лицензии, copyleft (🔴 GPL/AGPL/LGPL) и подозрительные репозитории.
- [x] Ни одного чужого репозитория не клонировалось и не запускалось; код приложения (`src/`, `server/`, `public/`) не изменялся.
- [x] Созданы `docs/scout/results.json` и `docs/scout/results.csv`.
- [x] Создан `docs/GITHUB_SCOUT.md` (топ-15 с подключением/чатом/рисками, топ-5 казахских датасетов-кандидатов со статусом лицензии, отсеянные с 🔴, «чего не делать», абзац честности для жюри).
- [x] Создан `docs/THIRD_PARTY.md` (имя, версия/коммит, лицензия, ссылка, что взято, статус «предложено»).

Параметры запуска: `per_query=5`, `max_repos=48`, `cache=enabled`.
