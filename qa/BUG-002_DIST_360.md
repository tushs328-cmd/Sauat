# BUG-002 — dist touch-target audit

Дата: 25.11.2026
Сборка: `npm run build:demo` — exit 0
Браузер: реальный Chrome через Playwright CLI, viewport `360×800`, dist через
`py -m http.server 4174 --directory dist`.

## Результат

| Экран | Интерактивных элементов | Ниже 44×44 px | `scrollWidth` | Фокус клавиатуры |
|---|---:|---:|---:|---|
| Карта | 17 | 0 | 345 | видимый `outline: solid` |
| case_001 story | проверено | 0 | 345 | видимый `outline: solid` |
| case_001 practice | проверено | 0 | 345 | видимый `outline: solid` |
| case_002 story | проверено | 0 | 345 | видимый `outline: solid` |
| case_002 practice | проверено | 0 | 345 | видимый `outline: solid` |
| case_003 story | проверено | 0 | 345 | видимый `outline: solid` |
| case_003 practice | проверено | 0 | 345 | видимый `outline: solid` |
| case_004 story | проверено | 0 | 345 | видимый `outline: solid` |
| case_004 practice | проверено | 0 | 345 | видимый `outline: solid` |

На story-экранах case_001–003 изображения загрузились с `complete=true` и
`naturalWidth>0`; case_004 использует предусмотренную иллюстрацию без `<img>`.
Горизонтального переполнения нет: во всех проверенных экранах `scrollWidth` не
превышает ширину viewport.

## Вердикт

**BUG-002 закрыт для demo dist.** В повторном аудите найдено `0` целей меньше
`44×44 px` на карте и всех восьми экранах story/practice. Дополнительных
изменений в `public/**` не потребовалось: текущие CSS-ограничения уже дают
нужный размер.
