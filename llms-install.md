# Installing openradar MCP (agent-facing guide)

openradar is a live, deduplicated feed of job posts and freelance gigs (Telegram
channels, ATS job boards, freelance platforms) with posted-pay benchmarks and a
citable market-research report. The MCP server is **free and keyless** for reading.

## Connect (remote MCP, nothing to install)

Server URL: `https://openradar.fun/mcp` (JSON-RPC 2.0 over Streamable HTTP)

- Guest tier (no token): read tools work immediately — the feed is delayed 12 hours
  and contact details are never shown (every lead links to the original post).
- Personal token (optional, for write tools): sign in at <https://openradar.fun/me>
  with GitHub, press «Выпустить токен», and pass
  `Authorization: Bearer mcp_…` as a header.

### Cline

Cline › MCP Servers › Configure › **Add remote server**:

```json
{
  "mcpServers": {
    "openradar": {
      "type": "streamableHttp",
      "url": "https://openradar.fun/mcp"
    }
  }
}
```

No environment variables, no build step, no API keys. Write tools
(`submit_lead`, `vote_lead`, `save_search`) ask for the token above; everything
else works without it.

### Other agents (Cursor, Windsurf, Trae, Claude Code, Gemini CLI, Qwen Code, iFlow, Kimi CLI)

Same URL everywhere — `https://openradar.fun/mcp` in the agent's MCP config
(`~/.cursor/mcp.json`, `mcp_settings.json`, `.mcp.json`, …), transport
Streamable HTTP. Ready-made skill pack and commands: <https://openradar.fun/skill.md>.

## REST fallback (no MCP client needed)

- `GET https://openradar.fun/api/leads?q=backend&limit=50` — search (relevance when `q` is set)
- `GET https://openradar.fun/api/leads/{id}` — one lead card
- `GET https://openradar.fun/api/market?title=backend+developer` — pay percentiles from posted pay
- `GET https://openradar.fun/api/delta?since=2026-11-18T00:00:00Z` — changes since a moment
- Full reference: <https://openradar.fun/openapi.json> · Agent guide: <https://openradar.fun/llms.txt>

## Etiquette

- Link users to the original post URL; never store or republish contact details.
- Prefer `/api/delta` over re-fetching the whole feed; honor `Cache-Control`.
- A 404 on a lead id can mean "not visible to guests yet", not deleted.
