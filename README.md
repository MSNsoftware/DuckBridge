<div align="center">

# 🦆 DuckBridge

### دروازه‌ی محلی Duck.ai با رابط دسکتاپ و API سازگار با OpenAI

**Duck.ai را از طریق یک API محلی، در ابزارها و کلاینت‌های سازگار با OpenAI به کار بگیرید.**

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-2563eb?style=for-the-badge&logo=windows&logoColor=white)](#-پشتیبانی-از-سیستم%E2%80%8Cعامل)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-FastAPI-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/license-0BSD-brightgreen?style=for-the-badge)](LICENSE)

[دانلود آخرین نسخه](https://github.com/MSNsoftware/DuckBridge/releases/latest) · [گزارش مشکل](https://github.com/MSNsoftware/DuckBridge/issues) · [English](#-english)

</div>

---

## فهرست مطالب

- [معرفی](#-معرفی)
- [قابلیت‌ها](#-قابلیت‌ها)
- [نحوه‌ی کار](#-نحوه‌ی-کار)
- [شروع سریع](#-شروع-سریع)
- [اتصال به کلاینت‌های OpenAI](#-اتصال-به-کلاینت‌های-openai)
- [API و مسیرها](#-api-و-مسیرها)
- [امنیت و حریم خصوصی](#-امنیت-و-حریم-خصوصی)
- [پیش‌نیازهای توسعه](#️-پیش‌نیازهای-توسعه)
- [ساخت از سورس](#️-ساخت-از-سورس)
- [محدودیت‌ها و نکات مهم](#️-محدودیت‌ها-و-نکات-مهم)
- [مشارکت](#-مشارکت)
- [اعتبار و سلب مسئولیت](#-اعتبار-و-سلب-مسئولیت)
- [English](#-english)

---

## 🦆 معرفی

**DuckBridge** یک برنامه‌ی دسکتاپ برای Windows و Linux است که یک دروازه‌ی API محلی برای [Duck.ai](https://duck.ai) راه‌اندازی و مدیریت می‌کند.

این پروژه یک چت‌بات یا رابط گفت‌وگوی مستقل نیست؛ هدف آن فراهم‌کردن یک نقطه‌ی اتصال محلی با ساختار آشنای **OpenAI API** است تا بتوانید Duck.ai را از طریق ابزارهایی که از API سازگار با OpenAI پشتیبانی می‌کنند، فراخوانی کنید.

DuckBridge از یک رابط دسکتاپ مبتنی بر Tauri و React در کنار یک سرویس محلی FastAPI استفاده می‌کند.

## ✨ قابلیت‌ها

| قابلیت | توضیحات |
|---|---|
| 🔌 **OpenAI-compatible API** | ارائه‌ی مسیرهای آشنای Chat Completions و Models |
| 🌊 **Streaming** | پشتیبانی از پاسخ جریانی و غیرجریانی در Chat Completions |
| 🖼️ **تولید تصویر** | ارائه‌ی مسیر سازگار با OpenAI برای تولید تصویر از طریق قابلیت Luna در Duck.ai |
| 🧠 **فهرست مدل‌ها** | دریافت فهرست مدل‌ها از Duck.ai و نمایش آن در داشبورد |
| 🔑 **مدیریت API Key** | ساخت و حذف کلیدهای دسترسی؛ ذخیره‌ی هش SHA-256 کلیدها |
| 🛡️ **کنترل دسترسی** | امکان فعال‌کردن الزام API Key برای درخواست‌ها |
| 🌐 **مدیریت Proxy** | حالت مستقیم، پروکسی سیستم و فهرست پروکسی‌های دستی |
| 📊 **پایش سرویس** | مشاهده‌ی وضعیت، مدت فعالیت، تعداد درخواست‌ها، خطاها و میانگین تأخیر |
| 🧪 **API Tester** | ارسال درخواست آزمایشی و مشاهده‌ی پاسخ از داخل برنامه |
| 🖥️ **مدیریت دسکتاپ** | کنترل سرور، گزارش‌ها، System Tray و اجرای خودکار |
| 🎨 **رابط دو‌زبانه** | فارسی با چینش RTL و انگلیسی با چینش LTR |
| 🌗 **پوسته‌ها** | حالت روشن، تاریک و هماهنگ با سیستم |
| 🔄 **به‌روزرسانی** | زیرساخت بررسی و دریافت به‌روزرسانی از GitHub Releases |

## ⚙️ نحوه‌ی کار

```text
┌──────────────────────────────┐
│       OpenAI Client          │
│  Chatbox · Continue · ...    │
└──────────────┬───────────────┘
               │  OpenAI-compatible HTTP
               ▼
┌──────────────────────────────┐
│       DuckBridge API         │
│     http://127.0.0.1:8765    │
│                              │
│  FastAPI · Auth · Streaming  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        Duck.ai Backend       │
│  Challenge solver · Models   │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│          Duck.ai             │
└──────────────────────────────┘

       Tauri Desktop Manager
   Settings · Logs · Proxy · Keys
```

برنامه، سرویس API را به‌صورت محلی اجرا می‌کند. کلاینت‌های دیگر به آدرس محلی متصل می‌شوند و DuckBridge درخواست‌ها را به Duck.ai منتقل می‌کند.

## 🚀 شروع سریع

### ۱. دریافت برنامه

به صفحه‌ی [آخرین انتشارها (Releases)](https://github.com/MSNsoftware/DuckBridge/releases/latest) بروید و فایل متناسب با سیستم‌عامل خود را دریافت کنید.

| سیستم‌عامل | فرمت‌های انتشار |
|---|---|
| Windows | `.exe` (NSIS) و `.msi` |
| Linux | `.AppImage` و `.deb` |

### ۲. نصب و اجرا

1. فایل دریافت‌شده را نصب یا اجرا کنید.
2. DuckBridge را باز کنید.
3. سرور را از داشبورد روشن کنید؛ در صورت فعال‌بودن گزینه‌ی شروع خودکار، سرور هنگام راه‌اندازی برنامه شروع می‌شود.
4. آدرس Base URL را از داشبورد کپی کنید.

آدرس پیش‌فرض:

```text
http://127.0.0.1:8765/v1
```

> **نکته‌ی مهم درباره‌ی پیش‌نیازهای اجرا:** نسخه‌ی فعلی برنامه، سرویس Python و حل‌کننده‌ی چالش مبتنی بر Node.js را به‌صورت پردازش‌های جانبی اجرا می‌کند. بنابراین نصب Python و Node.js و وابستگی‌های مربوط به سرور ممکن است روی سیستم مقصد لازم باشد. جزئیات در بخش [پیش‌نیازها](#️-پیش‌نیازهای-توسعه) آمده است.

## 🔌 اتصال به کلاینت‌های OpenAI

در تنظیمات ارائه‌دهنده‌ی سفارشی (Custom OpenAI Provider) در کلاینت خود، مقادیر زیر را وارد کنید:

| تنظیم | مقدار |
|---|---|
| Base URL | `http://127.0.0.1:8765/v1` |
| API Key | کلیدی که در DuckBridge ساخته‌اید؛ در حالت دسترسی آزاد، مقدار دلخواه |
| Model | یکی از شناسه‌های نمایش‌داده‌شده در تب Models |

### نمونه با Python و کتابخانه‌ی OpenAI

ابتدا کتابخانه را نصب کنید:

```bash
pip install openai
```

سپس:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8765/v1",
    api_key="YOUR_DUCKBRIDGE_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-6-luna",
    messages=[
        {"role": "user", "content": "سلام! خودت را معرفی کن."}
    ],
)

print(response.choices[0].message.content)
```

برای دریافت پاسخ جریانی:

```python
stream = client.chat.completions.create(
    model="gpt-6-luna",
    messages=[{"role": "user", "content": "یک داستان کوتاه بنویس."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

> شناسه‌ی مدل نمونه است. برای مشاهده‌ی مدل‌های در دسترس، از `GET /v1/models` یا تب Models در برنامه استفاده کنید.

## 🧭 API و مسیرها

آدرس پایه‌ی محلی:

```text
http://127.0.0.1:8765
```

| متد | مسیر | کاربرد |
|---|---|---|
| `GET` | `/health` | وضعیت سرویس و اطلاعات سلامت |
| `GET` | `/metrics` | آمار درخواست‌ها، خطاها و تأخیر |
| `GET` | `/v1/models` | فهرست مدل‌ها با ساختار سازگار با OpenAI |
| `POST` | `/v1/chat/completions` | تکمیل گفت‌وگو، با پشتیبانی از streaming |
| `POST` | `/v1/images/generations` | تولید تصویر |
| `GET` | `/v1/images/content/{id}` | دریافت تصویر تولیدشده از حافظه‌ی موقت |
| `POST` | `/api-keys` | ساخت کلید API (نیازمند توکن ادمین) |
| `GET` | `/api-keys` | فهرست کلیدها (نیازمند توکن ادمین) |
| `DELETE` | `/api-keys/{key}` | حذف کلید (نیازمند توکن ادمین) |

مستندات تعاملی FastAPI نیز پس از اجرای سرویس در دسترس است:

```text
http://127.0.0.1:8765/docs
```

### نمونه‌ی درخواست مستقیم با cURL

```bash
curl http://127.0.0.1:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_DUCKBRIDGE_API_KEY" \
  -d '{
    "model": "gpt-6-luna",
    "messages": [
      {"role": "user", "content": "Hello from DuckBridge"}
    ],
    "stream": false
  }'
```

### تولید تصویر

```bash
curl http://127.0.0.1:8765/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_DUCKBRIDGE_API_KEY" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "A minimal illustration of a blue duck",
    "n": 1,
    "size": "1024x1024"
  }'
```

در حالت پیش‌فرض، پاسخ شامل یک مسیر محلی برای دریافت تصویر است. محتوای تصویر در حافظه نگهداری می‌شود و کش فعلی ظرفیت محدودی دارد.

## 🔐 امنیت و حریم خصوصی

- سرویس به‌صورت پیش‌فرض روی `127.0.0.1` گوش می‌دهد؛ یعنی فقط از همان دستگاه قابل دسترسی است.
- می‌توانید الزام کلید API را از تنظیمات فعال کنید. در این حالت درخواست‌های API باید هدر `Authorization: Bearer ...` معتبر داشته باشند.
- کلیدهای ساخته‌شده با SHA-256 هش می‌شوند و هش آن‌ها در پایگاه داده ذخیره می‌شود.
- توکن ادمین برای مدیریت کلیدها استفاده می‌شود؛ آن را محرمانه نگه دارید.
- در حالت دسترسی آزاد، هر برنامه‌ای که به سرویس محلی دسترسی داشته باشد می‌تواند API را فراخوانی کند. برای استفاده‌ی روزمره، فعال‌کردن الزام API Key توصیه می‌شود.
- DuckBridge برای کارکرد خود به ارتباط شبکه‌ای با Duck.ai نیاز دارد؛ درخواست‌ها صرفاً در دستگاه باقی نمی‌مانند.

**هشدار:** این پروژه را بدون بازبینی تنظیمات امنیتی روی شبکه‌ی عمومی یا رابطی غیر از loopback در دسترس دیگران قرار ندهید. این پروژه جایگزین یک API رسمی یا سرویس میزبانی‌شده‌ی سازمانی نیست.

## 🛠️ پیش‌نیازهای توسعه

برای اجرای پروژه از سورس، موارد زیر لازم‌اند:

| ابزار | نسخه / توضیح |
|---|---|
| Git | نسخه‌ی جدید |
| Node.js | نسخه‌ی ۲۰ برای محیط CI؛ Node.js 18 یا بالاتر برای حل‌کننده‌ی چالش |
| npm | همراه Node.js |
| Python | نسخه‌ی ۳.۱۱ یا بالاتر |
| Rust | ابزارهای `rustc` و `cargo`؛ حداقل سازگار با Tauri 2 |
| وابستگی‌های Tauri | وابسته به سیستم‌عامل؛ در Linux به کتابخانه‌های WebKitGTK و ابزارهای ساخت نیاز است |

وابستگی‌های Python و JavaScript سرور:

```bash
pip install -r server/requirements.txt
npm --prefix server install
```

## 🧑‍💻 ساخت از سورس

مخزن را دریافت کنید:

```bash
git clone https://github.com/MSNsoftware/DuckBridge.git
cd DuckBridge
```

وابستگی‌های رابط و سرور را نصب کنید:

```bash
npm install
npm --prefix server install
pip install -r server/requirements.txt
```

اجرای نسخه‌ی توسعه:

```bash
npm run tauri dev
```

ساخت نسخه‌ی قابل انتشار:

```bash
npm run tauri build
```

خروجی بسته‌ها در مسیر زیر قرار می‌گیرد:

```text
src-tauri/target/release/bundle/
```

فرمت‌های پیکربندی‌شده برای انتشار:

- Windows: `msi` و `nsis` (`.exe`)
- Linux: `AppImage` و `deb`

### خط انتشار خودکار

با Push کردن یک تگ با الگوی `v*`، GitHub Actions گردش‌کار انتشار را اجرا می‌کند. این گردش‌کار برای Windows و Linux خروجی می‌سازد و در صورت اجرای موفق، فایل‌ها را در GitHub Release منتشر می‌کند.

نمونه:

```bash
git tag v0.1.4
git push origin v0.1.4
```

برای امضای به‌روزرسانی‌ها، Secrets مربوط به کلید خصوصی Tauri باید در تنظیمات مخزن پیکربندی شده باشند.

## ⚠️ محدودیت‌ها و نکات مهم

- **وابستگی به Duck.ai:** عملکرد پروژه به در دسترس‌بودن Duck.ai و تغییرات احتمالی سرویس آن وابسته است. تغییرات سمت سرویس ممکن است نیازمند به‌روزرسانی DuckBridge باشد.
- **محدودیت نرخ و دسترسی:** Duck.ai ممکن است درخواست‌ها را محدود یا رد کند. DuckBridge خطاهای upstream را به کلاینت منتقل می‌کند و برای برخی پاسخ‌های `418` و `429` مکث کوتاه در نظر می‌گیرد.
- **پردازش درخواست‌ها:** فراخوانی‌های upstream در پیاده‌سازی فعلی به‌صورت ترتیبی انجام می‌شوند تا احتمال برخورد با محدودیت‌های سرویس کاهش یابد.
- **تاریخچه‌ی گفتگو:** Duck.ai در این مسیر stateless است؛ DuckBridge پیام‌های دریافتی را به یک prompt تبدیل می‌کند و تاریخچه‌ی گفتگو را از سمت خودش به‌صورت یک نشست دائمی نگهداری نمی‌کند.
- **تولید تصویر:** خروجی‌های تولید تصویر در کش حافظه نگهداری می‌شوند؛ کش فعلی محدود به آخرین ۵۰ تصویر است و با راه‌اندازی مجدد سرویس از بین می‌رود.
- **ویرایش تصویر و Vision:** مسیر `/v1/images/edits` در نسخه‌ی فعلی پیاده‌سازی نشده و پاسخ `501` می‌دهد.
- **سازگاری API:** سازگاری با OpenAI در سطح مسیرها و ساختار درخواست/پاسخ هدف‌گذاری شده است؛ به معنی پشتیبانی از تمام قابلیت‌ها و جزئیات API رسمی OpenAI نیست.
- **دسترسی مدل‌ها:** نام و دسترسی مدل‌ها ممکن است در طول زمان در Duck.ai تغییر کند.

## 🤝 مشارکت

از گزارش باگ، پیشنهاد قابلیت و مشارکت در توسعه استقبال می‌کنیم.

1. مخزن را Fork کنید.
2. یک Branch با نام معنادار بسازید.
3. تغییرات خود را همراه با توضیح و در صورت امکان تست ثبت کنید.
4. یک Pull Request ارسال کنید.

برای گزارش مشکل، لطفاً سیستم‌عامل، نسخه‌ی DuckBridge، مراحل بازتولید و گزارش خطای مرتبط را در [Issues](https://github.com/MSNsoftware/DuckBridge/issues) قرار دهید. پیش از ارسال، اطلاعات حساس مانند API Key و توکن ادمین را حذف کنید.

## 👤 اعتبار و سلب مسئولیت

طراحی و توسعه: **محمد صادق نوروزیان (Mohammad Sadegh Norouzian)**

- GitHub: [@MSNsoftware](https://github.com/MSNsoftware)
- Telegram: [@MSNoroozian](https://t.me/MSNoroozian)

DuckBridge یک پروژه‌ی مستقل و غیررسمی است و وابستگی، تأیید یا حمایت رسمی از سوی DuckDuckGo ندارد. نام‌ها و علائم تجاری متعلق به صاحبان آن‌ها هستند. کاربران مسئول رعایت شرایط استفاده‌ی Duck.ai و قوانین مربوط به محل استفاده‌ی خود هستند.

---

# 🇬🇧 English

## Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start](#-quick-start)
- [Connect an OpenAI-Compatible Client](#-connect-an-openai-compatible-client)
- [API Reference](#-api-reference)
- [Security and Privacy](#-security-and-privacy)
- [Development Requirements](#️-development-requirements)
- [Build from Source](#️-build-from-source)
- [Limitations](#️-limitations-and-notes)
- [Contributing](#-contributing)
- [Credits and Disclaimer](#-credits-and-disclaimer)

## 🦆 Overview

**DuckBridge** is a desktop application for Windows and Linux that launches and manages a local API gateway for [Duck.ai](https://duck.ai).

It is not a standalone chatbot or chat interface. Its purpose is to expose Duck.ai through a local endpoint with an **OpenAI-compatible API shape**, allowing tools and clients that support custom OpenAI-compatible providers to connect to it.

DuckBridge combines a Tauri + React desktop manager with a local FastAPI service.

## ✨ Features

| Feature | Description |
|---|---|
| 🔌 **OpenAI-compatible API** | Familiar Chat Completions and Models endpoints |
| 🌊 **Streaming** | Streaming and non-streaming chat completions |
| 🖼️ **Image generation** | OpenAI-shaped image generation endpoint powered by Duck.ai's Luna capability |
| 🧠 **Model catalog** | Fetches the available model catalog from Duck.ai |
| 🔑 **API key management** | Create and delete API keys; SHA-256 hashes are stored at rest |
| 🛡️ **Access control** | Optional API-key enforcement |
| 🌐 **Proxy management** | Direct, system proxy, and manually configured proxy entries |
| 📊 **Service monitoring** | Health, uptime, request counts, errors, and average latency |
| 🧪 **API Tester** | Send test requests and inspect responses inside the desktop app |
| 🖥️ **Desktop controls** | Server lifecycle, logs, system tray, and autostart |
| 🌍 **Bilingual UI** | Persian (RTL) and English (LTR) |
| 🌗 **Themes** | Light, dark, and system themes |
| 🔄 **Updates** | Update infrastructure backed by GitHub Releases |

## ⚙️ Architecture

```text
┌──────────────────────────────┐
│       OpenAI Client          │
│  Chatbox · Continue · ...    │
└──────────────┬───────────────┘
               │  OpenAI-compatible HTTP
               ▼
┌──────────────────────────────┐
│       DuckBridge API         │
│     http://127.0.0.1:8765    │
│                              │
│  FastAPI · Auth · Streaming  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│        Duck.ai Backend       │
│  Challenge solver · Models   │
└──────────────┬───────────────┘
               │ HTTPS
               ▼
┌──────────────────────────────┐
│          Duck.ai             │
└──────────────────────────────┘

       Tauri Desktop Manager
   Settings · Logs · Proxy · Keys
```

The desktop application manages the local API process. Compatible clients send requests to the local endpoint, and DuckBridge forwards them to Duck.ai.

## 🚀 Quick Start

### 1. Download

Visit [GitHub Releases](https://github.com/MSNsoftware/DuckBridge/releases/latest) and download the package for your operating system.

| Platform | Release formats |
|---|---|
| Windows | `.exe` (NSIS) and `.msi` |
| Linux | `.AppImage` and `.deb` |

### 2. Install and launch

1. Install or run the downloaded package.
2. Launch DuckBridge.
3. Start the server from the dashboard. If auto-start is enabled, the server starts when the application launches.
4. Copy the Base URL from the dashboard.

Default endpoint:

```text
http://127.0.0.1:8765/v1
```

> **Runtime requirements:** The current application launches a Python service and a Node.js-based challenge solver as child processes. Python, Node.js, and the server dependencies may therefore need to be installed on the target machine. See [Development Requirements](#️-development-requirements).

## 🔌 Connect an OpenAI-Compatible Client

Configure your client's custom OpenAI provider:

| Setting | Value |
|---|---|
| Base URL | `http://127.0.0.1:8765/v1` |
| API Key | A key created in DuckBridge; any placeholder value works when authentication is disabled |
| Model | A model ID shown in the Models tab |

### Python example

Install the OpenAI Python SDK:

```bash
pip install openai
```

Use it with DuckBridge:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8765/v1",
    api_key="YOUR_DUCKBRIDGE_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-6-luna",
    messages=[
        {"role": "user", "content": "Hello! Introduce yourself."}
    ],
)

print(response.choices[0].message.content)
```

Streaming example:

```python
stream = client.chat.completions.create(
    model="gpt-6-luna",
    messages=[{"role": "user", "content": "Write a short story."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

> The model ID above is an example. Use `GET /v1/models` or the application's Models tab to inspect the currently available catalog.

## 🧭 API Reference

Local API root:

```text
http://127.0.0.1:8765
```

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health and runtime information |
| `GET` | `/metrics` | Request, error, and latency metrics |
| `GET` | `/v1/models` | OpenAI-shaped model catalog |
| `POST` | `/v1/chat/completions` | Chat completions, including streaming |
| `POST` | `/v1/images/generations` | Image generation |
| `GET` | `/v1/images/content/{id}` | Retrieve a generated image from the in-memory cache |
| `POST` | `/api-keys` | Create an API key (admin token required) |
| `GET` | `/api-keys` | List API keys (admin token required) |
| `DELETE` | `/api-keys/{key}` | Delete an API key (admin token required) |

FastAPI's interactive documentation is available at:

```text
http://127.0.0.1:8765/docs
```

### cURL example

```bash
curl http://127.0.0.1:8765/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_DUCKBRIDGE_API_KEY" \
  -d '{
    "model": "gpt-6-luna",
    "messages": [
      {"role": "user", "content": "Hello from DuckBridge"}
    ],
    "stream": false
  }'
```

### Image generation

```bash
curl http://127.0.0.1:8765/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_DUCKBRIDGE_API_KEY" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "A minimal illustration of a blue duck",
    "n": 1,
    "size": "1024x1024"
  }'
```

By default, the response contains a local URL for the generated image. Image bytes are kept in a bounded in-memory cache.

## 🔐 Security and Privacy

- The service binds to `127.0.0.1` by default, making it accessible only from the local machine.
- API-key enforcement can be enabled in Settings. When enabled, API requests must include a valid `Authorization: Bearer ...` header.
- Generated API keys are SHA-256 hashed before being stored in the database.
- The admin token is used for key management. Keep it secret.
- With authentication disabled, any local process that can reach the service may call the API. Enabling API-key enforcement is recommended for normal use.
- DuckBridge requires network access to Duck.ai; requests are not processed exclusively on your device.

**Warning:** Do not expose this application on a public network or bind it to a non-loopback interface without reviewing and hardening its security configuration. This project is not a replacement for an official API or an enterprise-hosted service.

## 🛠️ Development Requirements

To build and run the project from source, you need:

| Tool | Version / Notes |
|---|---|
| Git | Recent version |
| Node.js | Version 20 in CI; Node.js 18+ for the challenge solver |
| npm | Included with Node.js |
| Python | Version 3.11+ |
| Rust | `rustc` and `cargo`, compatible with Tauri 2 |
| Tauri system dependencies | OS-specific; Linux requires WebKitGTK and build tooling |

Install the Python and JavaScript server dependencies:

```bash
pip install -r server/requirements.txt
npm --prefix server install
```

## 🧑‍💻 Build from Source

Clone the repository:

```bash
git clone https://github.com/MSNsoftware/DuckBridge.git
cd DuckBridge
```

Install frontend and backend dependencies:

```bash
npm install
npm --prefix server install
pip install -r server/requirements.txt
```

Run the development application:

```bash
npm run tauri dev
```

### Run the UI in a browser (no Rust toolchain)

The React UI can be driven in a plain browser without building the Tauri shell.
A small dev-only control plane (`dev-control/server.mjs`) stands in for the
Tauri `start_server` / `stop_server` / `get_logs` commands, so the dashboard,
API tester, key management and logs all behave the same.

In one terminal:

```bash
npm run dev:control
```

In a second terminal:

```bash
npm run dev
```

Then open <http://localhost:1420>. The control plane listens on
`127.0.0.1:8766` and owns the FastAPI sidecar on `127.0.0.1:8765`.

Inside the Tauri app nothing changes: `src/lib/ipc.ts` detects the Tauri
runtime and forwards every command to Rust, so the desktop build is unaffected.

Build release bundles:

```bash
npm run tauri build
```

Build artifacts are written to:

```text
src-tauri/target/release/bundle/
```

Configured bundle formats:

- Windows: `msi` and `nsis` (`.exe`)
- Linux: `AppImage` and `deb`

### Automated release workflow

Pushing a tag matching `v*` triggers the GitHub Actions release workflow. It builds Windows and Linux bundles and publishes the artifacts to a GitHub Release when the workflow succeeds.

Example:

```bash
git tag v0.1.4
git push origin v0.1.4
```

Tauri updater signing requires the corresponding private-key secrets to be configured in the repository settings.

## ⚠️ Limitations and Notes

- **Duck.ai dependency:** The project depends on Duck.ai availability and behavior. Upstream changes may require updates to DuckBridge.
- **Rate limits and access:** Duck.ai may throttle or reject requests. DuckBridge propagates upstream errors and applies a short cooldown after some `418` and `429` responses.
- **Request concurrency:** Upstream calls are serialized in the current implementation to reduce the chance of triggering service-side restrictions.
- **Conversation state:** This Duck.ai request path is stateless. DuckBridge folds the supplied messages into a prompt; it does not maintain a persistent conversation session of its own.
- **Image generation:** Generated image data is held in memory. The current cache is limited to the latest 50 images and is cleared when the service restarts.
- **Image editing and vision:** The `/v1/images/edits` endpoint is not implemented in the current version and returns `501`.
- **API compatibility:** Compatibility targets familiar OpenAI-style routes and request/response structures. It does not imply support for every feature or edge case of the official OpenAI API.
- **Model availability:** Model IDs and access tiers may change on Duck.ai over time.

## 🤝 Contributing

Bug reports, feature suggestions, and code contributions are welcome.

1. Fork the repository.
2. Create a descriptive branch.
3. Make your changes and include tests where practical.
4. Open a Pull Request with a clear summary.

When reporting a bug, include your OS, DuckBridge version, reproduction steps, and relevant logs. Remove secrets such as API keys and admin tokens before sharing logs.

## 👤 Credits and Disclaimer

Designed and developed by **Mohammad Sadegh Norouzian**.

- GitHub: [@MSNsoftware](https://github.com/MSNsoftware)
- Telegram: [@MSNoroozian](https://t.me/MSNoroozian)

DuckBridge is an independent, unofficial project. It is not affiliated with, endorsed by, or sponsored by DuckDuckGo. All product names and trademarks belong to their respective owners. Users are responsible for complying with Duck.ai's terms of service and applicable local laws.

---

<div align="center">

**Made with care by [MSNsoftware](https://github.com/MSNsoftware)**

[⬆ بازگشت به بالا](#-duckbridge)

</div>
