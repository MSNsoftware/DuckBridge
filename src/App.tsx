import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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
  proxyList: { id: string; url: string; enabled: boolean }[];
  adminToken: string;
};

type Tab = "dashboard" | "apitester" | "keys" | "models" | "logs" | "settings";

function copy(text: string) {
  navigator.clipboard.writeText(text);
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [settings, setSettings] = useState<Settings>({
    host: "127.0.0.1",
    port: 8765,
    autoStartServer: true,
    autostart: false,
    minimizeToTray: true,
    autoUpdate: false,
    theme: "system",
    language: "en",
    proxyMode: "direct",
    proxyList: [],
    adminToken: "your-super-secret-admin-token",
  });
  const [status, setStatus] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [testerUrl, setTesterUrl] = useState("/v1/models");
  const [testerBody, setTesterBody] = useState('{"model":"gpt-6-luna","messages":[{"role":"user","content":"Reply exactly: OK"}]}');
  const [testerOut, setTesterOut] = useState("");

  const baseUrl = `http://${settings.host}:${settings.port}`;
  const v1Url = `${baseUrl}/v1`;

  async function loadAll() {
    try {
      const s = await invoke<Settings>("get_settings");
      setSettings(s);
      setStatus(await invoke<boolean>("server_status"));
      setLogs(await invoke<string[]>("get_logs"));
      try {
        const m = await fetch(`${v1Url}/models`);
        const j = await m.json();
        setModels((j.data || []).map((d: any) => d.id));
      } catch {}
      try {
        const h = await fetch(`${baseUrl}/health`);
        setHealth(await h.json());
        const met = await fetch(`${baseUrl}/metrics`);
        setMetrics(await met.json());
      } catch {}
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    loadAll().then(() => {
      // auto-start server on first load
      invoke<Settings>("get_settings").then((s) => {
        if (s.autoStartServer) {
          invoke("start_server").then(() => setTimeout(loadAll, 2000)).catch(() => {});
        }
      }).catch(() => {});
    });
    const id = setInterval(loadAll, 5000);
    return () => clearInterval(id);
  }, []);

  async function save(newSettings: Settings) {
    setSettings(newSettings);
    await invoke("save_settings_cmd", { settings: newSettings });
  }

  async function refreshKeys() {
    try {
      const r = await fetch(`${baseUrl}/api-keys`, { headers: { Authorization: `Bearer ${settings.adminToken}` } });
      const j = await r.json();
      setKeys(j.api_keys || []);
    } catch {}
  }

  useEffect(() => {
    if (tab === "keys") refreshKeys();
  }, [tab]);

  async function createKey() {
    const desc = prompt("Description:");
    if (desc === null) return;
    const r = await fetch(`${baseUrl}/api-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.adminToken}` },
      body: JSON.stringify({ description: desc }),
    });
    const j = await r.json();
    if (j.key) alert(`Created: ${j.key}`);
    refreshKeys();
  }

  async function deleteKey(k: string) {
    await fetch(`${baseUrl}/api-keys/${k}`, { method: "DELETE", headers: { Authorization: `Bearer ${settings.adminToken}` } });
    refreshKeys();
  }

  async function runTester(method: string) {
    setTesterOut("Loading...");
    try {
      const opts: any = { headers: { "Content-Type": "application/json", Authorization: `Bearer test` } };
      if (method !== "GET") { opts.method = method; opts.body = testerBody; }
      const r = await fetch(`${baseUrl}${testerUrl}`, opts);
      const t = await r.text();
      setTesterOut(`${r.status} ${r.statusText}\n${t}`);
    } catch (e: any) {
      setTesterOut(`Error: ${e.message}`);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>DuckBridge <span>API Gateway</span></h1>
        <div className="status">
          <span className={status ? "dot on" : "dot off"} />
          {status ? "Running" : "Stopped"}
          <button onClick={() => invoke("start_server").then(loadAll)}>Start</button>
          <button onClick={() => invoke("stop_server").then(loadAll)}>Stop</button>
        </div>
      </header>

      <nav>
        {(["dashboard", "apitester", "keys", "models", "logs", "settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "dashboard" ? "Dashboard" : t === "apitester" ? "API Tester" : t === "keys" ? "API Keys" : t === "models" ? "Models" : t === "logs" ? "Logs" : "Settings"}</button>
        ))}
      </nav>

      <main>
        {tab === "dashboard" && (
          <section>
            <h2>Base URL</h2>
            <div className="copybox">
              <code>{v1Url}</code>
              <button onClick={() => copy(v1Url)}>Copy</button>
            </div>
            <div className="copybox">
              <code>{baseUrl}</code>
              <button onClick={() => copy(baseUrl)}>Copy</button>
            </div>
            <pre className="snippet">{`curl ${v1Url}/chat/completions \\
  -H "Authorization: Bearer <key>" \\
  -d '{"model":"gpt-6-luna","messages":[{"role":"user","content":"Hi"}]}'`}</pre>
            <pre className="snippet">{`from openai import OpenAI
client = OpenAI(api_key="anything", base_url="${v1Url}")
client.chat.completions.create(model="gpt-6-luna", messages=[{"role":"user","content":"Hi"}])`}</pre>
            {health && <pre className="snippet">{JSON.stringify(health, null, 2)}</pre>}
            {metrics && <pre className="snippet">{JSON.stringify(metrics, null, 2)}</pre>}
          </section>
        )}

        {tab === "apitester" && (
          <section>
            <h2>API Tester</h2>
            <input value={testerUrl} onChange={(e) => setTesterUrl(e.target.value)} placeholder="/v1/models" />
            <textarea value={testerBody} onChange={(e) => setTesterBody(e.target.value)} rows={6} />
            <div>
              <button onClick={() => runTester("GET")}>GET</button>
              <button onClick={() => runTester("POST")}>POST</button>
            </div>
            <pre className="snippet">{testerOut}</pre>
          </section>
        )}

        {tab === "keys" && (
          <section>
            <h2>API Keys</h2>
            <button onClick={createKey}>Create Key</button>
            <ul>
              {keys.map((k: any) => (
                <li key={k.id}>
                  <code>{k.key}</code> <span>{k.description || ""}</span>
                  <button onClick={() => copy(k.key)}>Copy</button>
                  <button onClick={() => deleteKey(k.key)}>Delete</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "models" && (
          <section>
            <h2>Models (live)</h2>
            <button onClick={loadAll}>Refresh</button>
            <ul>{models.map((m) => <li key={m}><code>{m}</code></li>)}</ul>
          </section>
        )}

        {tab === "logs" && (
          <section>
            <h2>Logs</h2>
            <button onClick={() => invoke("clear_logs").then(loadAll)}>Clear</button>
            <pre className="logs">{logs.join("\n")}</pre>
          </section>
        )}

        {tab === "settings" && (
          <section>
            <h2>Settings</h2>
            <label>Host <input value={settings.host} onChange={(e) => save({ ...settings, host: e.target.value })} /></label>
            <label>Port <input type="number" value={settings.port} onChange={(e) => save({ ...settings, port: Number(e.target.value) })} /></label>
            <label><input type="checkbox" checked={settings.autoStartServer} onChange={(e) => save({ ...settings, autoStartServer: e.target.checked })} /> Auto-start server</label>
            <label><input type="checkbox" checked={settings.autostart} onChange={(e) => save({ ...settings, autostart: e.target.checked })} /> Autostart at login</label>
            <label><input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => save({ ...settings, minimizeToTray: e.target.checked })} /> Minimize to tray on close</label>
            <label><input type="checkbox" checked={settings.autoUpdate} onChange={(e) => save({ ...settings, autoUpdate: e.target.checked })} /> Auto-update</label>
            <label>Theme
              <select value={settings.theme} onChange={(e) => save({ ...settings, theme: e.target.value })}>
                <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </label>
            <label>Language
              <select value={settings.language} onChange={(e) => save({ ...settings, language: e.target.value })}>
                <option value="en">English</option><option value="fa">فارسی</option>
              </select>
            </label>
            <label>Proxy Mode
              <select value={settings.proxyMode} onChange={(e) => save({ ...settings, proxyMode: e.target.value })}>
                <option value="direct">Direct (no proxy)</option><option value="system">System proxy</option><option value="manual">Manual list</option>
              </select>
            </label>
            <label>Admin Token <input value={settings.adminToken} onChange={(e) => save({ ...settings, adminToken: e.target.value })} /></label>
            <button onClick={async () => { await invoke("test_proxy", { url: "" }); }}>Test Proxy</button>
          </section>
        )}
      </main>
    </div>
  );
}
