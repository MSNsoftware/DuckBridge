<div align="center">

# 🦆 DuckBridge

### دروازه‌ی محلی Duck.ai با رابط کاربری دسکتاپ و API استاندارد سازگار با OpenAI
### Local Duck.ai Desktop Gateway & OpenAI-Compatible API

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-2563eb?style=for-the-badge&logo=windows&logoColor=white)](#-پشتیبانی-از-سیستم‌عامل)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-FastAPI-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-0BSD-brightgreen?style=for-the-badge)](LICENSE)

**[دانلود آخرین نسخه (Releases)](https://github.com/MSNsoftware/DuckBridge/releases/latest) · [تاریخچه تغییرات و رفع باگ‌ها (Changelog)](CHANGELOG.md) · [گزارش خطا یا پیشنهاد (Issues)](https://github.com/MSNsoftware/DuckBridge/issues) · [English Documentation](#-english)**

</div>

---

<div dir="rtl">

## 📑 فهرست مطالب

- [معرفی](#-معرفی)
- [قابلیت‌های کلیدی](#-قابلیت‌های-کلیدی)
- [نحوه‌ی کار و معماری سامانه](#️-نحوه‌ی-کار-و-معماری-سامانه)
- [شروع سریع و نصب](#-شروع-سریع-و-نصب)
- [اتصال به کلاینت‌های محبوب OpenAI](#-اتصال-به-کلاینت‌های-محبوب-openai)
- [مرجع مسیرهای API](#-مرجع-مسیرهای-api)
- [امنیت و حریم خصوصی](#-امنیت-و-حریم-خصوصی)
- [پیش‌نیازها و ساخت از سورس](#️-پیش‌نیازها-و-ساخت-از-سورس)
- [نکات و محدودیت‌ها](#️-نکات-و-محدودیت‌ها)
- [مشارکت در توسعه](#-مشارکت-در-توسعه)
- [توسعه‌دهنده و سلب مسئولیت](#-توسعه‌دهنده-و-سلب-مسئولیت)

---

## 🦆 معرفی

**DuckBridge** یک نرم‌افزار دسکتاپ مدرن، سبک و با کارایی بالا برای **Windows** و **Linux** است که به عنوان یک پل محلی (Local Gateway) میان کلاینت‌های هوش مصنوعی و سرویس [Duck.ai](https://duck.ai) عمل می‌کند.

این برنامه ابزارهای توسعه، کلاینت‌های هوش مصنوعی و ویرایشگرهای کد را قادر می‌سازد تا بدون نیاز به پرداخت هزینه‌های گزاف API، مستقیماً از جدیدترین مدل‌های رایگان Duck.ai (نظیر GPT-6 Luna, Claude 3.5/4.5 Haiku, Mistral Small و غیره) با قالب استاندارد **OpenAI Chat Completions** استفاده کنند.

رابط کاربری دسکتاپ پروژه با **Tauri v2** و **React 19** توسعه یافته و سرور رابط آن یک میکروسرویس مستقل مبتنی بر **FastAPI** پایتون است.

---

## ✨ قابلیت‌های کلیدی

| قابلیت | شرح کارکرد |
|---|---|
| 🔌 **سازگاری کامل با پروتکل OpenAI** | پیاده‌سازی استاندارد اندپوینت‌های `/v1/chat/completions`، `/v1/models` و `/v1/images/generations` سازگار با Cursor, Continue, Chatbox و LangChain |
| ⚡ **معماری فوق‌سبک بدون دیتابیس (Zero-DB)** | حذف کامل وابستگی به SQLite یا پایگاه داده و مهاجرت ۱۰۰٪ به متریک‌های درون‌حافظه‌ای؛ صفر ثانیه تاخیر و حذف کامل خطاهای قفل پایگاه داده |
| 🌊 **استریم زنده SSE با چانک پایانی استاندارد** | استریم بی‌درنگ توکن‌ها به همراه ارسال فریم پایانی `finish_reason: "stop"` برای سازگاری کامل با اتوماسیون‌ها و کتابخانه‌های رسمی |
| 🔄 **راه‌اندازی مجدد تک‌کلیکی (One-Click Restart)** | دکمه اختصاصی ری‌استارت در سایدبار، بخش تنظیمات و منوی Tray ویندوز با مدیریت هوشمند سوکت `TIME_WAIT` جهت جلوگیری از پرش پورت |
| 🛡️ **سوپروایزر هوشمند و واچ‌داگ استریم** | پایش پیوسته پروسه والد-فرزند و بازیابی خودکار در صورت بروز کرش، به همراه تایم‌اوت ۴۵ ثانیه‌ای عدم فعالیت استریم برای پیشگیری از قفل سمافور |
| 🌐 **پشتیبانی پیشرفته از انواع پروکسی** | پشتیبانی از پروکسی مستقیم، پروکسی سیستمی و فهرست سفارشی SOCKS5/HTTP با ارتقای خودکار به پروتکل `socks5h://` جهت رفع نشتی DNS |
| 🖼️ **تولید تصویر با خروجی Absolute URL** | تولید تصویر مبتنی بر قابلیت بومی مدل Luna و بازگرداندن نشانی کامل و معتبر برای نمایش و دانلود مستقیم در هر کلاینت استاندارد |
| 🧩 **پشتیبانی از فرمت‌های ساختاریافته و محتوای Null** | سازگاری عمیق با پیام‌های حاوی `content: null` و محتوای آرایه‌ای چندبخشی ارسال‌شده توسط عامل‌های هوشمند کدنویسی |
| 🧪 **محیط تست زنده (Playground) با دکمه لغو** | تب چت زنده و تولید تصویر با قابلیت توقف دستی استریم (AbortController) و اندازه‌گیری دقیق تاخیر اولین توکن (TTFT) |
| 🖥️ **یکپارچگی عمیق دسکتاپ** | مقیم شدن در System Tray، استارت خودکار هنگام بوت ویندوز، بسته‌شدن امن تمامی پردازش‌ها از طریق Windows Job Objects |

---

## ⚙️ نحوه‌ی کار و معماری سامانه

</div>

<div dir="ltr">

```text
┌────────────────────────────────────────────────────────┐
│               OpenAI-Compatible Clients                │
│    Cursor · Continue.dev · Chatbox · Roo Code · LangChain  │
└───────────────────────────┬────────────────────────────┘
                            │  Standard OpenAI API Requests
                            ▼
┌────────────────────────────────────────────────────────┐
│                  DuckBridge Gateway                    │
│                 http://127.0.0.1:8765                  │
│                                                        │
│  FastAPI Sidecar · Stream Watchdog · 100% In-Memory    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Duck.ai Backend                      │
│     Challenge Solver (Node.js/JSDOM) · Prompt Folding  │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / SOCKS5h
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Duck.ai Cloud API                     │
└────────────────────────────────────────────────────────┘

                 Tauri Desktop Shell
       Supervisor · System Tray · One-Click Restart
```

</div>

<div dir="rtl">

---

## 🚀 شروع سریع و نصب

### ۱. دانلود برنامه

از صفحه‌ی [آخرین انتشارها (GitHub Releases)](https://github.com/MSNsoftware/DuckBridge/releases/latest) بسته‌ی مناسب با سیستم‌عامل خود را دریافت کنید:

- **Windows:** فایل نصبی خودکار `.exe` (NSIS) یا بسته‌ی شرکتی `.msi`
- **Linux:** بسته‌ی پرتابل `.AppImage` یا فایل نصبی توزیع‌های دبیان/اوبونتو `.deb`

### ۲. اجرا و اتصال

1. نرم‌افزار را اجرا کنید.
2. روی دکمه‌ی **شروع سرور** در سایدبار کلیک کنید (یا در تنظیمات، گزینه‌ی «شروع خودکار سرور» را فعال نمایید).
3. آدرس پایه (Base URL) را از بالای صفحه کپی کنید:

</div>

<div dir="ltr">

```text
http://127.0.0.1:8765/v1
```

</div>

<div dir="rtl">

> **نکته:** DuckBridge برای حل چالش امنیتی ضدبات داک‌داک‌گو در پس‌زمینه از محیط سبک Node.js استفاده می‌کند. اطمینان حاصل کنید که Node.js نسخه ۱۸ به بالا روی سیستم شما نصب است.

---

## 🔌 اتصال به کلاینت‌های محبوب OpenAI

### ۱. تنظیم در کلاینت چت‌باکس (Chatbox)
- **Model Provider:** ارائه‌دهنده را روی `OpenAI API` قرار دهید.
- **API Host:** آدرس `http://127.0.0.1:8765` را وارد کنید.
- **API Key:** هر مقدار دلخواهی (مانند `dummy` یا `duckbridge`) وارد کنید.
- **Model:** یکی از مدل‌های موجود مثل `gpt-6-luna` یا `claude-haiku-4-5` را انتخاب کنید.

### ۲. تنظیم در افزونه Continue.dev (VS Code / JetBrains)
در فایل `config.json` کلاینت Continue، مدل زیر را به آرایه‌ی `models` اضافه کنید:

</div>

<div dir="ltr">

```json
{
  "title": "DuckBridge",
  "provider": "openai",
  "model": "gpt-6-luna",
  "apiKey": "dummy",
  "apiBase": "http://127.0.0.1:8765/v1"
}
```

</div>

<div dir="rtl">

### ۳. تنظیم در ویرایشگر Cursor / Windsurf
- به مسیر **Settings > Models** بروید.
- گزینه‌ی **Override OpenAI Base URL** را فعال کرده و آدرس `http://127.0.0.1:8765/v1` را قرار دهید.
- کلید API را یک عبارت دلخواه بنویسید.

### ۴. استفاده در برنامه‌نویسی با پایتون (Official OpenAI Python SDK)

</div>

<div dir="ltr">

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8765/v1",
    api_key="duckbridge-local",
)

# ۱. دریافت پاسخ متنی جریانی (Streaming)
stream = client.chat.completions.create(
    model="gpt-6-luna",
    messages=[{"role": "user", "content": "یک داستان کوتاه بنویس."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)

# ۲. تولید تصویر (Image Generation)
image_resp = client.images.generate(
    prompt="A minimal illustration of a cute duck in rain",
    n=1,
    size="1024x1024"
)
print("Image URL:", image_resp.data[0].url)
```

</div>

<div dir="rtl">

---

## 🧭 مرجع مسیرهای API

آدرس پیش‌فرض سرویس: `http://127.0.0.1:8765`

| متد | مسیر | توضیحات |
|---|---|---|
| `GET` | `/health` | بررسی سلامت سرور محلی، پایداری پروسه و دسترسی به Node.js |
| `GET` | `/metrics` | آمار لحظه‌ای درخواست‌های کل، موفق، خطاها و میانگین زمان تاخیر |
| `GET` | `/v1/models` | فهرست زنده مدل‌های فعال Duck.ai با ساختار رسمی OpenAI |
| `POST` | `/v1/chat/completions` | پردازش گفت‌وگو به صورت ساده یا جریانی (SSE) |
| `POST` | `/v1/images/generations` | تولید تصویر با مدل Luna و تحویل Absolute URL |
| `GET` | `/v1/images/content/{id}` | دانلود فایل خام تصویر تولیدشده از حافظه موقت |
| `GET` | `/docs` | رابط تعاملی Swagger / OpenAPI جهت تست مستقیم اندپوینت‌ها |

---

## 🔐 امنیت و حریم خصوصی

- **محدود به رایانه شما:** سرور به‌صورت پیش‌فرض فقط روی آدرس محلی `127.0.0.1` فعال است و از روی شبکه و اینترنت قابل دسترسی نیست.
- **حفظ حریم خصوصی:** هیچ‌گونه لاگ چت، تاریخچه یا دیتابیسی روی دیسک نگهداری نمی‌شود و پردازش‌ها ۱۰۰٪ درون‌حافظه‌ای هستند.
- **ایمنی پروسه‌ها در ویندوز:** اتصال پروسه پایتون به **Windows Job Objects** تضمین می‌کند که حتی در صورت Force-Quit شدن رابط کاربری، پروسه‌های پایتون در رم باقی نمانند.
- **ارتباط خارجی:** برای دریافت پاسخ‌ها، ارتباط رمزگذاری‌شده HTTPS با سرورهای Duck.ai برقرار می‌شود؛ برنامه هیچ ترافیکی به سرور ثالث دیگری ارسال نمی‌کند.

---

## 🛠️ پیش‌نیازها و ساخت از سورس

در صورت تمایل به کامپایل و توسعه برنامه از سورس‌کد:

1. **ابزارهای مورد نیاز:**
   - Git
   - Node.js (نسخه ۱۸ یا بالاتر)
   - Python 3.11 یا بالاتر
   - Rust و ابزار Cargo (آخرین نسخه با پشتیبانی از Tauri v2)

2. **دستورات ساخت و اجرا:**

</div>

<div dir="ltr">

```bash
# دریافت مخزن
git clone https://github.com/MSNsoftware/DuckBridge.git
cd DuckBridge

# نصب وابستگی‌های رابط و سرور
npm install
npm --prefix server install
pip install -r server/requirements.txt

# اجرای محیط توسعه
npm run tauri dev

# کامپایل نسخه‌ی نهایی نصبی (Release Build)
npm run tauri build
```

</div>

<div dir="rtl">

فایل‌های خروجی کامپایل‌شده در مسیر زیر قرار می‌گیرند:
`src-tauri/target/release/bundle/`

---

## ⚠️ نکات و محدودیت‌ها

- **وابستگی به سرویس داک‌داک‌گو:** پایداری سرویس وابسته به آنلاین بودن و سیاست‌های دسترسی Duck.ai است.
- **توالی درخواست‌ها (Concurrency Serializer):** به دلیل محدودیت‌های ضد اسپم داک‌داک‌گو، درخواست‌های چت به صورت ترتیبی با سمافور هدایت می‌شوند تا آی‌پی کاربر مسدود نشود.
- **حافظه موقت تصاویر:** تا ۵۰ تصویر آخر تولیدشده در حافظه رم نگهداری می‌شوند و با بستن کامل سرور پاک خواهند شد.
- **عدم پشتیبانی از Embeddings:** سرویس Duck.ai ارائه‌دهنده مدل‌های Embedding متنی نیست؛ در صورت ارسال درخواست به `/v1/embeddings` خطای راهنمای 501 بازگردانده می‌شود تا کلاینت‌ها از ارائه‌دهنده دیگر استفاده کنند.

---

## 🤝 مشارکت در توسعه

از هرگونه مشارکت، گزارش ایراد یا ارائه پیشنهادهای بهینه‌سازی استقبال می‌کنیم:
1. پروژه را Fork کنید.
2. یک Branch جدید برای رفع باگ یا قابلیت مدنظرتان بسازید.
3. تغییرات خود را Commit کرده و یک Pull Request ارسال کنید.

---

## 👤 توسعه‌دهنده و سلب مسئولیت

طراحی و پیاده‌سازی توسط: **محمد صادق نوروزیان (Mohammad Sadegh Norouzian)**

- **گیت‌هاب:** [@MSNsoftware](https://github.com/MSNsoftware)
- **تلگرام:** [@MSNoroozian](https://t.me/MSNoroozian)

> **سلب مسئولیت:** DuckBridge یک پروژه مستقل، متن‌باز و غیررسمی است و هیچ‌گونه وابستگی تجاری یا اداری با موتور جستجوی DuckDuckGo ندارد.

</div>

---

<div dir="ltr">

# 🇬🇧 English

## Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Connecting OpenAI Clients](#-connecting-openai-clients)
- [API Reference](#-api-reference)
- [Security & Privacy](#-security--privacy)
- [Build from Source](#-build-from-source)
- [Limitations & Notes](#-limitations--notes)
- [Credits & Disclaimer](#-credits--disclaimer)

---

## 🦆 Overview

**DuckBridge** is a modern, lightweight, high-performance desktop application for **Windows** and **Linux** that serves as a zero-configuration local API gateway translating OpenAI-compatible API calls directly to [Duck.ai](https://duck.ai).

It allows AI development tools, coding assistants, and local clients to connect to Duck.ai's free state-of-the-art models (such as GPT-6 Luna, Claude 3.5/4.5 Haiku, Mistral Small, etc.) through the standard **OpenAI Chat Completions** interface without requiring external paid API keys.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔌 **Strict OpenAI API Compliance** | Full drop-in compatibility for `/v1/chat/completions`, `/v1/models`, and `/v1/images/generations` with Cursor, Continue, Chatbox, and LangChain |
| ⚡ **Zero-DB & 100% In-Memory** | Completely eliminated database overhead and SQLite locking; fast in-memory metrics and zero database connection setup |
| 🌊 **Standard SSE Streaming with Stop Chunks** | Real-time token streaming compliant with OpenAI specs, featuring the terminal `finish_reason: "stop"` chunk to prevent client hangs |
| 🔄 **One-Click Server Restart** | Dedicated restart action in the sidebar, settings view, and Windows system tray with smart `TIME_WAIT` socket cleanup |
| 🛡️ **Supervisor & Stream Watchdog** | Process auto-recovery on backend crashes and a 45-second stream idle watchdog that unlocks the concurrency semaphore upon silent drops |
| 🌐 **Advanced SOCKS5 & HTTP Proxy** | Seamless proxy support with automatic upgrade to `socks5h://` for remote DNS resolution, bypassing ISP-level blocking |
| 🖼️ **Image Generation with Absolute URLs** | OpenAI-compliant image generation powered by Duck.ai's Luna model, returning reachable absolute URLs for instant rendering |
| 🧩 **Multimodal & Null Content Support** | Gracefully handles `content: null` and array-based content blocks produced by agentic coding tools (e.g. Cursor agentic tools) |
| 🧪 **Built-in Playground with Abort** | Live test runner for chat and image models with instant TTFT latency benchmarking and manual streaming cancellation |
| 🖥️ **Desktop Native Integration** | System tray minimization, login auto-start, and automatic child-process termination via Windows Job Objects |

---

## ⚙️ Architecture

```text
┌────────────────────────────────────────────────────────┐
│               OpenAI-Compatible Clients                │
│    Cursor · Continue.dev · Chatbox · Roo Code · LangChain  │
└───────────────────────────┬────────────────────────────┘
                            │  Standard OpenAI API Requests
                            ▼
┌────────────────────────────────────────────────────────┐
│                  DuckBridge Gateway                    │
│                 http://127.0.0.1:8765                  │
│                                                        │
│  FastAPI Sidecar · Stream Watchdog · 100% In-Memory    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Duck.ai Backend                      │
│     Challenge Solver (Node.js/JSDOM) · Prompt Folding  │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / SOCKS5h
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Duck.ai Cloud API                     │
└────────────────────────────────────────────────────────┘

                 Tauri Desktop Shell
       Supervisor · System Tray · One-Click Restart
```

---

## 🚀 Quick Start

### 1. Download
Download the latest prebuilt package from the [GitHub Releases](https://github.com/MSNsoftware/DuckBridge/releases/latest) page:
- **Windows:** `.exe` (NSIS Installer) or `.msi`
- **Linux:** `.AppImage` (portable) or `.deb`

### 2. Run and Connect
1. Launch **DuckBridge**.
2. Click **Start Server** in the sidebar.
3. Copy the Base URL:

```text
http://127.0.0.1:8765/v1
```

> **Requirement:** DuckBridge requires Node.js (version 18 or newer) on your system to evaluate Duck.ai's anti-bot challenges.

---

## 🔌 Connecting OpenAI Clients

### Python Example (Official OpenAI SDK)

```bash
pip install openai
```

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8765/v1",
    api_key="duckbridge-local",
)

# 1. Streaming chat completion
stream = client.chat.completions.create(
    model="gpt-6-luna",
    messages=[{"role": "user", "content": "Write a haiku about programming."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)

# 2. Image generation
image_resp = client.images.generate(
    prompt="A futuristic neon city at night",
    n=1,
    size="1024x1024"
)
print("Image URL:", image_resp.data[0].url)
```

---

## 🧭 API Reference

Base Endpoint: `http://127.0.0.1:8765`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health, uptime, and Node.js challenge runner status |
| `GET` | `/metrics` | Total requests, successes, errors, and average latency (seconds) |
| `GET` | `/v1/models` | Live catalog of Duck.ai models with OpenAI schema |
| `POST` | `/v1/chat/completions` | Standard chat completions (streaming and non-streaming) |
| `POST` | `/v1/images/generations` | Image generation (returns absolute URL or base64 JSON) |
| `GET` | `/v1/images/content/{id}` | Download generated image from in-memory cache |
| `GET` | `/docs` | Interactive Swagger API documentation |

---

## 🛠️ Build from Source

```bash
# Clone the repository
git clone https://github.com/MSNsoftware/DuckBridge.git
cd DuckBridge

# Install frontend and backend dependencies
npm install
npm --prefix server install
pip install -r server/requirements.txt

# Run in development mode
npm run tauri dev

# Build production installers
npm run tauri build
```

---

## 👤 Credits & Disclaimer

Designed and developed by **Mohammad Sadegh Norouzian**:
- **GitHub:** [@MSNsoftware](https://github.com/MSNsoftware)
- **Telegram:** [@MSNoroozian](https://t.me/MSNoroozian)

*Disclaimer: DuckBridge is an independent, unofficial open-source project and is not affiliated with, endorsed by, or sponsored by DuckDuckGo.*

---

<div align="center">

**Made with care by [MSNsoftware](https://github.com/MSNsoftware)**

[⬆ Return to Top](#-duckbridge)

</div>

</div>
