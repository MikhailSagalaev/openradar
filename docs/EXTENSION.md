# Browser Extension (Manifest V3)

A lightweight, zero-dependency Manifest V3 browser extension that captures freelance gigs and job postings into your self-hosted **OpenRadar** instance with one click, via the context menu or the `Alt+Shift+R` hotkey.

---

## 📦 Installation (Chrome / Edge / Yandex Browser / Brave)

### Option A: From Web UI (Recommended)
1. Open your running OpenRadar dashboard and navigate to **«Расширение»** (`/extension`).
2. Click **«Скачать extension.zip»** (or download from `/extension/download`) and unpack it to any folder on your computer.
3. Open `chrome://extensions/` in your browser.
4. Toggle on **«Developer mode»** (top-right corner).
5. Click **«Load unpacked»** and select the unpacked extension folder.

### Option B: From Repository
Select the `extension/` directory directly inside the repository in `chrome://extensions/`.

---

## ⚙️ Configuration

1. **Create a Webhook source** in OpenRadar (if you haven't yet):
   ```bash
   node bin/radar.js source add --kind webhook --title "Browser Extension"
   ```
   *Note: Save the token printed by the command. You can also view source IDs on the `/extension` page.*

2. Click the **OpenRadar icon** in your browser toolbar and expand **«Настройки подключения»**:
   - **Contributor nickname**: e.g. `@telegram` (optional; signs your submissions in the community).
   - **Radar server URL**: e.g. `http://127.0.0.1:8787` (click **«Проверить»** to test the connection via `/api/ping`).
   - **Source ID**: The Webhook source ID from step 1.
   - **Source Token**: Secret token for the source.
3. Click **«Сохранить»**.

---

## 🚀 Features

- **Full Page Capture (`Alt+Shift+R` or Popup)**:
  - Automatically parses structured `schema.org/JobPosting` (position, company, salary range, city, remote flag, required skills).
  - Falls back to OpenGraph (`og:title`, `og:description`), Twitter Card metadata, or page title/description.
  - Allows switching between **«Заказ (Gig)»** and **«Вакансия (Job)»** before submitting.
- **Selection Capture (Context Menu)**:
  - Highlight any text (job requirements, order specs, contact details) on any site (Kwork, Habr Freelance, Telegram Web, Avito, forums).
  - Right-click → **«Отправить заказ в Radar»** (Gig) or **«Отправить вакансию в Radar»** (Job).
  - System notification pops up with a direct link to the newly created lead card in OpenRadar.
- **Visual Snippet & Badge in Popup**:
  - Live preview of selected text snippet and parsed Job details (`🏢 Acme Corp · 💰 250 000 ₽ · 📍 Москва`).
- **Dark Mode Support**:
  - Native dark/light mode following system appearance with crisp Swiss typography.

---

## 🔒 Security & Privacy

- **Local Storage only**: Credentials and tokens are stored solely in `chrome.storage.local`.
- **Zero Tracking**: No analytics, telemetry, or external third-party servers. All requests go directly to your configured OpenRadar server.
- **Scoped Permissions**: Uses `activeTab`, `scripting`, and `contextMenus`. Content scripts remain passive until triggered.
