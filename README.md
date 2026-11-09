# DuckBridge Desktop

Local Duck.ai API gateway manager — Tauri + React (Windows/Linux). Not a chat UI, just an API sidecar manager + settings.

> Duck.ai is DuckDuckGo's anonymous AI chat proxy at https://duck.ai. This project turns it into an OpenAI-compatible API on your own machine.

---

## 🇮🇷 فارسی

### نصب و اجرا (کاربر نهایی)
1. از بخش **Releases** آخرین نسخه را دانلود کن:
   - ویندوز: فایل `.exe` (NSIS) یا `.msi`
   - لینوکس: فایل `AppImage` یا `.deb`
2. روی فایل دانلودی دابل‌کلیک کن و نصب کن (مثل بقیه اپ‌ها).
3. اپ را باز کن — خودش سرور محلی را روی `http://127.0.0.1:8765` بالا می‌آورد.
4. توی داشبورد **Base URL** را کپی کن و توی اپ دلخواهت (Chatbox / Continue / WebUI) وارد کن:
   ```
   http://127.0.0.1:8765/v1
   ```
5. دیگر نیازی به Node/Python نیست — همه‌چیز داخل نصاب باندل شده است.

### اعتبار
برنامه‌ریزی و توسعه: **محمد صادق نوروزیان**

---

## 🇬🇧 English

### Install and run (end users)
1. Download the latest build from **Releases**:
   - Windows: `.exe` (NSIS) or `.msi`
   - Linux: `AppImage` or `.deb`
2. Double-click the installer and follow the usual steps.
3. Launch the app — it starts the local server on `http://127.0.0.1:8765` by itself.
4. Copy **Base URL** from the Dashboard and paste it into any OpenAI-compatible client:
   ```
   http://127.0.0.1:8765/v1
   ```
5. No Node/Python needed — everything is bundled in the installer.

### About the author
Designed and programmed by **Mohammad Sadegh Norouzian** — Telegram: `@MSNoroozian`

### Publishing
Maintainers: see **GITHUB_PUBLISH.md** (repo, secrets, releases). Source code is in the repo for review; end users don't need to build from it.

### Disclaimer
Unofficial, for personal/educational use. Not affiliated with DuckDuckGo. Respect Duck.ai's terms of service and rate limits.
