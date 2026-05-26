use axum::{Json, Router, extract::State, routing::get};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tracing_subscriber::{EnvFilter, reload};

#[derive(Clone)]
pub struct LogLevelState {
    pub handle: reload::Handle<EnvFilter, tracing_subscriber::Registry>,
    current_level: Arc<RwLock<String>>,
}

#[derive(Serialize)]
struct LogLevelResponse {
    level: String,
}

#[derive(Deserialize)]
struct SetLogLevelRequest {
    level: String,
}

async fn get_log_level(State(state): State<Arc<LogLevelState>>) -> Json<LogLevelResponse> {
    let level = state
        .current_level
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    Json(LogLevelResponse { level })
}

async fn set_log_level(
    State(state): State<Arc<LogLevelState>>,
    Json(body): Json<SetLogLevelRequest>,
) -> Json<LogLevelResponse> {
    let filter = match body.level.as_str() {
        "off" => EnvFilter::new("off"),
        level => EnvFilter::new(format!("agent_panel_server={level},tower_http={level}")),
    };

    match state.handle.reload(filter) {
        Ok(()) => {
            tracing::info!(new_level = %body.level, "log level changed");
            if let Ok(mut w) = state.current_level.write() {
                *w = body.level.clone();
            }
            Json(LogLevelResponse { level: body.level })
        }
        Err(e) => {
            tracing::error!(error = %e, "failed to change log level");
            Json(LogLevelResponse {
                level: "error".to_string(),
            })
        }
    }
}

pub fn routes(handle: reload::Handle<EnvFilter, tracing_subscriber::Registry>) -> Router {
    let state = Arc::new(LogLevelState {
        handle,
        current_level: Arc::new(RwLock::new("info".to_string())),
    });
    Router::new()
        .route("/log-level", get(get_log_level).post(set_log_level))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;

    fn test_server() -> (
        TestServer,
        reload::Layer<EnvFilter, tracing_subscriber::Registry>,
    ) {
        let (layer, handle) =
            reload::Layer::<EnvFilter, tracing_subscriber::Registry>::new(EnvFilter::new(
                "agent_panel_server=debug,tower_http=info",
            ));
        let router = routes(handle);
        (
            TestServer::new(router.into_make_service()),
            layer,
        )
    }

    #[test]
    fn test_reload_handle_accepts_new_filter() {
        let (_layer, handle) =
            reload::Layer::<EnvFilter, tracing_subscriber::Registry>::new(EnvFilter::new("info"));
        assert!(handle.reload(EnvFilter::new("debug")).is_ok());
    }

    #[test]
    fn test_reload_handle_accepts_target_specific_filter() {
        let (_layer, handle) =
            reload::Layer::<EnvFilter, tracing_subscriber::Registry>::new(
                EnvFilter::new("agent_panel_server=debug,tower_http=info"),
            );
        assert!(handle
            .reload(EnvFilter::new("agent_panel_server=debug,tower_http=debug"))
            .is_ok());
    }

    #[test]
    fn test_state_get_set_level() {
        let (_layer, handle) =
            reload::Layer::<EnvFilter, tracing_subscriber::Registry>::new(EnvFilter::new("info"));
        let state = Arc::new(LogLevelState {
            handle,
            current_level: Arc::new(RwLock::new("info".to_string())),
        });
        assert_eq!(state.current_level.read().unwrap().as_str(), "info");
        *state.current_level.write().unwrap() = "debug".to_string();
        assert_eq!(state.current_level.read().unwrap().as_str(), "debug");
    }

    #[tokio::test]
    async fn test_get_log_level_returns_initial() {
        let (server, _layer) = test_server();
        let res = server.get("/log-level").await;
        res.assert_status_ok();
        assert_eq!(res.json::<serde_json::Value>()["level"], "info");
    }

    #[tokio::test]
    async fn test_set_log_level_debug() {
        let (server, _layer) = test_server();
        let res = server
            .post("/log-level")
            .json(&serde_json::json!({"level": "debug"}))
            .await;
        res.assert_status_ok();
        assert_eq!(res.json::<serde_json::Value>()["level"], "debug");
    }

    #[tokio::test]
    async fn test_set_then_get_roundtrip() {
        let (server, _layer) = test_server();
        server
            .post("/log-level")
            .json(&serde_json::json!({"level": "trace"}))
            .await;
        let res = server.get("/log-level").await;
        assert_eq!(res.json::<serde_json::Value>()["level"], "trace");
    }

    #[tokio::test]
    async fn test_set_log_level_off() {
        let (server, _layer) = test_server();
        let res = server
            .post("/log-level")
            .json(&serde_json::json!({"level": "off"}))
            .await;
        res.assert_status_ok();
        assert_eq!(res.json::<serde_json::Value>()["level"], "off");
    }
}
