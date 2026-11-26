# Проверка ссылок источников контента

Проверено 26.11.2026 командой `curl.exe -L -sS --max-time 20 -o NUL
-w "%{http_code}" --url URL` из текущего `dev` (HEAD `db3c865`). Проверка
делала GET с переходом по редиректам; `curlExit` — код завершения curl.

Итог: из 24 HTTP(S)-URL в `content/*.json` **21 вернул 200**, 2 вернули 403 и
1 (тестовый fixture) не разрешился (`curlExit 6`, HTTP `000`). Поэтому честный
результат — не все URL отвечают 200. 403 означает отказ конкретного сервера для
этого curl-запроса, а не доказанную несуществующую страницу.

| Файл | source id | HTTP | curlExit | URL |
|---|---|---:|---:|---|
| case_001.json | kazakhstan_travel_issyk_897 | 200 | 0 | <https://kazakhstan.travel/en/attractions/897> |
| case_001.json | ehistory_issyk_kurgans_49 | 200 | 0 | <https://e-history.kz/ru/map/view/49> |
| case_001.json | ehistory_golden_man_10244 | 200 | 0 | <https://e-history.kz/ru/kazakhstanika/show/10244> |
| case_001.json | ehistory_portal_attribution | 200 | 0 | <https://e-history.kz/ru> |
| case_001.json | science_advances_2026_golden_man | 403 | 0 | <https://www.science.org/doi/10.1126/sciadv.aef0108> |
| case_001.json | unesco_silk_roads_6567 | 403 | 0 | <https://whc.unesco.org/en/tentativelists/6567/> |
| case_002.json | nasa_aral_world_of_change | 200 | 0 | <https://science.nasa.gov/earth/earth-observatory/world-of-change/aral-sea/> |
| case_002.json | usgs_aral_main | 200 | 0 | <https://eros.usgs.gov/earthshots/aral-sea-kazakhstan-and-uzbekistan> |
| case_002.json | usgs_kok_aral_dam | 200 | 0 | <https://eros.usgs.gov/earthshots/kok-aral-dam> |
| case_002.json | usgs_aralsk | 200 | 0 | <https://eros.usgs.gov/earthshots/aralsk> |
| case_002.json | kazakhstan_water_ministry_volume_2025 | 200 | 0 | <https://www.gov.kz/org/water/press/news/details/1065233?lang=ru> |
| case_002.json | cawater_north_aral_monitoring_2026 | 200 | 0 | <https://www.cawater-info.net/aral/data/pdf/north_sea_monitoring_september_2026_en.pdf> |
| case_002.json | kazakhstan_water_ministry_plan_2026 | 200 | 0 | <https://www.gov.kz/org/water/press/news/details/1145057?lang=ru> |
| case_003.json | esa_baikonur_cosmodrome | 200 | 0 | <https://www.esa.int/articles/about-us/directorates/science/baikonur-cosmodrome> |
| case_003.json | esa_korolev_baikonur_history | 200 | 0 | <https://www.esa.int/articles/about-us/who-we-are/history/sergei-korolev-father-of-the-soviet-union-s-success-in-space> |
| case_003.json | nasa_rockets_people_r7_1957 | 200 | 0 | <https://www.nasa.gov/wp-content/uploads/2015/04/635963main_rocketspeoplevolume2-ebook.pdf> |
| case_003.json | nasa_sputnik_65_years | 200 | 0 | <https://www.nasa.gov/history/65-years-ago-sputnik-ushers-in-the-space-age/> |
| case_003.json | esa_vostok_1 | 200 | 0 | <https://www.esa.int/articles/about-us/who-we-are/history/the-flight-of-vostok-1> |
| case_003.json | kazcosmos_baikonur_launch_services_current | 200 | 0 | <https://www.gov.kz/org/kazcosmos/activities/801?lang=ru&parentId=5> |
| case_003.json | kazakhstan_russia_1994_baikonur_agreement | 200 | 0 | <https://www.gov.kz/org/mod/documents/details/243792?lang=ru> |
| case_004.json | gov_water_ministry_2025 | 200 | 0 | <https://www.gov.kz/org/water/press/news/details/1032111?lang=ru> |
| case_004.json | gov_water_household_rules | 200 | 0 | <https://www.gov.kz/situations/748/1564> |
| case_005.json | gov_earthquake_almaty_2026 | 200 | 0 | <https://www.gov.kz/org/departament-kkbtu-almaty/press/news/details/1319849?lang=ru> |
| fixture_test.json | fixture-source | 000 | 6 | <https://example.invalid/sauat-fixture> |

`diag_entry_001.json` и `diag_exit_001.json` содержат `urn:sauat:original-text`;
это локальный идентификатор исходного текста, не HTTP-URL, поэтому curl к нему
не применялся. `fixture_test.json` — тестовый файл и не входит в 7 историй demo.
