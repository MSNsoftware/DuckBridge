# DuckBridge Desktop

Local Duck.ai API gateway manager — Tauri + React, Windows/Linux. Not a chat UI, just a sidecar manager + settings.

## Features
- Tray app (minimize to tray, autostart optional)
- Bundled FastAPI + Node jsdom sidecar (spawned by Rust)
- Editable HOST/PORT (default 127.0.0.1:8765) with conflict detection
- Base URL copy box with curl/Python/JS snippets
- API Key management (list/create/delete)
- Live models from `/v1/models` + models page
- Health/Metrics + logs viewer
- Proxy: Direct / System / Manual list (SOCKS/HTTP)
- Theme light/dark/system + EN/FA (RTL)
- Auto-update toggle (GitHub)

## Run (dev)
1. Copy/reference server folder (already bundled in ./server)
2. `npm install`
3. `npm run tauri dev` (opens window, starts sidecar)

Build: `npm run tauri build` → bundle targets msi/nsis/appimage/deb per tauri.conf.json.

## API (backend only, no chat/image UI)
- POST /v1/chat/completions
- GET /v1/models
- POST /v1/images/generations + GET /v1/images/content/{id}
- GET /health, /metrics

Copy Base URL from Dashboard and use in any OpenAI-compatible client.
