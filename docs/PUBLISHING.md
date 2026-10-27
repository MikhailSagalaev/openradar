# Releases

## Before a release

- [ ] CI is green on `main`; `pnpm typecheck`, `pnpm test`, `pnpm build` pass locally.
- [ ] The Docker image builds and `/health` answers inside the container.
- [ ] The scenarios in [GETTING_STARTED.md](GETTING_STARTED.md) work from a clean clone.
- [ ] `git grep -nE "(api[_-]?key|token|password|secret)"` finds only documentation, env names and test values.
- [ ] Screenshots and fixtures contain no real personal contacts.
- [ ] The extension loads unpacked, sends a page to a webhook source and shows a market estimate.
- [ ] `CHANGELOG.md` has the release section.

## Release

```bash
git tag v0.7.0
git push origin v0.7.0
```

The `Release` workflow builds the app, the Docker image (`ghcr.io/<owner>/<repo>`) and `radar-extension-<tag>.zip`, and attaches the zip to the release. Attach nothing that contains a database or a `.env`.

## Deploying your own hub

The `Deploy hub` workflow runs `deploy-server.sh` over SSH after a green CI on `main`. It needs the secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (and optionally `DEPLOY_PORT`, `DEPLOY_KNOWN_HOSTS`) and the variables `DEPLOY_DIR` and `DEPLOY_HEALTH_URL`. Without the secrets the job is skipped. The `Uptime` workflow runs only where the variable `UPTIME_URL` is set.

Restrict the deploy key on the server to the deploy and nothing else, so leaked repository secrets do not mean a shell on the server. A wrapper such as `/usr/local/bin/radar-deploy`:

```sh
#!/bin/sh
set -e
cd /opt/radar
git fetch -q origin main
git show origin/main:deploy-server.sh > /tmp/radar-deploy.sh
RADAR_DIR=/opt/radar exec bash /tmp/radar-deploy.sh </dev/null
```

and in `~/.ssh/authorized_keys`:

```
command="/usr/local/bin/radar-deploy",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... deploy
```

The workflow then only triggers the deploy; the script it pipes is ignored.

## What not to promise

- "collects from every marketplace";
- "bypasses anti-bot protection";
- "replaces a CRM".

The README states the limits. Keep it that way.
