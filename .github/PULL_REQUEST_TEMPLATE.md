## What changes · Что меняется

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist · Проверка

- [ ] `pnpm typecheck` and `pnpm test` pass; tests do not go to the network (fixtures instead)
- [ ] A new source: one adapter, one fixture, one test; it reads only public pages or an official API, respects robots.txt and does not bypass logins, captchas or rate limits
- [ ] User-facing text in Russian and English (`src/server/i18n.ts`) when the UI changes
- [ ] Docs updated (README, docs/) when behaviour or setup changes
