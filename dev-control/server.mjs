#!/usr/bin/env node
/**
 * Dev-only control plane for DuckBridge.
 *
 * The desktop app runs the FastAPI sidecar through the Tauri `start_server` /
 * `stop_server` / `get_logs` commands (src-tauri/src/main.rs). A plain browser
 * has no Tauri IPC, so this small local HTTP service stands in for those three
 * commands: it owns the uvicorn child process, keeps the log ring buffer and
 * mirrors `write_server_dotenv` so the .env toggle behaves the same.
 *
 * It is NOT part of the shipped app — `npm run tauri build` never touches it.
 *
 *   node dev-control/server.mjs          # listens on 127.0.0.1:8766
 */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT, "server");
const LOG_LIMIT = 500;
const CONTROL_PORT = Number(process.env.DUCKBRIDGE_CONTROL_PORT || 8766);

const logs = [];
let child = null;

function pushLog(line) {
  logs.push(line);
  if (logs.length > LOG_LIMIT) logs.splice(0, logs.length - LOG_LIMIT);
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "settings.json"), "utf8"));
  } catch {
    return {};
  }
}

/** Mirror of write_server_dotenv() in src-tauri/src/main.rs. */
function writeDotenv(settings) {
  const ignore = settings.requireApiKeys ? "False" : "True";
  const content = [
    `IGNPRE_API_KEYS=${ignore}`,
    `ADMIN_TOKEN=${settings.adminToken ?? ""}`,
    "DATABASE_URL=",
    `PORT=${settings.port ?? 8765}`,
    `HOST=${settings.host ?? "127.0.0.1"}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(SERVER_DIR, ".env"), content);
}

function findPython() {
  const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  for (const c of candidates) {
    try {
      const r = spawn(c, ["--version"], { stdio: "ignore" });
      r.on("error", () => {});
      return c;
    } catch {
      /* try next */
    }
  }
  return candidates[0];
}

function startServer(settings) {
  if (child) return { running: true, pid: child.pid };
  const merged = { ...readSettings(), ...(settings || {}) };
  writeDotenv(merged);
  const host = merged.host || "127.0.0.1";
  const port = String(merged.port || 8765);
  const python = findPython();

  const proc = spawn(
    python,
    ["-m", "uvicorn", "main:app", "--host", host, "--port", port],
    {
      cwd: SERVER_DIR,
      windowsHide: true,
      env: {
        ...process.env,
        HOST: host,
        PORT: port,
        ADMIN_TOKEN: merged.adminToken ?? "",
        IGNPRE_API_KEYS: merged.requireApiKeys ? "False" : "True",
        DATABASE_URL: "",
      },
    },
  );
  proc.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => pushLog(`[stdout] ${l}`)));
  proc.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach((l) => pushLog(`[stderr] ${l}`)));
  proc.on("exit", (code) => {
    pushLog(`[server] exited with code ${code}`);
    if (child === proc) child = null;
  });
  proc.on("error", (e) => pushLog(`[server] spawn error: ${e.message}`));
  child = proc;
  pushLog(`[server] started pid ${proc.pid} via ${python} in ${SERVER_DIR}`);
  return { running: true, pid: proc.pid };
}

function stopServer() {
  if (!child) return { running: false };
  const pid = child.pid;
  try {
    child.kill();
  } catch (e) {
    pushLog(`[server] kill failed: ${e.message}`);
  }
  child = null;
  pushLog(`[server] stopped pid ${pid}`);
  return { running: false };
}

/** Mirror of the test_proxy command: hit the local /health through a proxy. */
async function testProxy(url) {
  const s = readSettings();
  const target = `http://${s.host || "127.0.0.1"}:${s.port || 8765}/health`;
  try {
    if (url) {
      const require = createRequire(path.join(SERVER_DIR, "package.json"));
      const { ProxyAgent, fetch: undiciFetch } = require("undici");
      const res = await undiciFetch(target, {
        dispatcher: new ProxyAgent(url),
        signal: AbortSignal.timeout(5000),
      });
      return `OK ${res.status} ${target}`;
    }
    const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
    return `OK ${res.status} ${target}`;
  } catch (e) {
    return `FAIL ${target} -> ${e.message}`;
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const send = (code, payload) => {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end(JSON.stringify(payload));
  };

  if (req.method === "OPTIONS") return send(204, {});

  const body = req.method === "POST" ? await readBody(req) : {};

  switch (`${req.method} ${url.pathname}`) {
    case "GET /status":
      return send(200, { running: !!child, pid: child?.pid ?? null });
    case "POST /start":
      return send(200, startServer(body));
    case "POST /stop":
      return send(200, stopServer());
    case "GET /logs":
      return send(200, { lines: logs.slice() });
    case "POST /logs/clear":
      logs.length = 0;
      return send(200, { ok: true });
    case "POST /settings": {
      fs.writeFileSync(path.join(__dirname, "settings.json"), JSON.stringify(body, null, 2));
      writeDotenv(body);
      return send(200, { ok: true });
    }
    case "POST /test-proxy":
      return send(200, { result: await testProxy(body.url) });
    default:
      return send(404, { error: "not found" });
  }
});

server.listen(CONTROL_PORT, "127.0.0.1", () => {
  console.log(`[duckbridge-control] listening on http://127.0.0.1:${CONTROL_PORT}`);
});
