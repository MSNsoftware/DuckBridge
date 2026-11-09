<div align="center">

# 🦆 DuckBridge

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-lightgrey)](https://duck.ai)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C3E6)](https://tauri.app)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688)](https://fastapi.tiangolo.com)

**Local Duck.ai API gateway — Tauri + React, Windows/Linux.** Not a chat UI, just an API sidecar manager + settings.

> Duck.ai is DuckDuckGo's anonymous AI chat proxy at https://duck.ai. This project turns it into an OpenAI-compatible API on your own machine.

</div>

---

## ✨ Features

| | | |
|--|--|--|
| 🌐 | **OpenAI-compatible API** — `POST /v1/chat/completions`, streaming + non-streaming | |
| 📡 | **Images** — `POST /v1/images/generations` (Luna GenerateImage) | |
| 📋 | **Models** — live catalog from Duck.ai (free green / paid red) | |
| 🔑 | **API keys** — create / list / delete (SHA-256 hashed at rest) | |
| 🔐 | **Auth toggle** — open access or `Require API key` | |
| 🌍 | **Proxy** — Direct / System / Manual (SOCKS/HTTP) | |
| 🖥️ | **Desktop** — tray, autostart, dark/light/system, EN/FA (Vazirmatn, RTL) | |
| 🔄 | **Auto-update** — signed (GitHub Releases) | |

---

## 🚀 Quick Start (End Users) — [فارسی پایین](#-فارسی)

1. Download the latest build from **Releases**:
   - Windows: `.exe` (NSIS) or `.msi`
   - Linux: `AppImage` or `.deb`
2. Double-click the installer and launch the app.
3. The app starts its local server on `http://127.0.0.1:8765` by itself.
4. Copy **Base URL** from the Dashboard and paste it into any OpenAI client:
   ```
   http://127.0.0.1:8765/v1
   ```

No Node/Python needed — everything is bundled in the installer.

---

## 🇮🇷 فارسی

### نصب و اجرا (کاربر نهایی)
1. از بخش **Releases** آخرین نسخه را دانلود کن:
   - ویندوز: فایل `.exe` (NSIS) یا `.msi`
   - لینوکس: فایل `AppImage` یا `.deb`
2. روی فایل دانلودی دابل‌کلیک کن و نصب کن.
3. اپ را باز کن — خودش سرور محلی را روی `http://127.0.0.1:8765` بالا می‌آورد.
4. توی داشبورد **Base URL** را کپی کن و توی اپ دلخواهت وارد کن:
   ```
   http://127.0.0.1:8765/v1
   ```
5. دیگر نیازی به Node/Python نیست — همه‌چیز داخل نصاب باندل شده است.

### اعتبار
برنامه‌ریزی و توسعه: **محمد صادق نوروزیان**

---

## 🛠 Requirements (for building from source / Maintainer)

**Before you start:**
- Windows 10/11 or Linux (Debian/Ubuntu)
- Node.js 18+ — Vite + jsdom solver
- Python 3.11+ — FastAPI sidecar
- Rust toolchain (`cargo`, `rustc`) — Tauri build
- Git

**After that (once requirements are met):**
```bat
cd duckbridge-desktop
npm install
npm --prefix server install
pip install -r server/requirements.txt
npm run tauri dev
```

**Release build:**
```bat
npm run tauri build
```
Output in `src-tauri/target/release/bundle/`: `.exe`/`.msi` (Windows), `AppImage`/`.deb` (Linux).

---

## 📦 API (backend only)

- `POST /v1/chat/completions`
- `GET /v1/models`
- `POST /v1/images/generations` + `GET /v1/images/content/{id}`
- `GET /health`, `GET /metrics`
- `GET/POST/DELETE /api-keys` (admin token)

```python
from openai import OpenAI
client = OpenAI(api_key="anything", base_url="http://127.0.0.1:8765/v1")
client.chat.completions.create(model="gpt-6-luna", messages=[{"role":"user","content":"Hi"}])
```

---

## 👤 About the author

Designed and programmed by **Mohammad Sadegh Norouzian** — Telegram: [`@MSNoroozian`](https://t.me/MSNoroozian)

---

## 📄 Documentation

- **Publishing / releases:** see the GitHub Releases page (maintainers run `git tag vX.Y.Z` and GitHub Actions builds the four installers + `latest.json` automatically).

## ⚠️ Disclaimer

Unofficial, for personal/educational use. Not affiliated with DuckDuckGo. Respect Duck.ai's terms of service and rate limits.
