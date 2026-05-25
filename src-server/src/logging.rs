use std::fs;
use std::path::Path;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{EnvFilter, Layer, fmt, layer::SubscriberExt, util::SubscriberInitExt};

pub struct LogGuards {
    _file_guard: WorkerGuard,
    _error_guard: WorkerGuard,
}

pub fn init(log_dir: &str, release_mode: bool) -> LogGuards {
    fs::create_dir_all(log_dir).expect("failed to create log directory");

    // --- Layer 1: stdout (human-readable, for development) ---
    let default_stdout_filter = if release_mode {
        "agent_panel_server=warn,tower_http=warn"
    } else {
        "agent_panel_server=debug,tower_http=info"
    };

    let stdout_layer = fmt::layer()
        .with_target(true)
        .with_file(true)
        .with_line_number(true)
        .with_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new(default_stdout_filter)),
        );

    // --- Layer 2: file (JSON, daily rotation, 14-day retention) ---
    let file_appender = tracing_appender::rolling::RollingFileAppender::builder()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("agent-panel")
        .filename_suffix("log")
        .max_log_files(crate::constants::LOG_RETENTION_DAYS)
        .build(log_dir)
        .expect("failed to create file appender");

    let (file_writer, file_guard) = tracing_appender::non_blocking(file_appender);

    let default_file_filter = if release_mode {
        "agent_panel_server=info,tower_http=info"
    } else {
        "agent_panel_server=debug,tower_http=info"
    };

    let file_layer = fmt::layer()
        .json()
        .with_writer(file_writer)
        .with_target(true)
        .with_current_span(true)
        .with_span_list(true)
        .with_filter(EnvFilter::new(default_file_filter));

    // --- Layer 3: error-only file (JSON, daily rotation, 30-day retention) ---
    let error_appender = tracing_appender::rolling::RollingFileAppender::builder()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("agent-panel-error")
        .filename_suffix("log")
        .max_log_files(crate::constants::ERROR_LOG_RETENTION_DAYS)
        .build(log_dir)
        .expect("failed to create error appender");

    let (error_writer, error_guard) = tracing_appender::non_blocking(error_appender);

    let error_layer = fmt::layer()
        .json()
        .with_writer(error_writer)
        .with_target(true)
        .with_current_span(true)
        .with_span_list(true)
        .with_filter(EnvFilter::new("error"));

    // --- Combine all layers ---
    tracing_subscriber::registry()
        .with(stdout_layer)
        .with(file_layer)
        .with(error_layer)
        .init();

    tracing::info!(log_dir = %Path::new(log_dir).canonicalize().unwrap_or_else(|_| Path::new(log_dir).to_path_buf()).display(), release_mode, "logging initialized");

    LogGuards {
        _file_guard: file_guard,
        _error_guard: error_guard,
    }
}
