# SAUAT — справка для жюри и организаторов

## Русская версия

**Что это.** SAUAT — двуязычное образовательное PWA для 7–9 классов, развивающее функциональную читательскую грамотность через короткие истории и жизненные ситуации. Ученик читает фрагменты, выбирает ответ и отдельно подтверждает его доказательством из текста.

**Проблема и источник.** По [PISA-2025 (OECD)](https://www.oecd.org/en/publications/pisa-2025-results-volume-i-country-notes_2d4ff9ea-en/kazakhstan_c01ae9c9-en.html) только 36% 15-летних учащихся Казахстана достигли уровня 2+ по чтению против 69% в среднем по ОЭСР. Это контекст проблемы, а не доказательство эффекта SAUAT.

**Как работает.** История → ответ и доказательство → подсказка наставника.

**Почему сельской школе.** После первой загрузки и кэширования основной сценарий рассчитан на офлайн-работу; стартовый набор — около 123 КБ gzip. В публичном прототипе не нужна регистрация.

**Роль ИИ.** Экспериментальный гибридный наставник: встроенные правила и опциональная локальная модель. В публичной версии работает только rules; повторная live-проверка модели не выполнена.

**Для учителя.** Кабинет показывает навыки и типы ошибок по импортированным локальным событиям.

**Что готово.** Для демо собрано 7 историй: 5 practice и 2 diagnostic; все имеют статус `draft`. `npm test` — 72/72. Прототип: <https://tushs328-cmd.github.io/Sauat/> · код: <https://github.com/tushs328-cmd/Sauat>.

**Что не доказано.** Реальный школьный пилот и эффект на грамотность не проверены; качество казахского текста не подтверждено носителем.

**Следующий шаг.** Провести редакторскую и носительскую проверку, затем реальный пилот и повторную live-проверку модели.

## English version

**What it is.** SAUAT is a bilingual educational PWA for grades 7–9 that develops functional reading literacy through short stories and real-life situations. Students read excerpts, choose an answer, and separately support it with evidence from the text.

**Problem and source.** According to [PISA 2025 (OECD)](https://www.oecd.org/en/publications/pisa-2025-results-volume-i-country-notes_2d4ff9ea-en/kazakhstan_c01ae9c9-en.html), 36% of 15-year-old students in Kazakhstan reached Level 2 or higher in reading, compared with 69% on average across the OECD. This frames the problem; it is not evidence of a SAUAT effect.

**How it works.** Story → answer and evidence → mentor hint.

**Why it fits rural schools.** After the first download and cache, the main learning flow is designed to work offline; the startup package is about 123 KB gzip. The public prototype requires no registration.

**Role of AI.** An experimental hybrid mentor combining built-in rules with an optional local model. The public version is rules-only; the model has not been rechecked live.

**For teachers.** The teacher cabinet shows skills and error types from imported local events.

**What is ready.** The demo contains 7 stories: 5 practice and 2 diagnostic; all remain `draft`. `npm test`: 72/72. Prototype: <https://tushs328-cmd.github.io/Sauat/> · code: <https://github.com/tushs328-cmd/Sauat>.

**Not proven.** No real school pilot or literacy effect has been established; Kazakh-language quality has not been confirmed by a native speaker.

**Next step.** Complete editorial and native-speaker review, then run a real pilot and repeat the live model check.

## Қазақша нұсқа — аударма жобасы, нужен носитель

**Бұл не.** SAUAT — 7–9 сынып оқушыларына арналған, қысқа әңгімелер мен өмірлік жағдайлар арқылы функционалдық оқу сауаттылығын дамытатын екі тілдегі білім беру PWA-қосымшасы. Оқушы үзінділерді оқиды, жауапты таңдайды және оны мәтіндегі дәлелмен бөлек растайды.

**Мәселе және дереккөз.** [PISA-2025 (OECD)](https://www.oecd.org/en/publications/pisa-2025-results-volume-i-country-notes_2d4ff9ea-en/kazakhstan_c01ae9c9-en.html) дерегіне сай, Қазақстандағы 15 жастағы оқушылардың 36%-ы оқу сауаттылығы бойынша 2-деңгейге немесе одан жоғары деңгейге жеткен; OECD орташа көрсеткіші — 69%. Бұл — мәселенің контексті, SAUAT әсерінің дәлелі емес.

**Қалай жұмыс істейді.** Әңгіме → жауап және дәлел → тәлімгердің кеңесі.

**Ауыл мектебіне сәйкестігі.** Алғашқы жүктеу мен кэштеуден кейін негізгі оқу сценарийі офлайн жұмыс істеуге есептелген; бастапқы пакет шамамен 123 КБ gzip. Ашық прототипте тіркелу қажет емес.

**ИИ рөлі.** Бұл — кірістірілген ережелер мен жергілікті модельді біріктіретін эксперименттік гибридті тәлімгер. Ашық нұсқада тек rules режимі жұмыс істейді; модельдің live тексеруі қайталанбаған.

**Мұғалім үшін.** Мұғалім кабинетінде импортталған жергілікті оқиғалар бойынша дағдылар мен қателер түрлері көрсетіледі.

**Дайын болғаны.** Демо жинағында 7 әңгіме бар: 5 practice және 2 diagnostic; барлығының мәртебесі `draft`. `npm test`: 72/72. Прототип: <https://tushs328-cmd.github.io/Sauat/> · код: <https://github.com/tushs328-cmd/Sauat>.

**Дәлелденбегені.** Нақты мектеп пилоты мен оқу сауаттылығына әсері тексерілген жоқ; қазақша мәтін сапасын ана тілі иесі растаған жоқ.

**Келесі қадам.** Редакциялық және ана тілі иесінің тексеруінен өтіп, нақты пилот жүргізу және модельді live режимінде қайта тексеру.
