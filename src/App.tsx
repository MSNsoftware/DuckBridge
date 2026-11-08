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
    autoStart: "Auto-start server", autostart: "Autostart at login", minimize: "Minimize to tray on close",
    direct: "Direct — no proxy", systemProxy: "System proxy", manual: "Manual list",
    add: "Add proxy", test: "Test", delete: "Delete", enable: "Enable",
    theme: "Theme", language: "Language", light: "Light", dark: "Dark", systemTheme: "System",
    create: "Create key", refresh: "Refresh", clear: "Clear", send: "Send",
    endpoint: "Endpoint", body: "Body (JSON)", response: "Response",
    lastError: "Last error", noModels: "No models loaded. Start the server.",
    copiedUrl: "Base URL copied.",
  },
  fa: {
    dashboard: "داشبورد", apitester: "تست API", keys: "کلیدها", models: "مدل‌ها", logs: "گزارش‌ها", settings: "تنظیمات",
    running: "در حال اجرا", stopped: "متوقف", start: "شروع سرور", stop: "توقف", restart: "راه‌اندازی مجدد",
    baseUrl: "آدرس پایه", ready: "این را در Chatbox یا Continue یا هر کلاینت OpenAI وارد کنید.",
    copy: "کپی", copied: "کپی شد", health: "وضعیت", metrics: "آمار",
    server: "سرور", proxy: "پروکسی", appearance: "ظاهر", system: "سیستم",
    host: "هاست", port: "پورت", adminToken: "توکن ادمین",
    autoStart: "شروع خودکار سرور", autostart: "اجرا با ورود به سیستم", minimize: "با بستن پنجره به ترای برود",
    direct: "مستقیم — بدون پروکسی", systemProxy: "پروکسی سیستم", manual: "لیست دستی",
    add: "افزودن پروکسی", test: "تست", delete: "حذف", enable: "فعال",
    theme: "پوسته", language: "زبان", light: "روشن", dark: "تیره", systemTheme: "سیستم",
    create: "ساخت کلید", refresh: "به‌روزرسانی", clear: "پاک کردن", send: "ارسال",
    endpoint: "نقطه پایانی", body: "بدنه (JSON)", response: "پاسخ",
    lastError: "آخرین خطا", noModels: "مدلی بارگذاری نشده. سرور را شروع کنید.",
    copiedUrl: "آدرس پایه کپی شد.",
  },
} as const;

async function copyText(text: string, fallback: (m: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    fallback("Copied");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); fallback("Copied"); } catch { fallback(text); }
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
    try { await invoke("save_settings_cmd", { settings: next }); } catch (e: any) { showToast(`Save failed: ${e}`); }
  }

  async function doStart() {
    setBusy(true);
    try { await invoke("start_server"); showToast(t.running); }
    catch (e: any) { showToast(`Start failed: ${e}`); }
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
  }

  async function runTester(method: string) {
    setTesterOut("Loading...");
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
    showToast("Proxy added");
  }

  const stats = useMemo(() => ({
    total: metrics?.total_requests ?? 0,
    success: metrics?.success ?? 0,
    errors: metrics?.errors ?? 0,
    avg: metrics?.avg_latency_sec ?? 0,
  }), [metrics]);

  const dirClass = lang === "fa" ? " rtl" : "";

  return (
    <div className={`shell${dirClass}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">D</div>
          <div>
            <div className="wordmark">DuckBridge</div>
            <div className="sub">API Gateway</div>
          </div>
        </div>

        <nav className="nav">
          {(([
            ["dashboard", t.dashboard, "Overview"], ["apitester", t.apitester, "Console"], ["keys", t.keys, "Keys"],
            ["models", t.models, "Models"], ["logs", t.logs, "Logs"], ["settings", t.settings, "Settings"],
          ]) as [Tab, string, string][]).map(([k, label]) => (
            <button key={k} className={`navbtn ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
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
            <button className="btn ghost" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl))}>{t.copy} Base URL</button>
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
                  <button className="btn primary" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl))}>{t.copy}</button>
                </div>
                <div className="urlrow secondary">
                  <code className="url">{baseUrl}</code>
                  <button className="btn" onClick={() => copyText(baseUrl, () => showToast(t.copiedUrl))}>{t.copy}</button>
                </div>
                <div className="statgrid">
                  <div className="stat"><span className="stat-label">{t.running}</span><strong>{status ? "●" : "○"}</strong><span className="muted">{status ? settings.port : "—"}</span></div>
                  <div className="stat"><span className="stat-label">Requests</span><strong>{stats.total}</strong><span className="muted">{stats.success} ok</span></div>
                  <div className="stat"><span className="stat-label">Errors</span><strong>{stats.errors}</strong><span className="muted">{metrics?.upstream_errors ?? 0} upstream</span></div>
                  <div className="stat"><span className="stat-label">Latency</span><strong>{stats.avg}s</strong><span className="muted">avg</span></div>
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
              <div className="row between"><h2>{t.keys}</h2><button className="btn primary" onClick={createKey}>{t.create}</button></div>
              {keys.length === 0 && <p className="muted">No keys. Set ADMIN_TOKEN in Settings and start the server with IGNPRE_API_KEYS=False, or leave it True for open access.</p>}
              <ul className="keylist">
                {keys.map((k: any) => (
                  <li key={k.id} className="keyrow">
                    <code className="mono">{k.key}</code>
                    <span className="muted">{k.description || ""}</span>
                    <span className="spacer" />
                    <button className="btn sm" onClick={() => copyText(k.key, showToast)}>{t.copy}</button>
                    <button className="btn sm danger" onClick={async () => { await fetch(`${baseUrl}/api-keys/${k.key}`, { method: "DELETE", headers: { Authorization: `Bearer ${settings.adminToken}` } }); refreshKeys(); }}>{t.delete}</button>
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
                <label className="check"><input type="checkbox" checked={settings.autoUpdate} onChange={(e) => save({ ...settings, autoUpdate: e.target.checked })} /> Auto-update</label>
              </div>

              <div className="card stack">
                <h2>{t.proxy}</h2>
                <label className="field"><span>Mode</span>
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
                          <code className="mono">{p.url}</code>
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
