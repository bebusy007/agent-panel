//! File watcher — monitors ~/.claude/ for changes and broadcasts events via WebSocket.
//!
//! Watches:
//! - ~/.claude/projects/ (session files)
//! - ~/.claude/skills/ (skill changes)
//! - ~/.claude/settings.json (config changes)
//! - ~/.claude/plugins/ (plugin changes)
//! - ~/.claude/agents/ (agent changes)

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::broadcast;

#[cfg(test)]
use std::path::PathBuf;

/// Event types broadcast to WebSocket clients.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchEvent {
    pub kind: String,
    pub paths: Vec<String>,
}

pub type EventSender = broadcast::Sender<WatchEvent>;

/// Start watching ~/.claude/ directory for changes.
/// Returns a broadcast sender that routes can subscribe to for WebSocket push.
pub fn start_watching() -> EventSender {
    let (tx, _) = broadcast::channel::<WatchEvent>(crate::constants::WATCHER_BROADCAST_CAPACITY);
    let tx_clone = tx.clone();

    std::thread::spawn(move || {
        let home = match dirs::home_dir() {
            Some(h) => h,
            None => {
                tracing::warn!("cannot determine home dir, watcher disabled");
                return;
            }
        };

        let claude_dir = home.join(".claude");
        if !claude_dir.is_dir() {
            tracing::warn!("~/.claude not found, watcher disabled");
            return;
        }

        let tx_inner = tx_clone;
        let mut watcher = match RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let kind = classify_event(&event);
                    if !kind.is_empty() {
                        if kind == "session_changed" {
                            crate::scanner::sessions::invalidate_scan_cache();
                        }
                        let paths: Vec<String> = event
                            .paths
                            .iter()
                            .map(|p| p.to_string_lossy().to_string())
                            .collect();
                        let _ = tx_inner.send(WatchEvent {
                            kind: kind.to_string(),
                            paths,
                        });
                    }
                }
            },
            Config::default(),
        ) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!("failed to create watcher: {}", e);
                return;
            }
        };

        // Watch key directories
        let watch_paths = vec![
            claude_dir.join("projects"),
            claude_dir.join("skills"),
            claude_dir.join("agents"),
            claude_dir.join("plugins"),
            claude_dir.join("settings.json"),
        ];

        let mut watched = 0usize;
        for path in &watch_paths {
            if !path.exists() {
                continue;
            }
            let mode = if path.is_dir() {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            };
            match watcher.watch(path, mode) {
                Ok(()) => {
                    watched += 1;
                }
                Err(e) if path.is_dir() => {
                    // Recursive watch can fail when the directory contains
                    // broken symlinks. Fall back to non-recursive.
                    tracing::debug!(
                        "recursive watch failed for {}, trying non-recursive: {}",
                        path.display(),
                        e
                    );
                    match watcher.watch(path, RecursiveMode::NonRecursive) {
                        Ok(()) => {
                            watched += 1;
                        }
                        Err(e2) => {
                            tracing::warn!("failed to watch {}: {}", path.display(), e2);
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!("failed to watch {}: {}", path.display(), e);
                }
            }
        }

        tracing::info!("file watcher started, monitoring {} paths", watched);

        // Keep thread alive
        loop {
            std::thread::sleep(std::time::Duration::from_secs(
                crate::constants::WATCHER_KEEPALIVE_SECS,
            ));
        }
    });

    tx
}

fn classify_event(event: &Event) -> &'static str {
    let paths = &event.paths;
    if paths.is_empty() {
        return "";
    }

    // 规范化路径分隔符：Windows \ → /
    let path_str = paths[0].to_string_lossy().replace('\\', "/");

    if path_str.contains("/projects/") && path_str.ends_with(".jsonl") {
        return "session_changed";
    }
    if path_str.contains("/skills/") {
        return "skills_changed";
    }
    if path_str.contains("/agents/") {
        return "agents_changed";
    }
    if path_str.contains("/plugins/") {
        return "plugins_changed";
    }
    if path_str.ends_with("settings.json") {
        return "settings_changed";
    }

    ""
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, ModifyKind};

    fn make_event(paths: Vec<&str>, kind: notify::EventKind) -> Event {
        Event {
            kind,
            paths: paths.into_iter().map(PathBuf::from).collect(),
            attrs: Default::default(),
        }
    }

    #[test]
    fn test_classify_session_event() {
        let event = make_event(
            vec!["/Users/test/.claude/projects/proj-a/session-1.jsonl"],
            notify::EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
        );
        assert_eq!(classify_event(&event), "session_changed");
    }

    #[test]
    fn test_classify_skills_event() {
        let event = make_event(
            vec!["/Users/test/.claude/skills/my-skill/SKILL.md"],
            notify::EventKind::Create(CreateKind::File),
        );
        assert_eq!(classify_event(&event), "skills_changed");
    }

    #[test]
    fn test_classify_settings_event() {
        let event = make_event(
            vec!["/Users/test/.claude/settings.json"],
            notify::EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
        );
        assert_eq!(classify_event(&event), "settings_changed");
    }

    #[test]
    fn test_classify_unknown_event() {
        let event = make_event(
            vec!["/Users/test/random/file.txt"],
            notify::EventKind::Create(CreateKind::File),
        );
        assert_eq!(classify_event(&event), "");
    }

    #[test]
    fn test_classify_empty_paths() {
        let event = make_event(vec![], notify::EventKind::Create(CreateKind::File));
        assert_eq!(classify_event(&event), "");
    }

    #[test]
    fn test_classify_agents_event() {
        let event = make_event(
            vec!["/Users/test/.claude/agents/my-agent.md"],
            notify::EventKind::Create(CreateKind::File),
        );
        assert_eq!(classify_event(&event), "agents_changed");
    }

    #[test]
    fn test_classify_plugins_event() {
        let event = make_event(
            vec!["/Users/test/.claude/plugins/plugin.json"],
            notify::EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
        );
        assert_eq!(classify_event(&event), "plugins_changed");
    }

    #[test]
    fn test_classify_projects_non_jsonl() {
        let event = make_event(
            vec!["/Users/test/.claude/projects/proj-a/.session_cache.json"],
            notify::EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
        );
        assert_eq!(classify_event(&event), "");
    }

    #[test]
    fn test_watch_event_serialization() {
        let event = WatchEvent {
            kind: "session_changed".to_string(),
            paths: vec!["/Users/test/.claude/projects/proj/session.jsonl".to_string()],
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["kind"], "session_changed");
        assert_eq!(
            json["paths"][0],
            "/Users/test/.claude/projects/proj/session.jsonl"
        );
    }

    #[test]
    fn test_watch_event_empty_paths() {
        let event = WatchEvent {
            kind: "skills_changed".to_string(),
            paths: vec![],
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["kind"], "skills_changed");
        assert!(json["paths"].as_array().unwrap().is_empty());
    }

    #[test]
    fn test_classify_multiple_paths_uses_first() {
        let event = make_event(
            vec![
                "/Users/test/.claude/projects/proj-a/session.jsonl",
                "/Users/test/.claude/skills/my-skill/SKILL.md",
            ],
            notify::EventKind::Create(CreateKind::File),
        );
        assert_eq!(classify_event(&event), "session_changed");
    }

    #[test]
    fn test_classify_session_nested_path() {
        let event = make_event(
            vec!["/Users/test/.claude/projects/some-long-project-name/deep/path.jsonl"],
            notify::EventKind::Create(CreateKind::File),
        );
        assert_eq!(classify_event(&event), "session_changed");
    }
}
