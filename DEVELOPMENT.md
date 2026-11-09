
# راهنمای توسعه و ساخت (Maintainer only)

> **کاربر نهایی فقط نصاب Releases رو لازم داره.** این فایل برای خودت (نگهدارنده) است.

## نیازمندی‌های قبل (فقط برای بیلد از روی سورس)
- Windows 10/11 یا Linux (Debian/Ubuntu)
- Node.js 18+ — برای Vite و jsdom solver
- Python 3.11+ — برای sidecar FastAPI
- Rust toolchain (`cargo`, `rustc`) — برای Tauri
- Git

## بعد از نیازمندی‌ها (Dev)
```bat
cd duckbridge-desktop
npm install
npm --prefix server install
pip install -r server/requirements.txt
npm run tauri dev
```

## بیلد نصاب (Release)
```bat
npm run tauri build
```
خروجی در `src-tauri/target/release/bundle/`:
- ویندوز: `.exe` + `.msi`
- لینوکس: `AppImage` + `.deb`

## انتشار در GitHub
1. نسخه رو تو `package.json` و `src-tauri/tauri.conf.json` بامپ کن (برابر)
2. `git commit -am "release: v0.1.1"` + `git tag v0.1.1` + `git push origin main --tags`
3. توی GitHub → Releases → Draft new release → آپلود هر ۴ نصاب + `latest.json` (امضاشده)
4. auto-update: وقتی اپ باز میشه latest.json رو چک می‌کنه، اگه جدیدتر بود دیالوگ می‌زنه، می‌بنده، نصب می‌کنه و ری‌استارت می‌کنه

## Secrets (فقط خودت)
- `TAURI_SIGNING_PRIVATE_KEY` (فایل `.tauri_keys.txt`)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
هرگز تو گیت نگذار.
