use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Server → Client messages (sent over WebSocket) ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    /// CLI spawned, waiting for session_init
    StateChange {
        state: SessionState,
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
    /// Connection established with session_id
    Connected {
        epoch: u64,
        session_id: String,
        seq: u64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reconnect_token: Option<String>,
    },
    /// A ChatEvent from CLI
    Event {
        seq: u64,
        event: ChatEvent,
    },
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
        uuid: String,
        #[serde(default)]
        attachments: Vec<AttachmentData>,
    },
    PermissionResponse {
        request_id: String,
        decision: PermissionDecision,
    },
    Interrupt,
    Disconnect,
    RewindFiles {
        request_id: String,
        user_message_id: String,
        #[serde(default)]
        dry_run: bool,
        #[serde(default)]
        files: Option<Vec<String>>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    Allow,
    Deny,
}

// ── ChatEvent: internal events parsed from CLI stdout ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatEvent {
    // ── Session lifecycle ──
    SessionInit {
        session_id: String,
        #[serde(default)]
        model: Option<String>,
        #[serde(default)]
        slash_commands: Vec<SlashCommandInfo>,
        #[serde(default)]
        mcp_servers: Vec<McpServerInfo>,
        #[serde(default)]
        tools: Vec<String>,
        #[serde(default)]
        cli_version: Option<String>,
        #[serde(default)]
        permission_mode: Option<String>,
        #[serde(default)]
        cwd: Option<String>,
    },
    SystemStatus {
        status: String,
    },

    // ── Streaming: message structure ──
    MessageStart {
        message_id: String,
        #[serde(default)]
        model: Option<String>,
    },
    MessageDelta {
        #[serde(default)]
        stop_reason: Option<String>,
        #[serde(default)]
        input_tokens: u64,
        #[serde(default)]
        output_tokens: u64,
        #[serde(default)]
        cache_read_input_tokens: u64,
        #[serde(default)]
        cache_creation_input_tokens: u64,
    },

    // ── Streaming: content block deltas ──
    ContentBlockStart {
        index: u64,
        block_type: ContentBlockType,
        #[serde(default)]
        tool_use_id: Option<String>,
        #[serde(default)]
        tool_name: Option<String>,
    },
    TextDelta {
        text: String,
    },
    ThinkingDelta {
        text: String,
    },
    SignatureDelta {
        signature: String,
    },
    ToolInputDelta {
        tool_use_id: String,
        json_delta: String,
    },
    ContentBlockStop {
        index: u64,
    },

    // ── Complete messages (authoritative summaries) ──
    AssistantMessage {
        message_id: String,
        #[serde(default)]
        model: Option<String>,
        #[serde(default)]
        text: Option<String>,
        #[serde(default)]
        thinking_text: Option<String>,
        #[serde(default)]
        thinking_signature: Option<String>,
        #[serde(default)]
        tool_use_id: Option<String>,
        #[serde(default)]
        tool_name: Option<String>,
        #[serde(default)]
        tool_input: Option<Value>,
        #[serde(default)]
        stop_reason: Option<String>,
        #[serde(default)]
        usage: Option<MessageUsage>,
    },
    UserMessageEcho {
        uuid: String,
    },

    // ── Tool results ──
    ToolResult {
        tool_use_id: String,
        #[serde(default)]
        output: Option<String>,
        #[serde(default)]
        is_error: bool,
        #[serde(default)]
        interrupted: bool,
        #[serde(default)]
        exit_code: Option<i32>,
        #[serde(default)]
        stdout: Option<String>,
        #[serde(default)]
        stderr: Option<String>,
    },

    // ── Permissions & controls ──
    PermissionRequest {
        request_id: String,
        tool_name: String,
        #[serde(default)]
        tool_input: Option<Value>,
        #[serde(default)]
        suggestions: Vec<Value>,
    },
    HookCallback {
        request_id: String,
        hook_name: String,
        hook_event: String,
        data: Value,
    },
    ElicitationRequest {
        request_id: String,
        mcp_server: String,
        message: String,
        #[serde(default)]
        schema: Option<Value>,
    },

    // ── Turn lifecycle ──
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
        #[serde(default)]
        is_error: bool,
        #[serde(default)]
        terminal_reason: Option<String>,
        #[serde(default)]
        duration_ms: u64,
        #[serde(default)]
        duration_api_ms: u64,
        #[serde(default)]
        num_turns: u64,
    },

    // ── System events ──
    CompactBoundary {
        #[serde(default)]
        compact_kind: Option<String>,
    },
    RateLimit {
        status: String,
        #[serde(default)]
        utilization: Option<f64>,
        #[serde(default)]
        resets_at: Option<u64>,
        #[serde(default)]
        limit_type: Option<String>,
    },
    TaskNotification {
        task_id: String,
        status: String,
        message: String,
        #[serde(default)]
        tool_use_id: Option<String>,
        #[serde(default)]
        output_file: Option<String>,
    },

    // ── Extensibility ──
    Raw {
        raw_type: String,
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
pub struct McpServerInfo {
    pub name: String,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageUsage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    #[serde(default)]
    pub cache_read_input_tokens: u64,
    #[serde(default)]
    pub cache_creation_input_tokens: u64,
    #[serde(default)]
    pub service_tier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContentBlockType {
    Thinking,
    Text,
    ToolUse,
    #[serde(untagged)]
    Unknown(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    #[serde(default)]
    pub cost: Option<f64>,
    #[serde(default)]
    pub duration_ms: u64,
    #[serde(default)]
    pub model_usage: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentData {
    pub filename: String,
    pub media_type: String,
    pub content_base64: String,
}

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

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_message_state_change() {
        let msg = ServerMessage::StateChange {
            state: SessionState::Spawned,
            reason: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"state_change\""));
        assert!(json.contains("\"state\":\"spawned\""));
    }

    #[test]
    fn server_message_connected() {
        let msg = ServerMessage::Connected {
            epoch: 1,
            session_id: "abc-123".into(),
            seq: 0,
            reconnect_token: Some("tok_xyz".into()),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"connected\""));
        assert!(json.contains("\"session_id\":\"abc-123\""));
        assert!(json.contains("\"reconnect_token\":\"tok_xyz\""));
    }

    #[test]
    fn server_message_error() {
        let msg = ServerMessage::Error {
            code: "already_connected".into(),
            message: "Session already has an active connection".into(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"error\""));
        assert!(json.contains("\"code\":\"already_connected\""));
    }

    #[test]
    fn client_message_user_message() {
        let json =
            r#"{"type":"user_message","text":"hello","uuid":"test-uuid-123","attachments":[]}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        match msg {
            ClientMessage::UserMessage {
                text,
                uuid,
                attachments,
            } => {
                assert_eq!(text, "hello");
                assert_eq!(uuid, "test-uuid-123");
                assert!(attachments.is_empty());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn client_message_permission_response() {
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
    fn client_message_interrupt() {
        let json = r#"{"type":"interrupt"}"#;
        let msg: ClientMessage = serde_json::from_str(json).unwrap();
        assert!(matches!(msg, ClientMessage::Interrupt));
    }

    #[test]
    fn chat_event_text_delta() {
        let event = ChatEvent::TextDelta {
            text: "hello".into(),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"text_delta\""));
        assert!(json.contains("\"text\":\"hello\""));
    }

    #[test]
    fn chat_event_session_init() {
        let event = ChatEvent::SessionInit {
            session_id: "sess_abc".into(),
            model: Some("claude-sonnet-4-20250514".into()),
            slash_commands: vec![],
            mcp_servers: vec![],
            tools: vec!["Bash".into()],
            cli_version: Some("2.1.153".into()),
            permission_mode: Some("default".into()),
            cwd: Some("/tmp".into()),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"session_init\""));
        assert!(json.contains("\"session_id\":\"sess_abc\""));
        assert!(json.contains("\"tools\":[\"Bash\"]"));
    }

    #[test]
    fn chat_event_tool_result() {
        let event = ChatEvent::ToolResult {
            tool_use_id: "tu_1".into(),
            output: Some("file content".into()),
            is_error: false,
            interrupted: false,
            exit_code: Some(0),
            stdout: Some("file content".into()),
            stderr: None,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"tool_use_id\":\"tu_1\""));
        assert!(json.contains("\"exit_code\":0"));
    }

    #[test]
    fn chat_event_permission_request() {
        let event = ChatEvent::PermissionRequest {
            request_id: "req_abc".into(),
            tool_name: "Bash".into(),
            tool_input: Some(serde_json::json!({"command": "ls"})),
            suggestions: vec![],
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"permission_request\""));
        assert!(json.contains("\"tool_name\":\"Bash\""));
    }

    #[test]
    fn chat_event_raw() {
        let event = ChatEvent::Raw {
            raw_type: "future_event".into(),
            data: serde_json::json!({"foo": 42}),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"raw\""));
        assert!(json.contains("\"foo\":42"));
    }

    #[test]
    fn chat_event_usage_update() {
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
    fn chat_event_turn_complete() {
        let event = ChatEvent::TurnComplete {
            stop_reason: Some("end_turn".into()),
            error: None,
            is_error: false,
            terminal_reason: Some("completed".into()),
            duration_ms: 1234,
            duration_api_ms: 1200,
            num_turns: 1,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"kind\":\"turn_complete\""));
        assert!(json.contains("\"stop_reason\":\"end_turn\""));
        assert!(json.contains("\"duration_ms\":1234"));
    }

    #[test]
    fn server_message_event_wraps_chat_event() {
        let msg = ServerMessage::Event {
            seq: 42,
            event: ChatEvent::TextDelta { text: "hi".into() },
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"event\""));
        assert!(json.contains("\"kind\":\"text_delta\""));
        // Verify seq is present
        assert!(json.contains("\"seq\":42"));
    }

    #[test]
    fn deserialize_session_init() {
        let json = r#"{"kind":"session_init","session_id":"abc-123","model":"opus","slash_commands":[],"mcp_servers":[],"tools":["Bash"]}"#;
        let ev: ChatEvent = serde_json::from_str(json).unwrap();
        match ev {
            ChatEvent::SessionInit {
                session_id,
                model,
                tools,
                ..
            } => {
                assert_eq!(session_id, "abc-123");
                assert_eq!(model.unwrap(), "opus");
                assert_eq!(tools, vec!["Bash"]);
            }
            _ => panic!("expected SessionInit"),
        }
    }

    #[test]
    fn deserialize_tool_result() {
        let json = r#"{"kind":"tool_result","tool_use_id":"tu_1","output":"ok","stdout":"ok","stderr":"","exit_code":0,"is_error":false,"interrupted":false}"#;
        let ev: ChatEvent = serde_json::from_str(json).unwrap();
        match ev {
            ChatEvent::ToolResult {
                tool_use_id,
                output,
                exit_code,
                ..
            } => {
                assert_eq!(tool_use_id, "tu_1");
                assert_eq!(output.unwrap(), "ok");
                assert_eq!(exit_code, Some(0));
            }
            _ => panic!("expected ToolResult"),
        }
    }

    #[test]
    fn attachment_data_round_trips() {
        let att = AttachmentData {
            filename: "photo.png".into(),
            media_type: "image/png".into(),
            content_base64: "iVBOR...".into(),
        };
        let json = serde_json::to_string(&att).unwrap();
        let back: AttachmentData = serde_json::from_str(&json).unwrap();
        assert_eq!(back.filename, "photo.png");
        assert_eq!(back.media_type, "image/png");
    }
}
