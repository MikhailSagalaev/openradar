---
name: New Connector Proposal
about: Propose or request a new data source adapter for OpenRadar
title: "connector: "
labels: ["connector", "enhancement"]
---

### Connector Name
<!-- Platform or marketplace name (e.g., freelance.habr.com, api.hh.ru) -->

### Source Type & Protocol
- [ ] Public REST API
- [ ] RSS / Atom Feed
- [ ] Static / HTML Scrape
- [ ] Email / IMAP Notifications
- [ ] Webhook / Push

### Endpoint / Documentation URL
<!-- Official API docs or feed URL -->

### Authentication & Access Requirements
<!-- Does it require an API key, bearer token, user-agent registration, or is it completely open? -->

### Sample Response / Data Structure
```json
// Paste a minimal sanitized sample response or feed entry
```

### Privacy & Legal Verification
- [ ] The source is publicly accessible without bypassing paywalls or captcha walls.
- [ ] Extracted leads will pass privacy sanitization (no personal passport data, phone numbers, or private emails per 152-FZ / GDPR).
- [ ] Connector can include offline fixture tests (`test/fixtures/<name>.json`) and a dedicated adapter in `src/sources/`.
