# Publishing and releases

## Launching the public repository

The repository is meant to go public as a fresh repository with one initial commit, so the development history (old configs, drafts, earlier passwords) does not come with it.

### 1. Before the switch

- [ ] Secrets that ever appeared in history are rotated on every server (database passwords, admin tokens, bot tokens).
- [ ] `git grep -nE "(api[_-]?key|token|password|secret)"` finds only documentation, env names and test values.
- [ ] No `.env`, `data/`, `dist/`, `node_modules/`, dumps or logs are tracked.
- [ ] Screenshots and fixtures contain no real personal contacts.
- [ ] CI is green on `main`; `pnpm typecheck`, `pnpm test`, `pnpm build` pass locally.
- [ ] The Docker image builds and `/health` answers inside the container.
- [ ] The scenarios in [GETTING_STARTED.md](GETTING_STARTED.md) work from a clean clone.
- [ ] `SECURITY.md` has a working private reporting channel.
- [ ] The extension loads unpacked and sends a page to a webhook source.

### 2. One-commit repository

```bash
git checkout --orphan public main
git commit -m "OpenRadar 0.7.0"
gh repo create <owner>/<name> --public --source=. --remote=public --push
```

Then:

- archive or make private the old repository;
- set the description, homepage (`https://openradar.fun`) and topics: `lead-generation`, `job-board`, `freelance`, `self-hosted`, `telegram`, `rss`, `postgresql`, `typescript`, `mcp`, `open-source`;
- move the deploy secrets (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) and the variables `DEPLOY_DIR`, `UPTIME_URL` (and `DEPLOY_HEALTH_URL` for another domain), and point the server's `git remote` to the new repository. Without the secrets the deploy job is skipped, without `UPTIME_URL` the uptime check does not run, so forks stay quiet;
- update repository links in `README.md`, `.env.example`, `src/config.ts` (user agent), `deploy-server.sh` and the extension.

## Release

```bash
git tag v0.7.0
git push origin v0.7.0
```

The `Release` workflow builds the app, the Docker image (`ghcr.io/<owner>/<repo>`) and `radar-extension-<tag>.zip`, and attaches the zip to the release. Attach nothing that contains a database or a `.env`.

## Naming

"Radar" is heavily used by other projects; the public name is OpenRadar. The code depends on the name only through the `radar` binary and the dashboard title.

## What not to promise

- "collects from every marketplace";
- "bypasses anti-bot protection";
- "replaces a CRM".

The README states the limits. Keep it that way.
