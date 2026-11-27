# SAUAT — FINAL_ACCEPTANCE_R2

Дата проверки: 27.11.2026 (Asia/Qyzylorda)
Версия: `c406299` (`git rev-parse --short HEAD`), ветка `dev`
Ожидаемый минимум: `88c634e` — выполнено (`c406299` новее).
Публичный прототип: <https://tushs328-cmd.github.io/Sauat/>
Режим жюри: <https://tushs328-cmd.github.io/Sauat/?jury=1>

Проверка выполнена без входа. Для чистого прогона использован архив
`git archive HEAD` в `C:\Users\ertai\AppData\Local\Temp\sauat-r2-head-e98e9d227b5845acb57e425cfdb0e6a2`.
В `public/`, `src/`, `content/` и `docs/slides/` в рамках этой приёмки изменений
не вносилось. В рабочем дереве были посторонние незакоммиченные и
неотслеживаемые файлы; они не включались в архив, не исправлялись и не
коммитились.

## Итог

**Результат: NOT FULLY VERIFIED.** P0/P1-дефектов по проверенным маршрутам не
обнаружено. Ограничение приёмки — Docker smoke не выполнен, потому что Docker
Desktop daemon недоступен; это отмечено как `NOT_TESTED`, а не как PASS.

## Матрица проверок

| Область | Статус | Факт и exit code |
|---|---|---|
| `git archive HEAD` + `npm ci` | PASS | архив HEAD `c406299`; `npm ci` exit `0`, 79 пакетов, 0 уязвимостей |
| `npm test` | PASS | exit `0`; 72 теста, 72 pass, 0 fail |
| `npm run validate` | PASS | exit `0`; ошибок нет, 2 эвристических warning о самом длинном правильном варианте RU/KK |
| `npm run build:demo` | PASS | exit `0`; `dist` содержит 7 demo-историй: 5 practice + 2 diagnostic |
| `node scripts/static-smoke.mjs --include-draft` | PASS | exit `0`; subpath, assets, Service Worker, offline rules и export guards проверены |
| `npm run size` | PASS | exit `0`; 27 файлов, 344.2 KB raw / 126.5 KB gzip; startup 333.4 KB raw / 123.4 KB gzip; budget PASS |
| `npm run qa` | NOT_TESTED | exit `1`: validate и test прошли, Docker smoke не смог подключиться к `npipe:////./pipe/dockerDesktopLinuxEngine`; агрегированный QA PASS не заявляется |
| Загрузка live `/Sauat/?jury=1` | PASS | Playwright, чистый профиль, без входа; открыты 7 карточек |
| Service Worker | PASS | scope `https://tushs328-cmd.github.io/Sauat/`, state `activated`, `controller=true` |
| Offline reload | PASS | после online-загрузки и offline reload сохранились 7 карточек и `jury=1` |
| Ошибки консоли | PASS | в проверенном live-сеансе `0` console errors |
| Первое задание всех историй | PASS | 56/56: 7 историй × RU/KK × 360/1280 px × light/dark; каждое первое задание принято с правильным ответом и доказательством |
| Все задания одной practice-истории | PASS | `case_001`: экран итогов после `4/4` заданий |
| Все задания одной diagnostic-истории | PASS | `diag_entry_001`: экран завершения после `3/3` заданий |
| Кабинет учителя: экспорт и импорт дважды | PASS | экспорт `saulat-events.json`; импорт 1: `принято 1, дубликатов 0`; импорт того же файла 2: `принято 0, дубликатов 1`; метрика и счётчик остались `1/1` и `1 событий` |

## Сверка live-сборки с HEAD

После повторного `npm run build:demo` из чистого архива каждый файл `dist`
скачан с live URL через `curl.exe` (не через clone) и сравнен по SHA-256.

| Показатель | Результат |
|---|---:|
| Файлов сборки | 27 |
| Ошибок `curl` | 0 |
| Различий SHA-256 | 0 |
| Итог | **ALL_BUILD_FILES_MATCH_LIVE = TRUE** |

## Файлы сдачи и Release Candidate

| Файл | Фактический результат | SHA-256 в `RELEASE_CANDIDATE.md` |
|---|---|---|
| `docs/video/SAUAT_pitch.mp4` | 4 992 839 байт; H.264 + AAC; `157.600000` с (2:37.6); аудио есть; лимиты ≤3:00 и ≤20 000 000 байт соблюдены | `4e84cd8fdee26bbd3cf7010385b50861663170101c1f45685fa8eff8e209905d` — совпадает |
| `docs/slides/export/slides.pdf` | 264 640 байт; `pdfinfo`: 10 страниц, 1152×648 pt | `c23d23e4cb160fcac61eefedfe8d08627f51dae5cdcd85fcef1f39427e80fca1` — совпадает |

## Аудит секретов и истории

Проверены отслеживаемые файлы HEAD и история всех refs:

- `git ls-files` для `.env` и `.env.*`: совпадений нет.
- В HEAD не найдены шаблоны `sk-*`, `ghp_*`, `github_pat_*`, AWS access key,
  Google API key, Slack token или Bearer token.
- `SAUAT_VIDEO`, `xi-api-key`, `ELEVENLABS_API_KEY` и `elevenlabs` не найдены
  в истории; имён файлов с `SAUAT_VIDEO`/`ElevenLabs` также нет.
- Найдены только контекстные совпадения `token`/`api-key` в коде генерации
  сессии, чтении переменной окружения и импортированных scout-данных. В
  `docs/scout/results.csv` и `docs/scout/results.json` присутствует внешний
  `circle-token` в HTML-бейдже; значение намеренно не цитируется. Это не
  подтверждено как действующий секрет, но требует ручной редактуры перед
  публикацией данных scout.

## Дефекты

### P0

Не обнаружены.

### P1

Не обнаружены. Предыдущие P1 закрыты и проверены повторно: live-сборка
совпадает с `build:demo` по 27/27 SHA-256, артефакты видео присутствуют и
соответствуют RC, а маршрут metric/слайд 07 не блокирует текущий live-прогон.

### P2

1. В отслеживаемых `docs/scout/results.csv` и `docs/scout/results.json` есть
   внешний `circle-token` из импортированного README-бейджа. Это не доказанный
   секрет, но security hygiene требует удалить или редактировать значение
   перед публичной раздачей scout-данных. В рамках FEATURE FREEZE не исправлялось.
2. `npm run validate` стабильно сообщает 2 эвристических warning: правильный
   вариант в `/tasks/1/correctOptionIds` является самым длинным в RU и KK.
   Это не остановило сборку, но может облегчать угадывание ответа.

## NOT_TESTED / ограничения

- Docker smoke и живой контракт Ollama: **не проверено** — Docker daemon
  недоступен; `npm run qa` имеет exit code `1`.
- Safari и физическое мобильное устройство: **не проверено**; проверены
  Chromium 360 и 1280 px.
- Независимое численное измерение WCAG-контраста каждого элемента: **не
  проверено**; проверены live-экраны и отсутствие console errors.
- Реальный школьный пилот и влияние на грамотность: **не проверено**.
- Внешние ссылки документов отдельно HTTP-проверкой не проверялись; наличие
  файлов, хэшей и live-поведения проверено.

