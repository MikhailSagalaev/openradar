# Карьерные сайты: что читаем и что нет

Разбор 155 адресов, где компании публикуют вакансии. Прежде чем подключать сайт, мы проверяем `robots.txt` и читаем настоящую страницу: что сайт закрыл, остаётся закрытым.

Способы по порядку предпочтения:

1. **ATS.** Публичный API системы найма: Greenhouse, Ashby, Lever, Workable, Recruitee, SmartRecruiters, Pinpoint, BambooHR.
2. **Открытый JSON.** Список, из которого сайт рисует страницу. Источник описывается настройками в [src/sources/json-boards.ts](../src/sources/json-boards.ts), без кода.
3. **Карта сайта или страница вакансий.** Читаем вакансии из HTML: [src/sources/career-sites.ts](../src/sources/career-sites.ts).
4. **Лента компании на hh.ru.** Если свой сайт закрыт, а компания публикует вакансии на hh.ru. Свежие 20 вакансий, без обхода чего-либо.
5. **Расширение.** Читает сайт в браузере владельца: тумблер у каждого сайта в разделе сбора заказов. Подходит для сайтов, которые рисуют всё в браузере или отказывают серверу.
6. **Запрос компании.** Если сайт закрыт, просим открытый фид. Обходить запрет мы не будем.

Сайты с проверкой на бота в расширение не входят. Защиту от ботов мы не обходим ни одним из способов.

«Не источник» значит, что по адресу нет вакансий компании: это соцсеть, форма заявки, короткая ссылка или большая доска вроде hh.ru и LinkedIn, которая попала в список из чужой вакансии.

## Читаем (87)

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
| tbank.ru | Лента на hh.ru и расширение |
| career.rwb.ru | Открытый JSON |
| getmatch.ru | Уже читаем |
| job-boards.eu.greenhouse.io | ATS |
| top.co | Расширение: читает страницы в браузере владельца |
| aviasales.ru | Страница вакансий |
| career.avito.com | Карта сайта |
| career.crpt.ru | Карта сайта |
| careers.glovoapp.com | Карта сайта |
| careers.nebius.com | ATS (gh_jid) |
| hr.tutu.ru | Лента компании на hh.ru |
| job.mts.ru | Карта сайта |
| jobboard.agilefluent.ru | Карта сайта |
| justjoin.it | Карта сайта |
| onde.app | Карта сайта |
| trmlabs.com | Подключён через Ashby |
| wise.jobs | Расширение: читает страницы в браузере владельца |
| workwithindies.com | Страница вакансий |
| 12storeez.com | Лента компании на hh.ru |
| acdamate.com | Карта сайта |
| artworkout.app | Карта сайта |
| bellintegrator.ru | Карта сайта |
| career.luxoft.com | Расширение: читает страницы в браузере владельца |
| career.t1.ru | Лента компании на hh.ru |
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
| hr.tochka.com | Лента компании на hh.ru |
| huntflow.ru | Карта сайта |
| ibs.ru | Карта сайта |
| indrive.pinpointhq.com | ATS (pinpoint) |
| inexgroup.bamboohr.com | ATS (bamboohr) |
| infomedijidoo.recruitee.com | ATS (recruitee) |
| intapp.wd1.myworkdayjobs.com | Карта сайта |
| it-one.ru | Открытый JSON |
| jahonschoolhrdepartment.huntflow.io | Карта сайта |
| job.2gis.ru | Карта сайта |
| job.goldapple.ru | Лента компании на hh.ru |
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
| ozon.tech | Лента компании на hh.ru |
| plata.careers | Расширение: читает страницы в браузере владельца |
| pubnub.com | ATS (gh_jid) |
| qbitech.io | Карта сайта |
| rabota.cdek.ru | Страница вакансий |
| rabota.x5.ru | Лента компании на hh.ru |
| room8studio.com | Карта сайта |
| sber2b.huntflow.io | Карта сайта |
| spawnparty.dev | Карта сайта |
| stepico.com | Карта сайта |
| tabby.pinpointhq.com | ATS (pinpoint) |
| team.vk.company | Карта сайта |
| torrero.bamboohr.com | ATS (bamboohr) |
| vacancy.sberhealth.ru | Расширение: читает страницы в браузере владельца |
| welltory.bamboohr.com | ATS (bamboohr) |
| wise-wolves.com | Карта сайта |
| yandex.ru | Страница вакансий |

## Нужен браузерный сборщик (8)

| Сайт | Решение |
|---|---|
| mundfish.com | Заголовок разбит на буквы, название вакансии читается только из адреса. Нужен свой разбор |
| animatedjobs.com | Шаблон без данных. Браузерный сборщик |
| career.mwnts.ru | Браузерный сборщик |
| cherryelectra.com | Браузерный сборщик |
| chillbase.net | В карте только списки. Браузерный сборщик |
| excorp.gg | Браузерный сборщик |
| jobbrowser.me | Браузерный сборщик |
| symfa.com | Браузерный сборщик |

## Закрыто или недоступно (13)

| Сайт | Решение |
|---|---|
| job.alfabank.ru | Настроен, но с нашего сервера сайт недоступен. Выключен на хабе. Следующий кандидат для расширения |
| mojam.co | Настроен, но с нашего сервера сайт недоступен. Выключен на хабе. Следующий кандидат для расширения |
| jobs.micro1.ai | Сайт отвечает 403. Проверить в браузере и добавить в расширение |
| people-andersenlab.com | robots.txt закрывает вакансии, на hh.ru страницы нет. Написать компании |
| ai-trainers.ya.ru | Вакансии Яндекса: читаем через yandex.ru/jobs |
| akvelon-bdc.peopleforce.io | robots.txt закрывает вакансии. Написать компании |
| alfabank.ru | Вакансии читаем с job.alfabank.ru |
| careers.versus.trade | Сайт отвечает 403. Проверить в браузере и добавить в расширение |
| dodoteam.ru | robots.txt закрывает вакансии, страницу на hh.ru найти не удалось. Написать компании |
| ecc.kz | Сайт компании без раздела вакансий |
| nitec.kz | Сайт компании без раздела вакансий |
| redcore.group | Сайт отвечает 403. Проверить в браузере и добавить в расширение |
| sberdevices.ru | Вакансии публикует Сбер: читаем через rabota.sber.ru |

## Нужен адаптер или другой адрес (31)

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
