# Security policy

## Reporting

Do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting on the repository, or contact the repository owner directly through their GitHub profile.

Include:

- affected version or commit;
- a minimal reproduction;
- impact (data leak, SSRF, auth bypass, RCE);
- whether a public disclosure is planned.

## Scope

In scope:

- authentication bypass of the admin API or dashboard;
- bypass of the GitHub login gate on voting or lead submission (`/submit`, votes);
- a user session escalating to admin rights;
- webhook token bypass;
- SSRF through a source adapter, the webhook endpoint, `/api/preview` or the outbound proxy (`RADAR_PROXY_URL`);
- SQL injection or path traversal;
- secret leakage in logs, errors or exports;
- stored XSS in the dashboard;
- bypass of the tier delay or of contact hiding for guests on any endpoint (pages, `/api/*`, RSS, catalog, `/mcp`, `/v2/*`);
- forging or replaying signed radar/2 events or NIP-98 request signatures;
- reading server environment secrets through source configuration.

Out of scope:

- a source changing its markup and an adapter returning nothing;
- rate limits imposed by a third-party site;
- legal complaints about a source: open an issue, do not treat it as a vulnerability;
- self-hosted misconfiguration such as exposing the dashboard without `RADAR_ADMIN_TOKEN`.

## Defaults

- The dashboard and API are protected when `RADAR_ADMIN_TOKEN` is set.
- Webhook sources use a separate per-source token.
- Secrets are read from environment variables; the database stores only a reference such as `passwordEnv`.
- The project does not ship credentials, session cookies or scraped personal data.

## Supported versions

Only the latest release receives security fixes. The project is young; pin a commit if you need stability.
