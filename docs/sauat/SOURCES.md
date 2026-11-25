# Проверенные поиском референсы и источники
Дата поиска: 25.11.2026. Код сторонних проектов не скачивался, не запускался, не проверялся построчно. Перед использованием сверить LICENSE конкретной версии, регламент хакатона, права на контент и ассеты. Не импортировать целый чужой продукт как собственный. В документах сдачи раскрывать библиотеки, референсы и ИИ.

## Игровые продукты — изучать UX, не копировать оформление
| Ресурс | Что брать | Что не брать |
|---|---|---|
| [Duolingo Adventures](https://blog.duolingo.com/adventures/) | короткие игровые ситуации и сюжетное погружение | бренд, персонажей, готовые уроки |
| [CommonLit Guided Reading](https://support.commonlit.org/article/459-what-is-guided-reading-mode-how-can-i-enable-it) | вопросы по ходу текста | чужие учебные материалы без разрешения |
| [H5P Branching Scenario](https://h5p.org/branching-scenario) / [код](https://github.com/h5p/h5p-branching-scenario) | интерактивное повествование, структура сценария | интеграцию всего H5P за 2 дня |
| [Twine](https://www.twinery.org/) / [ink](https://github.com/inkle/ink) (MIT для ink) | структура интерактивной истории | отдельный сложный runtime, если JSON достаточно |
| [Kolibri](https://github.com/learningequality/kolibri) (MIT) | офлайн-пакеты и локальная доступность | всю платформу и сервер |
| [Duolingo Clone — Code With Antonio](https://github.com/code-with-antonio/nextjs-duolingo-clone) | примеры карты уроков, прогресс, компонентная структура | готовый проект целиком, платёжные модули, бренд, ассеты; проверить LICENSE перед reuse |
| [Duolingo-inspired React/Ionic](https://github.com/Jayrajrodage/Duolingo-clone) (MIT заявлена) | альтернативный пример мобильного UI | Supabase/Capacitor без необходимости |

## Библиотеки — реальные кандидаты для MVP
| Код / документация | Применение | Лицензия/заметка |
|---|---|---|
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) / [React guide](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/docs/frameworks/react.md) | precache, service worker, offlineReady | MIT, проверить Node compatibility |
| [Dexie](https://github.com/dexie/Dexie.js/) | IndexedDB, локальный прогресс | Apache-2.0 |
| [Lucide](https://github.com/lucide-icons/lucide) | иконки | ISC; сохранить notices |
| [Ollama structured outputs](https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx) | JSON Schema и выбор ID | проверить совместимость модели |
| [Playwright BrowserContext](https://playwright.dev/docs/api/class-browsercontext) | setOffline, тесты браузера | документация |

Рекомендация: vite-plugin-pwa + Dexie (либо уже имеющееся хранилище) + Lucide; собственный простой JSON-движок. Не добавлять ink/Twine/H5P/Kolibri одновременно. Не использовать случайный «клон Duolingo» как базу, если он добавит авторизацию и тяжёлый backend.

## Контент и доказательства
| Тема | Источник | Идея миссии |
|---|---|---|
| Золотой человек | [Kazakhstan.travel — музей Иссык](https://kazakhstan.travel/en/attractions/897) | отличить факт находки от гипотезы о личности |
| Арал | [NASA Earth Observatory](https://science.nasa.gov/earth/earth-observatory/world-of-change/aral-sea/) и [USGS](https://eros.usgs.gov/earthshots/aral-sea-kazakhstan-and-uzbekistan) | сопоставить наблюдения, вывести причину |
| Байконур | [ESA](https://www.esa.int/articles/about-us/directorates/science/baikonur-cosmodrome) | сопоставить утверждение с историческим источником |
| Таңбалы (P1) | [UNESCO](https://whc.unesco.org/en/decisions/112), [Archaeology.kz](https://archaeology.kz/en/heritages/66-tanbaly-tamgaly-petroglifteri) | различать наблюдение и интерпретацию |
| PISA | [OECD — Казахстан RU](https://www.oecd.org/ru/publications/pisa-2025-results-volume-i_e70a9cc9-ru/7d50ea0b-ru.html), [EN](https://www.oecd.org/en/publications/pisa-2025-results-volume-i-country-notes_2d4ff9ea-en/kazakhstan_c01ae9c9-en.html) | 36% достигли уровня 2+ по чтению |
| Методика | [EEF Reading comprehension strategies](https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit/reading-comprehension-strategies/) | стратегии понимания текста, не доказательство эффективности приложения |

Для каждого реального утверждения в истории фиксировать конкретный источник. Пересказывать своими словами, не копировать длинные тексты. Фото даже с открытого сайта не обязательно свободны: проверять лицензию каждого файла, автора и attribution; при сомнении делать оригинальное изображение с маркировкой. Не использовать AI-иллюстрацию как подлинный исторический документ.
