# Privacy Policy for OpenRadar Extension

**Protocol Version:** radar/1  
**Extension Version:** 0.5.0  
**Effective Date:** October 25, 2026  

## 1. Core Manifesto & Zero-Telemetry Guarantee
The OpenRadar Extension is built on the principle of digital sovereignty and zero user surveillance:
1. **No Tracking or Telemetry:** The extension contains zero tracking pixels, zero analytics libraries, and zero telemetry SDKs (no Google Analytics, no Sentry, no Mixpanel).
2. **No Data Reselling:** User data, browsing habits, and identity are never monetized, logged, or transferred to advertisers or data brokers.
3. **Local-First Cryptography:** secp256k1 cryptographic keypairs (NIP-07 / NIP-01) are generated and stored exclusively within `chrome.storage.local` on your local device. Private keys never leave your browser unencrypted.

## 2. Information Extracted & Handled
The extension operates strictly in context when visiting supported career portals or capturing leads:
1. **Ghost Job & Salary X-Ray:** When viewing a vacancy on supported job boards (HeadHunter, Habr Career, LinkedIn, Kwork, Upwork), the extension queries `GET /api/v1/xray?url=...` on the configured OpenRadar instance to fetch market salary distributions and duplicate counts.
2. **Public Metadata Only:** Extraction reads only publicly rendered HTML elements and standard `schema.org/JobPosting` structured JSON-LD (job title, employer name, salary range, city, skills, and public description).
3. **Client-Side PII Scrubbing:** All lead submissions are sanitized locally before network broadcast. Personal phone numbers, personal emails, and direct messenger links are stripped automatically.

## 3. Browser Permissions Declared
- `activeTab` & `scripting`: Required solely to extract public vacancy metadata from the actively open tab upon user interaction.
- `storage`: Required to preserve your local server URL, access tier state, and cryptographic keypair.
- `contextMenus` & `notifications`: Used solely for optional right-click submissions and notification toasts.

## 4. Open Source & Auditability
The entire codebase for the extension and server is 100% open source under the Apache 2.0 / AGPL-3.0 licenses:
- GitHub Repository: https://github.com/MikhailSagalaev/radar-oss
- Public Node: https://openradar.fun
