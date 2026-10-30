# openradar

<p align="right"><a href="README.md">English</a> · <b>Русский</b></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-black.png">
    <img alt="openradar" src="assets/logo-black.png" width="360">
  </picture>
</p>

<p align="center">
  <a href="https://openradar.fun"><img src="https://img.shields.io/badge/live-openradar.fun-10b981.svg" alt="Хаб: openradar.fun"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="Лицензия: AGPL v3"></a>
  <a href="docs/PROTOCOL.md"><img src="https://img.shields.io/badge/protocol-radar%2F2-purple.svg" alt="Протокол: radar/2"></a>
</p>

openradar — открытая база вакансий и заказов для фрилансеров. Парсеры, узлы и люди добавляют посты с бирж, из RSS-лент, Telegram-каналов и почтовых рассылок; хаб склеивает дубли и держит одну чистую ленту.

Человек, который ищет работу, не должен платить за подписку на парсер или за отклик на вакансию. У openradar нет платного тарифа: контакты — в посте, заказчику вы пишете напрямую. Свою копию может запустить любой.

**Хаб:** [openradar.fun](https://openradar.fun) · **Хотите помочь?** Начните с [CONTRIBUTING.md](CONTRIBUTING.md): одна биржа — один адаптер — один pull request.

<p align="center">
  <a href="https://openradar.fun"><img alt="Лента openradar.fun" src="docs/screenshots/hub.jpg" width="800"></a>
</p>

## Что умеет

- **Одна лента по всем профессиям.** FL.ru, Kwork, Freelancehunt, Хабр Карьера, hh.ru, Работа России, We Work Remotely, Jobicy, RemoteOK, ATS-доски компаний и Telegram-каналы (публичные — как есть, закрытые каналы и чаты — через ваш аккаунт): разработка, дизайн, видео, тексты, реклама, продажи и другое. Пост, замеченный на двух площадках, — один заказ.
- **Поиск, фильтры и рейтинг.** Бюджет от, навык, только удалёнка, язык. Лента открывается лучшими свежими заказами (рейтинг, который снижается с возрастом поста); «сначала новые» и «сначала дорогие» — в один клик. У каждого заказа рейтинг 0–100: оплата, навыки, подробность, прямой контакт. Если зарплата вакансии намного ниже обычной для такой работы, вместо суммы видно «зарплату проверить».
- **Расширение для браузера.** Один раз войдите через GitHub — и добавляйте вакансию или заказ с любого сайта в один клик. Расширение показывает, сколько обычно платят за похожую работу и где на этом фоне сумма на странице.
- **Голоса и публикации.** После входа можно отмечать заказы как полезные, мусор, мошенничество или закрытые и добавлять посты по ссылке.
- **Исследование рынка.** [openradar.fun/research](https://openradar.fun/research): зарплаты в вакансиях и бюджеты заказов по ролям, грейдам, языку, городам и навыкам — медианы, квартили, размер выборки. Месячные отчёты замораживаются, чтобы их можно было цитировать; данные открыты по CC BY 4.0 (CSV и JSON). Как считаем: [методология](https://openradar.fun/research/methodology).
- **RSS по любому запросу**, HTTP API и MCP-сервер над той же лентой.
- **Свой узел.** Запустите дома или на сервере, подключите свои источники, фильтры и уведомления (Telegram, вебхук). Пока вы не поделились источником, ничего не уходит с узла.

## Сеть

Узлы и парсеры могут отправлять посты в общий хаб. Каждый пост подписан ключом участника. Хаб склеивает один и тот же пост, увиденный в разных местах, засчитывает его тому, кто увидел первым, и понижает вес мусора и мошенничества по голосам и рейтингу сообщивших.

Кто приносит заказы, видит ленту раньше:

| Уровень | Как получить | Задержка | Контакты |
| --- | --- | --- | --- |
| Гость | без входа | 12 ч | скрыты |
| Участник | вход через GitHub или рейтинг от 1 | 3 ч | видны |
| Активный | рейтинг от 10 за 30 дней | 30 мин | видны |
| Ядро | рейтинг от 50 или модератор | нет | видны |

На сайте рейтинг участника показан очками (×10). Он складывается из подтверждённых заказов, которые вы увидели первым (×1,5 за закрытые каналы и за 6 часов эксклюзива), подтверждений и сигналов, совпавших с итогом; заказы, скрытые как мусор или мошенничество, отнимают очки. Подробно: [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Быстрый старт

Нужны Node.js 22.19+ и pnpm 11+:

```bash
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar
pnpm install
pnpm dev serve
```

`serve` выведет одноразовый токен администратора. Откройте `http://127.0.0.1:8787`, войдите с ним, зайдите в **Источники** → **Каталог площадок** и подключите биржи по одной или все сразу (**Подключить все**): они сразу опрашиваются, первые заказы появятся через несколько секунд.

Без `DATABASE_URL` узел держит всё в памяти. Для постоянного узла нужен PostgreSQL 17 через Docker:

```bash
pnpm init:env           # создаст .env со случайными секретами
docker compose run --rm radar migrate
docker compose up -d
```

`pnpm init:env` не перезаписывает существующий `.env`. Если копируете `.env.example` вручную, замените в нём секреты: с примерами `docker compose` не запустится.

Пошаговые сценарии — читать хаб, свой узел, свой сервер, парсер, обмен с хабом: [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

## Подключить парсер

Любой скрипт (Telethon для закрытых каналов, Playwright-скрейпер, задача по cron) может отправлять посты в узел:

```bash
pnpm dev source add --kind webhook --title "Мой парсер"   # выведет id источника и токен
python my_parser.py | pnpm dev push --source <id>         # NDJSON, один пост на строку
# или по HTTP: POST /api/v2/ingest/<id> с заголовком x-radar-token
```

Или сразу в хаб через Python SDK (только стандартная библиотека, есть помощники для Telethon и Pyrogram):

```bash
pip install "git+https://github.com/MikhailSagalaev/openradar#subdirectory=sdk/python"
```

```python
import os
from openradar import HubClient, Key

hub = HubClient("https://openradar.fun", Key.from_string(os.environ["RADAR_KEY"]))
hub.observe([{"source": {"platform": "telegram", "channel": "-1001234567890", "visibility": "private", "message_id": "48213"},
              "text": "Ищем React-разработчика..."}])
```

`RADAR_KEY` — ваш ключ участника (`pnpm dev key`), к нему привязан рейтинг. TypeScript-пакет экспортирует те же `HubClient` и `NodeClient`.

## Документация

| Документ | Что внутри |
| --- | --- |
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | Сценарии: читать хаб, свой узел, сервер, парсер, обмен с хабом |
| [PROTOCOL.md](docs/PROTOCOL.md) | radar/2: посты, подписи, склейка, уровни, рейтинг, модерация |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Конвейер узла, рейтинг заказа, модель данных, HTTP-маршруты |
| [PLUGINS.md](docs/PLUGINS.md) | Как написать адаптер источника или получателя |
| [EXTENSION.md](docs/EXTENSION.md) | Расширение для браузера и оценка рынка |
| [BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Резервные копии |
| [sdk/python](sdk/python/README.md) | Python SDK |

## Как помочь

Самый полезный вклад — новая биржа: один адаптер, одна фикстура, один тест. Заготовку создаёт `pnpm new:connector`. Правила — в [CONTRIBUTING.md](CONTRIBUTING.md), нормы общения — в [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Об уязвимостях сообщайте закрыто: [SECURITY.md](SECURITY.md).

## Лицензия

AGPL-3.0. См. [LICENSE](LICENSE).
