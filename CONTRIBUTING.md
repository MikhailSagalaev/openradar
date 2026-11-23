# Contributing

[English](#english) · [Русский](#русский)

## English

The most useful contribution is a new board: one adapter, one fixture, one test. Bug reports with a reproduction and fixes are welcome too.

### Setup

```bash
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar
pnpm install
pnpm verify   # lint, version lock, typecheck, build, tests, Python SDK — the same gates as CI
```

Node.js 22.19+ (CI tests 22 and 24 LTS), pnpm 12+ and Python 3 (for the SDK tests). `pnpm verify` runs `pnpm lint`, `node scripts/check-version.js`, `pnpm typecheck`, `pnpm build`, `pnpm test` and `pnpm test:python`; tests run in `Europe/Moscow` time locally as in CI. Tests use an in-memory store and never call the network; adapters are tested against saved fixtures. `RADAR_TEST_STORE=postgres DATABASE_URL=... pnpm test` runs the same suite on PostgreSQL.

### Adding a source

```bash
pnpm new:connector <name>
```

This creates `src/sources/<name>.ts`, a fixture in `test/fixtures/` and a test in `test/sources/`. Then:

- fetch only the URL from the source config, with `ctx.fetchImpl`, `ctx.timeoutMs` and `ctx.userAgent`;
- fill `title`, `text`, `url` and, when the board has them, `budget`, `currency`, `skills`, `city`, `isRemote`; set `type` to `job` (employment) or `gig` (an order);
- keep the text as published, contacts included: the server extracts them and hides them from guests;
- never bypass a login, a CAPTCHA or a paywall; if a board needs an account, use a webhook source and a parser on your side;
- register the adapter in `src/sources/index.ts` and, if it is a good default, add a preset to `src/sources/presets.ts`.

Rules for adapters and sinks: [docs/PLUGINS.md](docs/PLUGINS.md).

### Pull requests

- `pnpm verify` passes (lint, version lock, typecheck, build, tests, Python SDK).
- One change per pull request, with a short description of what and why.
- Add or update a test for any behaviour change.
- Update the docs and `CHANGELOG.md` when users or operators will notice the change.

## Русский

Самый полезный вклад — новая площадка: один адаптер, одна фикстура, один тест. Также приветствуются баг-репорты с шагами воспроизведения и исправления.

```bash
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar
pnpm install
pnpm verify   # lint, проверка версий, типы, сборка, тесты, Python SDK — те же проверки, что в CI
```

Новый источник: `pnpm new:connector <имя>` создаст адаптер в `src/sources/`, фикстуру и тест. Адаптер берёт только адрес из настроек источника, отдаёт текст как есть вместе с контактами (сервер сам скрывает их от гостей) и не обходит вход, капчу и платный доступ. Подробные правила — в [docs/PLUGINS.md](docs/PLUGINS.md).

Нужны Node.js 22.19+ (CI проверяет 22 и 24 LTS), pnpm 12+ и Python 3. Перед пул-реквестом: `pnpm verify` проходит (lint, версии, типы, сборка, тесты, Python SDK), на изменение поведения есть тест, документация и `CHANGELOG.md` обновлены.
