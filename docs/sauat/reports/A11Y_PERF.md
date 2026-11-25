# A11Y_PERF — текущая проверка

Статус: ЧАСТИЧНО. Это проверка реального браузера Playwright, не заявление о полном WCAG-соответствии.

## Проверено

- Viewports: 360×800, 768×1024, 1440×900; RU и KK.
- Горизонтальный overflow: не обнаружен во всех сохранённых map/practice/diagnostic audits.
- Фокус: виден во всех сохранённых audits (`outline: solid` на активном элементе).
- Изображения: в сохранённых story screens `complete=true`, `naturalWidth>0`.
- Console: practice/diagnostic сценарии не дали ошибок приложения; offline reload дал `ERR_FAILED` на favicon вместе с BUG-001.

## W5 follow-up — 2026-11-25

Запущен `node tools/qa/a11y_perf.js` против свежей копии `qa/.tmp/app-w5`, exit code `0`; результат сохранён в `qa/out/a11y-perf.json`. Проверены RU/KK и 360×800, 768×1024, 1440×900 — 6 обычных сессий плюс 1 slow-network с задержкой ответа 150 ms.

- В стартовом экране: `unnamedInteractiveCount=0`, горизонтального overflow нет, 4 интерактивных элемента имеют hit-area не меньше 44×44 px.
- Первая холодная загрузка: 15 ресурсов, около 174 KB transfer size; последующие замеры использовали cache.
- Slow-network: `elapsedToDomContentLoaded=187 ms`, `domInteractive` как прозрачный proxy TTI — `170 ms`; запрос шёл с cache-busting query, тело приложения отображалось.
- Точные селекторы малых целей из story/practice-аудита перечислены в BUG-002; стартовый экран их не содержит.

## Проблемы

- BUG-002: интерактивные цели 21–40 px по высоте/размеру; нужны селекторы и увеличение hit area.
- BUG-001: после offline reload приложение не восстанавливает shell/story.
- Пустые leaf-узлы DOM в технической audit-эвристике требуют ручной проверки; этот сигнал не объявлен дефектом без визуального подтверждения.

## Не выполнено

- `axe-core` не запускался: пакет не входит в текущий `package.json`, зависимость не добавлялась.
- Lighthouse не запускался: в окружении нет подтверждённого локального бинарника; установка не выполнялась.
- Полный TTI/waterfall профайлером не измерялся; `domInteractive` указан только как явно названный proxy.

## Команды

- `node qa/run.js` из копии приложения — exit 0; 16 сценариев, 14 PASS / 2 FAIL (BUG-001 и BUG-003).
- `node tools/qa/a11y_perf.js` — exit 0; 7 synthetic sessions, `qa/out/a11y-perf.json`.
- `npm test` — exit 0; 59/59.

