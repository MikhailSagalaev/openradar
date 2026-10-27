# Plugins and adapters

Radar ships with eight sources (rss, telegram, kwork, webhook, imap, trudvsem, hh, remoteok) and four sinks (console, telegram, webhook, hub). Everything else is meant to be added as an adapter, not by patching the pipeline.

## Two levels of extension

### 1. Compile-time adapter (recommended)

A normal TypeScript module, reviewed and shipped with the project. `pnpm new:connector <name>` generates the module, a fixture and a test:

```ts
import { defineSource } from '../sdk.ts';
import type { RawLead } from '../core/types.ts';

export const exampleSource = defineSource({
  kind: 'rss', // add a new kind to the SourceKind union first
  access: 'public',
  description: 'Example adapter',
  risks: ['markup can change'],
  async poll(source, ctx): Promise<RawLead[]> {
    const response = await ctx.fetchImpl(source.config.url, {
      headers: { 'user-agent': ctx.userAgent },
      signal: AbortSignal.timeout(ctx.timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return [];
  },
});
```

Register it in `src/sources/index.ts`, add a fixture and a test.

### 2. Runtime plugins (not shipped)

Runtime loading of untrusted JavaScript is deliberately absent. A self-hosted tool that imports arbitrary plugins from a directory is a remote-code-execution surface, and it makes the adapter contract impossible to keep stable. The plan is a signed/allowlisted plugin directory with a manifest, not `import()` of anything a user drops into a folder.

## Adapter rules

- Fetch only the URL from `source.config`.
- Respect `ctx.timeoutMs` and `ctx.userAgent`.
- Return `RawLead[]`; never write to the store directly.
- Return `[]` for an empty page, throw for a real transport error.
- Never bypass login, CAPTCHA, paywalls or private groups.
- Never embed credentials or personal data in a fixture.
- Declare `access` and `risks` honestly.

## Sink rules

- Keep the payload minimal.
- Use `ctx.fetchImpl` and a timeout.
- Throw on failure; the registry records it and marks the lead `failed`.
- Do not retry inside the sink: the pipeline already records delivery state.

## Testing

```bash
pnpm test
```

A source adapter test uses a fixture and a mocked `fetchImpl`; no network. A sink test uses a mocked `fetchImpl` and asserts the request body.

## Source policy

The default adapters are limited to feeds, public pages, public Telegram previews and data the operator provides. If a source needs an account, use the `webhook` or `imap` source instead of shipping a session cookie with the project.
