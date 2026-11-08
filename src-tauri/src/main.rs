#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    host: String,
    port: u16,
    require_api_keys: bool,
    auto_start_server: bool,
    autostart: bool,
    minimize_to_tray: bool,
    auto_update: bool,
    theme: String,
    language: String,
    proxy_mode: String,
    proxy_list: Vec<ProxyEntry>,
    admin_token: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct ProxyEntry {
    id: String,
    url: String,
    enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            host: "127.0.0.1".into(),
            port: 8765,
            require_api_keys: false,
            auto_start_server: true,
            autostart: false,
            minimize_to_tray: true,
            auto_update: false,
            theme: "system".into(),
            language: "en".into(),
            proxy_mode: "direct".into(),
            proxy_list: vec![],
            admin_token: "your-super-secret-admin-token".into(),
        }
    }
}

struct ServerState {
    child: Option<Child>,
    logs: Vec<String>,
}

fn settings_path(app: &AppHandle) -> PathBuf {
    if let Some(dir) = app.path().app_config_dir().ok() {
        let _ = fs::create_dir_all(&dir);
        dir.join("settings.json")
    } else {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("duckbridge")
            .join("settings.json")
    }
}

fn load_settings(app: &AppHandle) -> AppSettings {
    let p = settings_path(app);
    if let Ok(txt) = fs::read_to_string(&p) {
        if let Ok(s) = serde_json::from_str(&txt) {
            return s;
        }
    }
    AppSettings::default()
}

fn save_settings(app: &AppHandle, s: &AppSettings) {
    let p = settings_path(app);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(txt) = serde_json::to_string_pretty(s) {
        let _ = fs::write(p, txt);
    }
}

fn find_server_dir() -> PathBuf {
    let mut candidates: Vec<PathBuf> = vec![];
    // compile-time location (dev): <project>/src-tauri -> ../server
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest.join("../server"));
    candidates.push(manifest.join("server"));
    // cwd (dev: project root, tauri dev)
    candidates.push(PathBuf::from("server"));
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("server"));
        candidates.push(cwd.join("duckbridge-desktop").join("server"));
        candidates.push(cwd.join("duckduckgo-ai-openai-api"));
    }
    // exe location (bundled)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("server"));
            candidates.push(dir.join("../server"));
            // resources dir (tauri bundle)
            candidates.push(dir.join("resources").join("server"));
        }
    }
    for c in &candidates {
        if c.join("main.py").exists() && c.join("duckai_backend.py").exists() {
            return c.clone();
        }
    }
    // fallback: manifest one (will error clearly later with path)
    manifest.join("../server")
}

fn find_python() -> String {
    // try candidates
    let candidates: Vec<&str> = if cfg!(target_os = "windows") {
        vec!["python", "py"]
    } else {
        vec!["python3", "python"]
    };
    for cand in candidates {
        if Command::new(cand).arg("--version").output().is_ok() {
            return cand.to_string();
        }
    }
    if cfg!(target_os = "windows") { "python".to_string() } else { "python3".to_string() }
}

static LOGS: OnceLock<Arc<Mutex<Vec<String>>>> = OnceLock::new();
fn logs_handle() -> Arc<Mutex<Vec<String>>> {
    LOGS.get_or_init(|| Arc::new(Mutex::new(Vec::new()))).clone()
}

fn push_log(s: String) {
    let logs = logs_handle();
    let mut l = logs.lock().unwrap();
    l.push(s);
    if l.len() > 500 {
        let excess = l.len() - 500;
        l.drain(0..excess);
    }
}

fn spawn_pipe_reader<R: std::io::Read + Send + 'static>(r: R, prefix: &'static str) {
    let logs = logs_handle();
    std::thread::spawn(move || {
        let reader = BufReader::new(r);
        for line in reader.lines().map_while(Result::ok) {
            let mut l = logs.lock().unwrap();
            l.push(format!("[{}] {}", prefix, line));
            let len = l.len();
            if len > 500 { l.drain(0..(len - 500)); }
        }
    });
}

#[tauri::command]
fn get_settings(app: AppHandle) -> AppSettings {
    load_settings(&app)
}

fn write_server_dotenv(server_dir: &std::path::Path, s: &AppSettings) {
    let env_path = server_dir.join(".env");
    let ignore = if s.require_api_keys { "False" } else { "True" };
    let content = format!("IGNPRE_API_KEYS={}\nADMIN_TOKEN={}\nDATABASE_URL=\nPORT={}\nHOST={}\n", ignore, s.admin_token, s.port, s.host);
    let _ = fs::write(&env_path, content);
}

#[tauri::command]
fn save_settings_cmd(app: AppHandle, settings: AppSettings) {
    if settings.autostart {
        let _ = app.autolaunch().enable();
    } else {
        let _ = app.autolaunch().disable();
    }
    save_settings(&app, &settings);
    // keep server/.env in sync so plain uvicorn also respects the toggle
    let dir = find_server_dir();
    if dir.exists() { write_server_dotenv(&dir, &settings); }
}

#[tauri::command]
fn server_status(state: tauri::State<'_, Arc<Mutex<ServerState>>>) -> bool {
    state.lock().unwrap().child.is_some()
}

#[tauri::command]
fn get_logs() -> Vec<String> {
    logs_handle().lock().unwrap().clone()
}

#[tauri::command]
fn clear_logs() {
    logs_handle().lock().unwrap().clear();
}

#[tauri::command]
fn server_dir_info() -> String {
    let d = find_server_dir();
    format!("{:?} exists={}", d, d.join("main.py").exists())
}

#[tauri::command]
async fn test_proxy(app: AppHandle, url: String) -> Result<String, String> {
    let s = load_settings(&app);
    let target = format!("http://{}:{}/health", s.host, s.port);
    let client = if url.is_empty() {
        reqwest::Client::new()
    } else {
        let proxy = reqwest::Proxy::all(&url).map_err(|e| e.to_string())?;
        reqwest::Client::builder().proxy(proxy).build().map_err(|e| e.to_string())?
    };
    match client.get(&target).timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(r) => Ok(format!("OK {} {}", r.status(), target)),
        Err(e) => Err(format!("FAIL {} -> {}", target, e)),
    }
}

#[tauri::command]
fn start_server(
    app: AppHandle,
    state: tauri::State<'_, Arc<Mutex<ServerState>>>,
) -> Result<(), String> {
    let settings = load_settings(&app);
    let mut st = state.lock().unwrap();
    if st.child.is_some() {
        return Ok(());
    }
    let server_dir = find_server_dir();
    if !server_dir.join("main.py").exists() {
        let msg = format!("Server folder not found. Tried {:?}. Is server/ bundled? (dev: run from duckbridge-desktop, prod: check resources)", server_dir);
        push_log(format!("[{}] {}", chrono::Local::now().format("%H:%M:%S"), msg));
        return Err(msg);
    }
    let python = find_python();
    let ignore = if settings.require_api_keys { "False" } else { "True" };
    write_server_dotenv(&server_dir, &settings);
    let mut cmd = Command::new(&python);
    cmd.arg("-m").arg("uvicorn").arg("main:app")
        .arg("--host").arg(&settings.host)
        .arg("--port").arg(settings.port.to_string())
        .current_dir(&server_dir)
        .env("HOST", &settings.host)
        .env("PORT", settings.port.to_string())
        .env("ADMIN_TOKEN", &settings.admin_token)
        .env("IGNPRE_API_KEYS", ignore)
        .env("DATABASE_URL", "")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // proxy env for upstream (duck.ai)
    if settings.proxy_mode == "system" {
        // leave to OS env
    } else if settings.proxy_mode == "manual" {
        if let Some(p) = settings.proxy_list.iter().find(|p| p.enabled) {
            cmd.env("HTTP_PROXY", &p.url).env("HTTPS_PROXY", &p.url).env("http_proxy", &p.url).env("https_proxy", &p.url);
        }
    }
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn '{}' in {:?}: {}", python, server_dir, e))?;
    let pid = child.id();
    if let Some(out) = child.stdout.take() {
        spawn_pipe_reader(out, "stdout");
    }
    if let Some(err) = child.stderr.take() {
        spawn_pipe_reader(err, "stderr");
    }
    push_log(format!("[{}] Server starting pid {} via {} in {:?}", chrono::Local::now().format("%H:%M:%S"), pid, python, server_dir));
    st.child = Some(child);
    Ok(())
}

#[tauri::command]
fn stop_server(state: tauri::State<'_, Arc<Mutex<ServerState>>>) -> Result<(), String> {
    let mut st = state.lock().unwrap();
    if let Some(mut child) = st.child.take() {
        let pid = child.id();
        let _ = child.kill();
        let _ = child.wait();
        push_log(format!("[{}] Server stopped pid {}", chrono::Local::now().format("%H:%M:%S"), pid));
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .manage(Arc::new(Mutex::new(ServerState { child: None, logs: vec![] })))
        .invoke_handler(tauri::generate_handler![
            get_settings, save_settings_cmd, server_status, get_logs, clear_logs, test_proxy, start_server, stop_server, server_dir_info
        ])
        .setup(|app| {
            let open_item = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let start_item = MenuItem::with_id(app, "start", "Start server", true, None::<&str>)?;
            let stop_item = MenuItem::with_id(app, "stop", "Stop server", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &start_item, &stop_item, &quit_item])?;

            let tray_icon = tauri::include_image!("icons/icon.png");
            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("DuckBridge")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); } }
                    "start" => { let st = app.state::<Arc<Mutex<ServerState>>>(); let _ = start_server(app.clone(), st); }
                    "stop" => { let st = app.state::<Arc<Mutex<ServerState>>>(); let _ = stop_server(st); }
                    "quit" => { let st = app.state::<Arc<Mutex<ServerState>>>(); let _ = stop_server(st); app.exit(0); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let settings = load_settings(app);
                if settings.minimize_to_tray {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DuckBridge");
}
