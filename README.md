
# DuckBridge Desktop

Local Duck.ai API gateway manager — Tauri + React (Windows/Linux). Not a chat UI, just an API sidecar manager + settings.

> Duck.ai is DuckDuckGo's anonymous AI chat proxy at https://duck.ai. This project turns it into an OpenAI-compatible API on your own machine.

---

## 🇮🇷 فارسی

### معرفی
DuckBridge یک اپ دسکتاپ سبک روی ویندوز/لینوکس هست که سرور FastAPI + Node jsdom رو روی ماشین خودت بالا میاره و یک API شبیه OpenAI میده — چت، لیست مدل‌ها و تولید عکس — بدون اینکه نیاز به کلید OpenAI داشته باشی. اپ خودش «چت» ندارد، فقط سرور را مدیریت می‌کند.

### نیازمندی‌های قبل (قبل از نصف کار)
- ویندوز 10/11 یا لینوکس (Debian/Ubuntu)
- Node.js 18 به بالا — برای solver jsdom (چلنج duck.ai)
- Python 3.11 به بالا — برای سرور FastAPI
- Git — برای کلون کردن ریپو
- Rust toolchain — فقط اگر خودت بخوای از کد بیلد بگیری (`cargo` و `rustc`)

### بعد از نصف (وقتی نیازمندی‌ها رو داری)
1. ریپو رو کلون کن:
   ```bat
   git clone https://github.com/OWNER/duckbridge.git
   cd duckbridge
   ```
2. وابستگی‌های فرانت رو نصب کن:
   ```bat
   npm install
   ```
3. وابستگی‌های سرور رو نصب کن (برای jsdom — بدون این چت کار نمی‌کند):
   ```bat
   npm --prefix server install
   pip install -r server/requirements.txt
   ```
4. اپ رو توسعه‌ای اجرا کن:
   ```bat
   npm run tauri dev
   ```
5. اپ بالا میاد، سرور روی `http://127.0.0.1:8765` استارت می‌شه — توی داشبورد Base URL رو کپی کن:
   ```
   http://127.0.0.1:8765/v1
   ```

### با اپ چه کارهایی میتونی بکنی؟
- **چت API** — هر اپ OpenAI-compatible وصل بشه (Chatbox, Continue, WebUI…)
- **تولید عکس** — Luna به‌صورت native تصویر می‌سازه (`/v1/images/generations`)
- **مدیریت کلیدها** — توکن ادمین برای ساخت/حذف کلید API
- **پروکسی** — مستقیم، سیستم یا لیست دستی (SOCKS/HTTP)
- **تم و زبان** — روشن/تیره/سیستم و فارسی/English (RTL کامل، Vazirmatn)

### بیلد نهایی (نصب‌کننده)
```bat
npm run tauri build
```
خروجی در `src-tauri/target/release/bundle/` :
- ویندوز: `.exe` (NSIS) و `.msi`
- لینوکس: `AppImage` و `.deb`

### اعتبار
برنامه‌ریزی و توسعه: **محمد صادق نوروزیان**

---

## 🇬🇧 English

### Overview
DuckBridge is a lightweight desktop app (Windows/Linux) that runs the FastAPI + Node jsdom sidecar on your own machine and exposes an OpenAI-compatible API — chat, models listing and image generation — without an OpenAI key. The app itself is not a chat client; it manages the gateway and settings.

### Requirements (before you start)
- **Windows 10/11 or Linux (Debian/Ubuntu)**
- **Node.js 18+** — jsdom solver for the Duck.ai challenge
- **Python 3.11+** — FastAPI sidecar
- **Rust toolchain** — only if you build from source (`cargo`, `rustc`)
- **Git** — to clone this repo

### After that (once requirements are met)
1. Clone the repo:
   ```bat
   git clone https://github.com/OWNER/duckbridge.git
   cd duckbridge
   ```
2. Install frontend dependencies:
   ```bat
   npm install
   ```
3. Install server dependencies (jsdom — chat won’t work without it):
   ```bat
   npm --prefix server install
   pip install -r server/requirements.txt
   ```
4. Run in dev mode:
   ```bat
   npm run tauri dev
   ```
5. The app launches; the sidecar starts on `http://127.0.0.1:8765` — copy **Base URL** from the Dashboard:
   ```
   http://127.0.0.1:8765/v1
   ```

### What you can do with the app
- **Chat API** — any OpenAI-compatible client (Chatbox, Continue, WebUI, …)
- **Image generation** — Luna natively triggers `GenerateImage` (`/v1/images/generations`)
- **Key management** — admin token to create/delete API keys
- **Proxy** — direct, system, or manual list (SOCKS/HTTP)
- **Theme & language** — light/dark/system, EN/FA (full RTL, Vazirmatn)

### Release build (installer)
```bat
npm run tauri build
```
Output in `src-tauri/target/release/bundle/`:
- Windows: `.exe` (NSIS) and `.msi`
- Linux: `AppImage` and `.deb`

### About the author
Designed and programmed by **Mohammad Sadegh Norouzian** — Telegram: `@MSNoroozian`

### Publishing / GitHub
See **GITHUB_PUBLISH.md** for the full release runbook (repo, secrets, updater, installers).

### Disclaimer
Unofficial, for personal/educational use. Not affiliated with DuckDuckGo. Respect Duck.ai's terms of service and rate limits.
