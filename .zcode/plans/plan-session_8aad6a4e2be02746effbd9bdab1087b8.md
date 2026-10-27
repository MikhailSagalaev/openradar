# GitHub-авторизация для мутаций + точечные security-фиксы

## Решения (зафиксированы)
- **GitHub обязателен везде**: голосовать и добавлять лиды через `/submit` может только пользователь, вошедший через GitHub (админ-токен права голоса не даёт).
- **Воронка статусов** (interesting/applied/in_work/rejected, feedback ±score) — остаётся за админом (это личный пайплайн оператора). Заодно чинит дыру из ревью: сейчас эти мутации открыты при `RADAR_PUBLIC_READ`.
- **Вес голоса**: фиксированный 1.0, один голос на пользователя на сигнал (PK `lead_votes`). Клиентские `weight`/`reputation` из тела запроса удаляются (TASK-D1-формула остаётся в бэклоге до репутационного движка).
- Просмотр, поиск, RSS, `/api/delta` — без изменений; расширение продолжает работать через токен источника (`/api/ingest` не трогаем).
- Новых зависимостей нет — OAuth руками через `fetch`.

## Phase 0 — три точечных фикса (маленькие, уже согласованные)
1. **SSRF в `/api/preview`**: маршрут (src/server/app.ts:1041) переключить на `fetchSafeHttp` из `src/pipeline/preview.ts` (DNS-проверка + ручные редиректы с ревалидацией), HTML дальше парсит существующий `extractPreviewFromHtml` из server/preview.ts.
2. **XML-инъекция в фиде**: в `src/server/feed.ts` экранировать `]]>` в `lead.text` перед CDATA.
3. **Краш poll'а на дубле external_id**: в `insertLead` (src/store/postgres.ts:224) `ON CONFLICT (fingerprint) DO NOTHING` → `ON CONFLICT DO NOTHING` без цели (покрывает и `(source_id, external_id)`); в MemoryStore добавить такую же проверку по external_id (устраняем дрейф).

## Phase 1 — схема и хранилище
- **Миграция `005_github_auth.sql`**: `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE`. Таблицы `app_users`/`lead_votes` уже есть в 002 — переиспользуем.
- **`src/core/store.ts`**: `UserRecord { id, githubId, handle, avatarUrl?, role, createdAt }`; новые методы: `upsertGitHubUser(input)`, `getUserBySession(sessionId)`, `recordUserVote(leadId, userId, signal)` (идемпотентно: `ON CONFLICT DO NOTHING` в `lead_votes`, при повторе возвращает текущие счётчики + `alreadyVoted: true`); `createSession(sessionId, expiresAt, userId?)` — userId опционален (сессии админ-логина без пользователя).
- **PostgresStore**: реализации (upsert по `github_id`, JOIN sessions+app_users, транзакционный recordUserVote с пересчётом через `recalculateVoteScoreAndStatus`).
- **MemoryStore**: зеркальная реализация (Map пользователей, голосов `${userId}:${leadId}:${signal}`, sessions с userId) — без дрейфа, урок из ревью.

## Phase 2 — OAuth-флоу и гейтинг
- **`src/config.ts` + `Env`**: `GITHUB_CLIENT_ID?`, `GITHUB_CLIENT_SECRET?` (optionalString).
- **Новый `src/server/auth.ts`**:
  - `GET /auth/github` → state в HttpOnly-cookie (10 мин) → redirect на `github.com/login/oauth/authorize` (scope `read:user`, redirect_uri из proto+host запроса).
  - `GET /auth/github/callback` → проверка state → обмен code на access_token → `GET api.github.com/user` → `upsertGitHubUser` → `createSession(sessionId, expiresAt, user.id)` → cookie `radar_session` (30 дней, флаги как сейчас) → redirect `/`. Ошибки → `/login?error=...`. Через `runtime.fetchImpl` (тестируемо).
- **`src/server/app.ts`**:
  - Хелпер `currentUser(c, runtime)` через `getUserBySession`.
  - `POST /leads/:id/vote` и `POST /api/leads/:id/vote`: только GitHub-пользователь (иначе форма → redirect `/login`, JSON → 401 `login_required`); вызов `recordUserVote`; вес/репутация из тела удалены.
  - `POST /submit` и `POST /api/submit`: только GitHub-пользователь; `author` = handle пользователя; неавторизованный GET `/submit` показывает страницу с кнопкой входа вместо формы.
  - `POST /leads/:id/status`, `/feedback`, `PATCH /api/leads/:id/status`: `canRead` → `isAdmin`.
  - `GET /login`: кнопка «Войти через GitHub» (если OAuth настроен) + существующая форма токена для админа.

## Phase 3 — UI (src/server/ui.ts)
- В `layout()` и интерфейсы страниц — опциональный `user { handle }`: в шапке справа handle + «Выйти» (для авторизованного) или «Войти» (для гостя).
- Кнопки голосования на `/leads/:id`: для гостя — блок-заглушка «Войдите через GitHub, чтобы голосовать» со ссылкой; счётчики видны всем.

## Phase 4 — тесты (test/server.test.ts + helpers.ts)
- Хелпер `makeUserSession(runtime)` (upsert пользователя + сессия с userId).
- Переписать тест TASK-D1 (без клиентского веса: 401 без логина, 1.0 за голос) и TASK-A1 (голос под user-сессией; повторный голос того же сигнала не меняет счётчики).
- Обновить submit-тест (под user-сессией) и тест статусов (остаётся на админ-сессии).
- Новые: OAuth state/callback с мокнутым `fetchImpl` (мок GitHub API) → сессия + пользователь в базе; голос без логина → 401/redirect.

## Phase 5 — доки и версия
- `.env.example`: `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` + комментарий как создать OAuth App (callback `/auth/github/callback`).
- README: раздел про авторизацию (просмотр публичен, мутации — через GitHub).
- `CHANGELOG.md` + версия 0.3.0 → 0.4.0 (package.json, version.ts).

## Проверка
`pnpm typecheck && pnpm test && pnpm build` — всё зелёное. Коммит не делаю без запроса.