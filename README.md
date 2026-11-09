# DuckBridge Desktop

Local Duck.ai API gateway manager — Tauri + React, Windows/Linux. Not a chat UI, just an API sidecar manager + settings.

> Duck.ai is DuckDuckGo's anonymous AI chat proxy at https://duck.ai. This project turns it into an OpenAI-compatible API on your own machine.

## Features
- Tray app (minimize to tray, autostart optional)
- Bundled FastAPI + Node jsdom sidecar (spawned by Rust)
- Editable HOST/PORT (default 127.0.0.1:8765) with conflict detection
- Base URL copy box with curl/Python/JS snippets
- API Key management (list/create/delete, SHA-256 hashed at rest)
- Live models from `/v1/models` (free green / paid red, from Duck.ai catalog)
- Health/Metrics + logs viewer
- Proxy: Direct / System / Manual list (SOCKS/HTTP)
- Theme light/dark/system + EN/FA (RTL, Vazirmatn bundled)
- Auto-update (signed, GitHub — optional, defaults on)
- Folders kept for you to explore: `server/` bundled API, `src-tauri/` Tauri host

## Screenshots
_Open the app and check the Dashboard for the Base URL — that's all you need to plug into any OpenAI client._

## Requirements
- Windows 10/11 or Linux (Debian/Ubuntu)
- Node.js >= 18 (for dev + jsdom solver)
- Python 3.11+ (for sidecar; bundled in release builds)

## Run (dev)
```bat
cd duckbridge-desktop
npm install
npm --prefix server install
npm run tauri dev
```
Build: `npm run tauri build` → bundle targets msi/nsis/appimage/deb per `src-tauri/tauri.conf.json`.

## API (backend only)
- `POST /v1/chat/completions`
- `GET /v1/models` (live catalog, free/paid tiers)
- `POST /v1/images/generations` + `GET /v1/images/content/{id}` (Luna GenerateImage)
- `GET /health`, `GET /metrics`
- `GET/POST/DELETE /api-keys` (admin token)

Copy Base URL from Dashboard and use in any OpenAI-compatible client:
```python
from openai import OpenAI
client = OpenAI(api_key="anything", base_url="http://127.0.0.1:8765/v1")
client.chat.completions.create(model="gpt-6-luna", messages=[{"role":"user","content":"Hi"}])
```

## Publishing
See **GITHUB_PUBLISH.md** for the step-by-step release runbook (secrets, updater, installers).

## Disclaimer
Unofficial, for personal/educational use. Not affiliated with DuckDuckGo. Respect Duck.ai's terms of service and rate limits.
