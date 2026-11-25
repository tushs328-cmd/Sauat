# CONTRACT — единый контракт SAUAT (v1, утверждён владельцем 25.11.2026)

Меняет только Claude по согласованию с владельцем. Любая правка = запись в «Изменения» внизу; ломающая правка повышает `schemaVersion`.

## 1. Контент (`content/<id>.json`, схема `docs/sauat/schema.json`)
- Два языка kk/ru в каждом тексте. Статус проверки отдельно по языкам: `reviewStatus.kk` и `reviewStatus.ru` ∈ draft | reviewed | approved. В публичную сборку попадают только истории, у которых язык показа `approved`. Непроверенный язык в интерфейсе помечается «на проверке» и не выдаётся за проверенный.
- `schemaVersion` — версия структуры; `contentVersion` — версия банка (растёт при любой правке содержимого).
- Каждое историческое утверждение: сегмент `documents[].segments[].sourceId` → `sources[].id` (URL и дата обращения).
- Изображение: `file`, `alt`, `credit`, `license`, `isReconstruction`. Без проверенных прав не принимается. ИИ-иллюстрацию не выдавать за историческую.
- Вымышленный документ: `isFictional=true`, в UI помечается.
- Тестовая заглушка для разработки: `isTestFixture=true`; в публичный манифест не попадает.
- Три типа задания одного движка: `find` (найти фрагмент), `infer_evidence` (вывод + доказательство), `claim_check` (поймай ИИ на ошибке; `claim.isTrue`).
- `options` ≥ 2 (лучше 3+); `correctOptionIds` — верный ответ; `acceptedEvidenceSets` — допустимые альтернативные наборы ID сегментов; набор ученика засчитывается, если он точно равен одному из них. `requireEvidence=true` для `infer_evidence` и `claim_check`.
- `hints` до 3 уровней (1 куда смотреть, 2 наводящий вопрос, 3 разбор без готового ответа). `kind=diagnostic` → `hints` пуст.
- `content/manifest.json`: `{contentVersion, stories:[{id, kind, file, assets:[...]}]}`.
- Валидатор (задача B02) дополнительно проверяет: нет пустых переводов у approved-языка, нет дублей ID, все `sourceId`/`acceptedEvidenceSets` ссылаются на существующие сегменты, `correctOptionIds` существуют, у `claim_check` есть `claim`.

## 2. Оценка (на клиенте, работает офлайн)
- `answerCorrect` = выбранные options == `correctOptionIds`.
- `evidenceCorrect` = выбранные сегменты точно равны одному из `acceptedEvidenceSets` (если `requireEvidence`).
- Полный балл только при обоих верных. Верный ответ без верного доказательства = частичный.
- Первая попытка (`firstTry`) записывается ДО повторного ответа и не перезаписывается.
- XP за задание начисляется один раз и не входит в учебную метрику.
- Диагностика: подсказки скрыты, считается только первая попытка.
- ГЛАВНАЯ МЕТРИКА: доля диагностических заданий с `firstTry && answerCorrect && evidenceCorrect && hintsUsed==0`. Показывать числитель/знаменатель; нет данных → «нет данных».
- Офлайн-результаты — учебная аналитика, не защищённый экзамен: правильные ответы лежат на устройстве.

## 3. Событие (анонимное)
```json
{ "eventId":"uuid", "anonId":"local-random", "ts":"ISO-8601", "contentVersion":1,
  "storyId":"case_001", "taskId":"t1", "skill":"find|infer|evidence", "mode":"practice|diagnostic",
  "attempt":1, "answerCorrect":true, "evidenceCorrect":false, "hintsUsed":0, "firstTry":true,
  "lang":"kk|ru", "mentorSource":"ai|rules|none" }
```
Без ФИО, школ и текстов ответов детей. `eventId` — для дедупликации при повторном импорте.

## 4. API (Express, `src/`)
| Метод и путь | Назначение | Ответ |
|---|---|---|
| GET `/api/health` | состояние | `{ai:"available"\|"fallback", contentVersion}` (offlineReady определяет КЛИЕНТ) |
| GET `/content/manifest.json`, `/content/<id>.json` | утверждённый контент статикой | JSON |
| POST `/api/mentor` | выбор подсказки | вход `{storyId, taskId, skill, errorProfile:{answerWrong, evidenceWrong, attempt, hintsUsed, lastHintLevel}, lang}` → `{strategy, hintId, nextTaskId\|null, source:"ai"\|"rules"}` |
| POST `/api/events` | пакет событий (≤500) | `{accepted, duplicates}` |
| POST `/api/teacher/import` | импорт файла событий | `{accepted, duplicates, rejected}` |
| GET `/api/teacher/summary` | три навыка и главная метрика | `{skills:{find:{num,den}, infer:{..}, evidence:{..}}, mainMetric:{num,den}, learners:n}` |
| GET `/api/teacher/export` | экспорт | JSON |

`/api/mentor`: вход только ID и числа (без свободного текста и персональных данных); тело ≤ 2 КБ; лимит запросов; таймаут модели 3,5 с; модель выбирает ТОЛЬКО из разрешённого списка `hintId`/`nextTaskId` через структурированный вывод (JSON Schema Ollama); неверный или запрещённый ответ → `source:"rules"`. Модель не создаёт фактов и не пишет текст на казахском. Старые маршруты (`/api/student/*`, роли, вход по коду класса) остаются в коде, но игровой сценарий от них не зависит; для жюри доступен мгновенный вход без регистрации.

## 5. Состояния ИИ в UI
1) «ИИ-наставник» (реальный ответ модели). 2) «Подсказка по правилам» (ИИ недоступен). 3) «Нет сети» (офлайн, правила). Публичный fallback никогда не выдаётся за ИИ.

## 6. Офлайн (клиент)
Service Worker precache: оболочка, `content/manifest.json`, все истории и ассеты по манифесту. `offlineReady=true` только после того, как клиент сам проверил наличие всех файлов манифеста в Cache Storage. Прогресс и события в IndexedDB; обновление билда не стирает их (миграция по `schemaVersion`).

## Изменения
- v1 (25.11.2026): первая версия.
