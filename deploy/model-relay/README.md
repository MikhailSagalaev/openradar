# Model relay

Groq does not serve Russian addresses (HTTP 403 to the hub and to Tor exits), so the hub
reaches it through this relay on Vercel. It forwards only `/<RELAY_TOKEN>/openai/v1/*` to
`https://api.groq.com`; any other path answers 404. The relay keeps no key: the hub's
`OPENAI_API_KEY` passes through in the `Authorization` header.

Deploy once:

```bash
cd deploy/model-relay
npx vercel@latest login
npx vercel@latest deploy --prod
npx vercel@latest env add RELAY_TOKEN production   # a random string: openssl rand -hex 24
npx vercel@latest deploy --prod
```

Then on the hub (`/opt/radar-test/.env`):

```
RADAR_EXTRACT_PROVIDER=openai
OPENAI_BASE_URL=https://<project>.vercel.app/<RELAY_TOKEN>/openai/v1
OPENAI_API_KEY=<Groq key>
RADAR_EXTRACT_MODEL=qwen/qwen3.8-27b
RADAR_EXTRACT_PER_HOUR=40
```

`RELAY_UPSTREAM` changes the target for another OpenAI-compatible API.

Groq's free plan allows 1 000 requests a day and 8 000 tokens a minute, which is about
40 posts an hour; a paid plan lifts both. On a 429 the hub stops the batch and waits
for `Retry-After`.
