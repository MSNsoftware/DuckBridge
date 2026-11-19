from typing import List, Optional
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
import asyncio
import time
import json
import os
import shutil
import logging
import base64
import uuid
import threading
from collections import deque

from fastapi import FastAPI, Header, HTTPException, Depends, Request
from starlette.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from dotenv import load_dotenv

from duckai_backend import DuckAI, DuckAIError, SUPPORTED_MODELS, DEFAULT_MODEL, resolve_model, build_prompt, fetch_models, fetch_models_full, get_max_chars_for_model

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# HERE  = directory of this file (read-only: the install directory)
# DATA  = writable directory for runtime state (.env, runtime config).
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.getenv("DATA_DIR") or HERE
os.makedirs(DATA_DIR, exist_ok=True)

# Load environment variables from .env file
load_dotenv(os.path.join(DATA_DIR, ".env"))
load_dotenv()

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
PORT = int(os.getenv("PORT", "8765"))
HOST = os.getenv("HOST", "127.0.0.1")
# Rate limit: max requests per minute per IP (tunable)
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
MAX_PROMPT_CHARS = int(os.getenv("MAX_PROMPT_CHARS", "15000"))

# --- In-memory metrics (100% in-memory, zero DB dependencies) ---
_metrics = {"total": 0, "success": 0, "errors": 0, "upstream_errors": 0, "last_error": None, "latencies": deque(maxlen=200)}
_metrics_lock = threading.Lock()
_started_at = time.time()
# Image cache (in-memory, last 50)
_image_cache: dict[str, bytes] = {}
_image_cache_order: deque[str] = deque(maxlen=50)
# Serializes upstream calls - bursts trigger Duck.ai fraud 418 (d78d)
_upstream_sem = asyncio.Semaphore(1)
# Cooldown after 418/429 to avoid hammering
_cooldown_until = 0.0
# Simple per-IP rate limiter
_rate_hits: dict[str, list[float]] = {}
_rate_lock = threading.Lock()

logger.info("Bind: %s:%s | rate_limit=%s/min | max_prompt_chars=%s", HOST, PORT, RATE_LIMIT_PER_MIN, MAX_PROMPT_CHARS)

node_bin = os.getenv("NODE_EXE") or shutil.which("node") or "node"
if not (os.path.isabs(node_bin) and os.path.exists(node_bin)) and shutil.which(node_bin) is None:
    logger.warning("node is not on PATH — duck.ai challenge solver needs Node.js >= 18")

# --- Open Local Access Auth Dependencies ---
async def get_admin_key(authorization: Optional[str] = Header(None)):
    return "ok"

async def get_api_key(authorization: Optional[str] = Header(None)):
    # Local open access: accept any Bearer token or none (Chatbox, Cursor, Continue)
    return "ok"

# --- Pydantic Models ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str = DEFAULT_MODEL
    messages: List[ChatMessage]
    stream: Optional[bool] = False

class ImageGenerationRequest(BaseModel):
    model: Optional[str] = None
    prompt: str
    n: int = 1
    size: Optional[str] = "1024x1024"
    response_format: Optional[str] = "url"  # url | b64_json

# --- FastAPI App Setup ---
app = FastAPI(title="duckduckgo-ai-openai-api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://tauri.localhost", "http://localhost:*", "http://127.0.0.1:*", "https://tauri.localhost"],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Skip health/models (cheap)
    if request.url.path in ("/health", "/models", "/v1/models", "/metrics"):
        return await call_next(request)
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    with _rate_lock:
        hits = _rate_hits.get(ip, [])
        hits = [t for t in hits if now - t < 60]
        if len(hits) >= RATE_LIMIT_PER_MIN:
            return Response(content='{"detail":"Rate limit exceeded"}', status_code=429, media_type="application/json")
        hits.append(now)
        _rate_hits[ip] = hits
    response = await call_next(request)
    return response

def _status_to_http(status) -> int:
    if status == 429:
        return 429
    if status == 404:
        return 404
    if status and 400 <= status < 500:
        return 400
    return 502

@app.get("/", response_class=HTMLResponse)
async def serve_html():
    with open(os.path.join(HERE, "website.html"), "r", encoding="utf-8") as file:
        html_content = file.read()
    return HTMLResponse(content=html_content)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "uptime_sec": int(time.time() - _started_at),
        "node": shutil.which("node") is not None,
        "models": len(SUPPORTED_MODELS),
        "default_model": DEFAULT_MODEL,
        "bind": f"{HOST}:{PORT}",
        "auth_enabled": IGNPRE_API_KEYS != "True",
        "admin_token_set": bool(ADMIN_TOKEN),
    }

@app.get("/metrics")
async def metrics():
    with _metrics_lock:
        lats = list(_metrics["latencies"])
    avg = sum(lats) / len(lats) if lats else 0
    with _metrics_lock:
        return {
            "total_requests": _metrics["total"],
            "success": _metrics["success"],
            "errors": _metrics["errors"],
            "upstream_errors": _metrics["upstream_errors"],
            "last_error": _metrics["last_error"],
            "avg_latency_sec": round(avg, 2),
            "rate_limit_per_min": RATE_LIMIT_PER_MIN,
        }

@app.get("/models")
@app.get("/v1/models")
async def list_models(api_key: str = Depends(get_api_key)):
    full = await asyncio.to_thread(lambda: fetch_models_full())
    models = full["ids"]
    return {
        "object": "list",
        "data": [
            {"id": m, "object": "model", "created": int(time.time()), "owned_by": "duck.ai", "free": next((x["free"] for x in full["full"] if x["id"] == m), True), "tiers": next((x["tiers"] for x in full["full"] if x["id"] == m), [])}
            for m in models
        ],
    }

# --- Image Edit / Vision (Phase B) ---
# Duck.ai has no standalone /images/edits or vision upload endpoint on the jsdom chat path.
# Text-to-image is via Luna GenerateImage (above). Image edit/vision needs the
# duck.ai file-upload payload (multipart -> chat with image part) which is not yet
# implemented; we return a clear 501 so clients know the limitation.
@app.post("/v1/images/edits")
async def images_edits(api_key: str = Depends(get_api_key)):
    raise HTTPException(status_code=501, detail="Image edits require Vision upload (not yet implemented on jsdom path). Text-to-image via /v1/images/generations works (gpt-6-luna).")

# --- Chat Completion Endpoint ---
async def _ask_serialized(prompt: str, model: str):
    global _cooldown_until
    # Honor cooldown after 418/429
    wait = _cooldown_until - time.time()
    if wait > 0:
        await asyncio.sleep(wait)
    async with _upstream_sem:
        try:
            return await asyncio.to_thread(lambda: DuckAI().ask(prompt, model=model))
        except DuckAIError as e:
            if e.status in (418, 429):
                _cooldown_until = time.time() + 10
            raise

def format_duckai_error(e: Exception) -> tuple[str, str]:
    msg = str(e)
    status = getattr(e, "status", None)
    if status == 429 or "429" in msg or "ERR_RATE_LIMIT" in msg or "ERR_BN_LIMIT" in msg:
        return "RATE_LIMIT", "سقف مصرف روزانه داک‌داک‌گو روی این آی‌پی به پایان رسید (خطای ۴۲۹). لطفاً در تنظیمات پروکسی را فعال یا تغییر دهید."
    if status == 418 or "418" in msg or "ERR_CHALLENGE" in msg:
        return "BOT_BLOCK", "سیستم امنیتی داک‌داک‌گو موقتاً درخواست را محدود کرد (خطای ۴۱۸). چند دقیقه صبر کنید یا پروکسی را تغییر دهید."
    return "UPSTREAM_ERROR", f"خطای داک‌داک‌گو: {msg[:250]}"

@app.post("/chat/completions")
@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    raw_request: Request,
    api_key: str = Depends(get_api_key)
):
    model = (request.model or DEFAULT_MODEL).strip()
    if len(request.messages) > 50:
        raise HTTPException(status_code=400, detail="Too many messages (max 50)")
    total_len = sum(len(m.content or "") for m in request.messages)
    if total_len > 200000:
        raise HTTPException(status_code=400, detail="Request too large (max ~200KB content)")
    max_chars = get_max_chars_for_model(model)
    prompt = build_prompt(request.messages, max_chars=max_chars)
    if not prompt:
        raise HTTPException(status_code=400, detail="Empty prompt")
    t0 = time.time()
    if request.stream:
        async def duckai_streamer():
            global _cooldown_until
            stop_event = threading.Event()
            token_q = asyncio.Queue(maxsize=30)
            loop = asyncio.get_running_loop()
            sentinel = object()

            # Ensure cooldown after 418/429
            wait = _cooldown_until - time.time()
            if wait > 0:
                await asyncio.sleep(wait)

            def producer():
                try:
                    for token in DuckAI().stream(prompt, model=model):
                        if stop_event.is_set():
                            break
                        asyncio.run_coroutine_threadsafe(token_q.put(token), loop).result(timeout=15)
                except Exception as ex:
                    if not stop_event.is_set():
                        asyncio.run_coroutine_threadsafe(token_q.put(ex), loop)
                finally:
                    asyncio.run_coroutine_threadsafe(token_q.put(sentinel), loop)

            async with _upstream_sem:
                threading.Thread(target=producer, daemon=True).start()

                try:
                    while True:
                        if await raw_request.is_disconnected():
                            logger.info("Client disconnected; aborting duck.ai stream")
                            stop_event.set()
                            break
                        try:
                            item = await asyncio.wait_for(token_q.get(), timeout=0.8)
                        except asyncio.TimeoutError:
                            continue
                        if item is sentinel:
                            break
                        if isinstance(item, Exception):
                            if getattr(item, "status", None) in (418, 429):
                                _cooldown_until = time.time() + 10
                            err_type, friendly_msg = format_duckai_error(item)
                            logger.warning("duck.ai stream error [%s]: %s", err_type, item)
                            with _metrics_lock:
                                _metrics["total"] += 1
                                _metrics["errors"] += 1
                                _metrics["upstream_errors"] += 1
                                _metrics["last_error"] = friendly_msg
                            err = {"choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "error"}], "error": friendly_msg}
                            yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
                            break
                        chunk = {
                            "id": f"chatcmpl-{int(time.time())}",
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model,
                            "choices": [{"index": 0, "delta": {"content": item}, "finish_reason": None}],
                        }
                        yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    with _metrics_lock:
                        _metrics["total"] += 1
                        _metrics["success"] += 1
                        _metrics["latencies"].append(time.time() - t0)
                finally:
                    stop_event.set()
                yield "data: [DONE]\n\n"

        return StreamingResponse(duckai_streamer(), media_type="text/event-stream")
    else:
        try:
            result = await _ask_serialized(prompt, model)
            with _metrics_lock:
                _metrics["total"] += 1
                _metrics["success"] += 1
                _metrics["latencies"].append(time.time() - t0)
        except DuckAIError as e:
            err_type, friendly_msg = format_duckai_error(e)
            with _metrics_lock:
                _metrics["total"] += 1
                _metrics["errors"] += 1
                _metrics["upstream_errors"] += 1
                _metrics["last_error"] = friendly_msg
            raise HTTPException(status_code=_status_to_http(e.status), detail=friendly_msg)
        except Exception as e:
            logger.exception("duck.ai ask failed")
            err_type, friendly_msg = format_duckai_error(e)
            with _metrics_lock:
                _metrics["total"] += 1
                _metrics["errors"] += 1
                _metrics["last_error"] = friendly_msg
            raise HTTPException(status_code=502, detail=friendly_msg)
        return {
            "id": f"chatcmpl-{int(time.time())}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": result},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

# --- Image Generation (OpenAI shape, powered by Luna GenerateImage) ---
IMAGE_ALIASES = {"gpt-image-1", "gpt-image-2", "dall-e-3", "image-generation", "gpt-6-luna", "gpt-5.6-luna"}

@app.post("/v1/images/generations")
async def generate_images(req: ImageGenerationRequest, api_key: str = Depends(get_api_key)):
    if not req.prompt or not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt required")
    n = max(1, min(int(req.n or 1), 4))
    size_hint = {"1024x1024": "square", "1792x1024": "landscape", "1024x1792": "portrait"}.get((req.size or "").strip(), "square")
    full_prompt = f"Generate an image ({size_hint} orientation): {req.prompt.strip()}"
    t0 = time.time()
    data_items = []
    for _ in range(n):
        try:
            img_bytes = await asyncio.to_thread(lambda: DuckAI().generate_image(full_prompt, model="gpt-6-luna"))
        except DuckAIError as e:
            with _metrics_lock:
                _metrics["total"] += 1
                _metrics["errors"] += 1
                _metrics["upstream_errors"] += 1
                _metrics["last_error"] = str(e)[:300]
            raise HTTPException(status_code=_status_to_http(e.status), detail=str(e))
        except Exception as e:
            logger.exception("image gen failed")
            with _metrics_lock:
                _metrics["total"] += 1
                _metrics["errors"] += 1
                _metrics["last_error"] = str(e)[:300]
            raise HTTPException(status_code=502, detail=str(e))
        img_id = uuid.uuid4().hex[:16]
        with _metrics_lock:
            _image_cache[img_id] = img_bytes
            _image_cache_order.append(img_id)
            while img_id in _image_cache_order and len(_image_cache) > 50:
                old = _image_cache_order.popleft()
                _image_cache.pop(old, None)
            _metrics["total"] += 1
            _metrics["success"] += 1
            _metrics["latencies"].append(time.time() - t0)
        if (req.response_format or "url") == "b64_json":
            data_items.append({"b64_json": base64.b64encode(img_bytes).decode(), "revised_prompt": req.prompt})
        else:
            data_items.append({"url": f"/v1/images/content/{img_id}", "revised_prompt": req.prompt})
    return {"created": int(time.time()), "data": data_items}

@app.get("/v1/images/content/{img_id}")
async def get_image(img_id: str):
    with _metrics_lock:
        data = _image_cache.get(img_id)
    if not data:
        raise HTTPException(status_code=404, detail="Image not found (expired - cache holds last 50)")
    return Response(content=data, media_type="image/jpeg")

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
