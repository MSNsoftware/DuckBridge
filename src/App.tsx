import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "./lib/ipc";

declare const __APP_VERSION__: string;

type ProxyEntry = { id: string; url: string; enabled: boolean };
type Settings = {
  host: string;
  port: number;
  requireApiKeys?: boolean;
  autoStartServer: boolean;
  autostart: boolean;
  minimizeToTray: boolean;
  autoUpdate: boolean;
  theme: string;
  language: string;
  proxyMode: string;
  proxyList: ProxyEntry[];
  adminToken?: string;
};

type Tab = "dashboard" | "playground" | "models" | "settings" | "about";

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
};

const T = {
  en: {
    dashboard: "Dashboard",
    playground: "Playground",
    models: "Models",
    settings: "Settings & Logs",
    about: "About",
    running: "Running",
    stopped: "Stopped",
    start: "Start server",
    stop: "Stop",
    restart: "Restart",
    baseUrl: "Base URL",
    ready: "Paste this into Chatbox, Continue, Cursor, or any OpenAI client.",
    copy: "Copy",
    copied: "Copied",
    copiedUrl: "Base URL copied.",
    clientPresets: "Quick Client Setup",
    chatboxTitle: "Chatbox",
    chatboxDesc: "Settings > Model Provider > OpenAI API. Set API Host to Base URL and API Key to any text.",
    cursorTitle: "Cursor / VS Code",
    cursorDesc: "Settings > Models > Override Base URL to Base URL, and set API key to 'dummy'.",
    continueTitle: "Continue.dev",
    continueDesc: "Add to your config.json inside models array:",
    copyConfig: "Copy Config",
    requests: "Requests",
    errors: "Errors",
    latency: "Latency",
    avg: "avg",
    ok: "ok",
    upstream: "upstream",
    chatTab: "Live Chat",
    imageTab: "Generate Image",
    selectModel: "Select Model",
    promptPlaceholder: "Ask something to test Duck.ai...",
    send: "Send",
    thinking: "Thinking...",
    clearChat: "Clear Chat",
    imagePromptPlaceholder: "Describe an image to generate with Luna...",
    generate: "Generate Image",
    generating: "Generating...",
    testLatency: "Test Latencies",
    testing: "Testing...",
    ms: "ms",
    server: "Server",
    proxy: "Proxy",
    appearance: "Appearance",
    logs: "Server Logs",
    host: "Host",
    port: "Port",
    autoStart: "Auto-start server",
    autostart: "Autostart at login",
    minimize: "Minimize to tray on close",
    direct: "Direct — no proxy",
    systemProxy: "System proxy",
    manual: "Manual list",
    add: "Add proxy",
    test: "Test",
    delete: "Delete",
    enable: "Enable",
    theme: "Theme",
    language: "Language",
    light: "Light",
    dark: "Dark",
    systemTheme: "System",
    refresh: "Refresh",
    clear: "Clear",
    mode: "Mode",
    noModels: "No models loaded. Start the server.",
    free: "Free",
    paid: "Paid (PRO)",
    proxyAdded: "Proxy added",
    saveFailed: "Save failed",
    startFailed: "Start failed",
  },
  fa: {
    dashboard: "داشبورد",
    playground: "تست زنده",
    models: "مدل‌ها",
    settings: "تنظیمات و لاگ",
    about: "درباره ما",
    running: "در حال اجرا",
    stopped: "متوقف",
    start: "شروع سرور",
    stop: "توقف",
    restart: "راه‌اندازی مجدد",
    baseUrl: "آدرس پایه (Base URL)",
    ready: "این آدرس را در Chatbox، Cursor، Continue یا هر کلاینت OpenAI وارد کنید.",
    copy: "کپی",
    copied: "کپی شد",
    copiedUrl: "آدرس پایه کپی شد.",
    clientPresets: "راهنمای اتصال سریع کلاینت‌ها",
    chatboxTitle: "چت‌باکس (Chatbox)",
    chatboxDesc: "در تنظیمات Chatbox: ارائه‌دهنده را OpenAI انتخاب کنید، API Host را آدرس زیر و API Key را هر عبارتی بگذارید.",
    cursorTitle: "کِرسِر (Cursor) / VS Code",
    cursorDesc: "در Settings > Models گزینه Override Base URL را آدرس پایه بگذارید و کلید را هر رشته‌ای وارد کنید.",
    continueTitle: "افزونه Continue",
    continueDesc: "در فایل config.json این مدل را اضافه کنید:",
    copyConfig: "کپی کانفیگ",
    requests: "درخواست‌ها",
    errors: "خطاها",
    latency: "تأخیر",
    avg: "میانگین",
    ok: "موفق",
    upstream: "آپ‌استریم",
    chatTab: "چت زنده",
    imageTab: "تولید تصویر",
    selectModel: "انتخاب مدل",
    promptPlaceholder: "پیامی بنویسید تا ارتباط زنده با Duck.ai تست شود...",
    send: "ارسال",
    thinking: "در حال پردازش...",
    clearChat: "پاک‌سازی چت",
    imagePromptPlaceholder: "توصیف تصویری که می‌خواهید مدل Luna تولید کند...",
    generate: "تولید تصویر",
    generating: "در حال تولید تصویر...",
    testLatency: "تست پینگ مدل‌ها",
    testing: "در حال تست...",
    ms: "میلی‌ثانیه",
    server: "سرور",
    proxy: "پروکسی",
    appearance: "ظاهر",
    logs: "گزارش‌های سرور",
    host: "هاست",
    port: "پورت",
    autoStart: "شروع خودکار سرور",
    autostart: "اجرا با ورود به سیستم",
    minimize: "با بستن پنجره به ترای برود",
    direct: "مستقیم — بدون پروکسی",
    systemProxy: "پروکسی سیستم",
    manual: "لیست دستی",
    add: "افزودن پروکسی",
    test: "تست",
    delete: "حذف",
    enable: "فعال",
    theme: "پوسته",
    language: "زبان",
    light: "روشن",
    dark: "تیره",
    systemTheme: "سیستم",
    refresh: "به‌روزرسانی",
    clear: "پاک کردن",
    mode: "حالت",
    noModels: "مدلی بارگذاری نشده. ابتدا سرور را شروع کنید.",
    free: "رایگان",
    paid: "پولی (PRO)",
    proxyAdded: "پروکسی اضافه شد",
    saveFailed: "ذخیره ناموفق بود",
    startFailed: "شروع ناموفق بود",
  },
} as const;

function notifySystem(title: string, body: string) {
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          if (p === "granted") new Notification(title, { body });
        });
      }
    }
  } catch {
    // ignore
  }
}

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
    try {
      document.execCommand("copy");
      feedback(okLabel);
    } catch {
      feedback(text);
    }
    ta.remove();
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [lang, setLang] = useState<"en" | "fa">("en");
  const [theme, setTheme] = useState("system");
  const [settings, setSettings] = useState<Settings>({
    host: "127.0.0.1",
    port: 8765,
    autoStartServer: true,
    autostart: false,
    minimizeToTray: true,
    autoUpdate: true,
    theme: "system",
    language: "en",
    proxyMode: "direct",
    proxyList: [],
  });
  const [status, setStatus] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [models, setModels] = useState<{ id: string; free: boolean; name?: string }[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [newProxy, setNewProxy] = useState("");

  // Playground state
  const [playSubTab, setPlaySubTab] = useState<"chat" | "image">("chat");
  const [selectedModel, setSelectedModel] = useState("gpt-6-luna");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "سلام! این یک محیط تست زنده برای اطمینان از سلامت اتصال به Duck.ai است. هر پیامی بفرستید تا پاسخ را در لحظه دریافت کنید." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [generatedImg, setGeneratedImg] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [modelLatencies, setModelLatencies] = useState<Record<string, number>>({});
  const [testingLatencies, setTestingLatencies] = useState(false);

  const t = T[lang];
  const baseUrl = `http://${settings.host}:${settings.port}`;
  const v1Url = `${baseUrl}/v1`;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }, []);

  const [ctx, setCtx] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      const copyEl = el.closest(".copyable, input, textarea, pre, code, .url, [data-copy]") as HTMLElement | null;
      if (!copyEl) {
        e.preventDefault();
        return;
      }
      const sel = window.getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString() : copyEl.textContent || "";
      if (!text) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      setCtx({ x: e.clientX, y: e.clientY, text });
    };
    const close = () => setCtx(null);
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("click", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("click", close);
      document.removeEventListener("scroll", close, true);
    };
  }, []);

  const applyTheme = useCallback((th: string) => {
    setTheme(th);
    const root = document.documentElement;
    if (th === "dark") {
      root.dataset.theme = "dark";
    } else if (th === "light") {
      root.dataset.theme = "light";
    } else {
      root.removeAttribute("data-theme");
    }
  }, []);

  const applyLang = useCallback((l: "en" | "fa") => {
    setLang(l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === "fa" ? "rtl" : "ltr";
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const s = await invoke<Settings>("get_settings").catch(() => null);
      if (s) {
        setSettings(s);
        applyTheme(s.theme);
        applyLang((s.language as any) || "en");
      }
      setStatus(await invoke<boolean>("server_status").catch(() => false));
      setLogs(await invoke<string[]>("get_logs").catch(() => []));
      const b = s ? `http://${s.host}:${s.port}` : "http://127.0.0.1:8765";

      try {
        const m = await fetch(`${b}/v1/models`);
        if (m.ok) {
          const j = await m.json();
          const list = (j.data || []).map((d: any) => ({ id: d.id, free: d.free !== false, name: d.name }));
          setModels(list);
          if (list.length > 0 && !list.some((item: any) => item.id === selectedModel)) {
            setSelectedModel(list[0].id);
          }
        }
      } catch {
        // server stopped or unreachable
      }

      try {
        const met = await fetch(`${b}/metrics`);
        setMetrics(met.ok ? await met.json() : null);
        const hl = await fetch(`${b}/health`);
        setHealth(hl.ok ? await hl.json() : null);
      } catch {
        setMetrics(null);
        setHealth(null);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }, [applyTheme, applyLang, selectedModel]);

  useEffect(() => {
    loadAll().then(() => {
      invoke<Settings>("get_settings")
        .then((s) => {
          if (s.autoStartServer) invoke("start_server").then(() => setTimeout(loadAll, 2500)).catch(() => {});
        })
        .catch(() => {});
    });
    const id = setInterval(loadAll, 6000);
    return () => clearInterval(id);
  }, [loadAll]);

  async function save(next: Settings) {
    const prev = settings;
    setSettings(next);
    applyTheme(next.theme);
    applyLang((next.language as any) || "en");
    try {
      await invoke("save_settings_cmd", { settings: next });
      if (status && (next.host !== prev.host || next.port !== prev.port || next.proxyMode !== prev.proxyMode)) {
        showToast(
          next.language === "fa"
            ? "تنظیمات ذخیره شد. برای اعمال، سرور را راه‌اندازی مجدد کنید."
            : "Settings saved. Restart server to apply changes."
        );
      }
    } catch (e: any) {
      showToast(`${T[next.language as "en" | "fa"]?.saveFailed ?? "Save failed"}: ${e}`);
    }
  }

  async function doStart() {
    setBusy(true);
    try {
      await invoke("start_server");
      showToast(t.running);
    } catch (e: any) {
      showToast(`${t.startFailed}: ${e}`);
    }
    setBusy(false);
    setTimeout(loadAll, 1500);
  }

  async function doStop() {
    setBusy(true);
    try {
      await invoke("stop_server");
      showToast(t.stopped);
    } catch (e: any) {
      showToast(`${e}`);
    }
    setBusy(false);
    setTimeout(loadAll, 800);
  }

  async function doRestart() {
    setBusy(true);
    showToast(lang === "fa" ? "در حال راه‌اندازی مجدد سرور..." : "Restarting server...");
    try {
      await invoke("restart_server");
      showToast(lang === "fa" ? "سرور با موفقیت راه‌اندازی مجدد شد" : "Server restarted");
    } catch (e: any) {
      showToast(`${t.startFailed}: ${e}`);
    } finally {
      setBusy(false);
      setTimeout(loadAll, 1200);
    }
  }

  async function addProxy() {
    const url = newProxy.trim();
    if (!url) return;
    const entry: ProxyEntry = { id: Date.now().toString(), url, enabled: true };
    await save({ ...settings, proxyList: [...settings.proxyList, entry] });
    setNewProxy("");
    showToast(t.proxyAdded);
  }

  // --- Live Chat Streaming Runner ---
  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const newMsgs: ChatMsg[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages([...newMsgs, { role: "assistant", content: "" }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const resp = await fetch(`${v1Url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        setChatMessages([...newMsgs, { role: "assistant", content: `خطا (${resp.status}): ${errText}` }]);
        if (resp.status === 429 || errText.includes("429") || errText.includes("سقف مصرف")) {
          notifySystem("DuckBridge — سقف مصرف روزانه", "سقف مصرف روزانه داک‌داک‌گو روی این آی‌پی به پایان رسید. لطفاً در تنظیمات پروکسی را فعال یا تغییر دهید.");
        } else if (resp.status === 418 || errText.includes("418")) {
          notifySystem("DuckBridge — محدودیت امنیتی داک‌داک‌گو", "درخواست موقتاً توسط داک‌داک‌گو متوقف شد. لطفاً پروکسی را تغییر دهید.");
        }
        setChatLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) {
        const json = await resp.json();
        setChatMessages([...newMsgs, { role: "assistant", content: json.choices?.[0]?.message?.content || "پاسخی دریافت نشد" }]);
        setChatLoading(false);
        return;
      }

      const decoder = new TextDecoder("utf-8");
      let partial = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        partial += decoder.decode(value, { stream: true });
        const lines = partial.split("\n");
        partial = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            try {
              const chunk = JSON.parse(trimmed.slice(6));
              if (chunk.error) {
                const errMsg = typeof chunk.error === "string" ? chunk.error : chunk.error.message || JSON.stringify(chunk.error);
                accumulated += `\n⚠️ ${errMsg}`;
                setChatMessages([...newMsgs, { role: "assistant", content: accumulated }]);
                if (errMsg.includes("429") || errMsg.includes("سقف مصرف")) {
                  notifySystem("DuckBridge — سقف مصرف روزانه", "سقف مصرف روزانه داک‌داک‌گو روی این آی‌پی به پایان رسید. لطفاً در تنظیمات پروکسی را تغییر دهید.");
                } else if (errMsg.includes("418")) {
                  notifySystem("DuckBridge — محدودیت امنیتی داک‌داک‌گو", "درخواست موقتاً توسط داک‌داک‌گو متوقف شد. چند دقیقه صبر کنید یا پروکسی را تغییر دهید.");
                }
              }
              const delta = chunk.choices?.[0]?.delta?.content || "";
              accumulated += delta;
              setChatMessages([...newMsgs, { role: "assistant", content: accumulated }]);
            } catch {
              // ignore malformed line
            }
          }
        }
      }
    } catch (e: any) {
      setChatMessages([...newMsgs, { role: "assistant", content: `خطای اتصال به سرور محلی: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  // --- Image Generator Runner ---
  async function generateImage() {
    const p = imagePrompt.trim();
    if (!p || imgLoading) return;
    setImgLoading(true);
    setGeneratedImg(null);
    try {
      const resp = await fetch(`${v1Url}/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, size: "1024x1024" }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        showToast(`خطا: ${err}`);
      } else {
        const json = await resp.json();
        const url = json.data?.[0]?.url;
        if (url) {
          setGeneratedImg(`${baseUrl}${url}`);
        }
      }
    } catch (e: any) {
      showToast(`خطا: ${e.message}`);
    } finally {
      setImgLoading(false);
    }
  }

  // --- Latency Benchmark Runner (Measures true Time-To-First-Token TTFT) ---
  async function runLatencyBenchmark() {
    if (testingLatencies || models.length === 0) return;
    setTestingLatencies(true);
    const results: Record<string, number> = { ...modelLatencies };

    for (const m of models.filter((x) => x.free)) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${v1Url}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: m.id,
            messages: [{ role: "user", content: "hi" }],
            stream: true,
          }),
        });
        if (res.ok && res.body) {
          const reader = res.body.getReader();
          // Read first token chunk to capture exact Time-To-First-Token (TTFT)
          const { done, value } = await reader.read();
          if (!done && value) {
            results[m.id] = Math.round(performance.now() - t0);
          } else {
            results[m.id] = Math.round(performance.now() - t0);
          }
          await reader.cancel(); // Disconnect to stop downstream token generation
        } else {
          results[m.id] = -1; // error
        }
      } catch {
        results[m.id] = -1;
      }
      setModelLatencies({ ...results });
    }
    setTestingLatencies(false);
  }

  const stats = useMemo(
    () => ({
      total: metrics?.total_requests ?? 0,
      success: metrics?.success ?? 0,
      errors: metrics?.errors ?? 0,
      avg: metrics?.avg_latency_sec ?? 0,
    }),
    [metrics]
  );

  const dirClass = lang === "fa" ? " rtl" : "";

  const Icon = ({ d }: { d: string }) => (
    <svg className="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );

  const icons: Record<Tab, string> = {
    dashboard: "M4 4h16v4H4zM4 10h16v2H4zM4 14h10v6H4z",
    playground: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    models: "M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zM12 11L4 6.5M12 11l8-4.5M12 11v9",
    settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z",
    about: "M12 8h.01M11 12h1v4h1",
  };

  const continueConfigSnippet = `{\n  "title": "DuckBridge",\n  "provider": "openai",\n  "model": "gpt-6-luna",\n  "apiKey": "dummy",\n  "apiBase": "${v1Url}"\n}`;

  return (
    <div className={`shell${dirClass}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="mark" aria-hidden="true">
            <svg viewBox="0 0 512 512" width="40" height="40" aria-hidden="true">
              <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#D64541" />
                  <stop offset="1" stopColor="#8B1E1E" />
                </linearGradient>
                <linearGradient id="beak" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#F2C14E" />
                  <stop offset="1" stopColor="#D99A2B" />
                </linearGradient>
              </defs>
              <rect width="512" height="512" rx="128" fill="url(#bg)" />
              <circle cx="256" cy="244" r="172" fill="#ffffff" opacity="0.10" />
              <g transform="translate(-379 -139) scale(5)">
                <path d="M138.46 132.53c-2.51-4.88-4.91-9.37-6.4-12.34-3.96-7.93-7.94-19.11-6.13-26.32.33-1.31-3.73-48.51-6.6-50.03-3.19-1.7-10.12-3.94-13.71-4.54-2.5-.4-3.07.3-4.12.46.99.1 5.7 2.42 6.61 2.55-.91.62-3.6-.02-5.32.74-.87.4-1.52 1.88-1.5 2.58 4.9-.5 12.56-.01 17.1 2-3.61.41-9.09.87-11.45 2.11-6.84 3.6-9.86 12.03-8.06 22.13 1.79 10.08 9.72 46.85 12.25 59.13 2.52 12.27 31.51 9.7 27.32 1.53z" fill="#E8DDD3" />
                <path d="M142.1 133.72c-3.01-5.97-6.08-11.68-7.86-15.22-3.97-7.94-7.93-19.11-6.13-26.32.34-1.31.34-6.67 1.43-7.38 8.41-5.5 7.81-.19 11.19-2.65 1.74-1.27 3.13-2.8 3.74-4.9 2.16-7.58-3-20.77-8.78-26.54-1.88-1.88-4.76-3.06-8.02-3.68-1.25-1.72-3.27-3.36-6.13-4.89a28.86 28.86 0 0 0-18.27-2.88c1 .1 3.26 2.14 4.17 2.27-1.38.94-5.05.82-5.03 2.9 4.92-.5 10.3.28 14.84 2.3-3.6.4-6.96 1.3-9.31 2.54-6.86 3.6-8.66 10.81-6.86 20.91 1.81 10.1 9.74 46.88 12.26 59.13 2.53 12.26 32.5 11.8 28.77 4.41z" fill="#FFF8F0" />
                <circle r="3.79" cx="112.8" cy="70.69" fill="#2A0A0A" />
                <circle r=".98" cx="114.49" cy="69.43" fill="#ffffff" />
                <circle r="3.25" cx="138.12" cy="68.44" fill="#2A0A0A" />
                <circle r=".84" cx="139.57" cy="67.36" fill="#ffffff" />
                <path fill="url(#beak)" d="M124.4 85.3c.38-2.3 6.3-6.63 10.5-6.9 4.2-.26 5.5-.2 9-1.04 3.51-.83 12.54-3.08 15.03-4.24 2.5-1.15 13.1.57 5.63 4.74-3.23 1.81-11.94 5.13-18.17 6.99-6.22 1.86-9.99-1.78-12.06 1.28-1.64 2.43-.33 5.76 7.1 6.45 10.04.93 19.66-4.52 20.72-1.62 1.06 2.9-8.62 6.5-14.52 6.62-5.9.11-17.78-3.9-19.56-5.14-1.79-1.23-4.16-4.13-3.67-7.14z" />
                <path fill="#3FA46A" d="M128.94 115.6s-14.1-7.53-14.33-4.48c-.24 3.06 0 15.51 1.64 16.45 1.65.94 13.4-6.1 13.4-6.1l-.7-5.88zm5.4-.48s9.64-7.29 11.76-6.82c2.11.48 2.58 15.51.7 16.23-1.88.7-12.9-3.81-12.9-3.81l.45-5.6z" />
              </g>
            </svg>
          </span>
          <div>
            <div className="wordmark">DuckBridge</div>
            <div className="sub">API Gateway</div>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          {([
            ["dashboard", t.dashboard],
            ["playground", t.playground],
            ["models", t.models],
            ["settings", t.settings],
            ["about", t.about],
          ] as [Tab, string][]).map(([k, label]) => (
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
            <span className="mono muted">
              {" "}
              {settings.host}:{settings.port}
            </span>
          </div>
          <div className="side-actions">
            {!status ? (
              <>
                <button className="btn primary sm" disabled={busy} onClick={doStart}>
                  {t.start}
                </button>
                <button className="btn sm" disabled={busy} onClick={doRestart}>
                  {t.restart}
                </button>
              </>
            ) : (
              <>
                <button className="btn sm" disabled={busy} onClick={doStop}>
                  {t.stop}
                </button>
                <button className="btn primary sm" disabled={busy} onClick={doRestart}>
                  {t.restart}
                </button>
              </>
            )}
          </div>
          <div className="sidefoot-meta">Duck.ai · local only</div>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div>
            <h1>{t[tab] || "Overview"}</h1>
            <p className="muted">{lang === "fa" ? "دروازه محلی و پرسرعت برای استفاده از Duck.ai در کلاینت‌های دلخواه" : "Local fast gateway to use Duck.ai in your favorite clients"}</p>
          </div>
          <div className="top-actions">
            <button className="btn ghost" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl), t.copied)}>
              {t.copy} Base URL
            </button>
            <button className="btn" onClick={loadAll}>
              {t.refresh}
            </button>
          </div>
        </header>

        <div className="page">
          {tab === "dashboard" && (
            <section className="stack">
              <div className="card hero">
                <label className="label">{t.baseUrl}</label>
                <p className="muted">{t.ready}</p>
                <div className="urlrow copyable" data-copy>
                  <code className="url">{v1Url}</code>
                  <button className="btn primary" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl), t.copied)}>
                    {t.copy}
                  </button>
                </div>
                <div className="statgrid">
                  <div className="stat">
                    <span className="stat-label">{t.running}</span>
                    <strong>{status ? "●" : "○"}</strong>
                    <span className="muted">{status ? settings.port : "—"}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">{t.requests}</span>
                    <strong>{stats.total}</strong>
                    <span className="muted">
                      {stats.success} {t.ok}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">{t.errors}</span>
                    <strong>{stats.errors}</strong>
                    <span className="muted">
                      {metrics?.upstream_errors ?? 0} {t.upstream}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">{t.latency}</span>
                    <strong>{stats.avg.toFixed(2)}s</strong>
                    <span className="muted">{t.avg}</span>
                  </div>
                </div>
                {metrics?.last_error && (
                  <div className="notice" style={{ borderColor: metrics.last_error.includes("۴۲۹") || metrics.last_error.includes("۴۱۸") ? "var(--bad)" : "var(--border)" }}>
                    <div className="row between" style={{ alignItems: "center", width: "100%" }}>
                      <span><strong>وضعیت اتصال:</strong> {metrics.last_error}</span>
                      {(metrics.last_error.includes("۴۲۹") || metrics.last_error.includes("۴۱۸") || metrics.last_error.includes("پروکسی")) && (
                        <button className="btn sm primary" onClick={() => setTab("settings")}>
                          تنظیمات پروکسی
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* One-Click Client Setup Guides */}
              <div className="card stack">
                <h3>{t.clientPresets}</h3>
                <div className="preset-grid">
                  <div className="preset-card">
                    <h4>
                      <span>{t.chatboxTitle}</span>
                      <button className="btn sm" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl), t.copied)}>
                        {t.copy} URL
                      </button>
                    </h4>
                    <p>{t.chatboxDesc}</p>
                    <pre className="code">Host: {v1Url}&#10;Key: anything</pre>
                  </div>

                  <div className="preset-card">
                    <h4>
                      <span>{t.cursorTitle}</span>
                      <button className="btn sm" onClick={() => copyText(v1Url, () => showToast(t.copiedUrl), t.copied)}>
                        {t.copy} URL
                      </button>
                    </h4>
                    <p>{t.cursorDesc}</p>
                    <pre className="code">Base URL: {v1Url}</pre>
                  </div>

                  <div className="preset-card">
                    <h4>
                      <span>{t.continueTitle}</span>
                      <button className="btn sm" onClick={() => copyText(continueConfigSnippet, () => showToast(t.copied), t.copied)}>
                        {t.copyConfig}
                      </button>
                    </h4>
                    <p>{t.continueDesc}</p>
                    <pre className="code">{continueConfigSnippet}</pre>
                  </div>
                </div>
              </div>
            </section>
          )}

          {tab === "playground" && (
            <section className="card stack">
              <div className="playground-toolbar">
                <div className="row">
                  <button className={`btn sm ${playSubTab === "chat" ? "primary" : ""}`} onClick={() => setPlaySubTab("chat")}>
                    {t.chatTab}
                  </button>
                  <button className={`btn sm ${playSubTab === "image" ? "primary" : ""}`} onClick={() => setPlaySubTab("image")}>
                    {t.imageTab}
                  </button>
                </div>
                {playSubTab === "chat" && (
                  <div className="row">
                    <select className="input sm" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ margin: 0, minHeight: 32, padding: "4px 8px" }}>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id} {m.free ? "" : "(PRO)"}
                        </option>
                      ))}
                    </select>
                    <button className="btn sm" onClick={() => setChatMessages([])}>
                      {t.clearChat}
                    </button>
                  </div>
                )}
              </div>

              {playSubTab === "chat" ? (
                <div className="chat-container">
                  <div className="chat-messages">
                    {chatMessages.map((m, idx) => (
                      <div key={idx} className={`chat-bubble ${m.role} ${m.role === "assistant" && !m.content && chatLoading ? "loading" : ""}`}>
                        {m.content || (chatLoading ? t.thinking : "")}
                      </div>
                    ))}
                  </div>
                  <div className="chat-input-bar">
                    <input
                      className="input"
                      placeholder={t.promptPlaceholder}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") sendChatMessage();
                      }}
                      disabled={chatLoading}
                    />
                    <button className="btn primary" onClick={sendChatMessage} disabled={chatLoading || !chatInput.trim()}>
                      {chatLoading ? t.thinking : t.send}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="stack">
                  <label className="label">{t.imagePromptPlaceholder}</label>
                  <div className="row">
                    <input
                      className="input"
                      placeholder="e.g. A serene mountain lake at sunrise, watercolor style"
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") generateImage();
                      }}
                      disabled={imgLoading}
                      style={{ flex: 1, margin: 0 }}
                    />
                    <button className="btn primary" onClick={generateImage} disabled={imgLoading || !imagePrompt.trim()}>
                      {imgLoading ? t.generating : t.generate}
                    </button>
                  </div>
                  {generatedImg && (
                    <div className="image-result">
                      <img src={generatedImg} alt="AI Generated" />
                      <a href={generatedImg} target="_blank" rel="noreferrer" className="btn sm">
                        دانلود / مشاهده کامل
                      </a>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {tab === "models" && (
            <section className="card stack">
              <div className="row between">
                <h2>{t.models}</h2>
                <div className="row">
                  <button className="btn sm" onClick={runLatencyBenchmark} disabled={testingLatencies}>
                    {testingLatencies ? t.testing : t.testLatency}
                  </button>
                  <span className="legend">
                    <span className="dot on" /> {t.free}
                  </span>
                  <span className="legend">
                    <span className="dot off" /> {t.paid}
                  </span>
                  <button className="btn sm" onClick={loadAll}>
                    {t.refresh}
                  </button>
                </div>
              </div>
              {models.length === 0 ? (
                <p className="muted">{t.noModels}</p>
              ) : (
                <ul className="modelgrid">
                  {models.map((m) => {
                    const lat = modelLatencies[m.id];
                    return (
                      <li key={m.id} className={`modelrow ${m.free ? "" : "paid"}`}>
                        <div className="model-top">
                          <span className={`dot ${m.free ? "on" : "off"}`} aria-hidden="true" />
                          <code className="mono" dir="ltr">
                            {m.id}
                          </code>
                          <span className="spacer" />
                          {lat !== undefined && (
                            <span className={`latency-badge ${lat < 0 ? "slow" : lat > 2000 ? "slow" : ""}`}>
                              {lat < 0 ? "Error" : `${lat} ${t.ms}`}
                            </span>
                          )}
                          {m.free ? (
                            <button className="btn sm" onClick={() => copyText(m.id, showToast, t.copied)}>
                              {t.copy}
                            </button>
                          ) : (
                            <span className="badge">{t.paid}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {tab === "settings" && (
            <section className="settings">
              <div className="card stack">
                <h2>{t.server}</h2>
                <div className="fieldgrid">
                  <label className="field">
                    <span>{t.host}</span>
                    <input className="input" value={settings.host} onChange={(e) => save({ ...settings, host: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>{t.port}</span>
                    <input className="input" type="number" value={settings.port} onChange={(e) => save({ ...settings, port: Number(e.target.value) })} />
                  </label>
                </div>
                <label className="check">
                  <input type="checkbox" checked={settings.autoStartServer} onChange={(e) => save({ ...settings, autoStartServer: e.target.checked })} /> {t.autoStart}
                </label>
                <label className="check">
                  <input type="checkbox" checked={settings.autostart} onChange={(e) => save({ ...settings, autostart: e.target.checked })} /> {t.autostart}
                </label>
                <label className="check">
                  <input type="checkbox" checked={settings.minimizeToTray} onChange={(e) => save({ ...settings, minimizeToTray: e.target.checked })} /> {t.minimize}
                </label>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn sm" disabled={busy} onClick={doRestart}>
                    {t.restart}
                  </button>
                </div>
              </div>

              <div className="card stack">
                <h2>{t.proxy}</h2>
                <label className="field">
                  <span>{t.mode}</span>
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
                      <button className="btn primary" onClick={addProxy}>
                        {t.add}
                      </button>
                    </div>
                    <ul className="keylist">
                      {settings.proxyList.map((p) => (
                        <li key={p.id} className="keyrow">
                          <code className="mono" dir="ltr">
                            {p.url}
                          </code>
                          <label className="check inline">
                            <input
                              type="checkbox"
                              checked={p.enabled}
                              onChange={(e) =>
                                save({
                                  ...settings,
                                  proxyList: settings.proxyList.map((x) => (x.id === p.id ? { ...x, enabled: e.target.checked } : x)),
                                })
                              }
                            />{" "}
                            {t.enable}
                          </label>
                          <span className="spacer" />
                          <button className="btn sm" onClick={() => invoke("test_proxy", { url: p.url }).then((r: any) => showToast(String(r))).catch((e: any) => showToast(String(e)))}>
                            {t.test}
                          </button>
                          <button className="btn sm danger" onClick={() => save({ ...settings, proxyList: settings.proxyList.filter((x) => x.id !== p.id) })}>
                            {t.delete}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="card stack">
                <h2>{t.appearance}</h2>
                <div className="fieldgrid">
                  <label className="field">
                    <span>{t.theme}</span>
                    <select className="input" value={settings.theme} onChange={(e) => save({ ...settings, theme: e.target.value })}>
                      <option value="system">{t.systemTheme}</option>
                      <option value="light">{t.light}</option>
                      <option value="dark">{t.dark}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>{t.language}</span>
                    <select className="input" value={settings.language} onChange={(e) => save({ ...settings, language: e.target.value })}>
                      <option value="en">English</option>
                      <option value="fa">فارسی</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="card stack">
                <div className="row between">
                  <h2>{t.logs}</h2>
                  <button className="btn sm" onClick={() => invoke("clear_logs").then(loadAll)}>
                    {t.clear}
                  </button>
                </div>
                <pre className="code logs">{logs.join("\n") || "—"}</pre>
              </div>
            </section>
          )}

          {tab === "about" && (
            <section className="card stack about">
              <div className="about-head">
                <div className="about-name">
                  <h2>DuckBridge</h2>
                  <p className="muted">{lang === "fa" ? "درگاه محلی API برای Duck.ai" : "Local API gateway for Duck.ai"}</p>
                </div>
              </div>
              <div className="about-grid">
                <div className="about-item">
                  <span>{lang === "fa" ? "برنامه‌ریزی و توسعه" : "Programmed by"}</span>
                  <strong dir="auto" className="about-name-ltr">
                    {lang === "fa" ? "محمد صادق نوروزیان" : "Mohammad Sadegh Norouzian"}
                  </strong>
                </div>
                <div className="about-item">
                  <span>Telegram</span>
                  <a href="https://t.me/MSNoroozian" target="_blank" rel="noreferrer" dir="ltr" className="about-link">
                    MSNoroozian
                  </a>
                </div>
                <div className="about-item">
                  <span>Stack</span>
                  <code dir="ltr">Tauri · React · FastAPI · Node.js</code>
                </div>
                <div className="about-item">
                  <span>{lang === "fa" ? "نسخه" : "Version"}</span>
                  <code dir="ltr">{__APP_VERSION__}</code>
                </div>
              </div>
              <p className="muted bidi">
                {lang === "fa"
                  ? "اپ به‌عنوان «سایدکار و دروازه محلی API» ساخته شده است. سرور محلی روی 127.0.0.1:8765 اجرا می‌شود و یک API استاندارد و سازگار با OpenAI برای چت، لیست مدل‌ها و تولید تصویر فراهم می‌کند تا ابزارهایی مانند Chatbox، Cursor و Continue بتوانند رایگان از آن استفاده کنند."
                  : "Built as an API-making sidecar. The local server runs on 127.0.0.1:8765 and serves an OpenAI-compatible API for other clients to use."}
              </p>
            </section>
          )}
        </div>
      </div>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      {ctx && (
        <div className="ctxmenu" style={{ left: ctx.x, top: ctx.y }} role="menu">
          <button
            className="ctxitem"
            onClick={() => {
              copyText(ctx.text, showToast, t.copied);
              setCtx(null);
            }}
            role="menuitem"
          >
            {t.copy}
          </button>
        </div>
      )}
    </div>
  );
}
