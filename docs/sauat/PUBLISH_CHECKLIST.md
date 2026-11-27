# PUBLISH_CHECKLIST — 10 кликов до сдачи SAUAT

Цель: выложить готовый статический `dist/`, проверить ссылку без локального
сервера/Ollama и отдельно отправить код в репозиторий. Публичная статика — это
demo rules-наставника; серверный API и локальная Ollama в неё не входят.

## Ровно 10 шагов

1. **Откройте PowerShell в корне проекта** и перейдите в подпапку:

   ```powershell
   cd C:\Users\ertai\Desktop\hakaton\Saulat_Sauat
   ```

2. **Соберите demo-пакет** (draft-статусы не меняются):

   ```powershell
   npm run build:demo
   npm run pack:site
   ```

   Ожидается сообщение о семи текущих demo draft-историях и exit code `0`.

3. **Проверьте пакет до загрузки:**

   ```powershell
   node scripts/static-smoke.mjs --include-draft
   npm run size
   ```

   Ожидаются все текущие practice и 2 diagnostic stories, offline/SW/export guards
   и exit code `0`; ZIP не должен превышать 20 000 000 байт. Загружать нужно `dist/` или
   `dist.zip`, не корень репозитория.

4. **Выберите одну площадку и загрузите `dist`:**

   - Cloudflare Pages: откройте [Workers & Pages](https://dash.cloudflare.com/),
     `Create application` → `Get started` → `Drag and drop your files`, задайте
     имя, перетащите содержимое `dist` и нажмите `Deploy site`. Публикация требует
     аккаунт владельца; итоговый адрес обычно имеет вид
     `https://ИМЯ.pages.dev`.
   - Netlify Drop: откройте [Netlify Drop](https://app.netlify.com/drop) и
     перетащите папку `dist` в drop-zone. Для временного URL аккаунт не нужен;
     если нужно управлять последующими деплоями, владелец может войти в Netlify.

5. **Скопируйте выданный URL** в отдельную заметку. Не заменяйте им ссылку на
   серверный `/api`: жюри нужна корневая статическая страница. Для показа всех
   материалов добавьте `?jury=1`, например `https://ваш-домен/?jury=1`.

6. **Проверьте ссылку без аккаунта:** откройте её в приватном окне или в другом
   браузере, где нет входа в Cloudflare/Netlify. Должны загрузиться onboarding и
   карта; все семь историй открываются для показа только с `?jury=1`, а без
   параметра сохраняется обычная последовательная прогрессия.

7. **Проверьте offline на опубликованной ссылке:** один раз откройте карту и
   case_001, перезагрузите страницу, затем временно отключите сеть в браузере и
   снова перезагрузите. Ожидаются «Готово офлайн», карта и уже открытые истории.
   Если обновление показывает старый состав историй, очистите данные сайта,
   повторите деплой свежего `dist` и снова пройдите шаги 6–7.

8. **Проверьте материалы подачи:** вставьте URL прототипа, ссылку на репозиторий,
   ссылку на слайды и видео ≤3:00 в форму hackathon.kz. Оставьте заметку, что
   Ollama работает только локально, а в public `dist` используется rules fallback.

9. **Подготовьте код из подпапки `Saulat_Sauat` без force** (выполняет владелец,
   после проверки списка файлов):

   ```powershell
   cd C:\Users\ertai\Desktop\hakaton
   git switch dev
   git pull --rebase origin dev
   git status --short
   git add -- Saulat_Sauat/src Saulat_Sauat/test Saulat_Sauat/scripts Saulat_Sauat/docs/sauat
   git diff --cached --name-only
   git commit -m "release: submit SAUAT"
   git push origin dev
   ```

   Если remote называется иначе, сначала проверьте `git remote -v` и замените
   только `origin`. Не используйте `git add -A`, `git push --force` или
   `git push --force-with-lease`; перед commit убедитесь, что в staged-списке
   нет чужих `public/**`, `content/**`, `.env` и локальных артефактов.

10. **Перед «сдавай» поставьте все галочки:** публичная ссылка открывается без
    аккаунта и Ollama; `?jury=1` показывает все истории из demo-манифеста; offline
    reload проверен;
    reviewStatus draft честно обозначен; кодовая ссылка открывается; слайды и
    видео актуальны; отправляется не более 5 файлов по 20 000 000 байт каждый; секретов,
    токенов, `.env` и персональных данных в архиве нет; `npm run qa` завершился
    exit code `0` (его вывод сохранён в отчёте команды).

## Что не делать

- Не поднимать `reviewStatus` вручную ради формы.
- Не обещать жюри удалённый AI: живая Ollama доступна только локально.
- Не загружать весь репозиторий вместо `dist`.
- Не считать ссылку проверенной, пока она не открыта в приватном окне без
  аккаунта и без локального сервера.

Официальные инструкции площадок: [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
и [Netlify Drop](https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/).
