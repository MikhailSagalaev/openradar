# Contributing to OpenRadar / Руководство контрибьютора

[English](#english) | [Русский](#русский)

---

<a name="english"></a>
## English

OpenRadar is an open-source decentralized liquidity protocol for jobs (`job`) and gigs (`gig`) curated by community intelligence and free of paywalls, spam, and paid application fees.

The bar for a useful contribution is straightforward: **one working adapter, one fixture, one test**.

### Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar

# 2. Install dependencies
pnpm install

# 3. Verify baseline tests and TypeScript types
pnpm test
pnpm typecheck
```

Node.js 22+ and pnpm 11 are required. The test suite uses an in-memory store by default and never calls the network in unit tests: adapters are strictly tested against sanitized fixtures.

### Adding a New Source Connector in 15 Minutes

We provide a built-in CLI scaffolding generator:

#### Step 1: Run the generator
```bash
pnpm new:connector <source_name>
```
*Example:* `pnpm new:connector remotejobs`

This automatically generates:
1. `src/sources/<source_name>.ts` — Clean boilerplate implementing `SourceAdapter`.
2. `test/fixtures/<source_name>.json` — Sample sanitized response fixture.
3. `test/sources/<source_name>.test.ts` — Ready-to-run vitest unit test.

#### Step 2: Implement extraction & security rules
In `src/sources/<source_name>.ts`:
- Validate all outgoing URLs via `assertSafeUrl(url)` from `src/core/ssrf.ts` to prevent SSRF against private subnets.
- Extract structured fields: `title`, `text`, `url`, `budget`, `currency`, `skills`, `city`, `isRemote`.
- Set lead `type`: `'job'` (permanent employment) or `'gig'` (freelance / contract task).
- Keep the text as published, contacts included: the server extracts contacts into a structured field and hides them from guests at read time.

#### Step 3: Verify and open a Pull Request
```bash
pnpm test
pnpm typecheck
```
Submit your Pull Request with a clear title and description of the source board.

### Architectural Invariants
- **Zero-Emoji Doctrine:** Strictly no emojis in code, logs, comments, UI, or commit messages.
- **Zero-Regression:** All existing tests must remain 100% green.
- **Strict TypeScript:** Zero `any` where avoidable, 0 errors on `tsc --noEmit`.

---

<a name="русский"></a>
## Русский

OpenRadar — это открытый децентрализованный протокол для свободного обмена вакансиями и заказами без пейволлов и комиссий за отклики.

Мы приветствуем любые улучшения: новые коннекторы к доскам объявлений, улучшения Web-of-Trust и оптимизации алгоритмов.

### Быстрый старт

```bash
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar
pnpm install
pnpm test
pnpm typecheck
```

### Добавление нового источника за 15 минут

```bash
# 1. Генерация каркаса нового коннектора
pnpm new:connector <source_name>
```

Это создаст:
- `src/sources/<source_name>.ts` — код адаптера.
- `test/fixtures/<source_name>.json` — фикстуру ответа сервиса.
- `test/sources/<source_name>.test.ts` — готовый юнит-тест.

Обязательные требования:
1. Валидация адресов через `assertSafeUrl` (защита от SSRF).
2. Текст передаётся как есть, вместе с контактами: сервер сам выделяет контакты и скрывает их от гостей.
3. 100% прохождение тестов (`pnpm test`) без внешних сетевых вызовов в тестах.
4. Полное отсутствие эмодзи в коде и коммитах.
