#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[cfg(windows)]
fn assign_to_job(_child: &Child) {
    // Job Object via winapi was complex to wire correctly; current stop_server kill on Quit
    // already cleans the sidecar on normal exit. Full Job Object integration is deferred.
}

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
            auto_update: true,
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

/// Writable directory for everything the sidecar creates at runtime: the key
/// database, the .env file, the challenge script and node_modules.
///
/// The install directory cannot be used for this: an MSI install lands in
/// "Program Files", which a normal user may not write to - the sidecar would
/// die on startup and the API would never come up.
fn data_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| {
            dirs::data_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("duckbridge")
        });
    let _ = fs::create_dir_all(&dir);
    dir
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
        let _ = fs::write(&p, txt);
        // best-effort: restrict to owner-only on Unix (600)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&p, fs::Permissions::from_mode(0o600));
        }
    }
}

fn find_server_dir() -> PathBuf {
    let candidates = server_dir_candidates();
    resolve_server_dir(&candidates)
}

/// Ordered list of places the FastAPI sidecar may live.
///
/// Order matters: the location that belongs to *this* executable wins, so an
/// installed app never picks up a stray `server/` folder in the current
/// working directory, and the compile-time dev path is only a last resort.
fn server_dir_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = vec![];
    // Explicit override (tests / unusual layouts).
    if let Ok(dir) = std::env::var("DUCKBRIDGE_SERVER_DIR") {
        candidates.push(PathBuf::from(dir));
    }
    // Next to the executable. The Tauri v2 NSIS/MSI installer keeps the exe
    // at the install root and the bundled resources in `_up_/`, so that path
    // must be checked - the old code only looked for `server/`, which never
    // exists in an installed layout.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("_up_").join("server"));
            candidates.push(dir.join("server"));
            candidates.push(dir.join("resources").join("server"));
            candidates.push(dir.join("_up_").join("resources").join("server"));
            candidates.push(dir.join("..").join("server"));
        }
    }
    // Current working directory (dev: project root).
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("server"));
        candidates.push(cwd.join("duckbridge-desktop").join("server"));
        candidates.push(cwd.join("duckduckgo-ai-openai-api"));
    }
    // Compile-time location (dev only) - absolute path baked into the binary,
    // so it must never outrank the installed copy.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest.join("../server"));
    candidates.push(manifest.join("server"));
    candidates
}

fn is_server_dir(c: &PathBuf) -> bool {
    c.join("main.py").exists() && c.join("duckai_backend.py").exists()
}

fn resolve_server_dir(candidates: &[PathBuf]) -> PathBuf {
    for c in candidates {
        if is_server_dir(c) {
            return c.clone();
        }
    }
    // Fallback: report the first candidate so the error names a real path.
    candidates.first().cloned().unwrap_or_else(|| PathBuf::from("server"))
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

/// First free TCP port at or after `preferred` (scans preferred..preferred+20).
fn pick_free_port(host: &str, preferred: u16) -> Option<u16> {
    use std::net::TcpListener;
    let end = preferred.saturating_add(20).min(65535);
    for port in preferred..=end {
        let addr = format!("{}:{}", host, port);
        if TcpListener::bind(&addr).is_ok() {
            return Some(port);
        }
    }
    None
}

/// Every module `server/main.py` imports at module scope.
const PYTHON_DEPS_CHECK: &str = "import uvicorn, fastapi, requests, dotenv, psycopg2, pydantic";

fn python_deps_ok(python: &str) -> bool {
    Command::new(python)
        .args(["-c", PYTHON_DEPS_CHECK])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Install the sidecar's Python requirements when they are missing.
///
/// Without this the sidecar exits on the first line of `main.py` and the app
/// shows a green "Running" dot while every request fails.
fn ensure_python_deps(python: &str, server_dir: &Path) -> Result<(), String> {
    if python_deps_ok(python) {
        return Ok(());
    }
    let req = server_dir.join("requirements.txt");
    push_log(format!(
        "[{}] Python packages missing for '{}' - running pip install ...",
        chrono::Local::now().format("%H:%M:%S"),
        python
    ));
    // Try plain install, then --user (PEP 668 "externally managed" envs).
    let attempts: Vec<Vec<&str>> = if req.exists() {
        vec![
            vec!["-m", "pip", "install", "-r", req.to_str().unwrap_or("requirements.txt")],
            vec!["-m", "pip", "install", "--user", "-r", req.to_str().unwrap_or("requirements.txt")],
        ]
    } else {
        vec![
            vec!["-m", "pip", "install", "fastapi", "uvicorn", "requests", "python-dotenv", "psycopg2-binary"],
            vec!["-m", "pip", "install", "--user", "fastapi", "uvicorn", "requests", "python-dotenv", "psycopg2-binary"],
        ]
    };
    let mut last_err = String::new();
    for args in attempts {
        let out = Command::new(python)
            .args(&args)
            .current_dir(server_dir)
            .output()
            .map_err(|e| format!("pip could not be started: {}", e))?;
        if out.status.success() {
            push_log(format!(
                "[{}] Python packages installed.",
                chrono::Local::now().format("%H:%M:%S")
            ));
            if python_deps_ok(python) {
                return Ok(());
            }
            last_err = "packages still not importable after install".to_string();
        } else {
            last_err = String::from_utf8_lossy(&out.stderr)
                .lines()
                .filter(|l| !l.trim().is_empty())
                .last()
                .unwrap_or("pip install failed")
                .to_string();
        }
    }
    let manual = format!(
        "{} -m pip install -r \"{}\"",
        python,
        req.display()
    );
    let msg = format!(
        "Python packages are missing and could not be installed automatically ({}). Run this manually: {}",
        last_err, manual
    );
    push_log(format!("[{}] {}", chrono::Local::now().format("%H:%M:%S"), msg));
    Err(msg)
}

static LOGS: OnceLock<Arc<Mutex<Vec<String>>>> = OnceLock::new();
fn logs_handle() -> Arc<Mutex<Vec<String>>> {
    LOGS.get_or_init(|| Arc::new(Mutex::new(Vec::new()))).clone()
}

fn push_log(s: String) {
    let logs = logs_handle();
    {
        let mut l = logs.lock().unwrap();
        l.push(s.clone());
        if l.len() > 500 {
            let excess = l.len() - 500;
            l.drain(0..excess);
        }
    }
    // Optional on-disk log (DUCKBRIDGE_LOG_FILE) so support can inspect what
    // the app did without a UI session - e.g. "the server never came up".
    if let Ok(path) = std::env::var("DUCKBRIDGE_LOG_FILE") {
        use std::io::Write;
        if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "{}", s);
        }
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

fn write_server_dotenv(dir: &std::path::Path, s: &AppSettings) {
    let ignore = if s.require_api_keys { "False" } else { "True" };
    let content = format!("IGNPRE_API_KEYS={}\nADMIN_TOKEN={}\nDATABASE_URL=\nPORT={}\nHOST={}\n", ignore, s.admin_token, s.port, s.host);
    let _ = fs::write(dir.join(".env"), content);
}

#[tauri::command]
fn save_settings_cmd(app: AppHandle, settings: AppSettings) {
    if settings.autostart {
        let _ = app.autolaunch().enable();
    } else {
        let _ = app.autolaunch().disable();
    }
    save_settings(&app, &settings);
    // keep the sidecar's .env in sync so plain uvicorn also respects the toggle
    let dir = data_dir(&app);
    write_server_dotenv(&dir, &settings);
}

#[tauri::command]
fn server_status(state: tauri::State<'_, Arc<Mutex<ServerState>>>) -> bool {
    let mut st = state.lock().unwrap();
    // `child.is_some()` is not enough: if the sidecar died (missing Python
    // deps, bad port, ...) the handle is still there and the UI would show a
    // green "Running" dot while every API call fails. Ask the OS instead.
    let dead = match st.child.as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(Some(_))),
        None => false,
    };
    if dead {
        if let Some(mut child) = st.child.take() {
            let code = child.wait().ok().and_then(|s| s.code());
            push_log(format!(
                "[{}] Server process exited unexpectedly (code {:?}). Check the log above.",
                chrono::Local::now().format("%H:%M:%S"),
                code
            ));
        }
        return false;
    }
    st.child.is_some()
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
fn server_dir_info(app: AppHandle) -> String {
    let d = find_server_dir();
    let data = data_dir(&app);
    format!(
        "server={:?} exists={} | data={:?} exists={}",
        d,
        d.join("main.py").exists(),
        data,
        data.exists()
    )
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
    let mut st = state.lock().unwrap();
    if st.child.is_some() {
        return Ok(());
    }
    let server_dir = find_server_dir();
    if !is_server_dir(&server_dir) {
        let msg = format!(
            "Server folder not found. Looked in {:?}. The sidecar files (main.py, duckai_backend.py) are missing - reinstall the app.",
            server_dir
        );
        push_log(format!("[{}] {}", chrono::Local::now().format("%H:%M:%S"), msg));
        return Err(msg);
    }

    // --- preflight -------------------------------------------------------
    // The sidecar dies instantly (and silently) when its Python packages are
    // missing, which on a fresh machine is the difference between "works"
    // and "the API never comes up".
    let python = find_python();
    ensure_python_deps(&python, &server_dir)?;
    if Command::new("node").arg("--version").output().is_err() {
        push_log(format!(
            "[{}] Node.js was not found on PATH - the duck.ai challenge solver needs Node.js 18+, so chat requests will fail until it is installed.",
            chrono::Local::now().format("%H:%M:%S")
        ));
    }
    // jsdom powers the duck.ai challenge solver. It is installed into the
    // writable data directory (the install directory may be read-only) and
    // exposed to node through NODE_PATH.
    let data_dir = data_dir(&app);
    let jsdom_home = data_dir.join("node_modules");
    let jsdom_present = server_dir.join("node_modules").join("jsdom").exists()
        || jsdom_home.join("jsdom").exists();
    if !jsdom_present {
        push_log(format!("[{}] jsdom missing, running npm install ...", chrono::Local::now().format("%H:%M:%S")));
        let pkg = data_dir.join("package.json");
        if !pkg.exists() {
            let _ = fs::write(
                &pkg,
                "{\n  \"name\": \"duckbridge-runtime\",\n  \"private\": true,\n  \"version\": \"0.0.0\",\n  \"dependencies\": { \"jsdom\": \"^30.1.3\" }\n}\n",
            );
        }
        // On Windows `npm` is a .cmd shim, which CreateProcess cannot execute
        // directly - it has to go through cmd.exe. The working directory is
        // set instead of --prefix so no path quoting is needed.
        let mut npm = if cfg!(target_os = "windows") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg("npm");
            c
        } else {
            Command::new("npm")
        };
        // Capture the output instead of inheriting it: a GUI-subsystem app has
        // no console, and an inherited invalid handle makes npm fail instantly
        // and silently - which left the sidecar without jsdom.
        let out = npm
            .arg("install")
            .current_dir(&data_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();
        match out {
            Ok(o) => {
                if !o.status.success() {
                    let msg = String::from_utf8_lossy(&o.stderr)
                        .lines()
                        .filter(|l| !l.trim().is_empty())
                        .last()
                        .unwrap_or("unknown error")
                        .to_string();
                    push_log(format!(
                        "[{}] npm install failed: {}",
                        chrono::Local::now().format("%H:%M:%S"),
                        msg
                    ));
                }
            }
            Err(e) => push_log(format!(
                "[{}] npm could not be started: {} (is Node.js installed?)",
                chrono::Local::now().format("%H:%M:%S"),
                e
            )),
        }
        if !jsdom_home.join("jsdom").exists() {
            push_log(format!(
                "[{}] jsdom is still missing - the duck.ai challenge solver will fail. Install it manually with: npm --prefix \"{}\" install",
                chrono::Local::now().format("%H:%M:%S"),
                data_dir.display()
            ));
        }
    }

    // --- port selection --------------------------------------------------
    // Another instance (or another app on the same port) may already hold the
    // configured port. Move to the next free one instead of refusing to start.
    let mut settings = load_settings(&app);
    match pick_free_port(&settings.host, settings.port) {
        Some(port) => {
            if port != settings.port {
                push_log(format!(
                    "[{}] Port {} on {} is already in use - switching to {}.",
                    chrono::Local::now().format("%H:%M:%S"),
                    settings.port,
                    settings.host,
                    port
                ));
                settings.port = port;
                save_settings(&app, &settings);
            }
        }
        None => {
            let msg = format!(
                "No free port found on {} (tried {}..{}). Change the port in Settings.",
                settings.host,
                settings.port,
                settings.port.saturating_add(20)
            );
            push_log(format!("[{}] {}", chrono::Local::now().format("%H:%M:%S"), msg));
            return Err(msg);
        }
    }

    let ignore = if settings.require_api_keys { "False" } else { "True" };
    write_server_dotenv(&data_dir, &settings);
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
        // Runtime state lives in the writable data dir, not in the install dir.
        .env("DATA_DIR", &data_dir)
        .env("NODE_PATH", &jsdom_home)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
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
    #[cfg(windows)]
    assign_to_job(&child);
    let pid = child.id();
    if let Some(out) = child.stdout.take() {
        spawn_pipe_reader(out, "stdout");
    }
    if let Some(err) = child.stderr.take() {
        spawn_pipe_reader(err, "stderr");
    }
    push_log(format!("[{}] Server starting pid {} via {} in {:?}", chrono::Local::now().format("%H:%M:%S"), pid, python, server_dir));
    push_log(format!(
        "[{}] Server dir candidates: {:?}",
        chrono::Local::now().format("%H:%M:%S"),
        server_dir_candidates()
    ));
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a directory that looks like a bundled sidecar.
    fn fake_server(root: &Path) -> PathBuf {
        let dir = root.join("server");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("main.py"), "# fake").unwrap();
        fs::write(dir.join("duckai_backend.py"), "# fake").unwrap();
        dir
    }

    #[test]
    fn resolves_the_bundled_up_server_directory() {
        // Layout produced by the NSIS/MSI installer: exe at the install root,
        // sidecar resources under `_up_/server` (note the trailing underscore).
        let tmp = std::env::temp_dir().join("db_test_up_server");
        let _ = fs::remove_dir_all(&tmp);
        let install_root = tmp.join("DuckBridge");
        fs::create_dir_all(&install_root).unwrap();
        let bundled = fake_server(&install_root.join("_up_"));

        let candidates = vec![
            install_root.join("_up_").join("server"),
            install_root.join("server"),
        ];
        assert_eq!(resolve_server_dir(&candidates), bundled);
    }

    #[test]
    fn exe_relative_candidates_beat_the_working_directory() {
        // The compile-time dev path must never outrank the installed copy.
        let tmp = std::env::temp_dir().join("db_test_priority");
        let _ = fs::remove_dir_all(&tmp);
        let cwd_server = fake_server(&tmp);
        let install_root = tmp.join("DuckBridge");
        fs::create_dir_all(&install_root).unwrap();
        let bundled = fake_server(&install_root.join("_up_"));

        let candidates = vec![
            install_root.join("_up_").join("server"), // exe-relative, first
            cwd_server.clone(),                        // cwd-relative, second
        ];
        assert_eq!(resolve_server_dir(&candidates), bundled);
    }

    #[test]
    fn skips_directories_without_the_sidecar_files() {
        let tmp = std::env::temp_dir().join("db_test_incomplete");
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();
        let incomplete = tmp.join("server");
        fs::create_dir_all(&incomplete).unwrap();
        fs::write(incomplete.join("main.py"), "# fake").unwrap(); // no backend

        let good = fake_server(&tmp.join("good"));
        let candidates = vec![incomplete, good.clone()];
        assert_eq!(resolve_server_dir(&candidates), good);
    }

    #[test]
    fn picks_the_preferred_port_when_it_is_free() {
        assert_eq!(pick_free_port("127.0.0.1", 45999), Some(45999));
    }

    #[test]
    fn picks_the_next_free_port_when_the_preferred_one_is_taken() {
        use std::net::TcpListener;
        let _busy = TcpListener::bind("127.0.0.1:45998").unwrap();
        let picked = pick_free_port("127.0.0.1", 45998).unwrap();
        assert!(picked >= 45999, "expected a port above the busy one, got {}", picked);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.unminimize(); let _ = w.set_focus(); }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
