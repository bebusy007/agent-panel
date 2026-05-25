mod constants;
mod logging;
mod models;
mod panic_hook;
mod router;
mod scanner;
mod search;
#[cfg(test)]
pub mod test_utils;
mod watcher;

use axum::Router;
use clap::Parser;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

#[derive(Parser, Debug)]
#[command(name = "agent-panel-server", about = "Agent Panel Rust backend")]
struct Args {
    /// Port to listen on
    #[arg(short, long, default_value_t = 7788)]
    port: u16,

    /// Don't open browser on start
    #[arg(long)]
    no_open: bool,

    /// Path to static web assets (web/dist/)
    #[arg(long, default_value = "web/dist")]
    dist: String,

    /// Log directory
    #[arg(long, default_value = "logs")]
    log_dir: String,

    /// Enable release mode (reduced stdout logging, info-level file logging)
    #[arg(long)]
    release_mode: bool,
}

#[tokio::main]
async fn main() {
    raise_fd_limit();

    let args = Args::parse();

    // Initialize logging — guards must live until program exit
    let _log_guards = logging::init(&args.log_dir, args.release_mode);

    // Install panic hook — crash reports written to crash.log
    let log_path = std::path::PathBuf::from(&args.log_dir);
    panic_hook::install(&log_path);

    // Start file watcher (background thread)
    let watcher_tx = watcher::start_watching();

    let api = router::build_api_router(watcher_tx, args.log_dir.clone());

    let index_path = std::path::PathBuf::from(&args.dist).join("index.html");
    let spa_fallback = tower::service_fn(move |_req: http::Request<_>| {
        let index = index_path.clone();
        async move {
            match tokio::fs::read(&index).await {
                Ok(body) => Ok(http::Response::builder()
                    .header("content-type", "text/html; charset=utf-8")
                    .header("cache-control", "no-cache, no-store, must-revalidate")
                    .body(axum::body::Body::from(body))
                    .unwrap()),
                Err(_) => Ok(http::Response::builder()
                    .status(404)
                    .body(axum::body::Body::from("index.html not found"))
                    .unwrap()),
            }
        }
    });

    let app = Router::new()
        .nest("/api", api)
        .fallback_service(
            ServeDir::new(&args.dist)
                .append_index_html_on_directories(true)
                .fallback(spa_fallback),
        )
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(|request: &http::Request<_>| {
                    let request_id = request
                        .headers()
                        .get("x-request-id")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("none");
                    tracing::info_span!(
                        "http",
                        method = %request.method(),
                        path = %request.uri().path(),
                        request_id = %request_id,
                    )
                })
                .on_response(
                    tower_http::trace::DefaultOnResponse::new()
                        .level(tracing::Level::INFO)
                        .latency_unit(tower_http::LatencyUnit::Millis),
                )
                .on_failure(
                    tower_http::trace::DefaultOnFailure::new().level(tracing::Level::ERROR),
                ),
        )
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(CorsLayer::permissive());

    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));
    tracing::info!("agent-panel-server listening on http://{}", addr);

    if !args.no_open {
        let url = format!("http://127.0.0.1:{}", args.port);
        let _ = open::that(&url);
    }

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Raise the file descriptor limit to avoid "Too many open files" when the
/// file watcher recursively monitors directories with many entries.
#[cfg(unix)]
fn raise_fd_limit() {
    use std::io;
    let mut rlim = libc::rlimit {
        rlim_cur: 0,
        rlim_max: 0,
    };
    unsafe {
        if libc::getrlimit(libc::RLIMIT_NOFILE, &mut rlim) == 0 {
            let target = rlim.rlim_max.min(10240);
            if rlim.rlim_cur < target {
                rlim.rlim_cur = target;
                if libc::setrlimit(libc::RLIMIT_NOFILE, &rlim) != 0 {
                    eprintln!(
                        "warning: failed to raise fd limit: {}",
                        io::Error::last_os_error()
                    );
                }
            }
        }
    }
}

#[cfg(not(unix))]
fn raise_fd_limit() {}
