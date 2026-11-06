# Карьерные сайты: что читаем и что нет

Разбор 155 адресов, где компании публикуют вакансии. Прежде чем подключать сайт, мы проверяем `robots.txt` и читаем настоящую страницу: что сайт закрыл, остаётся закрытым.

Способы по порядку предпочтения:

1. **ATS.** Публичный API системы найма: Greenhouse, Ashby, Lever, Workable, Recruitee, SmartRecruiters, Pinpoint, BambooHR.
2. **Открытый JSON.** Список, из которого сайт рисует страницу. Источник описывается настройками в [src/sources/json-boards.ts](../src/sources/json-boards.ts), без кода.
3. **Карта сайта или страница вакансий.** Читаем вакансии из HTML: [src/sources/career-sites.ts](../src/sources/career-sites.ts).
4. **Браузерный сборщик.** Для сайтов, которые рисуют всё в браузере. Пока не сделан: см. раздел ниже.
5. **Запрос компании.** Если сайт закрыт, просим открытый фид. Обходить запрет мы не будем.

## Браузерный сборщик

Сайтов, где нужен настоящий браузер, немного. Два пути:

- **Расширение участника.** Оно уже читает доски заказов и видит страницу так же, как человек. Это дешевле всего и подходит для сайтов, отвечающих серверу отказом, если они не запрещают такое чтение.
- **Отдельный Playwright.** Отдельный процесс с очередью, одна вкладка за раз, только страницы, разрешённые `robots.txt`. На сервере он займёт сотни мегабайт памяти, поэтому его стоит заводить, когда таких сайтов наберётся больше.

Защиту от ботов мы не обходим ни одним из способов.

## Читаем (74)

| Сайт | Решение |
|---|---|
| jobs.ashbyhq.com | ATS |
| job-boards.greenhouse.io | ATS |
| rabota.sber.ru | Открытый JSON |
| apply.workable.com | ATS |
| azurgames.com | Страница вакансий |
| geekjob.ru | Уже читаем |
| team.rt-solar.ru | Страница вакансий |
| jobs.lever.co | ATS |
| career.rwb.ru | Открытый JSON |
| getmatch.ru | Уже читаем |
| job-boards.eu.greenhouse.io | ATS |
| aviasales.ru | Страница вакансий |
| career.avito.com | Карта сайта |
| career.crpt.ru | Карта сайта |
| careers.glovoapp.com | Карта сайта |
| careers.nebius.com | ATS (gh_jid) |
| job.mts.ru | Карта сайта |
| jobboard.agilefluent.ru | Карта сайта |
| justjoin.it | Карта сайта |
| onde.app | Карта сайта |
| trmlabs.com | Подключён через Ashby |
| workwithindies.com | Страница вакансий |
| acdamate.com | Карта сайта |
| artworkout.app | Карта сайта |
| bellintegrator.ru | Карта сайта |
| careers.croc.ru | Страница вакансий |
| careers.hhhub.eu | Карта сайта |
| careers.kaspersky.ru | Страница вакансий |
| careers.replika.com | Карта сайта |
| careers.snappymob.com | Карта сайта |
| careers.yadro.com | Карта сайта |
| careersemea.smbcgroup.com | Карта сайта |
| choicy.work | Карта сайта |
| coinbase.com | ATS (gh_jid) |
| crowdstrike.wd5.myworkdayjobs.com | Карта сайта |
| databricks.com | ATS (gh_jid) |
| fin.dev | Карта сайта |
| fivetran.com | ATS (gh_jid) |
| harvey.ai | Подключён через Ashby |
| hr.novakidschool.com | Карта сайта |
| huntflow.ru | Карта сайта |
| ibs.ru | Карта сайта |
| indrive.pinpointhq.com | ATS (pinpoint) |
| inexgroup.bamboohr.com | ATS (bamboohr) |
| infomedijidoo.recruitee.com | ATS (recruitee) |
| intapp.wd1.myworkdayjobs.com | Карта сайта |
| it-one.ru | Открытый JSON |
| jahonschoolhrdepartment.huntflow.io | Карта сайта |
| job.2gis.ru | Карта сайта |
| jobs.bonapolia.com | Карта сайта |
| jobs.eu.lever.co | ATS, доска сейчас пуста |
| jobs.foxford.ru | Страница вакансий |
| jobs.simple.life | Карта сайта |
| jobs.smartrecruiters.com | ATS |
| karta.huntflow.io | Карта сайта |
| magnit.tech | Открытый JSON |
| mayflower.recruitee.com | ATS (recruitee) |
| mu.se | Карта сайта |
| nekki.com | Карта сайта |
| nobordersabroad.com | Карта сайта |
| nobrakesgames.com | Карта сайта |
| pubnub.com | ATS (gh_jid) |
| qbitech.io | Карта сайта |
| rabota.cdek.ru | Страница вакансий |
| room8studio.com | Карта сайта |
| sber2b.huntflow.io | Карта сайта |
| spawnparty.dev | Карта сайта |
| stepico.com | Карта сайта |
| tabby.pinpointhq.com | ATS (pinpoint) |
| team.vk.company | Карта сайта |
| torrero.bamboohr.com | ATS (bamboohr) |
| welltory.bamboohr.com | ATS (bamboohr) |
| wise-wolves.com | Карта сайта |
| yandex.ru | Страница вакансий |

## Нужен браузерный сборщик (12)

| Сайт | Решение |
|---|---|
| top.co | Браузерный сборщик |
| animatedjobs.com | Шаблон без данных. Браузерный сборщик |
| career.mwnts.ru | Браузерный сборщик |
| career.t1.ru | Список рисует браузер, запросов к API на странице нет. Браузерный сборщик |
| cherryelectra.com | Браузерный сборщик |
| chillbase.net | В карте только списки. Браузерный сборщик |
| excorp.gg | Браузерный сборщик |
| jobbrowser.me | Браузерный сборщик |
| mundfish.com | Браузерный сборщик |
| plata.careers | SPA без данных в HTML. Браузерный сборщик |
| symfa.com | Браузерный сборщик |
| vacancy.sberhealth.ru | Next.js без данных в HTML. Браузерный сборщик |

## Закрыто или недоступно (21)

| Сайт | Решение |
|---|---|
| job.alfabank.ru | Настроен, но с нашего сервера сайт недоступен. Выключен на хабе, на другом узле может работать |
| mojam.co | Настроен, но с нашего сервера сайт недоступен. Выключен на хабе, на другом узле может работать |
| tbank.ru | Сервер не достаёт сайт, страницы рисует браузер. Читать из браузера участника |
| hr.tutu.ru | robots.txt закрывает вакансии. Запросить фид у компании |
| jobs.micro1.ai | Сайт отвечает 403 |
| people-andersenlab.com | robots.txt закрывает вакансии. Запросить фид у компании |
| wise.jobs | Сайт отвечает нашему серверу 403. Читать только из браузера участника |
| 12storeez.com | Сайт отвечает 403 |
| ai-trainers.ya.ru | Сайт не ответил |
| akvelon-bdc.peopleforce.io | robots.txt закрывает вакансии. Запросить фид у компании |
| alfabank.ru | Сайт отвечает 403. Вакансии уже читаем с job.alfabank.ru |
| career.luxoft.com | Сайт отвечает нашему серверу 403. Читать только из браузера участника |
| careers.versus.trade | Сайт отвечает 403 |
| dodoteam.ru | robots.txt закрывает вакансии. Запросить фид у компании |
| ecc.kz | Сайт не ответил |
| job.goldapple.ru | Сайт отвечает 503 на запрос без браузера |
| nitec.kz | Сайт не ответил |
| ozon.tech | Сайт не ответил. Проверить из браузера, затем искать API |
| rabota.x5.ru | API закрыт в robots.txt, в карте нет вакансий. Запросить фид у компании |
| redcore.group | Сайт отвечает 403 |
| sberdevices.ru | Сайт не ответил. Проверить из браузера, затем искать API |

## Нужен адаптер или другой адрес (32)

| Сайт | Решение |
|---|---|
| relocate.me | Доска релокации: в карте нет вакансий, нужен список |
| smartcat.com | Greenhouse встроен в страницу, адрес доски не подобран |
| tobspr.jobs.personio.de | Personio: доска закрыта |
| aina-tech.io | Нет вакансий в карте сайта и в HTML списка. Проверить вручную |
| budu.jobs | На главной 4 вакансии, адаптер пока не окупится |
| careers.vinted.com | Greenhouse встроен в страницу, адрес доски не подобран |
| changellenge.com | Стажировки: в карте только события |
| dsml.kz | Сообщество Казахстана: адреса /j/, нужен список |
| ingamejob.com | Доска геймдева: в карте только разделы, нужен список |
| careers-page.com | Manatal: нужен адаптер, 1 компания |
| cast.ai | Greenhouse встроен в страницу, адрес доски не подобран |
| comeet.com | Comeet: нужен адаптер, 1 компания |
| crowncoinscasino.com | Нет страницы вакансий |
| eqvilent.com | Greenhouse встроен в страницу, адрес доски не подобран |
| exness-careers.com | Greenhouse встроен в страницу, адрес доски не подобран |
| hire.kg | Доска Кыргызстана: нужна другая карта сайта |
| hr.tochka.com | Нет вакансий в карте сайта и в HTML списка. Проверить вручную |
| koppla.jobs.personio.de | Personio: XML-лента, 2 вакансии, адаптер пока не окупится |
| lego.com | robots.txt закрывает раздел |
| mframe.team | Нет страницы вакансий |
| playrix.com | Открытый POST job/getList. Нужно подобрать параметры запроса |
| positions.careers-hfm.com | Zoho Recruit: нужен адаптер, 1 компания |
| ru.ingamejob.com | Доска геймдева: в карте только разделы, нужен список |
| start.avito.ru | Разовые программы, не вакансии |
| streamsolutions.kz | Нет страницы вакансий |
| teamascend.applytojob.com | JazzHR: в ленте чужие компании, не берём |
| tether.recruitee.com | Нет вакансий в карте сайта и в HTML списка. Проверить вручную |
| thehub.io | Доска стартапов: в карте только подборки, нужен API |
| usetech.ru | Страница списка не найдена, проверить адрес |
| wd3.myworkdaysite.com | Workday: адаптер по образцу двух уже читаемых сайтов |
| work.co.il | Доска Израиля, не наш рынок |
| workforcenow.adp.com | ADP: нужен адаптер, 1 компания |

## Не источник (16)

| Сайт | Решение |
|---|---|
| spb.hh.ru | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| hh.uz | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| teletype.in | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| tgrhkbrtohbr.io | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| x.com | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| cjl.ist | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| clck.ru | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| es.linkedin.com | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| forms.yandex.ru | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| hh.kz | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| instagram.com | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| kazan.hh.ru | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| openradar.fun | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| radar.mellow.io | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| tally.so | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
| uk.linkedin.com | Не источник: соцсеть, форма, короткая ссылка или доска, которую читаем отдельно |
