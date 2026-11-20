# 📋 تاریخچه تغییرات و نسخه‌ها (Changelog)

تمام تغییرات کلیدی، رفع ایرادات و بهبودهای اعمال‌شده در DuckBridge در این بخش ثبت می‌شود.

---

## [0.1.7] - 2026-11-20

<div dir="rtl">

### 🌐 یکپارچه‌سازی و رفع تداخل زبان‌های رابط کاربری (UI i18n & Localization)
- **جداسازی کامل دیکشنری‌های زبان:** برطرف شدن مشکل تداخل زبان انگلیسی و فارسی؛ هیچ متن هاردکدشده‌ی فارسی در محیط کاربری انگلیسی و هیچ متن انگلیسی غیرضروری در محیط فارسی نمایش داده نمی‌شود.
- **ترجمه داینامیک پیام‌های خطا (`localizeError`):** خطاهای بازگشتی سرور محلی (نظیر سقف مصرف ۴۲۹، خطای امنیتی ۴۱۸، مفقود بودن پکیج jsdom یا node) به‌صورت هوشمند متناسب با زبان فعال برنامه ترجمه می‌شوند.
- **رفع پیام اولیه محیط چت تست زنده:** پیام خوش‌آمدگویی و تست در حالت انگلیسی به‌طور خودکار انگلیسی و در حالت فارسی به‌طور کامل فارسی نمایش داده می‌شود.
- **استانداردسازی خطاهای FastAPI:** پیام‌های خطای سرور محلی برای کلاینت‌های استاندارد OpenAI (نظیر Cursor، Continue و Chatbox) به فرمت رسمی انگلیسی استاندارد بازگردانده می‌شوند.
- **بومی‌سازی تمامی دکمه‌ها و فرم‌ها:** دکمه‌های «توقف استریم»، «تنظیمات پروکسی»، «کپی آدرس»، «تولید تصویر» و اعلان‌های سیستم متناسب با زبان کاربر به‌روزرسانی شدند.

</div>

<div dir="ltr">

### 🌐 Complete UI i18n & Language Unification
- **Zero Language Leakage:** Completely eliminated hardcoded Persian text appearing in English mode and untranslated English elements appearing in Persian mode.
- **Dynamic Error Localization:** Added `localizeError` helper to dynamically translate backend errors (429 Rate Limit, 418 Bot Challenge, missing dependencies) according to the active UI language.
- **Playground Chat Greeting:** The live chat test greeting now dynamically updates between Persian and English without requiring page reloads or persisting stale messages.
- **OpenAI Standard Backend Errors:** Standardized FastAPI JSON error responses in English so external AI development environments (Cursor, Windsurf, Continue) receive expected error payloads.
- **Form Controls & Modals:** Localized all UI buttons, tooltips, placeholders, and system notifications.

</div>

---

## [0.1.6] - 2026-11-20

<div dir="rtl">

### ⚡ پایداری، رفع باگ‌های ارتباطی و معماری Zero-DB
- **مهاجرت به معماری ۱۰۰٪ درون‌حافظه‌ای (Zero-DB):** حذف کامل دیتابیس SQLite و کدهای مسدودکننده دیسک؛ صفر ثانیه تاخیر و حذف کامل خطاهای قفل پایگاه داده (`database is locked`).
- **واچ‌داگ هوشمند استریم (Stream Watchdog):** اضافه شدن تایم‌اوت ۴۵ ثانیه‌ای برای بستن ارتباطات مرده و آزادسازی فوری سمافور پردازش همزمانی.
- **ارسال فریم پایانی استریم SSE (`finish_reason: "stop"`):** تطابق ۱۰۰٪ با پروتکل OpenAI با ارسال فریم پایانی استاندارد پیش از `data: [DONE]` جهت جلوگیری از معلق ماندن کلاینت‌ها.
- **مدیریت سوکت‌های `TIME_WAIT` ویندوز:** رفع پرش ناخواسته پورت هنگام راه‌اندازی مجدد سرور محلی با مکانیزم تلاش مجدد تا ۱.۲ ثانیه.
- **آدرس‌دهی کامل تصاویر تولیدشده (Absolute URLs):** بازگرداندن URL کامل با پروتکل و هاست معتبر در `/v1/images/generations` برای کلاینت‌هایی مانند Chatbox.
- **پشتیبانی کامل از پیام‌های ساختاریافته AI Agents:** پذیرش پیام‌های با `content: null` و محتوای آرایه‌ای در Cursor و Continue جهت رفع خطاهای ۴۲۲ Validation Error.
- **حل چالش در پس‌زمینه بدون پرش پنجره:** اضافه شدن فلگ `CREATE_NO_WINDOW` در ویندوز جهت جلوگیری از چشمک زدن خط فرمان Node.js.
- **پشتیبانی از پروکسی امن SOCKS5h:** ارتقای خودکار پروکسی به پروتکل `socks5h://` جهت حل ریموت DNS و عبور از اختلالات شبکه.
- **دکمه لغو و کنترل استریم در تست زنده:** اضافه شدن دکمه Stop در محیط تست زنده با استفاده از `AbortController`.

</div>

<div dir="ltr">

### ⚡ Stability, Protocol Compliance & Zero-DB Architecture
- **100% In-Memory Architecture (Zero-DB):** Completely removed SQLite database overhead and disk locking issues; instant startup and zero database locking.
- **Stream Idle Watchdog:** 45-second inactivity watchdog that automatically closes hung connections and releases the upstream concurrency semaphore.
- **Standard SSE Stop Chunks:** Emits OpenAI-compliant `finish_reason: "stop"` chunks before `data: [DONE]` to prevent client hanging.
- **Windows Socket TIME_WAIT Mitigation:** Prevents port-hopping during one-click server restarts by polling socket availability for up to 1.2s.
- **Absolute Image URLs:** `/v1/images/generations` now returns reachable absolute URLs (`http://127.0.0.1:8765/v1/images/content/{id}`) to eliminate `MissingSchema` errors.
- **Multimodal & Null Content Handling:** Relaxed schema validation to allow `content: null` and array payloads from agentic tools (Cursor/Continue).
- **Silent Node.js Execution:** Added `CREATE_NO_WINDOW` flag (0x08000000) on Windows to prevent console flashing during challenge evaluation.
- **SOCKS5h Remote DNS:** Seamlessly rewrites SOCKS proxies to `socks5h://` to resolve DNS remotely and bypass ISP blocks.
- **Playground Stream Abort:** Interactive stop button in the Live Chat runner powered by `AbortController`.

</div>

---

## [0.1.5] - 2026-11-19

<div dir="rtl">

- اضافه شدن پشتیبانی از سیستم Tray و مقیم شدن در تسک‌بار ویندوز
- استارت خودکار سرور و برنامه هنگام ورود به سیستم
- پشتیبانی از پوسته‌های تاریک و روشن
- بهبود اولیه مدیریت پروکسی

</div>

<div dir="ltr">

- Windows system tray minimization and background resident support.
- Auto-start at system boot.
- Light and dark theme switching.
- Initial proxy list management.

</div>
