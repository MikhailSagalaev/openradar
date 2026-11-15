# Plan 010: Close the five security gaps (extension hijack, author spoofing, GET logout, proxy-header trust, cookie Secure)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 260a650..HEAD -- extension/manifest.json extension/connected.js extension/popup.js src/server/app.ts src/server/auth.ts src/server/ratelimit.ts src/server/ui.ts src/config.ts test/server.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `260a650`, 2026-11-11

## Why this matters

A defensive audit verified five gaps, all present on v0.67.0:
1. **Extension account hijack (top issue)**: `connected.html` is a web-accessible resource for every site, and it writes `token`/`base`/`handle` from the URL fragment into `chrome.storage.local` with no origin check and no flow-bound nonce. Any page the victim visits can silently replace the stored account; all later submissions (page titles, selected text, URLs) then go to the attacker's server carrying the victim's `ext_` token.
2. **Author spoofing**: the authenticated web submit paths accept `author` from the request body, so a signed-in user can attribute a lead to anyone. The extension route already does it right (`delete body.author`).
3. **GET /logout** mutates state (deletes the session) but the CSRF gate only checks POST/PATCH/DELETE; `SameSite=Lax` still sends the cookie on top-level cross-site GET → any site can force-logout the admin.
4. **Rate-limit key from a spoofable header**: the bucket key is the last `X-Forwarded-For` entry with no trusted-proxy boundary. If Node is reachable directly, an attacker rotates the header to defeat the admin-token brute-force limiter.
5. **Cookie `Secure` and public base URL from request headers**: behind a proxy that omits `x-forwarded-proto`, session cookies are issued without `Secure`; with `RADAR_PUBLIC_URL` unset, a poisoned `Host` influences the OAuth/extension base.

Verified sound (do NOT re-audit or "harden" these): SSRF guards, session crypto (HKDF/GCM/AAD), BIP-340 + NIP-98 replay store, parameterized SQL, HTML/RSS escaping, SHA-256 token hashing, timing-safe comparisons, admin/user session separation. The localhost CSRF allowance (`sameOrigin`) was ALREADY fixed upstream — it only applies when the request's own Host is loopback. Leave it alone.

## Current state

- `extension/manifest.json:56–65` — `web_accessible_resources`: `connected.html`, matches `https://*/*` and `http://*/*`.
- `extension/connected.js` (whole file, 24 lines): reads `location.hash` params, checks only `token.startsWith('ext_')` and `/^https?:\/\//.test(base)`, then `chrome.storage.local.set({ radarAccount: { token, handle, base } })`.
- `extension/popup.js:388–393` — starts the flow:

```js
  const back = chrome.runtime.getURL('connected.html');
  await chrome.tabs.create({ url: `${base}/extension/connect?redirect_uri=${encodeURIComponent(back)}` });
```

- `src/server/app.ts:2821` — `EXTENSION_REDIRECT_RE` allows `https://<32 a-p chars>.chromiumapp.org/…` or `chrome-extension://<32 a-p chars>/connected.html`.
- `src/server/app.ts:2836–2858` — GET `/extension/connect` (consent page via `renderExtensionConnectPage`, `src/server/ui.ts:4532`) and POST (issues `ext_` token, redirects `${redirectUri}#token=…&handle=…&base=…`). The POST form carries only `redirect_uri` (`ui.ts:4548–4550`).
- `src/server/app.ts:1866` — form submit: `author: author || user.handle` (author parsed at 1836). `src/server/app.ts:2778` — `submitForUser`: `author: asString(body.author) || user.handle`. Correct counter-example at 2886: `delete body.author;` (extension route).
- `src/server/app.ts:1164–1171` — `app.get('/logout', …)` deletes the session, clears the cookie, redirects `/login`. CSRF middleware at ~980–993 checks only POST/PATCH/DELETE. UI link: `src/server/ui.ts:2299` `<a class="user-menu-link danger" href="/logout">…`.
- `src/server/ratelimit.ts:34–38`:

```ts
    // Our nginx APPENDS the real client IP to X-Forwarded-For, so the LAST
    // value is the only one the client cannot spoof by sending its own header.
    const forwardedParts = c.req.header('x-forwarded-for')?.split(',').map((p) => p.trim()).filter(Boolean) ?? [];
    const client = options.keyFrom?.(c) || forwardedParts[forwardedParts.length - 1] || c.req.header('x-real-ip') || 'local';
```

  Consumers: admin login `app.ts:1141` (10/15min), submit, ingest, public GETs. Tests send `x-forwarded-for` directly (`test/server.test.ts:119,130,140,434,448`) — they rely on the header being honored in tests.
- `src/server/auth.ts:16–26` — `baseUrlOf` (RADAR_PUBLIC_URL → else Host+x-forwarded-proto) and `secureCookie(c)` = header check only. `src/server/app.ts:421–427` — `publicBaseUrl` same pattern; `app.ts:1157` — session cookie `secure: c.req.header('x-forwarded-proto') === 'https'`.
- `src/config.ts` — zod env schema; `NODE_ENV` exists; add new optional vars here. `.env.example` documents deployment vars.
- Conventions: `AGENTS.md` §2 (no inline `<script>` violating CSP — `test/inline-scripts.test.ts`, `test/hardening.test.ts`); extension files are plain JS tested via `// @ts-ignore` imports (`test/extension.test.ts`); server tests use `makeTestRuntime`/`makeUserSession` (`test/helpers.ts`), extension connect flow test at `test/server.test.ts:926–985`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm typecheck`         | exit 0, no errors   |
| Tests     | `pnpm test`              | all pass (baseline: 82 files, 690 tests) |
| Focused   | `pnpm test -- server extension hardening inline-scripts` | all pass |
| Pack ext  | `pnpm pack:extension`    | exit 0 (manifest stays valid) |

## Scope

**In scope** (the only files you should modify):
- `extension/manifest.json`, `extension/connected.js`, `extension/popup.js`
- `src/server/app.ts` (author lines, logout route, connect flow nonce, cookie secure)
- `src/server/auth.ts` (`secureCookie`, `baseUrlOf`)
- `src/server/ratelimit.ts`
- `src/server/ui.ts` (logout form, connect-page hidden state field ONLY)
- `src/config.ts`, `.env.example` (new `RADAR_TRUSTED_PROXY` var)
- `test/server.test.ts`, `test/extension.test.ts`, `test/hardening.test.ts` (only if a CSP assertion needs the new form)

**Out of scope** (do NOT touch):
- `sameOrigin` / the CSRF middleware's localhost logic — already correct upstream.
- `src/core/ssrf.ts`, `src/core/crypto-session.ts`, `src/net/protocol.ts` — verified sound.
- `extension/background.js`, `extension/collector.js` — they read `radarAccount`; the storage shape stays `{ token, handle, base }`.
- Sink adapters, store modules, MCP server.

## Git workflow

- Branch: `advisor/010-security-gaps`
- One commit per finding: `fix(extension): bind the connect handshake to a flow nonce`, `fix(server): derive lead author from the session on web submits`, `fix(server): make logout a POST`, `fix(server): honor forwarded headers only behind a trusted proxy`, `fix(server): derive cookie Secure from configuration`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Bind the extension connect flow to a nonce (S1)

Flow today: popup opens `${base}/extension/connect?redirect_uri=chrome-extension://<id>/connected.html` → consent POST → redirect with `#token&handle&base`. Add a one-time state:

1. `extension/popup.js` (~392): before opening the tab, generate `const state = crypto.randomUUID();` and `await chrome.storage.local.set({ radarConnectState: state });`. Append `&state=${state}` to the connect URL.
2. `src/server/app.ts` GET `/extension/connect` (2836): read `c.req.query('state')`, validate `/^[0-9a-f-]{36}$/i` (reject otherwise with 400), pass it through the GitHub `returnTo` round-trip (it is part of the `back` URL already) and into `renderExtensionConnectPage`.
3. `src/server/ui.ts` `renderExtensionConnectPage` (4532): accept `state: string`, render `<input type="hidden" name="state" value="${escapeHtml(data.state)}">` next to `redirect_uri`.
4. `src/server/app.ts` POST `/extension/connect` (2848): read `form.state`, require the same format, and append `&state=…` to the redirect fragment.
5. `extension/connected.js`: read `state` from the fragment; load `radarConnectState` from storage; require equality AND presence; `chrome.storage.local.remove('radarConnectState')` after success (single use). On mismatch show the existing failure strings — do NOT write `radarAccount`.
6. `extension/manifest.json`: keep `connected.html` web-accessible (the hub redirect needs it) but the nonce now gates the write. Additionally validate `base`: accept only `https:` hosts, or `http:` when the host is `localhost`/`127.0.0.1` (self-hosted nodes).

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- server extension` → all pass (update the connect-flow test per Step 6); `pnpm pack:extension` → exit 0.

### Step 2: Derive author from the session on web submits (S2)

- `src/server/app.ts:1866`: `author: user.handle,` (drop the `author ||` fallback; the parsed `author` variable at 1836 becomes unused — remove it).
- `src/server/app.ts:2778` (`submitForUser`): `author: user.handle,`.
- Mirror the extension route's comment style: attribution always comes from the authenticated identity.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Make logout a POST (S3)

- `src/server/app.ts:1164`: change `app.get('/logout', …)` to `app.post('/logout', …)`; keep the body. The existing CSRF middleware now covers it automatically.
- `src/server/ui.ts:2299`: replace the `<a href="/logout">` with a minimal form: `<form method="post" action="/logout" class="user-menu-logout"><button type="submit" class="user-menu-link danger">${escapeHtml(t.signOut)}</button></form>`. Style the button to look like the existing link using EXISTING CSS classes only (no inline `<script>`, no new `<style>` blocks that would trip CSP tests — check `test/inline-scripts.test.ts` expectations first).
- Grep for other `/logout` references (`grep -rn "/logout" src/ extension/`) and update any link the same way.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test -- server hardening inline-scripts` → all pass.

### Step 4: Honor forwarded headers only behind a trusted proxy (S4)

- `src/config.ts`: add `RADAR_TRUSTED_PROXY: booleanFromEnv(false)` (follow the existing `booleanFromEnv` pattern, e.g. `RADAR_CHECK_CLOSED`).
- `src/server/ratelimit.ts`: the limiter needs the env flag. Add an optional `trustProxy?: boolean` to `RateLimitOptions` AND a module-level default set once via an exported `configureRateLimit({ trustProxy })` called from `createApp` (grep how `createApp` reads `runtime.env`). When `trustProxy` is false: key = `options.keyFrom?.(c) || 'local'` (ignore XFF/X-Real-IP entirely). When true: keep today's last-XFF logic. Update the comment to state the deployment invariant: only enable behind a proxy that APPENDS the client IP.
- Tests currently send `x-forwarded-for` and expect per-IP buckets (`test/server.test.ts:119,130,140,434,448`): set `RADAR_TRUSTED_PROXY: 'true'` in those tests' runtime env (they construct env via `makeTestRuntime({...})` / `testEnv`). Do not weaken the assertions.
- `.env.example`: document `RADAR_TRUSTED_PROXY=false` with the nginx invariant comment.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass.

### Step 5: Derive cookie Secure and base URL from configuration (S5)

- `src/server/auth.ts`: `secureCookie(c, runtime)` → true when `runtime.env.RADAR_PUBLIC_URL` starts with `https:` OR `runtime.env.NODE_ENV === 'production'` OR the header says https (keep the header as an additional signal for dev behind TLS-terminating proxies). Update all call sites in `auth.ts`.
- `src/server/app.ts:1157`: same rule for the session cookie (extract a shared helper if cleaner — it may live in `auth.ts` and be imported).
- `baseUrlOf` / `publicBaseUrl`: when `RADAR_PUBLIC_URL` is unset AND `NODE_ENV === 'production'`, do not trust `Host`: fall back to `http://127.0.0.1:<port>` is wrong for a public hub — instead log a warning once and keep current behavior ONLY in non-production; in production without `RADAR_PUBLIC_URL`, return the configured-less base from the request but mark the cookie Secure per above. (Minimal safe change: production ⇒ Secure cookies always; document in `.env.example` that `RADAR_PUBLIC_URL` is required for public deployments. Do NOT add a startup refusal — that is a deployment-behavior change beyond this plan.)

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → all pass.

### Step 6: Regression tests

In `test/server.test.ts`:
1. **Author spoofing**: signed-in POST `/api/submit` with `author: 'Someone else'` → stored lead's author equals the session handle (pattern: the extension test at ~970 already asserts this for `/api/ext/submit`; copy it for `/api/submit` and the form `/submit`).
2. **Logout**: GET `/logout` with a valid session cookie → 404/405 (route gone) and session still valid; POST `/logout` with same-origin header → session deleted; POST without Origin → 403.
3. **Connect nonce**: POST `/extension/connect` without `state` → 400; with a valid state → fragment contains `state`. Update the existing flow test (926–985) to thread the state through.
4. **Rate limit**: with `RADAR_TRUSTED_PROXY` unset, two requests with different `x-forwarded-for` values share one bucket (the 11th admin-login attempt within the window returns 429 regardless of header rotation).

In `test/extension.test.ts`: export the fragment-validation logic from `connected.js` as a pure function (follow the `module.exports` pattern at the bottom of `extension/content.js:297`) and test: valid token+base+matching state → accepted; missing/mismatched state → rejected; `http://evil.example` base → rejected; `http://127.0.0.1:8787` base → accepted.

**Verify**: `pnpm test` → all pass (baseline 690 + new).

## Test plan

- New tests listed in Step 6; structural patterns: `test/server.test.ts:926–985` (connect flow), `test/extension.test.ts` (pure-function imports from extension JS).
- Verification: `pnpm test` → all pass; `pnpm pack:extension` → exit 0.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0; new tests exist and pass
- [ ] `grep -n "author || user.handle\|asString(body.author) || user.handle" src/server/app.ts` → no matches
- [ ] `grep -n "app.get('/logout'" src/server/app.ts` → no matches
- [ ] `extension/connected.js` writes `radarAccount` only after the state check (covered by test)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts don't match the live code (drift) — especially if upstream already added a nonce or changed the connect flow.
- The CSP tests reject the logout form and the fix would require a new inline script or style block (stop; report the exact test failure).
- Changing `rateLimit`'s signature breaks a consumer you cannot update within scope.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The nonce lives in `chrome.storage.local` (`radarConnectState`), single-use, removed on success. A stale state from an abandoned flow is harmless: the next connect overwrites it.
- `RADAR_TRUSTED_PROXY=true` is a deployment invariant: the proxy MUST append the real client IP to XFF (nginx `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). Document it wherever deployment is documented.
- The `chromiumapp.org` redirect path (chrome.identity) is currently unused by popup.js but allowed by the regex — the nonce must be threaded there too if that flow is ever revived.
- Reviewer: verify no path writes `radarAccount` without the state check, and that the logout button renders identically in ru/en.
