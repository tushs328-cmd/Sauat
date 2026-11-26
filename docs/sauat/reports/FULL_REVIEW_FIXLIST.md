# SAUAT — FIXLIST после полного review

Дата: 27.11.2026. Статус: изменения B выполняются в `src/`, `test/`, `scripts/`
и `docs/sauat/`; push не выполняется.

## Закрыто этим блоком

- [x] Убрать автодоступ ко всем историям из demo без `?jury=1`; сохранить обычную
      прогрессию.
- [x] Изолировать jury-progress и jury-события от основного прогресса и метрики.
- [x] Исправить абсолютные пути hero/story assets и иконок для любого подпути.
- [x] Добавить hero и иконки в offline precache и проверку `offlineReady`.
- [x] Сделать cache key зависимым от manifest, shell, контента, ассетов и генератора,
      чтобы обновление приложения не застревало в старом SW-кэше.
- [x] Добавить `npm run pack:site`: build demo → `dist.zip`, прямые `/`-слэши,
      проверка лимита 20 MiB.
- [x] Оставить import/export локальным и ограниченным: schema validation,
      дедупликация, максимум 500 событий и 2 MiB на файл.
- [x] Добавить targeted tests для ZIP, demo gating, jury isolation contract,
      relative assets и cache-version guard.
- [x] Не включать старую legacy-страницу с входом и API-кнопками в публичный
      static package; текущий entrypoint работает без регистрации и сервера.
- [x] Обновить submission/deploy/AI документы без заявлений о пилоте, human KK или
      public Ollama.

## Перед отправкой владельцу

1. Выложить свежий `dist/` или `dist.zip` на выбранный hosting и открыть URL без
   аккаунта, затем повторить `?jury=1` и offline reload.
2. Подставить в форму public prototype URL, video URL и slides URL.
3. Провести человеческую проверку RU/KK всех 7 историй и только потом менять
   `reviewStatus`.
4. Не переносить в форму чужие цифры, регистрации/Gmail, результаты пилота или
   обещание эффективности.
5. После согласия на публикацию отдельно проверить состав staged-файлов; B не делал
   push и не добавлял `public/`, `content/`, секреты или локальные артефакты.

## Передать Codex A

- Экран карты / история / onboarding: проверить визуальный баланс на 360, 768 и
  1440 px после свежей сборки; особенно длинные KK-заголовки.
- Экран задания: проверить keyboard focus, состояние выбранного evidence, длинные
  тексты и контраст в light/dark.
- Экран кабинета: проверить читаемость пустого состояния, import error и download
  feedback; не выдавать пустой кабинет за данные класса.
- Публичный hosting: проверить service-worker install, offline reload после первого
  открытия и отсутствие 404 для assets из project subpath.
