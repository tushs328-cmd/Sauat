# QA_NIGHT — финальный прогон W2

Дата: 25.11.2026. Сценарии ниже проверены на локальном demo dist; это не
пилот с реальными учениками и не проверка внешнего hosting URL.

| Проверка | Viewport | Результат |
|---|---:|---|
| `build:demo`: 4 practice + 2 diagnostic | — | PASS |
| static smoke: manifest, JSON, assets, SW precache | — | PASS |
| карта demo с шестью историями | 360×800 | PASS |
| story/practice case_001–004, touch targets | 360×800 | PASS — `0` целей ниже 44×44 |
| story/practice case_001–004, overflow | 360×800 | PASS — `scrollWidth=345` |
| story/practice case_001–004, keyboard focus | 360×800 | PASS — видимый outline |
| story images / fallback illustration | 360×800 | PASS |
| `npm run qa`: validate + tests + Docker smoke | — | PASS |

## BUG-002

Повторный аудит на реальном Chrome в dist охватил карту и все восемь экранов
story/practice для case_001–004. Найдено `0` интерактивных целей меньше
`44×44 px`; на карте проверено 17 элементов. Горизонтального переполнения нет:
`scrollWidth=345` при viewport `360`. Фокус с клавиатуры виден на каждом
проверенном экране. **BUG-002 закрыт для demo dist.** Подробная таблица сохранена
в [`qa/BUG-002_DIST_360.md`](../../../qa/BUG-002_DIST_360.md).

## Команды и exit code

- `npm run build:demo` — exit 0; dist содержит 4 practice и 2 diagnostic.
- `node scripts/static-smoke.mjs --include-draft` — exit 0.
- Playwright CLI, headed Chrome, 360×800 — exit 0; карта и 8 story/practice
  экранов проверены, `0` целей ниже 44×44.
- `npm run qa` — exit 0: validate, `npm test` 59/59, Docker smoke PASS.

Ограничения остаются прежними: внешний hosting URL, человеческая проверка KK,
реальный ученический пилот и production-нагрузка этим прогоном не подтверждены.

