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
fn assign_to_job(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use std::sync::OnceLock;

    type HANDLE = *mut std::ffi::c_void;
    type BOOL = i32;
    type DWORD = u32;

    #[repr(C)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: DWORD,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: DWORD,
        affinity: usize,
        priority_class: DWORD,
        scheduling_class: DWORD,
    }

    #[repr(C)]
    struct IO_COUNTERS {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION,
        io_info: IO_COUNTERS,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_limit: usize,
        peak_job_memory_limit: usize,
    }

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: DWORD = 0x00002000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: DWORD = 9;

    extern "system" {
        fn CreateJobObjectW(lpJobAttributes: *mut std::ffi::c_void, lpName: *const u16) -> HANDLE;
        fn SetInformationJobObject(
            hJob: HANDLE,
            JobObjectInformationClass: DWORD,
            lpJobObjectInformation: *const std::ffi::c_void,
            cbJobObjectInformationLength: DWORD,
        ) -> BOOL;
        fn AssignProcessToJobObject(hJob: HANDLE, hProcess: HANDLE) -> BOOL;
        fn CloseHandle(hObject: HANDLE) -> BOOL;
    }

    static GLOBAL_JOB: OnceLock<usize> = OnceLock::new();

    let job_handle = GLOBAL_JOB.get_or_init(|| {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
            if job.is_null() {
                return 0;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                job,
                JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as DWORD,
            );
            if ok == 0 {
                CloseHandle(job);
                return 0;
            }
            job as usize
        }
    });

    if *job_handle != 0 {
        unsafe {
            let proc = child.as_raw_handle() as HANDLE;
            AssignProcessToJobObject(*job_handle as HANDLE, proc);
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    host: String,
    port: u16,
    #[serde(default)]
    require_api_keys: bool,
    auto_start_server: bool,
    autostart: bool,
    minimize_to_tray: bool,
    auto_update: bool,
    theme: String,
    language: String,
    proxy_mode: String,
    proxy_list: Vec<ProxyEntry>,
    #[serde(default = "default_token")]
    admin_token: String,
}

fn default_token() -> String {
    "local-token".into()
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

#[allow(dead_code)]
struct ServerState {
    child: Option<Child>,
    logs: Vec<String>,
    explicitly_stopped: bool,
    restart_count: u32,
    last_restart: Option<std::time::Instant>,
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
    let mut candidates: Vec<String> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // 1. Scan %LOCALAPPDATA%\Programs\Python\Python3*
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let py_dir = Path::new(&local_app_data).join("Programs").join("Python");
            if let Ok(entries) = fs::read_dir(py_dir) {
                let mut found_dirs: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
                found_dirs.sort();
                found_dirs.reverse(); // prefer newer versions
                for d in found_dirs {
                    let exe = d.join("python.exe");
                    if exe.exists() {
                        candidates.push(exe.to_string_lossy().to_string());
                    }
                }
            }
        }

        // 2. Scan standard Program Files Python installs
        for pf in &["PROGRAMFILES", "ProgramFiles(x86)"] {
            if let Ok(dir) = std::env::var(pf) {
                let py_base = Path::new(&dir).join("Python");
                if let Ok(entries) = fs::read_dir(py_base) {
                    for entry in entries.flatten() {
                        let exe = entry.path().join("python.exe");
                        if exe.exists() {
                            candidates.push(exe.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        candidates.push("py".into());
        candidates.push("python".into());
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidates.push("python3".into());
        candidates.push("python".into());
    }

    // Pass 1: Find a python where our required packages are ALREADY working
    for cand in &candidates {
        if !cand.to_lowercase().contains("inkscape") && python_deps_ok(cand) {
            return cand.clone();
        }
    }

    // Pass 2: Find a python with pip available to install requirements
    for cand in &candidates {
        if !cand.to_lowercase().contains("inkscape") && python_has_pip(cand) {
            return cand.clone();
        }
    }

    // Fallback: any working python interpreter
    for cand in &candidates {
        if !cand.to_lowercase().contains("inkscape") && Command::new(cand).arg("--version").output().is_ok() {
            return cand.clone();
        }
    }

    if cfg!(target_os = "windows") { "python".to_string() } else { "python3".to_string() }
}

fn find_node() -> Option<String> {
    let mut candidates: Vec<String> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // 1. Standard Program Files installs
        for pf in &["PROGRAMFILES", "ProgramFiles(x86)"] {
            if let Ok(dir) = std::env::var(pf) {
                let node_exe = Path::new(&dir).join("nodejs").join("node.exe");
                if node_exe.exists() {
                    candidates.push(node_exe.to_string_lossy().to_string());
                }
            }
        }

        // 2. LocalAppData / User directory installs (NVM, Volta, fnm, Hermes)
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let hermes = Path::new(&local_app_data).join("hermes").join("node").join("node.exe");
            if hermes.exists() {
                candidates.push(hermes.to_string_lossy().to_string());
            }
            let programs = Path::new(&local_app_data).join("Programs").join("node").join("node.exe");
            if programs.exists() {
                candidates.push(programs.to_string_lossy().to_string());
            }
        }

        if let Ok(app_data) = std::env::var("APPDATA") {
            let nvm = Path::new(&app_data).join("nvm");
            if let Ok(entries) = fs::read_dir(nvm) {
                for entry in entries.flatten() {
                    let exe = entry.path().join("node.exe");
                    if exe.exists() {
                        candidates.push(exe.to_string_lossy().to_string());
                    }
                }
            }
        }

        candidates.push("node.exe".into());
        candidates.push("node".into());
    }

    #[cfg(not(target_os = "windows"))]
    {
        for p in &["/usr/local/bin/node", "/usr/bin/node", "/opt/homebrew/bin/node"] {
            if Path::new(p).exists() {
                candidates.push((*p).into());
            }
        }
        candidates.push("node".into());
    }

    for cand in &candidates {
        if let Ok(out) = Command::new(cand).arg("--version").output() {
            if out.status.success() {
                let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if ver.starts_with('v') {
                    return Some(cand.clone());
                }
            }
        }
    }

    None
}

fn python_has_pip(python: &str) -> bool {
    Command::new(python)
        .args(["-m", "pip", "--version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
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
const PYTHON_DEPS_CHECK: &str = "import uvicorn, fastapi, requests, dotenv, pydantic";

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
fn server_status(app: AppHandle, state: tauri::State<'_, Arc<Mutex<ServerState>>>) -> bool {
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
            // Supervisor auto-recovery: if not explicitly stopped, attempt restart
            if !st.explicitly_stopped {
                let now = std::time::Instant::now();
                let can_restart = match st.last_restart {
                    Some(last) => now.duration_since(last).as_secs() > 10 || st.restart_count < 3,
                    None => true,
                };
                if can_restart {
                    st.last_restart = Some(now);
                    st.restart_count += 1;
                    push_log(format!(
                        "[{}] Supervisor: auto-restarting backend server (attempt {}/3)...",
                        chrono::Local::now().format("%H:%M:%S"),
                        st.restart_count
                    ));
                    drop(st);
                    let _ = start_server(app, state);
                    return true;
                }
            }
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
async fn test_proxy(_app: AppHandle, url: String) -> Result<String, String> {
    let target = "https://duck.ai/";
    let client = if url.trim().is_empty() {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?
    } else {
        let mut proxy_str = url.trim().to_string();
        if proxy_str.starts_with("socks5h://") {
            proxy_str = format!("socks5://{}", &proxy_str[10..]);
        }
        let proxy = reqwest::Proxy::all(&proxy_str).map_err(|e| format!("Invalid proxy: {}", e))?;
        reqwest::Client::builder()
            .proxy(proxy)
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|e| e.to_string())?
    };
    let t0 = std::time::Instant::now();
    match client.head(target).send().await {
        Ok(r) => {
            let elapsed = t0.elapsed().as_millis();
            Ok(format!("OK (HTTP {} in {}ms)", r.status().as_u16(), elapsed))
        }
        Err(_) => {
            // Fallback: try GET if HEAD was disallowed by cloudflare
            match client.get(target).send().await {
                Ok(r) => {
                    let elapsed = t0.elapsed().as_millis();
                    Ok(format!("OK (HTTP {} in {}ms)", r.status().as_u16(), elapsed))
                }
                Err(e) => Err(format!("Connection failed: {}", e)),
            }
        }
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
    let node_opt = find_node();
    let node_bin = match &node_opt {
        Some(p) => {
            push_log(format!("[{}] Node.js located at '{}'", chrono::Local::now().format("%H:%M:%S"), p));
            p.clone()
        }
        None => {
            push_log(format!(
                "[{}] Node.js was not found on PATH or standard locations - the duck.ai challenge solver needs Node.js 18+, so chat requests will fail until it is installed.",
                chrono::Local::now().format("%H:%M:%S")
            ));
            "node".to_string()
        }
    };
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
        // Use npm located next to node if available
        let mut npm = if let Some(ref nb) = node_opt {
            let direct_npm = Path::new(nb).parent().map(|p| p.join("npm.cmd")).filter(|p| p.exists());
            if let Some(p) = direct_npm {
                let mut c = Command::new("cmd");
                c.arg("/C").arg(p);
                c
            } else if cfg!(target_os = "windows") {
                let mut c = Command::new("cmd");
                c.arg("/C").arg("npm");
                c
            } else {
                Command::new("npm")
            }
        } else if cfg!(target_os = "windows") {
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
        .env("NODE_EXE", &node_bin)
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
            let mut proxy_url = p.url.trim().to_string();
            // Automatically upgrade socks5:// to socks5h:// to enforce remote DNS resolution through proxy
            if proxy_url.starts_with("socks5://") {
                proxy_url = format!("socks5h://{}", &proxy_url[9..]);
            }
            cmd.env("HTTP_PROXY", &proxy_url)
                .env("HTTPS_PROXY", &proxy_url)
                .env("http_proxy", &proxy_url)
                .env("https_proxy", &proxy_url);
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
    st.explicitly_stopped = false;
    st.child = Some(child);
    Ok(())
}

#[tauri::command]
fn stop_server(state: tauri::State<'_, Arc<Mutex<ServerState>>>) -> Result<(), String> {
    let mut st = state.lock().unwrap();
    st.explicitly_stopped = true;
    st.restart_count = 0;
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
        .manage(Arc::new(Mutex::new(ServerState {
            child: None,
            logs: vec![],
            explicitly_stopped: false,
            restart_count: 0,
            last_restart: None,
        })))
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
