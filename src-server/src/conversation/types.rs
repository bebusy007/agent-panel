use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Server → Client messages (sent over WebSocket) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    StateChange {
        state: SessionState,
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
    Connected {
        epoch: u64,
        session_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        reconnect_token: Option<String>,
    },
    Event(ChatEvent),
    Error {
        code: String,
        message: String,
    },
    Disconnected {
        reason: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Spawned,
    Idle,
}

// ── Client → Server messages (received over WebSocket) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    UserMessage {
        text: String,
        #[serde(default)]
        attachments: Vec<AttachmentData>,
    },
    PermissionResponse {
        request_id: String,
        decision: PermissionDecision,
    },
    Interrupt {},
    Disconnect {},
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    Allow,
    Deny,
}

// ── ChatEvent: internal events parsed from CLI stdout ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum ChatEvent {
    SessionInit {
        session_id: String,
        #[serde(default)]
        model: Option<String>,
        #[serde(default)]
        slash_commands: Vec<SlashCommandInfo>,
    },
    ThinkingDelta {
        text: String,
    },
    TextDelta {
        text: String,
    },
    ToolUseStart {
        tool_use_id: String,
        tool_name: String,
    },
    ToolInputDelta {
        tool_use_id: String,
        json_delta: String,
    },
    ToolUseEnd {
        tool_use_id: String,
    },
    ToolResult {
        tool_use_id: String,
        #[serde(default)]
        output: Option<String>,
        #[serde(default)]
        is_error: bool,
    },
    PermissionRequest {
        request_id: String,
        tool_name: String,
        #[serde(default)]
        tool_input: Option<Value>,
        #[serde(default)]
        suggestions: Vec<Value>,
    },
    UsageUpdate {
        #[serde(default)]
        input_tokens: u64,
        #[serde(default)]
        output_tokens: u64,
        #[serde(default)]
        cache_read_tokens: u64,
        #[serde(default)]
        cache_write_tokens: u64,
        #[serde(default)]
        cost: Option<f64>,
        #[serde(default)]
        model_usage: Option<Value>,
    },
    TurnComplete {
        #[serde(default)]
        stop_reason: Option<String>,
        #[serde(default)]
        error: Option<String>,
    },
    AssistantMessage {
        message_id: String,
    },
    UserMessageEcho {
        uuid: String,
    },
    Raw {
        data: Value,
    },
}

// ── Supporting types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlashCommandInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub is_skill: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentData {
    pub filename: String,
    pub media_type: String,
    pub content_base64: String,
}

// ── Spawn configuration ──

#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub mode: SpawnMode,
    pub cwd: String,
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub cli_path: Option<String>,
}

#[derive(Debug, Clone)]
pub enum SpawnMode {
    Resume { session_id: String },
    New,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_message_state_change_serializes() {
        let msg = ServerMessage::StateChange {
            state: SessionState::Spawned,
            reason: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"state_change\""));
        assert!(json.contains("\"state\":\"spawned\""));
    }

    #[test]
    fn server_message_connected_serializes() {
        let msg = ServerMessage::Connected {
            epoch: 1,
            session_id: "abc-123".into(),
            reconnect_token: Some("tok_xyz".into()),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"connected\""));
        assert!(json.contains("\"session_id\":\"abc-123\""));
        assert!(json.contains("\"reconnect_token\":\"tok_xyz\""));
    }

    #[test]
    fn server_message_error_serializes() {
        let msg = ServerMessage::Error {
            code: "already_connected".into(),
            message: "Session already has an active connection".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"error\""));
        assert!(json.contains("\"code\":\"already_connected\""));
    }

    #[test]
    fn client_message_user_message_deserializes() {
        let json = r#"{"type":"user_message","text":"hello","attachments":[]}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        match msg {
            ClientMessage::UserMessage { text, attachments } => {
                assert_eq!(text, "hello");
                assert!(attachments.is_empty());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn client_message_permission_response_deserializes() {
        let json = r#"{"type":"permission_response","request_id":"req_1","decision":"allow"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        match msg {
            ClientMessage::PermissionResponse {
                request_id,
                decision,
            } => {
                assert_eq!(request_id, "req_1");
                assert_eq!(decision, PermissionDecision::Allow);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn client_message_interrupt_deserializes() {
        let json = r#"{"type":"interrupt"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        assert!(matches!(msg, ClientMessage::Interrupt {}));
    }

    #[test]
    fn chat_event_text_delta_serializes() {
        let event = ChatEvent::TextDelta {
            text: "hello".into(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"event_type\":\"text_delta\""));
        assert!(json.contains("\"text\":\"hello\""));
    }

    #[test]
    fn chat_event_tool_use_start_serializes() {
        let event = ChatEvent::ToolUseStart {
            tool_use_id: "tu_1".into(),
            tool_name: "Bash".into(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"event_type\":\"tool_use_start\""));
        assert!(json.contains("\"tool_name\":\"Bash\""));
    }

    #[test]
    fn chat_event_permission_request_serializes() {
        let event = ChatEvent::PermissionRequest {
            request_id: "req_abc".into(),
            tool_name: "Bash".into(),
            tool_input: Some(serde_json::json!({"command": "ls"})),
            suggestions: vec![],
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"event_type\":\"permission_request\""));
        assert!(json.contains("\"tool_name\":\"Bash\""));
    }

    #[test]
    fn chat_event_raw_serializes() {
        let event = ChatEvent::Raw {
            data: serde_json::json!({"type": "unknown_thing", "foo": 42}),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"event_type\":\"raw\""));
    }

    #[test]
    fn chat_event_usage_update_serializes() {
        let event = ChatEvent::UsageUpdate {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: 80,
            cache_write_tokens: 20,
            cost: Some(0.003),
            model_usage: None,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"input_tokens\":100"));
        assert!(json.contains("\"cache_read_tokens\":80"));
    }

    #[test]
    fn attachment_data_round_trips() {
        let att = AttachmentData {
            filename: "photo.png".into(),
            media_type: "image/png".into(),
            content_base64: "iVBORw0KGgo=".into(),
        };
        let json = serde_json::to_string(&att).unwrap();
        let back: AttachmentData = serde_json::from_str(&json).unwrap();
        assert_eq!(back.filename, "photo.png");
        assert_eq!(back.media_type, "image/png");
    }
}
