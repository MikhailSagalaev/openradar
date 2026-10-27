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
git tag v0.8.0
git push origin v0.8.0
```

The `Release` workflow builds the app, the Docker image (`ghcr.io/<owner>/<repo>`) and `radar-extension-<tag>.zip`, and attaches the zip to the release. Attach nothing that contains a database or a `.env`.

## Deploying your own hub

Releases are what goes to production. A server that runs OpenRadar from a git checkout pulls them itself: [scripts/autodeploy.sh](../scripts/autodeploy.sh) runs from cron, fetches tags and deploys the newest `vX.Y.Z` with `deploy-server.sh` from that tag (backup, migrations, restart, health check). Nothing on GitHub holds a key to the server.

```cron
*/5 * * * * root RADAR_DIR=/opt/radar /opt/radar/scripts/autodeploy.sh >> /var/log/radar-autodeploy.log 2>&1
```

- **Release:** tag and push; the server picks it up within five minutes.
- **Rollback:** write the tag to `$RADAR_DIR/.deploy-pin`; delete the file to follow releases again.
- **A failed deploy** leaves the previous version running and is not retried until a newer tag or `autodeploy.sh --force`.

The `Uptime` workflow checks `/health` every 15 minutes where the repository variable `UPTIME_URL` is set; forks stay quiet. An nginx example: [nginx.example.conf](nginx.example.conf).

## What not to promise

- "collects from every marketplace";
- "bypasses anti-bot protection";
- "replaces a CRM".

The README states the limits. Keep it that way.
