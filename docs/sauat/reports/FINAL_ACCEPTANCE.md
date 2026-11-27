# SAUAT — финальная независимая приёмка

Дата проверки: 27.11.2026 (Asia/Qyzylorda)
Версия репозитория: `1c65899` (`git rev-parse --short HEAD`), ветка `dev`
Публичный прототип: <https://tushs328-cmd.github.io/Sauat/>
Режим жюри: <https://tushs328-cmd.github.io/Sauat/?jury=1>
Код: <https://github.com/tushs328-cmd/Sauat>

Проверка выполнена в режиме FEATURE FREEZE: в рамках этой работы `public/`,
`src/` и `content/` не изменялись; commit содержит только этот отчёт. В рабочем
дереве до проверки уже находилось отдельное незакоммиченное изменение
`content/manifest.json`, оно не трогалось.

## Итог

**Финальная приёмка: FAIL / IMPLEMENTED — NOT FULLY VERIFIED.**

Публичный пользовательский маршрут прошёл проверку: 56 из 56 первых заданий
(7 историй × RU/KK × 360/1280 px × light/dark), Service Worker и offline reload
работают, ошибок консоли не обнаружено. Приёмка не может быть подтверждена из-за
трёх P1-расхождений: опубликованная ветка `gh-pages` не совпадает со сборкой
текущего HEAD, описание метрики на слайде 07 расходится с реализацией, а
заявленный MP4 отсутствует в `git archive HEAD` и имеет разные размеры в документах.

## Проверки

| Область | Статус | Доказательство | Результат |
|---|---|---|---|
| Чистая копия: `git archive HEAD` + `npm ci` | PASS | архив HEAD `1c65899`; `npm ci` | exit code `0`, 79 пакетов, 0 уязвимостей |
| Тесты | PASS | `npm test` | exit code `0`; 72/72 pass, 0 fail |
| Контент | PASS | `npm run validate` | exit code `0`; 0 ошибок, 2 эвристических warning о длине варианта |
| Demo build | PASS | `npm run build:demo` | exit code `0`; 7 draft-историй: 5 practice + 2 diagnostic |
| Static smoke | PASS | `node scripts/static-smoke.mjs --include-draft` | exit code `0`; subpath, assets, SW/offline guards |
| Размер | PASS | `npm run size` | exit code `0`; startup 123.4 KB gzip, total 126.5 KB gzip, budget PASS |
| Полный QA | FAIL / NOT_TESTED | `npm run qa` | exit code `1`: validate и test прошли, Docker smoke не смог подключиться к `dockerDesktopLinuxEngine`; PASS не засчитывается |
| Публичная загрузка | PASS | Playwright, чистый профиль, без входа | `/Sauat/?jury=1` открылся; 7 карточек доступны |
| Service Worker | PASS | Playwright | scope `https://tushs328-cmd.github.io/Sauat/`, state `activated`, controller `true` |
| Offline reload | PASS | Playwright: сначала online, затем offline reload | 7 карточек и `jury=1` сохранились, ошибок страницы/консоли нет |
| Первое задание всех историй | PASS | Playwright | `case_001`–`case_005`, `diag_entry_001`, `diag_exit_001`; RU и KK; 360 и 1280; light и dark; 56/56 completed |
| Публичный mentor | PASS | Playwright network capture | запросов к `/api/` и Ollama нет; отображается rules-only подсказка |
| Публикация против HEAD | FAIL | SHA-256 сравнение текущего `dist` и clone `gh-pages` | опубликованный commit `6dbcbfd`; 20 файлов сборки против 27 публичных; 7 different и 7 extra |
| Слайды | PASS (визуально), FAIL (метрика) | `pdfinfo`, PNG и ручная проверка `slide-02/06/07` | PDF: 10 страниц, 1152×648 pt; PNG: 1280×720; обрезания текста не видно, но формула слайда 07 неточна |

### Live-проверка

Проверены все семь историй: `case_001`, `case_002`, `case_003`,
`case_004`, `case_005`, `diag_entry_001`, `diag_exit_001`. Для каждой истории выполнено
первое задание на русском и казахском языках, в 360 и 1280 px, в светлой и
тёмной теме. У каждой комбинации зафиксировано успешное завершение без
ошибок страницы и консоли.

Скриншот для дефекта пользовательского интерфейса не приложен: в live-маршруте
дефектов интерфейса не обнаружено. Для найденных документальных и hash-дефектов
воспроизводимым доказательством являются цитаты, commit-id и SHA-256, а не
снимок экрана.

## Сверка опубликованной сборки

Сравнение сделано после `npm run build:demo` из чистого архива HEAD. `.nojekyll`
исключён из сравнения как служебный файл Pages.

| Показатель | Значение |
|---|---:|
| Файлы в текущем `dist` | 20 |
| Файлы в `gh-pages` | 27 |
| Отсутствуют в `gh-pages` | 0 |
| Лишние в `gh-pages` | 7 |
| Одинаковые пути с разным SHA-256 | 7 |

Лишние публичные файлы: `content/case_001.json`–`content/case_005.json`,
`content/diag_entry_001.json`, `content/diag_exit_001.json`.

Различающиеся файлы:

| Файл | SHA-256 build из HEAD | SHA-256 `gh-pages` |
|---|---|---|
| `content/manifest.json` | `AF7CD5040A98E7AD4244A6AFFDDC36047B336AEE58CDC6E7411B06686158C291` | `F236FFF34A02696E603C6F88DC586B87C77A37B1B63298D8FF425D875CA71A60` |
| `js/content.js` | `C5A0CF3C3308C4A4F3E535AE21388962F2078CAE399E80C730E645EEF9AD591` | `4DD27860D53427E53E883134CBF668F43FBF56C0AD7ECEE0335437A66528DD25` |
| `js/main.js` | `E80E3CFF142C7AB1E50AA6B7E164DDA2F60700E7EACAD97A80A0E62EE18D5A74` | `FB0F640B07852AC44203C428BDEEDFBABCFAEE40076E345844F4A3ADC4309C20` |
| `js/offline.js` | `827582750239C113FAC4806E37832C401EC2C340F8E38ECFB631E1922693C586` | `543D539EB7B348590E7083E6BDF76749EE49D064C369D2B63C97BF01970F571C` |
| `js/storage.js` | `6683CFC2569C5872AD7EA25422019D298359E1DE054369A434A4E7165A2ED86D` | `99A777349B1DA853344E8CCCC7CD65B7CC4E4239237691DF416DB7D228D6361C` |
| `manifest.webmanifest` | `D44F43AE9C4D06776E5905C872E50254A9D4D4B623D02C74DA1E1A995474EF27` | `D1103DDE9CF26813E9B32C0B9F3DB57E37F01B7C54031E821D868D933C37833F` |
| `sw.js` | `1AB4CECB8C2D4BCCF0EAC5E483EBA22B9F344CD251F472FCFB9EDE80C0C341DC` | `6317F90AD83D9F1A508602F98DC3DB7A789EE1B06A97438F493B2D154201908` |

## Расхождения в документах и слайдах

| ID / приоритет | Цитата | Факт проверки | Предлагаемая замена |
|---|---|---|---|
| D1 / P1 | `docs/slides/index.html:236`: «…от общего числа импортированных диагностических событий» | `src/events.js:84-96` сначала оставляет только `mode === diagnostic && firstTry`, затем отдельно считает entry и exit; `SUBMISSION_FORM.md:94-101` описывает это правильно | «Доля firstTry-событий диагностической группы (entry или exit), где `answerCorrect=true`, `evidenceCorrect=true` и `hintsUsed=0`; entry и exit считаются отдельно. События режима жюри исключаются.» |
| D2 / P2 | `SUBMISSION_FORM.md:83-84`: «offline reload нужно подтвердить на свежем опубликованном URL»; `:159-160`: «публичный hosting URL ещё не проверен»; `:181`: `[ ] Проверить…` | В текущем live-тесте public URL, SW scope и offline reload подтверждены | Заменить caveat и unchecked-пункты на: «27.11.2026 проверено в чистом профиле без входа: `/Sauat/`, SW `activated`, offline reload, 7 историй; запросов к Ollama нет.» |
| D3 / P2 | `SUBMISSION_PACKAGE.md:3-4`: «Фактические публичные URL ещё не подтверждены»; `:36-37` требует свежую публикацию; `:53` и `:55` оставляют публичную проверку незакрытой | Публичный URL реально проверен без входа, включая `?jury=1`, offline reload и rules-only | Обновить статус и чек-лист теми же текущими результатами; отдельно оставить открытым только hash mismatch публикации из раздела выше |
| D4 / P2 | `RELEASE_CANDIDATE.md:7-8`: source commit `350448f`, публикация собрана из `350448f` | Текущий HEAD — `1c65899`; после него изменены slide 05 PNG/PDF и текст `docs/slides/index.html` | Либо пересобрать/опубликовать из `1c65899`, либо явно назвать документ snapshot для `350448f`; после публикации обновить content hash |
| D5 / P1 | `RELEASE_CANDIDATE.md:23`: `SAUAT_pitch.mp4`, 4 992 839 байт, hash; `SUBMISSION_FORM.md:179` и `SUBMISSION_PACKAGE.md:17`: 5 012 023 байт | `SAUAT_pitch.mp4` отсутствует в `git archive HEAD` и рабочем дереве; присутствуют `docs/demo/demo.webm` (18 468 874 байт) и PDF. MP4 нельзя подтвердить по текущему репозиторию | Вложить фактический MP4 или явно указать внешний источник; затем привести один размер, длительность и SHA-256 во всех документах. До этого MP4 — `NOT_TESTED`, не «готов» |
| D6 / P2 | `SUBMISSION_PACKAGE.md:25-32`: лимит каждого файла сдачи 20 000 000 байт; README описывает «лимит загрузки файлов» без числа | Серверный импорт ограничен 2 MiB (`src/server.js:68`); static import ограничен 2 MiB и 500 событиями (`scripts/build-static.mjs:217,267`). 20 000 000 байт — лимит submission artifacts, не импортируемого файла приложения | Явно разделить: «файл сдачи ≤20 000 000 байт; teacher/static event import ≤2 MiB на файл; static import ≤500 событий» |
| D7 / P2 | `docs/slides/index.html:234,256,295` и `RELEASE_CANDIDATE.md:17`: «около 123 КБ gzip» / «123,2 КБ» | Текущий `npm run size`: startup `123.4 KB gzip`, total `126.5 KB gzip`. В предыдущем задании требовалась единая формулировка «124 КБ gzip» | Выбрать одну подтверждённую формулировку и использовать везде; если нужен округлённый headline — «124 КБ gzip», рядом можно оставить точное значение `123.4 KB` |

### Что согласуется с поведением

- Числа историй согласуются: demo build и live `?jury=1` дают пять practice и
  две diagnostic истории; все семь имеют `draft`.
- `AI_CARD_RU.md:28-40`, `README.md:103-107` и слайд 06 корректно описывают
  публичную сборку как rules-only. Live capture не обнаружил запросов к API или
  Ollama. Финальный live-тест модели не заявляется; Docker smoke не прошёл из-за
  недоступности daemon.
- `SUBMISSION_FORM.md:94-101` согласуется с реализацией метрики лучше, чем
  слайд 07: denominator — firstTry-события соответствующей диагностической
  группы, entry и exit отдельно.
- Слайды 02, 03, 04, 05 и 06 содержат заявленные правки: 36% и прямая ссылка
  OECD, аккаунт только для статического демо, «История → ответ и доказательство
  → подсказка наставника», единое имя `SAUAT_pitch.mp4`, rules-only в demo и
  раскрытие отсутствия финального live-теста.
- Внутри приложения атрибуция находится в разделе «О проекте»
  (`public/js/main.js:151`); документационные disclosure-пункты отдельно
  перечислены в AI/submission materials и в этой приёмке не изменялись.

## Дефекты по приоритетам

### P0

Нет подтверждённых P0-дефектов.

### P1

1. `gh-pages` не соответствует `npm run build:demo` из HEAD: семь общих путей
   имеют другой SHA-256 и есть семь лишних JSON-файлов. Нужно пересобрать и
   опубликовать именно текущий HEAD, затем повторить hash-сверку.
2. Формула главной метрики на слайде 07 может дать неверное понимание
   denominator и противоречит `src/events.js` и форме. Нужно заменить текст до
   подачи.
3. Заявленный MP4 не доступен в текущем `HEAD`/архиве, а его размер и hash
   расходятся между документами. Нужна фактическая вложенная версия или честный
   статус `NOT_TESTED`.

### P2

1. `SUBMISSION_FORM.md` и `SUBMISSION_PACKAGE.md` содержат устаревшие статусы
   проверки public URL/offline.
2. `RELEASE_CANDIDATE.md` ссылается на старый source commit `350448f` вместо
   текущего `1c65899`.
3. Различаются понятия лимита submission-файла (20 000 000 байт) и лимита
   импорта приложения (2 MiB; static import также 500 событий).
4. В слайдах/RC заявлено около 123 КБ gzip, тогда как требование последней
   правки просило единое «124 КБ gzip»; точное текущее измерение — 123.4 KB gzip.

## Не проверено / ограничения

- Docker smoke и финальный live-контракт Ollama: **не проверено**, потому что
  Docker CLI не подключился к `dockerDesktopLinuxEngine`; `npm run qa` поэтому
  имеет exit code `1`.
- Фактический MP4: **не проверено** — файла нет в `git archive HEAD`; проверены
  только существующие PDF/WebM.
- Safari, физическое мобильное устройство и реальные школьные данные: **не
  проверено**. Выполнена требуемая Chromium-проверка 360/1280 px.
- Отдельный HTTP-тест внешних ссылок OECD/Science.org/UNESCO: **не проверено**.
  Наличие ссылок в документах проверено; публичный prototype и GitHub URL
  открыты.

## Проверенные визуальные артефакты

- `docs/slides/export/slide-02.png`
- `docs/slides/export/slide-06.png`
- `docs/slides/export/slide-07.png`
- `docs/slides/export/slides.pdf` — 10 страниц, 1152×648 pt

Текст на этих слайдах визуально не обрезан. Семантическое замечание к слайду 07
описано как D1/P1 выше.
