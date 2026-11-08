import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type ProxyEntry = { id: string; url: string; enabled: boolean };
type Settings = {
  host: string;
  port: number;
  autoStartServer: boolean;
  autostart: boolean;
  minimizeToTray: boolean;
  autoUpdate: boolean;
  theme: string;
  language: string;
  proxyMode: string;
  proxyList: ProxyEntry[];
  adminToken: string;
};

type Tab = "dashboard" | "apitester" | "keys" | "models" | "logs" | "settings";

const T = {
  en: {
    dashboard: "Dashboard", apitester: "API Tester", keys: "API Keys", models: "Models", logs: "Logs", settings: "Settings",
    running: "Running", stopped: "Stopped", start: "Start server", stop: "Stop", restart: "Restart",
    baseUrl: "Base URL", ready: "Paste this in Chatbox, Continue, or any OpenAI client.",
    copy: "Copy", copied: "Copied", health: "Health", metrics: "Metrics",
    server: "Server", proxy: "Proxy", appearance: "Appearance", system: "System",
    host: "Host", port: "Port", adminToken: "Admin token",
    autoStart: "Auto-start server", autostart: "Autostart at login", minimize: "Minimize to tray on close", autoUpdate: "Auto-update",
    direct: "Direct — no proxy", systemProxy: "System proxy", manual: "Manual list",
    add: "Add proxy", test: "Test", delete: "Delete", enable: "Enable",
    theme: "Theme", language: "Language", light: "Light", dark: "Dark", systemTheme: "System",
    create: "Create key", refresh: "Refresh", clear: "Clear", send: "Send",
    endpoint: "Endpoint", body: "Body (JSON)", response: "Response",
    lastError: "Last error", noModels: "No models loaded. Start the server.",
    copiedUrl: "Base URL copied.", requests: "Requests", errors: "Errors", latency: "Latency", avg: "avg", ok: "ok", upstream: "upstream",
    noKeys: "No keys. Set ADMIN_TOKEN in Settings and start the server with IGNPRE_API_KEYS=False, or leave it True for open access.",
    loading: "Loading...", proxyAdded: "Proxy added", saveFailed: "Save failed", startFailed: "Start failed", mode: "Mode",
  },
  fa: {
    dashboard: "داشبورد", apitester: "تست API", keys: "کلیدها", models: "مدل‌ها", logs: "گزارش‌ها", settings: "تنظیمات",
    running: "در حال اجرا", stopped: "متوقف", start: "شروع سرور", stop: "توقف", restart: "راه‌اندازی مجدد",
    baseUrl: "آدرس پایه", ready: "این را در Chatbox یا Continue یا هر کلاینت OpenAI وارد کنید.",
    copy: "کپی", copied: "کپی شد", health: "وضعیت", metrics: "آمار",
    server: "سرور", proxy: "پروکسی", appearance: "ظاهر", system: "سیستم",
    host: "هاست", port: "پورت", adminToken: "توکن ادمین",
    autoStart: "شروع خودکار سرور", autostart: "اجرا با ورود به سیستم", minimize: "با بستن پنجره به ترای برود", autoUpdate: "به‌روزرسانی خودکار",
    direct: "مستقیم — بدون پروکسی", systemProxy: "پروکسی سیستم", manual: "لیست دستی",
    add: "افزودن پروکسی", test: "تست", delete: "حذف", enable: "فعال",
    theme: "پوسته", language: "زبان", light: "روشن", dark: "تیره", systemTheme: "سیستم",
    create: "ساخت کلید", refresh: "به‌روزرسانی", clear: "پاک کردن", send: "ارسال",
    endpoint: "نقطه پایانی", body: "بدنه (JSON)", response: "پاسخ",
    lastError: "آخرین خطا", noModels: "مدلی بارگذاری نشده. سرور را شروع کنید.",
    copiedUrl: "آدرس پایه کپی شد.", requests: "درخواست‌ها", errors: "خطاها", latency: "تأخیر", avg: "میانگین", ok: "موفق", upstream: "آپ‌استریم",
    noKeys: "کلیدی نیست. توکن ادمین را در تنظیمات بگذارید و IGNPRE_API_KEYS=False کنید، یا True بگذارید برای دسترسی آزاد.",
    loading: "در حال بارگذاری...", proxyAdded: "پروکسی اضافه شد", saveFailed: "ذخیره ناموفق بود", startFailed: "شروع ناموفق بود", mode: "حالت",
  },
} as const;

async function copyText(text: string, feedback: (m: string) => void, okLabel = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    feedback(okLabel);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); feedback(okLabel); } catch { feedback(text); }
    ta.remove();
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [lang, setLang] = useState<"en" | "fa">("en");
  const [theme, setTheme] = useState("system");
  const [settings, setSettings] = useState<Settings>({
    host: "127.0.0.1", port: 8765, autoStartServer: true, autostart: false,
    minimizeToTray: true, autoUpdate: false, theme: "system", language: "en",
    proxyMode: "direct", proxyList: [], adminToken: "your-super-secret-admin-token",
  });
  const [status, setStatus] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [testerUrl, setTesterUrl] = useState("/v1/models");
  const [testerBody, setTesterBody] = useState('{"model":"gpt-6-luna","messages":[{"role":"user","content":"Reply exactly: OK"}]}');
  const [testerOut, setTesterOut] = useState("");
  const [newProxy, setNewProxy] = useState("");

  const t = T[lang];
  const baseUrl = `http://${settings.host}:${settings.port}`;
  const v1Url = `${baseUrl}/v1`;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  const applyTheme = useCallback((th: string) => {
    setTheme(th);
    const root = document.documentElement;
    if (th === "dark") { root.dataset.theme = "dark"; }
    else if (th === "light") { root.dataset.theme = "light"; }
    else { root.removeAttribute("data-theme"); }
  }, []);

  const applyLang = useCallback((l: "en" | "fa") => {
    setLang(l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === "fa" ? "rtl" : "ltr";
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const s = await invoke<Settings>("get_settings");
      setSettings(s);
      applyTheme(s.theme);
      applyLang((s.language as any) || "en");
      setStatus(await invoke<boolean>("server_status").catch(() => false));
      setLogs(await invoke<string[]>("get_logs").catch(() => []));
      const b = `http://${s.host}:${s.port}`;
      try {
        const m = await fetch(`${b}/v1/models`);
        if (m.ok) { const j = await m.json(); setModels((j.data || []).map((d: any) => d.id)); } else setModels([]);
      } catch { setModels([]); }
      try {
        const h = await fetch(`${b}/health`);
        setHealth(h.ok ? await h.json() : null);
        const met = await fetch(`${b}/metrics`);
        setMetrics(met.ok ? await met.json() : null);
      } catch { setHealth(null); setMetrics(null); }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }, [applyTheme, applyLang]);

  useEffect(() => {
    loadAll().then(() => {
      invoke<Settings>("get_settings").then((s) => {
        if (s.autoStartServer) invoke("start_server").then(() => setTimeout(loadAll, 2500)).catch(() => {});
      }).catch(() => {});
    });
    const id = setInterval(loadAll, 6000);
    return () => clearInterval(id);
  }, [loadAll]);

  async function save(next: Settings) {
    setSettings(next);
    applyTheme(next.theme);
    applyLang((next.language as any) || "en");
    try { await invoke("save_settings_cmd", { settings: next }); } catch (e: any) { showToast(`${T[next.language as "en" | "fa"]?.saveFailed ?? "Save failed"}: ${e}`); }
  }

  async function doStart() {
    setBusy(true);
    try { await invoke("start_server"); showToast(t.running); }
    catch (e: any) { showToast(`${t.startFailed}: ${e}`); }
    setBusy(false);
    setTimeout(loadAll, 1500);
  }
  async function doStop() {
    setBusy(true);
    try { await invoke("stop_server"); showToast(t.stopped); } catch (e: any) { showToast(`${e}`); }
    setBusy(false);
    setTimeout(loadAll, 800);
  }

  async function refreshKeys() {
    try {
      const r = await fetch(`${baseUrl}/api-keys`, { headers: { Authorization: `Bearer ${settings.adminToken}` } });
      if (r.ok) { const j = await r.json(); setKeys(j.api_keys || []); } else setKeys([]);
    } catch { setKeys([]); }
  }
  useEffect(() => { if (tab === "keys") refreshKeys(); }, [tab, baseUrl, settings.adminToken]);

  async function createKey() {
    const desc = prompt(lang === "fa" ? "توضیح:" : "Description:");
    if (desc === null) return;
    setBusy(true);
    try {
      const r = await fetch(`${baseUrl}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.adminToken}` },
        body: JSON.stringify({ description: desc }),
      });
      const j = await r.json();
      if (j.key) { await copyText(j.key, showToast); }
      else showToast(j.detail || "Error");
      refreshKeys();
    } catch (e: any) { showToast(`${e}`); }
    setBusy(false);
  }

  async function deleteKey(k: string) {
    if (!confirm(lang === "fa" ? "این کلید حذف شود؟" : "Delete this key?")) return;
    try {
      await fetch(`${baseUrl}/api-keys/${k}`, { method: "DELETE", headers: { Authorization: `Bearer ${settings.adminToken}` } });
      refreshKeys();
    } catch (e: any) { showToast(`${e}`); }
  }

  async function runTester(method: string) {
    setTesterOut(t.loading);
    try {
      const opts: any = { headers: { "Content-Type": "application/json", Authorization: `Bearer test` } };
      if (method !== "GET") { opts.method = method; opts.body = testerBody; }
      const r = await fetch(`${baseUrl}${testerUrl}`, opts);
      const tx = await r.text();
      setTesterOut(`${r.status} ${r.statusText}\n${tx.slice(0, 4000)}`);
    } catch (e: any) { setTesterOut(`Error: ${e.message} (is the server running on ${baseUrl}?)`); }
  }

  async function addProxy() {
    const url = newProxy.trim();
    if (!url) return;
    const entry: ProxyEntry = { id: Date.now().toString(), url, enabled: true };
    await save({ ...settings, proxyList: [...settings.proxyList, entry] });
    setNewProxy("");
    showToast(t.proxyAdded);
  }

  const stats = useMemo(() => ({
    total: metrics?.total_requests ?? 0,
    success: metrics?.success ?? 0,
    errors: metrics?.errors ?? 0,
    avg: metrics?.avg_latency_sec ?? 0,
  }), [metrics]);

  const dirClass = lang === "fa" ? " rtl" : "";

  const Icon = ({ d }: { d: string }) => (
    <svg className="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
  const icons: Record<Tab, string> = {
    dashboard: "M4 4h16v4H4zM4 10h16v2H4zM4 14h10v6H4z",
    apitester: "M8 9l4 3-4 3M12 21h8",
    keys: "M21 2l-2 2m-7.61 7.61A5.5 5.5 0 1 1 5.5 5.5L21 18l-4 4-2-2",
    models: "M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zM12 11L4 6.5M12 11l8-4.5M12 11v9",
    logs: "M4 6h16M4 12h16M4 18h10",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z",
  };

  return (
    <div className={`shell${dirClass}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg viewBox="0 0 512 512" width="40" height="40" aria-hidden="true">
              <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#D64541"/><stop offset="1" stop-color="#8B1E1E"/></linearGradient><linearGradient id="beak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F2C14E"/><stop offset="1" stop-color="#D99A2B"/></linearGradient></defs>
              <rect width="512" height="512" rx="128" fill="url(#bg)"/>
              <circle cx="256" cy="244" r="172" fill="#ffffff" opacity="0.10"/>
              <g transform="translate(-379 -139) scale(5)">
                <path d="M138.46 132.53c-2.51-4.88-4.91-9.37-6.4-12.34-3.96-7.93-7.94-19.11-6.13-26.32.33-1.31-3.73-48.51-6.6-50.03-3.19-1.7-10.12-3.94-13.71-4.54-2.5-.4-3.07.3-4.12.46.99.1 5.7 2.42 6.61 2.55-.91.62-3.6-.02-5.32.74-.87.4-1.52 1.88-1.5 2.58 4.9-.5 12.56-.01 17.1 2-3.61.41-9.09.87-11.45 2.11-6.84 3.6-9.86 12.03-8.06 22.13 1.79 10.08 9.72 46.85 12.25 59.13 2.52 12.27 31.51 9.7 27.32 1.53z" fill="#E8DDD3"/>
                <path d="M142.1 133.72c-3.01-5.97-6.08-11.68-7.86-15.22-3.97-7.94-7.93-19.11-6.13-26.32.34-1.31.34-6.67 1.43-7.38 8.41-5.5 7.81-.19 11.19-2.65 1.74-1.27 3.13-2.8 3.74-4.9 2.16-7.58-3-20.77-8.78-26.54-1.88-1.88-4.76-3.06-8.02-3.68-1.25-1.72-3.27-3.36-6.13-4.89a28.86 28.86 0 0 0-18.27-2.88c1 .1 3.26 2.14 4.17 2.27-1.38.94-5.05.82-5.03 2.9 4.92-.5 10.3.28 14.84 2.3-3.6.4-6.96 1.3-9.31 2.54-6.86 3.6-8.66 10.81-6.86 20.91 1.81 10.1 9.74 46.88 12.26 59.13 2.53 12.26 32.5 11.8 28.77 4.41z" fill="#FFF8F0"/>
                <circle r="3.79" cx="112.8" cy="70.69" fill="#2A0A0A"/><circle r=".98" cx="114.49" cy="69.43" fill="#ffffff"/>
                <circle r="3.25" cx="138.12" cy="68.44" fill="#2A0A0A"/><circle r=".84" cx="139.57" cy="67.36" fill="#ffffff"/>
                <path fill="url(#beak)" d="M124.4 85.3c.38-2.3 6.3-6.63 10.5-6.9 4.2-.26 5.5-.2 9-1.04 3.51-.83 12.54-3.08 15.03-4.24 2.5-1.15 13.1.57 5.63 4.74-3.23 1.81-11.94 5.13-18.17 6.99-6.22 1.86-9.99-1.78-12.06 1.28-1.64 2.43-.33 5.76 7.1 6.45 10.04.93 19.66-4.52 20.72-1.62 1.06 2.9-8.62 6.5-14.52 6.62-5.9.11-17.78-3.9-19.56-5.14-1.79-1.23-4.16-4.13-3.67-7.14z"/>
                <path fill="#3FA46A" d="M128.94 115.6s-14.1-7.53-14.33-4.48c-.24 3.06 0 15.51 1.64 16.45 1.65.94 13.4-6.1 13.4-6.1l-.7-5.88zm5.4-.48s9.64-7.29 11.76-6.82c2.11.48 2.58 15.51.7 16.23-1.88.7-12.9-3.81-12.9-3.81l.45-5.6z"/>
              </g>
            </svg>
          </span>
          <div>
            <div className="wordmark">DuckBridge</div>
            <div className="sub">API Gateway</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          {(([
            ["dashboard", t.dashboard], ["apitester", t.apitester], ["keys", t.keys],
            ["models", t.models], ["logs", t.logs], ["settings", t.settings],
          ]) as [Tab, string][]).map(([k, label]) => (
            <button key={k} className={`navbtn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}>
              <Icon d={icons[k]} />
              <span className="navlabel">{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidefoot">
          <div className="side-status">
            <span className={`dot ${status ? "on" : "off"}`} />
            <span>{status ? t.running : t.stopped}</span>
            <span className="mono muted"> {settings.host}:{settings.port}</span>
          </div>
          <div className="side-actions">
            <button className="btn primary sm" disabled={busy} onClick={doStart}>{t.start}</button>
            <button className="btn sm" disabled={busy} onClick={doStop}>{t.stop}</button>
          </div>
          <div className="sidefoot-meta">Duck.ai · local only</div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div>
            <h1>{t[tab] || "Overview"}</h1>
            <p className="muted">{lang === "fa" ? "سرور لوکال OpenAI-compatible روی ماشین شما" : "Local OpenAI-compatible server on this machine"}</p>
          </div>
          <div className="top-actions">
            <button className="btn ghost" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl), t.copied)}>{t.copy} Base URL</button>
            <button className="btn" onClick={loadAll}>{t.refresh}</button>
          </div>
        </header>

        <div className="page">
          {tab === "dashboard" && (
            <section className="stack">
              <div className="card hero">
                <label className="label">{t.baseUrl}</label>
                <p className="muted">{t.ready}</p>
                <div className="urlrow">
                  <code className="url">{v1Url}</code>
                  <button className="btn primary" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl), t.copied)}>{t.copy}</button>
                </div>
                <div className="urlrow secondary">
                  <code className="url">{baseUrl}</code>
                  <button className="btn" onClick={() => copyText(baseUrl, () => showToast(t.copiedUrl), t.copied)}>{t.copy}</button>
                </div>
                <div className="statgrid">
                  <div className="stat"><span className="stat-label">{t.running}</span><strong>{status ? "●" : "○"}</strong><span className="muted">{status ? settings.port : "—"}</span></div>
                  <div className="stat"><span className="stat-label">{t.requests}</span><strong>{stats.total}</strong><span className="muted">{stats.success} {t.ok}</span></div>
                  <div className="stat"><span className="stat-label">{t.errors}</span><strong>{stats.errors}</strong><span className="muted">{metrics?.upstream_errors ?? 0} {t.upstream}</span></div>
                  <div className="stat"><span className="stat-label">{t.latency}</span><strong>{stats.avg}s</strong><span className="muted">{t.avg}</span></div>
                </div>
                {metrics?.last_error && <div className="notice">{t.lastError}: <code>{metrics.last_error}</code></div>}
              </div>

              <div className="grid2">
                <div className="card">
                  <h3>curl</h3>
                  <pre className="code">{`curl ${v1Url}/chat/completions \\
  -H "Authorization: Bearer <key>" \\
  -d '{"model":"gpt-6-luna","messages":[{"role":"user","content":"Hi"}]}'`}</pre>
                </div>
                <div className="card">
                  <h3>Python</h3>
                  <pre className="code">{`from openai import OpenAI
client = OpenAI(api_key="anything", base_url="${v1Url}")
client.chat.completions.create(model="gpt-6-luna", messages=[{"role":"user","content":"Hi"}])`}</pre>
                </div>
              </div>

              <div className="grid2">
                <div className="card"><h3>{t.health}</h3><pre className="code">{health ? JSON.stringify(health, null, 2) : "—"}</pre></div>
                <div className="card"><h3>{t.metrics}</h3><pre className="code">{metrics ? JSON.stringify(metrics, null, 2) : "—"}</pre></div>
              </div>
            </section>
          )}

          {tab === "apitester" && (
            <section className="card stack">
              <h2>{t.apitester}</h2>
              <label className="label">{t.endpoint}</label>
              <input className="input mono" value={testerUrl} onChange={(e) => setTesterUrl(e.target.value)} placeholder="/v1/models" />
              <label className="label">{t.body}</label>
              <textarea className="input mono" value={testerBody} onChange={(e) => setTesterBody(e.target.value)} rows={7} spellCheck={false} />
              <div className="row">
                <button className="btn" onClick={() => runTester("GET")}>GET</button>
                <button className="btn primary" onClick={() => runTester("POST")}>POST</button>
              </div>
              <label className="label">{t.response}</label>
              <pre className="code tall">{testerOut || "—"}</pre>
            </section>
          )}

          {tab === "keys" && (
            <section className="card stack">
              <div className="row between"><h2>{t.keys}</h2><button className="btn primary" disabled={busy} onClick={createKey}>{t.create}</button></div>
              {keys.length === 0 && <p className="muted bidi">{t.noKeys}</p>}
              <ul className="keylist">
                {keys.map((k: any) => (
                  <li key={k.id} className="keyrow">
                    <code className="mono" dir="ltr">{k.key}</code>
                    <span className="muted key-desc" dir="auto">{k.description || ""}</span>
                    <span className="spacer" />
                    <button className="btn sm" onClick={() => copyText(k.key, showToast)}>{t.copy}</button>
                    <button className="btn sm danger" onClick={async () => { if (!confirm(lang === "fa" ? "این کلید حذف شود؟" : "Delete this key?")) return; await fetch(`${baseUrl}/api-keys/${k.key}`, { method: "DELETE", headers: { Authorization: `Bearer ${settings.adminToken}` } }); refreshKeys(); }}>{t.delete}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "models" && (
            <section className="card stack">
              <div className="row between"><h2>{t.models}</h2><button className="btn" onClick={loadAll}>{t.refresh}</button></div>
              {models.length === 0 ? <p className="muted">{t.noModels}</p> : <ul className="modelgrid">{models.map((m) => <li key={m}><code className="mono">{m}</code></li>)}</ul>}
            </section>
          )}

          {tab === "logs" && (
            <section className="card stack">
              <div className="row between"><h2>{t.logs}</h2><button className="btn" onClick={() => invoke("clear_logs").then(loadAll)}>{t.clear}</button></div>
              <pre className="code logs">{logs.join("\n") || "—"}</pre>
            </section>
          )}

          {tab === "settings" && (
            <section className="settings">
              <div className="card stack">
                <h2>{t.server}</h2>
                <div className="fieldgrid">
                  <label className="field"><span>{t.host}</span><input className="input" value={settings.host} onChange={(e) => save({ ...settings, host: e.target.value })} /></label>
                  <label className="field"><span>{t.port}</span><input className="input" type="number" value={settings.port} onChange={(e) => save({ ...settings, port: Number(e.target.value) })} /></label>
                </div>
                <label className="check"><input type="checkbox" checked={settings.autoStartServer} onChange={(e) => save({ ...settings, autoStartServer: e.target.checked })} /> {t.autoStart}</label>
                <label className="check"><input type="checkbox" checked={settings.autostart} onChange={(e) => save({ ...settings, autostart: e.target.checked })} /> {t.autostart}</label>
                <label className="check"><input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => save({ ...settings, minimizeToTray: e.target.checked })} /> {t.minimize}</label>
                <label className="check"><input type="checkbox" checked={settings.autoUpdate} onChange={(e) => save({ ...settings, autoUpdate: e.target.checked })} /> {t.autoUpdate}</label>
              </div>

              <div className="card stack">
                <h2>{t.proxy}</h2>
                <label className="field"><span>{t.mode}</span>
                  <select className="input" value={settings.proxyMode} onChange={(e) => save({ ...settings, proxyMode: e.target.value })}>
                    <option value="direct">{t.direct}</option>
                    <option value="system">{t.systemProxy}</option>
                    <option value="manual">{t.manual}</option>
                  </select>
                </label>
                {settings.proxyMode === "manual" && (
                  <>
                    <div className="row">
                      <input className="input mono" placeholder="socks5://user:pass@host:port" value={newProxy} onChange={(e) => setNewProxy(e.target.value)} />
                      <button className="btn primary" onClick={addProxy}>{t.add}</button>
                    </div>
                    <ul className="keylist">
                      {settings.proxyList.map((p) => (
                        <li key={p.id} className="keyrow">
                          <code className="mono" dir="ltr">{p.url}</code>
                          <label className="check inline"><input type="checkbox" checked={p.enabled} onChange={(e) => save({ ...settings, proxyList: settings.proxyList.map((x) => x.id === p.id ? { ...x, enabled: e.target.checked } : x) })} /> {t.enable}</label>
                          <span className="spacer" />
                          <button className="btn sm" onClick={() => invoke("test_proxy", { url: p.url }).then((r: any) => showToast(String(r))).catch((e: any) => showToast(String(e)))}>{t.test}</button>
                          <button className="btn sm danger" onClick={() => save({ ...settings, proxyList: settings.proxyList.filter((x) => x.id !== p.id) })}>{t.delete}</button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="card stack">
                <h2>{t.appearance}</h2>
                <div className="fieldgrid">
                  <label className="field"><span>{t.theme}</span>
                    <select className="input" value={settings.theme} onChange={(e) => save({ ...settings, theme: e.target.value })}>
                      <option value="system">{t.systemTheme}</option><option value="light">{t.light}</option><option value="dark">{t.dark}</option>
                    </select>
                  </label>
                  <label className="field"><span>{t.language}</span>
                    <select className="input" value={settings.language} onChange={(e) => save({ ...settings, language: e.target.value })}>
                      <option value="en">English</option><option value="fa">فارسی</option>
                    </select>
                  </label>
                </div>
                <label className="field"><span>{t.adminToken}</span><input className="input mono" value={settings.adminToken} onChange={(e) => save({ ...settings, adminToken: e.target.value })} /></label>
              </div>
            </section>
          )}
        </div>
      </div>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
