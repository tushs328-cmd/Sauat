# QA_NIGHT — W1

СИМУЛЯЦИЯ: все персоны ниже — синтетические браузерные сценарии, не реальные ученики.

| Тест | Viewport | Язык | Результат |
|---|---:|---|---|
| attentive | 360×800 | RU | PASS |
| attentive | 768×1024 | RU | PASS |
| attentive | 1440×900 | RU | PASS |
| attentive | 360×800 | KK | PASS |
| attentive | 768×1024 | KK | PASS |
| attentive | 1440×900 | KK | PASS |
| random / hint-eater / double-click / language switch | 360×800 | RU | PASS |
| diagnostic + hidden hints | 360×800 | RU | PASS |
| diagnostic + hidden hints | 768×1024 | KK | PASS |
| tab close → return with progress | 360×800 | RU | PASS |
| export → teacher import → metric check | 360×800 | RU | PASS |
| offline reload and continue | 360×800 | RU | FAIL — BUG-001 |

Итого актуального W1-прогона: 15 сценариев, 14 PASS, 1 FAIL. Горизонтальная прокрутка не обнаружена; фокус виден; изображения имели `complete=true` и `naturalWidth>0` в проверенных экранах. Найдены интерактивные цели меньше 44 px — BUG-002. Карточки Арал/Байконур закрыты — BUG-003. Кабинет принял `saulat-events.json`: 3 события, метрика `0/3`; возврат после закрытия вкладки сохранил IndexedDB history `1 → 1`.

Команды и exit code:

- `npm run validate` в копии с `INCLUDE_DRAFT=1` — exit 0; контент валиден, эвристические предупреждения о длине правильных вариантов остаются.
- `npm test` в копии — exit 0; 56/56 тестов.
- `node qa/run.js` из свежей копии `qa/.tmp/app-w5` при сервере `PORT=3400`, `INCLUDE_DRAFT=1` — exit 0; итог 14/15 PASS.

Не сделано: offline reload всё ещё не восстановил shell/story (BUG-001); истории 02/03 остаются заблокированными (BUG-003). Не проверены ученический пилот, человек-проверка KK и живой Ollama.

