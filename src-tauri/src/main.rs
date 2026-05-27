#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use tauri::WebviewUrl;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct SidecarState(Mutex<Option<CommandChild>>);

static SIDECAR_PID: AtomicU32 = AtomicU32::new(0);

const BASE_PORT: u16 = 7788;
const MAX_PORT_ATTEMPTS: u16 = 10;
const HEALTH_CHECK_INTERVAL: Duration = Duration::from_millis(300);
const HEALTH_CHECK_TIMEOUT: Duration = Duration::from_secs(15);

fn find_available_port() -> u16 {
    for offset in 0..MAX_PORT_ATTEMPTS {
        let port = BASE_PORT + offset;
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    BASE_PORT
}

#[cfg(unix)]
extern "C" fn kill_sidecar_by_pid() {
    let pid = SIDECAR_PID.swap(0, Ordering::SeqCst);
    if pid != 0 {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
}

#[cfg(unix)]
extern "C" fn signal_handler(_sig: libc::c_int) {
    kill_sidecar_by_pid();
    unsafe {
        libc::_exit(0);
    }
}

fn main() {
    let port = find_available_port();

    #[cfg(unix)]
    unsafe {
        libc::atexit(kill_sidecar_by_pid);
        libc::signal(libc::SIGTERM, signal_handler as libc::sighandler_t);
        libc::signal(libc::SIGINT, signal_handler as libc::sighandler_t);
        libc::signal(libc::SIGHUP, signal_handler as libc::sighandler_t);
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(SidecarState(Mutex::new(None)))
        .setup(move |app| {
            let handle = app.handle().clone();

            let log_dir = resolve_log_dir();

            let resource_dir = handle
                .path()
                .resource_dir()
                .map(|p| p.join("web/dist"))
                .unwrap_or_default();

            let dist_path = if resource_dir.is_dir() {
                resource_dir.to_string_lossy().to_string()
            } else {
                "web/dist".to_string()
            };

            let sidecar = handle.shell().sidecar("agent-panel-server").unwrap();
            let (_rx, child) = sidecar
                .args([
                    "--port",
                    &port.to_string(),
                    "--no-open",
                    "--release-mode",
                    "--dist",
                    &dist_path,
                    "--log-dir",
                    &log_dir,
                ])
                .spawn()
                .expect("failed to spawn sidecar");

            SIDECAR_PID.store(child.pid(), Ordering::SeqCst);

            let state = handle.state::<SidecarState>();
            *state.0.lock().unwrap() = Some(child);

            let handle2 = handle.clone();
            tauri::async_runtime::spawn(async move {
                let health_url = format!("http://127.0.0.1:{}/api/health", port);
                let start = std::time::Instant::now();

                loop {
                    if start.elapsed() > HEALTH_CHECK_TIMEOUT {
                        eprintln!("sidecar health check timed out");
                        break;
                    }
                    match reqwest::get(&health_url).await {
                        Ok(resp) if resp.status().is_success() => break,
                        _ => tokio::time::sleep(HEALTH_CHECK_INTERVAL).await,
                    }
                }

                let page_url = format!("http://127.0.0.1:{}", port);
                let url: url::Url = page_url.parse().unwrap();

                let _win =
                    tauri::WebviewWindowBuilder::new(&handle2, "main", WebviewUrl::External(url))
                        .title("AgentPanel")
                        .inner_size(1280.0, 800.0)
                        .min_inner_size(900.0, 600.0)
                        .resizable(true)
                        .visible(true)
                        .focused(true)
                        .build()
                        .expect("failed to create window");
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                // Primary: kill via CommandChild handle
                let state = app_handle.state::<SidecarState>();
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                    }
                }
                // Fallback: kill by PID in case handle didn't work
                #[cfg(unix)]
                kill_sidecar_by_pid();
            }
            _ => {}
        }
    });

    // Last resort: process exit cleanup
    #[cfg(unix)]
    kill_sidecar_by_pid();
}

fn resolve_log_dir() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let log_dir = home.join("Library/Logs/AgentPanel");
            let _ = std::fs::create_dir_all(&log_dir);
            return log_dir.to_string_lossy().to_string();
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(data) = dirs::data_local_dir() {
            let log_dir = data.join("AgentPanel/logs");
            let _ = std::fs::create_dir_all(&log_dir);
            return log_dir.to_string_lossy().to_string();
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(data) = dirs::data_local_dir() {
            let log_dir = data.join("AgentPanel").join("logs");
            let _ = std::fs::create_dir_all(&log_dir);
            return log_dir.to_string_lossy().to_string();
        }
    }

    "logs".to_string()
}
