# AI_COMPARE — Ollama против rules (TASK-002)

> ВНИМАНИЕ: запуск БЕЗ живой модели (OLLAMA_URL не задан). Колонка «Модель» = rules-fallback, строки с ИИ не измерялись. Измеримо только: эталон против rules и свобода выбора модели.

Модель: qwen2.5:1.5b. Дата: 2026-11-26T19:15:04.980Z. Сценариев: 12 (6 профилей × RU/KK, задание t2 case_001).
Эталон (ожидаемая стратегия) зафиксирован в run-compare.js до запуска и не менялся после ответов модели.

| Язык | Профиль | Эталон | Модель | Rules | Модель=эталон | Rules=эталон | Выбор стратегий (допустимо) | мс |
|---|---|---|---|---|---|---|---|---:|
| ru | answer-error | locate | rules:locate/t2_h1 | locate/t2_h1 | да | да | compare,locate | 0 |
| ru | evidence-error | compare | rules:compare/t2_h1 | compare/t2_h1 | да | да | compare | 0 |
| ru | both-errors | locate | rules:locate/t2_h1 | locate/t2_h1 | да | да | compare,locate | 0 |
| ru | repeat-same-error | locate | rules:locate/t2_h3 | locate/t2_h3 | да | да | compare,locate | 0 |
| ru | hint-heavy | compare | rules:compare/t2_h3 | compare/t2_h3 | да | да | compare | 0 |
| ru | independent-success | compare | rules:compare/t2_h1 | compare/t2_h1 | да | да | compare | 0 |
| kk | answer-error | locate | rules:locate/t2_h1 | locate/t2_h1 | да | да | compare,locate | 0 |
| kk | evidence-error | compare | rules:compare/t2_h1 | compare/t2_h1 | да | да | compare | 0 |
| kk | both-errors | locate | rules:locate/t2_h1 | locate/t2_h1 | да | да | compare,locate | 0 |
| kk | repeat-same-error | locate | rules:locate/t2_h3 | locate/t2_h3 | да | да | compare,locate | 0 |
| kk | hint-heavy | compare | rules:compare/t2_h3 | compare/t2_h3 | да | да | compare | 0 |
| kk | independent-success | compare | rules:compare/t2_h1 | compare/t2_h1 | да | да | compare | 0 |

## Итоги
- Ответов модели (source:ai): 0/12.
- Модель совпала с педагогическим эталоном: 12/12; rules совпали: 12/12.
- Модель совпала с rules полностью (стратегия+hintId+nextTaskId): 12/12.
- Допустимость hintId: 12/12; nextTaskId: 12/12.
- Сценариев, где у модели вообще был выбор из >1 стратегии: 6/12.
- Задержка: первый вызов 0 мс, медиана null мс, максимум null мс (локальный CPU/Docker, не эталонное устройство).
- Раскрытие правильного ответа: 0 случаев по построению (модель возвращает только идентификаторы из allowlist).

Ограничение: это 12 синтетических профилей, не доказательство образовательной пользы.
