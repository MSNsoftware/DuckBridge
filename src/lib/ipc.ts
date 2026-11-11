/**
 * IPC layer that works in both runtimes.
 *
 * - Inside the Tauri app the real `@tauri-apps/api/core` `invoke` is used.
 * - In a plain browser (no Tauri runtime) the calls are served by the local
 *   dev control server (`dev-control/server.mjs`), which owns the FastAPI
 *   sidecar process exactly like the `start_server` / `stop_server` /
 *   `get_logs` Tauri commands do.
 *
 * The desktop app is unaffected: `window.__TAURI_INTERNALS__` is present there,
 * so every command is forwarded verbatim to Rust.
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export type Settings = {
  host: string;
  port: number;
  requireApiKeys: boolean;
  autoStartServer: boolean;
  autostart: boolean;
  minimizeToTray: boolean;
  autoUpdate: boolean;
  theme: string;
  language: string;
  proxyMode: string;
  proxyList: { id: string; url: string; enabled: boolean }[];
  adminToken: string;
};

const CONTROL_URL = "http://127.0.0.1:8766";
const SETTINGS_KEY = "duckbridge.settings";

const DEFAULT_SETTINGS: Settings = {
  host: "127.0.0.1",
  port: 8765,
  requireApiKeys: false,
  autoStartServer: true,
  autostart: false,
  minimizeToTray: true,
  autoUpdate: true,
  theme: "system",
  language: "en",
  proxyMode: "direct",
  proxyList: [],
  adminToken: "your-super-secret-admin-token",
};

const isTauri = () =>
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* corrupted storage - fall back to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

function writeSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota - settings simply won't persist */
  }
}

async function control<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CONTROL_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** Browser-mode implementation of the Rust commands in src-tauri/src/main.rs. */
async function browserInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "get_settings":
      return readSettings() as T;

    case "save_settings_cmd": {
      const settings = args?.settings as Settings;
      writeSettings(settings);
      await control("/settings", { method: "POST", body: JSON.stringify(settings) }).catch(() => {});
      return undefined as T;
    }

    case "server_status": {
      const r = await control<{ running: boolean }>("/status");
      return r.running as T;
    }

    case "get_logs": {
      const r = await control<{ lines: string[] }>("/logs");
      return r.lines as T;
    }

    case "clear_logs":
      await control("/logs/clear", { method: "POST" });
      return undefined as T;

    case "start_server":
      await control("/start", { method: "POST", body: JSON.stringify(readSettings()) });
      return undefined as T;

    case "stop_server":
      await control("/stop", { method: "POST" });
      return undefined as T;

    case "test_proxy": {
      const r = await control<{ result: string }>("/test-proxy", {
        method: "POST",
        body: JSON.stringify({ url: args?.url ?? "" }),
      });
      if (r.result.startsWith("FAIL")) throw new Error(r.result);
      return r.result as T;
    }

    default:
      throw new Error(`Command "${cmd}" is not available in browser mode`);
  }
}

export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) return tauriInvoke<T>(cmd, args);
  return browserInvoke<T>(cmd, args);
}
