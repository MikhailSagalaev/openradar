# Privacy Policy for OpenRadar Extension

**Protocol Version:** radar/1  
**Extension Version:** 0.5.0  
**Effective Date:** October 25, 2026  

## 1. Core Manifesto & Zero-Telemetry Guarantee
The OpenRadar Extension is built on the principle of digital sovereignty and zero user surveillance:
1. **No Tracking or Telemetry:** The extension contains zero tracking pixels, zero analytics libraries, and zero telemetry SDKs (no Google Analytics, no Sentry, no Mixpanel).
2. **No Data Reselling:** User data, browsing habits, and identity are never monetized, logged, or transferred to advertisers or data brokers.
3. **No Private Key Storage:** The extension never generates, stores, or transmits private key material. Signing and identity (radar/1 mesh events) come exclusively from your own NIP-07 signer extension (e.g. Alby) via `window.nostr`; keys stay in the signer, not in this extension.

## 2. Information Extracted & Handled
The extension operates strictly on explicit user action — it never sends anything automatically while you browse:
1. **Ghost Job & Salary X-Ray (explicit only):** When you press the "X-Ray страницы" button in the popup on a supported job board (HeadHunter, Habr Career, LinkedIn, Kwork, Upwork), the extension queries `GET /api/v1/xray?url=...` on the configured OpenRadar instance to fetch market salary distributions and duplicate counts. The page URL is transmitted only at that moment; there is no automatic background X-Ray on any domain.
2. **Public Metadata Only:** Extraction reads only publicly rendered HTML elements and standard `schema.org/JobPosting` structured JSON-LD (job title, employer name, salary range, city, skills, and public description), and only when you submit a lead or request an X-Ray.
3. **Client-Side PII Scrubbing:** All lead submissions are sanitized locally before network transmission. Personal phone numbers, personal emails, and direct messenger links are stripped automatically.

## 3. Browser Permissions Declared
- `activeTab` & `scripting`: Required solely to extract public vacancy metadata from the actively open tab upon user interaction.
- `storage`: Required to preserve your local server URL, source credentials and access tier state. No cryptographic keys are stored.
- `contextMenus` & `notifications`: Used solely for optional right-click submissions and notification toasts.

## 4. Open Source & Auditability
The entire codebase for the extension and server is 100% open source under the Apache 2.0 / AGPL-3.0 licenses:
- GitHub Repository: https://github.com/MikhailSagalaev/radar-oss
- Public Node: https://openradar.fun
