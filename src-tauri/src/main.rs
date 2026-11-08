#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
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
    auto_start_server: bool,
    autostart: bool,
    minimize_to_tray: bool,
    auto_update: bool,
    theme: String, // light | dark | system
    language: String, // en | fa
    proxy_mode: String, // direct | system | manual
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

#[tauri::command]
fn get_settings(app: AppHandle) -> AppSettings {
    load_settings(&app)
}

#[tauri::command]
fn save_settings_cmd(app: AppHandle, settings: AppSettings) {
    // autostart toggle
    if settings.autostart {
        let _ = app.autolaunch().enable();
    } else {
        let _ = app.autolaunch().disable();
    }
    save_settings(&app, &settings);
}

#[tauri::command]
fn server_status(state: tauri::State<'_, Arc<Mutex<ServerState>>>) -> bool {
    state.lock().unwrap().child.is_some()
}

#[tauri::command]
fn get_logs(state: tauri::State<'_, Arc<Mutex<ServerState>>>) -> Vec<String> {
    state.lock().unwrap().logs.clone()
}

#[tauri::command]
fn clear_logs(state: tauri::State<'_, Arc<Mutex<ServerState>>>) {
    state.lock().unwrap().logs.clear();
}

#[tauri::command]
async fn test_proxy(url: String) -> Result<String, String> {
    let client = if url.is_empty() {
        reqwest::Client::new()
    } else {
        let proxy = reqwest::Proxy::all(&url).map_err(|e| e.to_string())?;
        reqwest::Client::builder().proxy(proxy).build().map_err(|e| e.to_string())?
    };
    match client.get("http://127.0.0.1:8765/health").timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(r) => Ok(format!("OK {}", r.status())),
        Err(e) => Err(format!("FAIL {}", e)),
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
    // Bundled server folder: try sidecar layout first, fallback to dev path
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let candidates: Vec<PathBuf> = vec![
        exe_dir.clone().map(|d| d.join("server")).unwrap_or_default(),
        PathBuf::from("server"),
        PathBuf::from("../duckduckgo-ai-openai-api"),
    ];
    let server_dir = candidates.iter().find(|p| p.join("main.py").exists()).cloned().unwrap_or_else(|| PathBuf::from("server"));
    let python = if cfg!(target_os = "windows") { "python" } else { "python3" };
    let child = Command::new(python)
        .arg("-m").arg("uvicorn").arg("main:app")
        .arg("--host").arg(&settings.host)
        .arg("--port").arg(settings.port.to_string())
        .current_dir(&server_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn server ({} in {:?}): {}", python, server_dir, e))?;
    st.logs.push(format!("[{}] Server started pid {:?}", chrono::Local::now().format("%H:%M:%S"), child.id()));
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
        st.logs.push(format!("[{}] Server stopped pid {}", chrono::Local::now().format("%H:%M:%S"), pid));
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
            get_settings, save_settings_cmd, server_status, get_logs, clear_logs, test_proxy, start_server, stop_server
        ])
        .setup(|app| {
            // Tray menu
            let open_item = MenuItem::with_id(app, "open", "Open DuckBridge", true, None::<&str>)?;
            let start_item = MenuItem::with_id(app, "start", "Start Server", true, None::<&str>)?;
            let stop_item = MenuItem::with_id(app, "stop", "Stop Server", true, None::<&str>)?;
            let copy_item = MenuItem::with_id(app, "copy_url", "Copy Base URL", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &start_item, &stop_item, &copy_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("DuckBridge - API Gateway")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); } }
                    "start" => { let st = app.state::<Arc<Mutex<ServerState>>>(); let _ = start_server(app.clone(), st); }
                    "stop" => { let st = app.state::<Arc<Mutex<ServerState>>>(); let _ = stop_server(st); }
                    "copy_url" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); } }
                    "quit" => { let st = app.state::<Arc<Mutex<ServerState>>>(); let _ = stop_server(st); app.exit(0); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(w) = tray.app_handle().get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
                    }
                })
                .build(app)?;

            // deferred server spawn to avoid borrow issues — frontend polls status
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // minimize to tray instead of closing, unless quit explicitly
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
