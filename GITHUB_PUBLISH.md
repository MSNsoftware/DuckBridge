# انتشار در GitHub — راهنمای قدم‌به‌قدم (مثل برای بچه ۱۰ ساله)

این فایل به زبان ساده می‌گه چطور این پروژه رو توی GitHub بذاری و هر وقت نسخه جدید ساختی، آپدیت خودکار بره بیرون.

---

## قبل از شروع، به چی نیاز داری؟

- یک اکانت GitHub (رایگان)
- روی کامپیوترت: Node.js، Python، Git (همونایی که برای اجرا لازم داری)

---

## قدم ۱ — ساخت ریپو روی GitHub

1. برو به https://github.com و وارد اکانتت شو.
2. بالا سمت راست روی ➕ → **New repository**.
3. اسمش رو `duckbridge` بذار.
4. گزینه‌ی **Public** رو انتخاب کن.
5. دکمه‌ی سبز **Create repository** رو بزن.
6. الان یک صفحه می‌بینی که یک آدرس مثل این بهت داده:
   ```
   https://github.com/USER/duckbridge.git
   ```
   همین رو برای بعد نگه دار.

---

## قدم ۲ — وصل کردن پروژه‌ی خودت به GitHub

روی کامپیوتر خودت، همین فولدر `duckbridge-desktop` رو باز کن و این دستورها رو به‌ترتیب بزن:

```bat
cd duckbridge-desktop
git remote add origin https://github.com/USER/duckbridge.git
git branch -M main
git push -u origin main
```

- `USER` همون اسمکاربری GitHub خودته.
- الان کل کد روی GitHub هست و هر کسی با لینک پیداش می‌کنه.

---

## قدم ۳ — کلیدهای امضا (مخصوص آپدیت خودکار)

تا اپ بتونه آپدیت خودش رو امضا کنه و امن باشه:

1. روی خودت این دستور رو بزن:
   ```bat
   npx tauri signer generate --password test123 --write-keys .tauri_keys.txt --force
   ```
   این دو فایل می‌سازه:
   - `.tauri_keys.txt` → **کلید خصوصی (محرمانه!)** — این رو هیچ‌وقت تو GitHub نذار
   - `.tauri_keys.txt.pub` → **کلید عمومی** — این توی `tauri.conf.json` به‌عنوان `pubkey` هست و امن است که توی کد باشد

2. توی GitHub به این مسیر برو:
   ```
   ریپوت → Settings → Secrets and variables → Actions
   ```
3. روی **New repository secret** بزن و این دو تا رو اضافه کن:
   - اسم: `TAURI_SIGNING_PRIVATE_KEY` مقدار: محتویات کامل فایل `.tauri_keys.txt`
   - اسم: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` مقدار: `test123` (همون رمز موقع ساختن کلید — می‌تونی بعداً عوضش کنی ولی باید هر دفعه همان را به CI بدی)

---

## قدم ۴ — انتشار هر نسخه (از این به بعد هر بار که خواستی آپدیت بدی)

1. نسخه رو توی دو جا یکی کن (مثلاً از `0.1.0` به `0.1.1`):
   - `package.json`
   - `src-tauri/tauri.conf.json`

2. کامیت و تگ:
   ```bat
   git commit -am "release: v0.1.1"
   git tag v0.1.1
   git push origin main
   git push origin v0.1.1
   ```

3. یوبر GitHub، توی ریپوت روی **Releases** بزن و **Draft a new release** بزن:
   - Tag رو `v0.1.1` انتخاب کن
   - نصاب‌ها رو آپلود کن (همون فایل‌هایی که `npm run tauri build` ساخته):
     - ویندوز: `.exe` و `.msi`
     - لینوکس: `AppImage` و `.deb`
   - روی **Publish release** بزن

4. آپدیت خودکار چی کار می‌کنه؟
   - اپ کاربرهای قدیمی وقتی باز می‌شن، خودش latest.json رو از همون ریلیز چک می‌کنه
   - اگه نسخه جدیدتر بود، دیالوگ نشون میده، اپ رو می‌بنده، نصب می‌کنه و دوباره بازش می‌کنه
   - آدرسش توی `tauri.conf.json` قابل تنظیمه:
     ```
     https://github.com/USER/duckbridge/releases/latest/download/latest.json
     ```

---

## خلاصه — چیزی که باید خودت بدی (به من بگو)

- آدرس ریپوت: `github.com/USER/duckbridge`
- تایید اینکه به GitHub وصل می‌کنم و push می‌کنم

بعدش خودم «push to GitHub» رو انجام می‌دم و خلق ریلیز اول رو آماده می‌کنم.

---

## Development notes (EN)

- Dev server runs locally on `http://127.0.0.1:8765` (settings: host/port editable, default 8765).
- Node solver (jsdom) must be installed with `npm --prefix server install` before `npm run tauri dev`, otherwise chat fails with `Cannot find module 'jsdom'`.
- Admin token / API keys: with `Require API key` OFF the server is open (any token works). With it ON, chat needs a real key from the Keys tab and `/api-keys` needs the Admin token from Settings.
