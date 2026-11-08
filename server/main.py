from typing import List, Optional
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field
import asyncio
import time
import json
import os
import shutil
import sqlite3
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
import psycopg2

from duckai_backend import DuckAI, DuckAIError, SUPPORTED_MODELS, DEFAULT_MODEL, resolve_model, build_prompt

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

IGNPRE_API_KEYS = os.getenv("IGNPRE_API_KEYS")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")
PORT = int(os.getenv("PORT", "8765"))
HOST = os.getenv("HOST", "127.0.0.1")
# Rate limit: max requests per minute per IP (tunable)
RATE_LIMIT_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "60"))
MAX_PROMPT_CHARS = int(os.getenv("MAX_PROMPT_CHARS", "15000"))

# --- In-memory metrics (no DB needed for local use) ---
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

# Determine and log the current mode
if IGNPRE_API_KEYS == "True":
    db_mode = "IGNPRE_API_KEYS"
elif DATABASE_URL:
    db_mode = "Postgres"
else:
    db_mode = "SQLite"
logger.info("Database mode: %s", db_mode)
logger.info("Bind: %s:%s | rate_limit=%s/min | max_prompt_chars=%s", HOST, PORT, RATE_LIMIT_PER_MIN, MAX_PROMPT_CHARS)

if shutil.which("node") is None:
    logger.warning("node is not on PATH — duck.ai challenge solver needs Node.js >= 18")

# --- Database Connection Setup ---
def get_db_connection():
    if DATABASE_URL:
        logger.info("Connecting to PostgreSQL.")
        return psycopg2.connect(DATABASE_URL, sslmode='require')
    else:
        logger.info("Connecting to SQLite.")
        return sqlite3.connect("api_keys.db")

# --- Initialize Database ---
def init_db():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if DATABASE_URL:
            # PostgreSQL: table named openai_api_keys
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS openai_api_keys (
                    id SERIAL PRIMARY KEY,
                    key TEXT UNIQUE NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        else:
            # SQLite: table named openai_api_keys
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS openai_api_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
        conn.commit()
        logger.info("Database initialized successfully.")
    finally:
        conn.close()

if IGNPRE_API_KEYS != "True":
    init_db()
else:
    logger.info("IGNPRE_API_KEYS is active; bypassing database initialization.")

# --- Dependency to Validate Admin Key ---
async def get_admin_key(authorization: Optional[str] = Header(None)):
    if IGNPRE_API_KEYS == "True":
        return ""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")
    token = authorization.split(" ")[1]
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid admin token")
    return token

# --- Dependency for API Key Validation ---
async def get_api_key(authorization: Optional[str] = Header(None)):
    if IGNPRE_API_KEYS == "True":
        return ""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")
    token = authorization.split(" ")[1]
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if DATABASE_URL:
            cursor.execute("SELECT id FROM openai_api_keys WHERE key = %s", (token,))
        else:
            cursor.execute("SELECT id FROM openai_api_keys WHERE key = ?", (token,))
        result = cursor.fetchone()
    finally:
        conn.close()
    if not result:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    return token

# --- Pydantic Models ---
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str = DEFAULT_MODEL
    messages: List[ChatMessage]
    stream: Optional[bool] = False

class ApiKeyCreate(BaseModel):
    description: Optional[str] = None

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
    allow_origins=["http://127.0.0.1:8765", "http://localhost:8765", "http://127.0.0.1:8080", "http://localhost:8080"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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
    with open("website.html", "r", encoding="utf-8") as file:
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
async def list_models():
    return {
        "object": "list",
        "data": [
            {"id": m, "object": "model", "created": int(time.time()), "owned_by": "duck.ai"}
            for m in SUPPORTED_MODELS
        ],
    }

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

@app.post("/chat/completions")
@app.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    api_key: str = Depends(get_api_key)
):
    model = (request.model or DEFAULT_MODEL).strip()
    if len(request.messages) > 50:
        raise HTTPException(status_code=400, detail="Too many messages (max 50)")
    total_len = sum(len(m.content or "") for m in request.messages)
    if total_len > 200000:
        raise HTTPException(status_code=400, detail="Request too large (max ~200KB content)")
    prompt = build_prompt(request.messages, max_chars=MAX_PROMPT_CHARS)
    if not prompt:
        raise HTTPException(status_code=400, detail="Empty prompt")
    t0 = time.time()
    if request.stream:
        def duckai_streamer():
            try:
                for token in DuckAI().stream(prompt, model=model):
                    chunk = {
                        "id": f"chatcmpl-{int(time.time())}",
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model,
                        "choices": [{"index": 0, "delta": {"content": token}, "finish_reason": None}],
                    }
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                with _metrics_lock:
                    _metrics["total"] += 1
                    _metrics["success"] += 1
                    _metrics["latencies"].append(time.time() - t0)
            except DuckAIError as e:
                logger.warning("duck.ai error (stream): %s", e)
                with _metrics_lock:
                    _metrics["total"] += 1
                    _metrics["errors"] += 1
                    _metrics["upstream_errors"] += 1
                    _metrics["last_error"] = str(e)[:300]
                err = {"choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "error"}],
                       "error": str(e)}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
            except Exception as e:
                logger.exception("duck.ai stream failed")
                with _metrics_lock:
                    _metrics["total"] += 1
                    _metrics["errors"] += 1
                    _metrics["last_error"] = str(e)[:300]
                err = {"choices": [{"index": 0, "delta": {"content": ""}, "finish_reason": "error"}],
                       "error": str(e)}
                yield f"data: {json.dumps(err, ensure_ascii=False)}\n\n"
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
            with _metrics_lock:
                _metrics["total"] += 1
                _metrics["errors"] += 1
                _metrics["upstream_errors"] += 1
                _metrics["last_error"] = str(e)[:300]
            raise HTTPException(status_code=_status_to_http(e.status), detail=str(e))
        except Exception as e:
            logger.exception("duck.ai ask failed")
            with _metrics_lock:
                _metrics["total"] += 1
                _metrics["errors"] += 1
                _metrics["last_error"] = str(e)[:300]
            raise HTTPException(status_code=502, detail=str(e))
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

# --- API Key Management Endpoints ---
@app.get("/api-keys", dependencies=[Depends(get_admin_key)])
async def list_api_keys():
    if IGNPRE_API_KEYS == "True":
        return ""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if DATABASE_URL:
            cursor.execute("SELECT id, key, description, created_at FROM openai_api_keys")
            rows = cursor.fetchall()
            keys = [{"id": r[0], "key": r[1], "description": r[2], "created_at": str(r[3])} for r in rows]
        else:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id, key, description, created_at FROM openai_api_keys")
            rows = cursor.fetchall()
            keys = [dict(row) for row in rows]
    finally:
        conn.close()
    return {"api_keys": keys}

@app.post("/api-keys", dependencies=[Depends(get_admin_key)])
async def create_api_key_endpoint(api_key_create: ApiKeyCreate):
    if IGNPRE_API_KEYS == "True":
        return ""
    import secrets
    new_key = secrets.token_hex(16)
    description = api_key_create.description
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if DATABASE_URL:
            cursor.execute("INSERT INTO openai_api_keys (key, description) VALUES (%s, %s)", (new_key, description))
        else:
            cursor.execute("INSERT INTO openai_api_keys (key, description) VALUES (?, ?)", (new_key, description))
        conn.commit()
        if DATABASE_URL:
            cursor.execute("SELECT currval(pg_get_serial_sequence('openai_api_keys','id'))")
            key_id = cursor.fetchone()[0]
        else:
            key_id = cursor.lastrowid
    except Exception:
        conn.close()
        raise HTTPException(status_code=400, detail="API Key already exists")
    finally:
        conn.close()
    return {"id": key_id, "key": new_key, "description": description}

@app.delete("/api-keys/{key}", dependencies=[Depends(get_admin_key)])
async def delete_api_key(key: str):
    if IGNPRE_API_KEYS == "True":
        return ""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if DATABASE_URL:
            cursor.execute("DELETE FROM openai_api_keys WHERE key = %s", (key,))
        else:
            cursor.execute("DELETE FROM openai_api_keys WHERE key = ?", (key,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="API Key not found")
    finally:
        conn.close()
    return {"detail": "API Key deleted"}

if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
