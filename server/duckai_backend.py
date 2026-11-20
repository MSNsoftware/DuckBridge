#!/usr/bin/env python3
"""Duck.ai backend (browserless) — jsdom-solved anti-abuse challenge.

Browserless Python client for duck.ai, adapted from
https://github.com/revesis/duckai (verified 2026-10-22).

How the handshake works (mirrors the web app):
  1. GET  https://duck.ai/                       -> data-version-tag/sha => x-fe-version
  2. GET  /duckchat/v1/status  (x-vqd-accept: 1)  -> X-Vqd-Hash-1 = base64(JS challenge)
  3. run that JS under jsdom (node)               -> {server_hashes, client_hashes, meta}
  4. X-Vqd-Hash-1 = base64(JSON(..., client_hashes = sha256(raw) base64))
  5. POST /duckchat/v1/chat                       -> SSE stream of the answer

Requirements: Node.js >= 18 (installed separately) + `npm install` (jsdom).
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
# Runtime state directory (key db, .env, challenge file). The desktop app sets
# DATA_DIR because the install directory is not always writable.
DATA_DIR = os.getenv("DATA_DIR") or HERE
os.makedirs(DATA_DIR, exist_ok=True)

# ``solve()`` writes the challenge to a fixed path, so concurrent callers must not overlap.
_SOLVE_LOCK = threading.Lock()

BASE = "https://duck.ai"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/145.0.0.0 Safari/537.36")

# Real duck.ai model ids (verified working on 2026-10-22 + local tests).
# Unknown model ids pass through verbatim so future Duck.ai models work
# without a code change; these are just the known-good + convenient aliases.
MODEL_ALIASES: dict[str, str] = {
    # --- current duck.ai free lineup (ids verified live) ---
    "gpt-6-luna": "gpt-6-luna",
    "gpt-6": "gpt-6-luna",
    "luna": "gpt-6-luna",
    "gpt-5.6-luna": "gpt-5.6-luna",
    "gpt-5.4-mini": "gpt-5.4-mini",
    "gpt5-mini": "gpt-5.4-mini",
    "gpt-5-mini": "gpt-5.4-mini",
    "gpt5.4-mini": "gpt-5.4-mini",
    "gpt-5.4-nano": "gpt-5.4-nano",
    "gpt5-nano": "gpt-5.4-nano",
    "gpt-5-nano": "gpt-5.4-nano",
    "gpt-5.4": "gpt-5.4-mini",
    "claude-haiku-4-5": "claude-haiku-4-5",
    "claude-haiku-4.5": "claude-haiku-4-5",
    "claude-haiku-5-5": "claude-haiku-5-5",
    "claude-haiku-5.5": "claude-haiku-5-5",
    "claude-haiku": "claude-haiku-4-5",
    "claude": "claude-haiku-4-5",
    "mistral-small-2603": "mistral-small-2603",
    "mistral-small-4": "mistral-small-2603",
    "mistral-small": "mistral-small-2603",
    "mistral": "mistral-small-2603",
    "tinfoil/gemma4-31b": "tinfoil/gemma4-31b",
    "tinfoil/gemma-4-31b": "tinfoil/gemma4-31b",
    "gemma4-31b": "tinfoil/gemma4-31b",
    "gemma-4-31b": "tinfoil/gemma4-31b",
    "gemma": "tinfoil/gemma4-31b",
    "tinfoil/gpt-oss-120b": "tinfoil/gpt-oss-120b",
    "gpt-oss-120b": "tinfoil/gpt-oss-120b",
    "gpt-oss": "tinfoil/gpt-oss-120b",
    # --- legacy ids from duckduckgo_search 7.4.2 (backward compat) ---
    "gpt-4o-mini": "gpt-5.4-mini",
    "gpt4o-mini": "gpt-5.4-mini",
    "o3-mini": "gpt-6-luna",
    "o3-mini-high": "gpt-6-luna",
    "claude-3-haiku": "claude-haiku-4-5",
    "llama-3.3-70b": "gpt-5.4-mini",
    "llama-3-70b": "gpt-5.4-mini",
    "llama-3.1-70b": "gpt-5.4-mini",
    "llama-3.3": "gpt-5.4-mini",
    "llama": "gpt-5.4-mini",
    "mixtral-8x7b": "mistral-small-2603",
    "mixtral": "mistral-small-2603",
    "mistral-small-3": "mistral-small-2603",
}

# Models to advertise in /models (real ids + friendly aliases).
SUPPORTED_MODELS: list[str] = [
    "gpt-6-luna",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "claude-haiku-4-5",
    "claude-haiku-5-5",
    "mistral-small-2603",
    "tinfoil/gemma4-31b",
    "tinfoil/gpt-oss-120b",
]

DEFAULT_MODEL = "gpt-6-luna"

# Duck.ai model-specific character limits for folded prompts.
# Heavier reasoning/coding models have smaller upstream request envelopes.
MODEL_MAX_CHARS: dict[str, int] = {
    "gpt-6-luna": 14000,
    "gpt-5.6-luna": 14000,
    "claude-haiku-4-5": 13000,
    "claude-haiku-5-5": 13000,
    "mistral-small-2603": 15000,
    "tinfoil/gemma4-31b": 15000,
    "tinfoil/gpt-oss-120b": 14000,
    "gpt-5.4-mini": 16000,
    "gpt-5.4-nano": 16000,
}

# Duck.ai stateless single-turn default ceiling
MAX_PROMPT_CHARS = 14000

def get_max_chars_for_model(model: str | None) -> int:
    real = resolve_model(model)
    return MODEL_MAX_CHARS.get(real, MAX_PROMPT_CHARS)

# --- Dynamic model catalog (GET /duckchat/v1/models) with local cache ---
_MODELS_CACHE: list[str] | None = None
_MODELS_CACHE_TS = 0.0
_MODELS_FULL_CACHE: list[dict] | None = None

def _parse_catalog(data) -> tuple[list[str], list[dict]]:
    ids: list[str] = []
    full: list[dict] = []
    models = data if isinstance(data, list) else (data.get("models") if isinstance(data, dict) else [])
    if not isinstance(models, list):
        return ids, full
    for m in models:
        if not isinstance(m, dict):
            continue
        mid = m.get("id") or m.get("model")
        if not mid:
            continue
        mid = str(mid)
        ids.append(mid)
        free = bool(m.get("entityHasAccess")) and ("free" in (m.get("accessTier") or []) or m.get("entityHasAccess"))
        tiers = m.get("accessTier") or []
        full.append({"id": mid, "name": m.get("name") or mid, "free": free, "tiers": tiers, "provider": m.get("provider") or ""})
    return ids, full

def fetch_models(force: bool = False) -> list[str]:
    return fetch_models_full(force=force)["ids"]

def fetch_models_full(force: bool = False) -> dict:
    """Fetch live model ids from duck.ai catalog; fall back to SUPPORTED_MODELS."""
    global _MODELS_CACHE, _MODELS_CACHE_TS, _MODELS_FULL_CACHE
    now = time.time()
    if not force and _MODELS_CACHE and (now - _MODELS_CACHE_TS) < 300:
        return {"ids": _MODELS_CACHE, "full": _MODELS_FULL_CACHE or [{"id": i, "name": i, "free": i in SUPPORTED_MODELS, "tiers": [], "provider": ""} for i in _MODELS_CACHE]}
    try:
        r = requests.get(BASE + "/duckchat/v1/models", headers={"User-Agent": UA, "Accept": "application/json"}, timeout=10)
        if r.status_code == 200:
            ids, full = _parse_catalog(r.json())
            if ids:
                _MODELS_CACHE = ids
                _MODELS_FULL_CACHE = full
                _MODELS_CACHE_TS = now
                return {"ids": ids, "full": full}
    except Exception:
        pass
    if _MODELS_CACHE:
        return {"ids": _MODELS_CACHE, "full": _MODELS_FULL_CACHE or []}
    return {"ids": list(SUPPORTED_MODELS), "full": [{"id": i, "name": i, "free": True, "tiers": ["free"], "provider": ""} for i in SUPPORTED_MODELS]}


def resolve_model(model: str | None) -> str:
    """Map a user/friendly model name to a real duck.ai model id."""
    if not model:
        return DEFAULT_MODEL
    key = model.strip().lower()
    if key in MODEL_ALIASES:
        return MODEL_ALIASES[key]
    # Unknown -> pass through verbatim (future models work without a code change).
    return model.strip()


def normalize_proxy(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip()
    if url.startswith("socks5://"):
        return "socks5h://" + url[len("socks5://"):]
    return url


def _extract_text(content) -> str:
    if not content:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if item.get("type") == "text" and item.get("text"):
                    parts.append(str(item["text"]))
                elif "text" in item:
                    parts.append(str(item["text"]))
        return "\n".join(parts).strip()
    return str(content).strip()


def build_prompt(messages: list[dict] | list, max_chars: int = MAX_PROMPT_CHARS) -> str:
    """Fold OpenAI history into a single user turn (duck.ai is stateless).
    Keeps system instructions and the latest user prompt intact, trimming older
    history turns cleanly at turn boundaries to protect code and JSON structure.
    """
    if not messages:
        return ""
    norm: list[dict] = []
    for m in messages:
        if isinstance(m, dict):
            norm.append({"role": m.get("role") or "user",
                         "content": _extract_text(m.get("content"))})
        else:  # pydantic model
            norm.append({"role": getattr(m, "role", "user") or "user",
                         "content": _extract_text(getattr(m, "content", ""))})

    system_parts: list[str] = []
    history_turns: list[str] = []
    last_user = ""

    for m in norm:
        role = (m.get("role") or "user").lower()
        content = str(m.get("content") or "").strip()
        if not content:
            continue
        if role == "system":
            system_parts.append(content)
        elif role == "user":
            if last_user:
                history_turns.append(f"user: {last_user}")
            last_user = content
        else:
            history_turns.append(f"{role}: {content}")

    sys_str = ("System instructions:\n" + "\n\n".join(system_parts)) if system_parts else ""
    user_str = last_user

    # Prioritize latest user prompt first to guarantee the AI always receives the user's question
    if len(user_str) > max_chars - 80:
        user_str = user_str[:max_chars - 100] + "\n\n[... user prompt trimmed ...]"

    remaining_budget = max_chars - len(user_str) - 30

    # Truncate system instructions if budget is exceeded, never clipping user prompt
    if sys_str:
        if len(sys_str) > remaining_budget:
            sys_str = sys_str[:max(0, remaining_budget - 40)] + "\n[... system instructions trimmed ...]"
            remaining_budget = 0
        else:
            remaining_budget -= len(sys_str) + 4

    # Allocate remaining budget to history turns (newest first)
    chosen_history: list[str] = []
    if remaining_budget > 200:
        for turn in reversed(history_turns):
            turn_cost = len(turn) + 4
            if turn_cost <= remaining_budget:
                chosen_history.append(turn)
                remaining_budget -= turn_cost
            else:
                break
        chosen_history.reverse()

    parts: list[str] = []
    if sys_str:
        parts.append(sys_str)
    if chosen_history:
        parts.append("Conversation so far:\n" + "\n".join(chosen_history))
    if user_str:
        parts.append(user_str)

    return "\n\n".join(parts).strip() or str(norm[-1].get("content", ""))


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def sha256_b64(text: str) -> str:
    return b64(hashlib.sha256(text.encode()).digest())


def b64_json(obj) -> str:
    return b64(json.dumps(obj, separators=(",", ":")).encode())


class DuckAIError(RuntimeError):
    """Upstream refusal after all retries (carries the last HTTP status when known)."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


# --- Cached Token & Handshake State ---
_CACHED_FE_VERSION: str = ""
_CACHED_JSA: str = ""
_CACHED_TS: float = 0.0
_CACHED_PROXY_TAG: str = ""
_AUTH_LOCK = threading.Lock()

class DuckAI:
    def __init__(self, ua: str = UA, timeout: int = 60):
        self.ua = ua
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9"})
        # Configure normalized proxy (including socks5h:// for remote DNS)
        http_p = normalize_proxy(os.getenv("HTTP_PROXY") or os.getenv("http_proxy"))
        https_p = normalize_proxy(os.getenv("HTTPS_PROXY") or os.getenv("https_proxy"))
        self.proxy_tag = f"{http_p}|{https_p}"
        if http_p or https_p:
            self.s.proxies.update({
                "http": http_p or https_p,
                "https": https_p or http_p,
            })
        self.fe_version = _CACHED_FE_VERSION
        self.jsa = _CACHED_JSA

    def bootstrap(self) -> "DuckAI":
        r = self.s.get(BASE + "/", timeout=self.timeout)
        r.raise_for_status()
        tag = re.search(r'data-version-tag="([^"]*)"', r.text)
        sha = re.search(r'data-version-sha="([^"]*)"', r.text)
        self.fe_version = f"{tag.group(1) if tag else 'dev'}-{sha.group(1) if sha else 'hash'}"
        return self

    def fetch_challenge(self) -> str:
        r = self.s.get(
            BASE + "/duckchat/v1/status",
            headers={"x-vqd-accept": "1", "Cache-Control": "no-store",
                     "x-fe-version": self.fe_version, "Origin": BASE, "Referer": BASE + "/"},
            timeout=self.timeout,
        )
        raw = r.headers.get("x-vqd-hash-1")
        if not raw:
            raise RuntimeError(f"no challenge (HTTP {r.status_code}): {r.text[:200]}")
        return base64.b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8", "replace")

    def solve(self, js_source: str) -> dict:
        # Resolve node binary (supports explicit NODE_EXE env passed by Tauri launcher or portable bundle)
        node_bin = os.getenv("NODE_EXE") or shutil.which("node") or "node"
        flags = 0
        if os.name == "nt":
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        # Pass challenge directly via stdin in memory to prevent disk race conditions and file locks
        with _SOLVE_LOCK:
            out = subprocess.run(
                [node_bin, os.path.join(HERE, "jsa_jsdom.js"), "-", self.ua],
                input=js_source,
                capture_output=True,
                text=True,
                timeout=90,
                creationflags=flags,
            )
        if out.returncode != 0 or not out.stdout.strip():
            raise RuntimeError(f"challenge runner failed: {out.stderr[:400]}")
        result = json.loads(out.stdout)
        if "__error" in result:
            raise RuntimeError(f"challenge error: {result['__error'][:400]}")
        return result

    def build_proof(self, solved: dict) -> str:
        proof = dict(solved)
        proof["client_hashes"] = [sha256_b64(x) for x in solved["client_hashes"]]
        meta = dict(solved.get("meta") or {})
        meta.update({
            "origin": BASE,
            "stack": ("Error\nat l (https://duck.ai/dist/duckai-dist/entry.duckai.js:2:2129171)\n"
                      "at async https://duck.ai/dist/duckai-dist/entry.duckai.js:2:1859809"),
            "duration": "58",
        })
        proof["meta"] = meta
        return b64_json(proof)

    def chat(self, prompt: str, model: str = DEFAULT_MODEL, tools: bool = False, delegate_image: bool = False):
        body = {
            "model": model,
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            "canUseTools": tools,
            "reasoningEffort": "none",
            "canUseApproxLocation": None,
            "canDelegateImageGeneration": True if delegate_image else None,
            "canShowGreeting": False,
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
            "Origin": BASE,
            "Referer": BASE + "/",
            "x-fe-version": self.fe_version,
            "x-fe-signals": b64_json({"start": int(time.time() * 1000),
                                      "events": [{"name": "action", "delta": 1200, "trusted": True}],
                                      "end": 1500}),
            "X-Vqd-Hash-1": self.jsa,
        }
        return self.s.post(BASE + "/duckchat/v1/chat", headers=headers,
                           data=json.dumps(body), stream=True, timeout=self.timeout)

    def stream(self, prompt: str, model: str = DEFAULT_MODEL, retries: int = 4):
        """Yield the answer incrementally (text deltas) as the SSE stream arrives."""
        for ev in self.chat_events(prompt, model=model, retries=retries):
            msg = ev.get("message")
            if isinstance(msg, str) and msg:
                yield msg

    def chat_events(self, prompt: str, model: str = DEFAULT_MODEL, retries: int = 4, tools: bool = False, delegate_image: bool = False):
        """Yield raw SSE events (dicts) from duck.ai with optimistic token reuse for low latency."""
        global _CACHED_FE_VERSION, _CACHED_JSA, _CACHED_TS, _CACHED_PROXY_TAG
        real_model = resolve_model(model)
        last = ""
        status = None
        r = None

        # 1. Optimistic fast-path: try cached proof if recently solved (< 180s) AND same proxy
        now = time.time()
        if (_CACHED_JSA and _CACHED_FE_VERSION
                and _CACHED_PROXY_TAG == self.proxy_tag
                and (now - _CACHED_TS < 180)):
            self.fe_version = _CACHED_FE_VERSION
            self.jsa = _CACHED_JSA
            try:
                test_r = self.chat(prompt, real_model, tools=tools, delegate_image=delegate_image)
                if test_r.status_code == 200:
                    r = test_r
                    _CACHED_TS = now
            except Exception:
                pass

        # 2. If cached proof was expired, proxy changed, or rejected, refresh via full handshake
        if r is None:
            for attempt in range(retries):
                with _AUTH_LOCK:
                    self.bootstrap()
                    solved = self.solve(self.fetch_challenge())
                    self.jsa = self.build_proof(solved)
                    _CACHED_FE_VERSION = self.fe_version
                    _CACHED_JSA = self.jsa
                    _CACHED_TS = time.time()
                    _CACHED_PROXY_TAG = self.proxy_tag
                r = self.chat(prompt, real_model, tools=tools, delegate_image=delegate_image)
                if r.status_code == 200:
                    break
                status = r.status_code
                last = f"HTTP {r.status_code}: {r.text[:200]}"
                # Invalidate cache on failure
                _CACHED_JSA = ""
                time.sleep(1 + attempt * 2)
            else:
                raise DuckAIError(f"chat failed after {retries} attempts: {last}", status=status)

        for raw in r.iter_lines():
            if not raw or not raw.startswith(b"data: "):
                continue
            chunk = raw[6:].decode("utf-8", "replace").strip()
            if chunk in ("", "[DONE]", "[PING]") or chunk.startswith("[CHAT_TITLE:"):
                continue
            try:
                ev = json.loads(chunk)
            except json.JSONDecodeError:
                continue

            # Detect embedded mid-stream error frames (e.g. action: "error", type: "ERR_BN_LIMIT")
            if ev.get("action") == "error":
                err_status = ev.get("status") or 418
                err_type = ev.get("type") or "UPSTREAM_ERROR"
                # Invalidate cached challenge token
                _CACHED_JSA = ""
                raise DuckAIError(f"duck.ai stream error ({err_type})", status=err_status)

            yield ev

    def generate_image(self, prompt: str, model: str = "gpt-6-luna", retries: int = 4) -> bytes:
        """Generate one image. duck.ai has no /images endpoint - GPT Luna natively
        calls its GenerateImage tool inside a chat turn and returns base64 JPEG
        in a ui-component SSE frame."""
        # Only Luna models have the native GenerateImage tool.
        image_model = "gpt-6-luna"
        for ev in self.chat_events(prompt, model=image_model, retries=retries, tools=True, delegate_image=True):
            if (ev.get("role") == "ui-component" and ev.get("name") == "generate-image"
                    and isinstance(ev.get("data"), dict)
                    and ev["data"].get("status") == "success"
                    and ev["data"].get("b64Image")):
                b64 = ev["data"]["b64Image"]
                try:
                    return base64.b64decode(b64)
                except Exception as e:
                    raise DuckAIError(f"bad b64 image: {e}")
        raise DuckAIError("No image returned by duck.ai (model may not have triggered GenerateImage)")

    def ask(self, prompt: str, model: str = DEFAULT_MODEL, on_delta=None, retries: int = 4) -> str:
        parts = []
        for delta in self.stream(prompt, model=model, retries=retries):
            parts.append(delta)
            if on_delta:
                on_delta(delta)
        return "".join(parts)
