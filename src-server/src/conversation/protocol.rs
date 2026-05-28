use crate::conversation::types::*;
use serde_json::Value;

/// Stateful protocol parser for Claude CLI stream-json output.
///
/// Maintains mappings needed across multiple lines:
/// - content block index → tool_use_id (separate from enum)
/// - current message_id (from message_start)
/// - accumulated tool input JSON strings
pub struct ProtocolParser {
    /// content block index → tool_use_id
    index_to_tool_id: std::collections::HashMap<u64, String>,
    /// tool_use_id → accumulated partial JSON
    tool_input_buf: std::collections::HashMap<String, String>,
}

impl ProtocolParser {
    pub fn new() -> Self {
        Self {
            index_to_tool_id: std::collections::HashMap::new(),
            tool_input_buf: std::collections::HashMap::new(),
        }
    }

    /// Parse a single JSON line, returning zero or more ChatEvents.
    pub fn parse_line(&mut self, line: &str) -> Vec<ChatEvent> {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            return vec![];
        }

        let value: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                let preview = &trimmed[..trimmed.len().min(200)];
                tracing::warn!(line_preview = preview, error = %e, "Failed to parse CLI JSON line");
                return vec![];
            }
        };

        let outer_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match outer_type {
            "system" => self.parse_system(&value),
            "stream_event" => self.parse_stream_event(&value),
            "assistant" => self.parse_assistant(&value),
            "user" => self.parse_user(&value),
            "result" => self.parse_result(&value),
            "control_request" => self.parse_control_request(&value),
            "" => {
                tracing::debug!("Skipping CLI line with empty type");
                vec![]
            }
            _ => {
                tracing::debug!(
                    event_type = outer_type,
                    "Unknown CLI event type, emitting Raw"
                );
                vec![ChatEvent::Raw {
                    raw_type: outer_type.to_string(),
                    data: value,
                }]
            }
        }
    }

    // ── system events ──

    fn parse_system(&self, value: &Value) -> Vec<ChatEvent> {
        let subtype = value.get("subtype").and_then(|v| v.as_str()).unwrap_or("");

        match subtype {
            "init" => {
                let session_id = value["session_id"].as_str().unwrap_or("").to_string();
                let model = value["model"].as_str().map(String::from);
                let slash_commands = parse_slash_commands(value);
                let mcp_servers = parse_mcp_servers(value);
                let tools = value["tools"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                let cli_version = value["claude_code_version"].as_str().map(String::from);
                let permission_mode = value["permissionMode"].as_str().map(String::from);
                let cwd = value["cwd"].as_str().map(String::from);

                vec![ChatEvent::SessionInit {
                    session_id,
                    model,
                    slash_commands,
                    mcp_servers,
                    tools,
                    cli_version,
                    permission_mode,
                    cwd,
                }]
            }
            "status" => {
                let status = value["status"].as_str().unwrap_or("").to_string();
                vec![ChatEvent::SystemStatus { status }]
            }
            _ => {
                vec![ChatEvent::Raw {
                    raw_type: format!("system::{subtype}"),
                    data: value.clone(),
                }]
            }
        }
    }

    // ── stream_event envelope (--include-partial-messages) ──

    fn parse_stream_event(&mut self, value: &Value) -> Vec<ChatEvent> {
        let event = match value.get("event") {
            Some(e) => e,
            None => {
                tracing::debug!("stream_event without inner event, skipping");
                return vec![];
            }
        };

        let event_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match event_type {
            "message_start" => self.parse_message_start(event),
            "content_block_start" => self.parse_content_block_start(event),
            "content_block_delta" => self.parse_content_block_delta(event),
            "content_block_stop" => self.parse_content_block_stop(event),
            "message_delta" => self.parse_message_delta(event),
            "message_stop" => {
                self.tool_input_buf.clear();
                self.index_to_tool_id.clear();
                vec![]
            }
            _ => {
                tracing::debug!(event_type, "Unknown stream_event inner type, emitting Raw");
                vec![ChatEvent::Raw {
                    raw_type: format!("stream_event::{event_type}"),
                    data: event.clone(),
                }]
            }
        }
    }

    fn parse_message_start(&mut self, event: &Value) -> Vec<ChatEvent> {
        let message_id = event["message"]["id"].as_str().unwrap_or("").to_string();
        let model = event["message"]["model"].as_str().map(String::from);
        vec![ChatEvent::MessageStart { message_id, model }]
    }

    fn parse_content_block_start(&mut self, event: &Value) -> Vec<ChatEvent> {
        let index = event["index"].as_u64().unwrap_or(0);
        let content_block = match event.get("content_block") {
            Some(cb) => cb,
            None => {
                tracing::warn!("content_block_start missing content_block field");
                return vec![];
            }
        };
        let block_type_str = content_block["type"].as_str().unwrap_or("");

        match block_type_str {
            "tool_use" => {
                let tool_use_id = content_block["id"].as_str().unwrap_or("").to_string();
                let tool_name = content_block["name"].as_str().unwrap_or("").to_string();
                self.index_to_tool_id.insert(index, tool_use_id.clone());
                vec![ChatEvent::ContentBlockStart {
                    index,
                    block_type: ContentBlockType::ToolUse,
                    tool_use_id: Some(tool_use_id),
                    tool_name: Some(tool_name),
                }]
            }
            "thinking" => {
                vec![ChatEvent::ContentBlockStart {
                    index,
                    block_type: ContentBlockType::Thinking,
                    tool_use_id: None,
                    tool_name: None,
                }]
            }
            "text" => {
                vec![ChatEvent::ContentBlockStart {
                    index,
                    block_type: ContentBlockType::Text,
                    tool_use_id: None,
                    tool_name: None,
                }]
            }
            other => {
                vec![ChatEvent::ContentBlockStart {
                    index,
                    block_type: ContentBlockType::Unknown(other.to_string()),
                    tool_use_id: None,
                    tool_name: None,
                }]
            }
        }
    }

    fn parse_content_block_delta(&mut self, event: &Value) -> Vec<ChatEvent> {
        let delta = match event.get("delta") {
            Some(d) => d,
            None => return vec![],
        };

        let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");

        match delta_type {
            "text_delta" => {
                let text = delta["text"].as_str().unwrap_or("").to_string();
                if text.is_empty() {
                    return vec![];
                }
                vec![ChatEvent::TextDelta { text }]
            }
            "thinking_delta" => {
                let text = delta
                    .get("thinking")
                    .or_else(|| delta.get("text"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if text.is_empty() {
                    return vec![];
                }
                vec![ChatEvent::ThinkingDelta { text }]
            }
            "signature_delta" => {
                let signature = delta["signature"].as_str().unwrap_or("").to_string();
                vec![ChatEvent::SignatureDelta { signature }]
            }
            "input_json_delta" => {
                let partial = delta["partial_json"].as_str().unwrap_or("").to_string();
                let index = event["index"].as_u64().unwrap_or(0);
                let tool_use_id = self
                    .index_to_tool_id
                    .get(&index)
                    .cloned()
                    .unwrap_or_else(|| format!("__unknown_index_{index}"));
                // Accumulate for potential full-json reconstruction
                self.tool_input_buf
                    .entry(tool_use_id.clone())
                    .or_default()
                    .push_str(&partial);
                vec![ChatEvent::ToolInputDelta {
                    tool_use_id,
                    json_delta: partial,
                }]
            }
            _ => vec![],
        }
    }

    fn parse_content_block_stop(&mut self, event: &Value) -> Vec<ChatEvent> {
        let index = event["index"].as_u64().unwrap_or(0);
        vec![ChatEvent::ContentBlockStop { index }]
    }

    fn parse_message_delta(&mut self, event: &Value) -> Vec<ChatEvent> {
        let usage = event.get("usage");
        vec![ChatEvent::MessageDelta {
            stop_reason: event["delta"]["stop_reason"].as_str().map(String::from),
            input_tokens: usage.and_then(|u| u["input_tokens"].as_u64()).unwrap_or(0),
            output_tokens: usage.and_then(|u| u["output_tokens"].as_u64()).unwrap_or(0),
            cache_read_input_tokens: usage
                .and_then(|u| u["cache_read_input_tokens"].as_u64())
                .unwrap_or(0),
            cache_creation_input_tokens: usage
                .and_then(|u| u["cache_creation_input_tokens"].as_u64())
                .unwrap_or(0),
        }]
    }

    // ── complete assistant message (summary, authoritative) ──

    fn parse_assistant(&mut self, value: &Value) -> Vec<ChatEvent> {
        let message = match value.get("message") {
            Some(m) => m,
            None => return vec![],
        };

        let message_id = message["id"].as_str().unwrap_or("").to_string();
        let model = message["model"].as_str().map(String::from);
        let stop_reason = message["stop_reason"].as_str().map(String::from);
        let usage = message.get("usage").map(parse_usage);

        let content = message.get("content").and_then(|c| c.as_array());
        let mut events = vec![];

        if let Some(blocks) = content {
            let total = blocks.len();
            for (i, block) in blocks.iter().enumerate() {
                let is_last = i == total - 1;
                let block_type = block["type"].as_str().unwrap_or("");
                let sr = if is_last { stop_reason.clone() } else { None };
                let u = if is_last { usage.clone() } else { None };
                match block_type {
                    "text" => {
                        let text = block["text"].as_str().unwrap_or("").to_string();
                        events.push(ChatEvent::AssistantMessage {
                            message_id: message_id.clone(),
                            model: model.clone(),
                            text: if text.is_empty() { None } else { Some(text) },
                            thinking_text: None,
                            thinking_signature: None,
                            tool_use_id: None,
                            tool_name: None,
                            tool_input: None,
                            stop_reason: sr,
                            usage: u,
                        });
                    }
                    "thinking" => {
                        let thinking = block
                            .get("thinking")
                            .or_else(|| block.get("text"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let signature = block["signature"].as_str().map(String::from);
                        events.push(ChatEvent::AssistantMessage {
                            message_id: message_id.clone(),
                            model: model.clone(),
                            text: None,
                            thinking_text: if thinking.is_empty() {
                                None
                            } else {
                                Some(thinking)
                            },
                            thinking_signature: signature,
                            tool_use_id: None,
                            tool_name: None,
                            tool_input: None,
                            stop_reason: sr,
                            usage: u,
                        });
                    }
                    "tool_use" => {
                        let tool_use_id = block["id"].as_str().unwrap_or("").to_string();
                        let tool_name = block["name"].as_str().unwrap_or("").to_string();
                        let tool_input = block.get("input").cloned();
                        events.push(ChatEvent::AssistantMessage {
                            message_id: message_id.clone(),
                            model: model.clone(),
                            text: None,
                            thinking_text: None,
                            thinking_signature: None,
                            tool_use_id: Some(tool_use_id),
                            tool_name: Some(tool_name),
                            tool_input,
                            stop_reason: sr,
                            usage: u,
                        });
                    }
                    _ => {}
                }
            }
        }

        // Emit metadata as a separate event if no content blocks
        // (or attach to the last one by re-reading from JSON)
        if events.is_empty() {
            let reason = message["stop_reason"].as_str().map(String::from);
            let u = message.get("usage").map(parse_usage);
            if reason.is_some() || u.is_some() {
                events.push(ChatEvent::AssistantMessage {
                    message_id: message_id.clone(),
                    model: model.clone(),
                    text: None,
                    thinking_text: None,
                    thinking_signature: None,
                    tool_use_id: None,
                    tool_name: None,
                    tool_input: None,
                    stop_reason: reason,
                    usage: u,
                });
            }
        }

        events
    }

    // ── user event (tool_result or echo) ──

    fn parse_user(&self, value: &Value) -> Vec<ChatEvent> {
        let message = value.get("message").unwrap_or(value);
        let content = message.get("content");

        // Check for tool_result in content array
        if let Some(arr) = content.and_then(|c| c.as_array()) {
            for block in arr {
                if block["type"].as_str() == Some("tool_result") {
                    let tool_use_id = block["tool_use_id"].as_str().unwrap_or("").to_string();
                    let result_content = &block["content"];
                    let output = extract_tool_output(result_content);
                    let is_error = block["is_error"].as_bool().unwrap_or(false);

                    // Extract structured tool_use_result fields
                    let tur = value.get("tool_use_result");
                    let interrupted = tur
                        .and_then(|r| r["interrupted"].as_bool())
                        .unwrap_or(false);
                    let exit_code = tur.and_then(|r| r["exitCode"].as_i64()).map(|v| v as i32);
                    let stdout = tur.and_then(|r| r["stdout"].as_str()).map(String::from);
                    let stderr = tur.and_then(|r| r["stderr"].as_str()).map(String::from);

                    return vec![ChatEvent::ToolResult {
                        tool_use_id,
                        output,
                        is_error,
                        interrupted,
                        exit_code,
                        stdout,
                        stderr,
                    }];
                }
            }
        }

        // User message echo (has uuid)
        if let Some(uuid) = value.get("uuid").and_then(|v| v.as_str()) {
            if !uuid.is_empty() {
                return vec![ChatEvent::UserMessageEcho {
                    uuid: uuid.to_string(),
                }];
            }
        }

        vec![]
    }

    // ── result (turn complete) ──

    fn parse_result(&self, value: &Value) -> Vec<ChatEvent> {
        let mut events = vec![];

        // Usage
        let usage = value.get("usage");
        if let Some(u) = usage {
            events.push(ChatEvent::UsageUpdate {
                input_tokens: u["input_tokens"].as_u64().unwrap_or(0),
                output_tokens: u["output_tokens"].as_u64().unwrap_or(0),
                cache_read_tokens: u["cache_read_input_tokens"].as_u64().unwrap_or(0),
                cache_write_tokens: u["cache_creation_input_tokens"].as_u64().unwrap_or(0),
                cost: value["total_cost_usd"].as_f64(),
                model_usage: value.get("modelUsage").cloned(),
            });
        }

        // Turn complete
        let error_val = value
            .get("errors")
            .and_then(|e| e.as_array())
            .and_then(|arr| arr.first().and_then(|e| e.as_str()).map(String::from));
        events.push(ChatEvent::TurnComplete {
            stop_reason: value["stop_reason"].as_str().map(String::from),
            error: error_val,
            is_error: value["is_error"].as_bool().unwrap_or(false),
            terminal_reason: value["terminal_reason"].as_str().map(String::from),
            duration_ms: value["duration_ms"].as_u64().unwrap_or(0),
            duration_api_ms: value["duration_api_ms"].as_u64().unwrap_or(0),
            num_turns: value["num_turns"].as_u64().unwrap_or(0),
        });

        events
    }

    // ── control_request ──

    fn parse_control_request(&self, value: &Value) -> Vec<ChatEvent> {
        let request = value.get("request").unwrap_or(value);
        let subtype = request["subtype"].as_str().unwrap_or("");
        let request_id = value["request_id"].as_str().unwrap_or("").to_string();

        match subtype {
            "can_use_tool" => {
                let tool_name = request["tool_name"].as_str().unwrap_or("").to_string();
                let tool_input = request.get("input").cloned();
                let suggestions = request["suggestions"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                vec![ChatEvent::PermissionRequest {
                    request_id,
                    tool_name,
                    tool_input,
                    suggestions,
                }]
            }
            "hook_callback" => {
                vec![ChatEvent::HookCallback {
                    request_id,
                    hook_name: request["hook_name"].as_str().unwrap_or("").to_string(),
                    hook_event: request["hook_event"].as_str().unwrap_or("").to_string(),
                    data: request.clone(),
                }]
            }
            "elicitation" => {
                vec![ChatEvent::ElicitationRequest {
                    request_id,
                    mcp_server: request["mcp_server"].as_str().unwrap_or("").to_string(),
                    message: request["message"].as_str().unwrap_or("").to_string(),
                    schema: request.get("schema").cloned(),
                }]
            }
            _ => {
                vec![ChatEvent::Raw {
                    raw_type: format!("control_request::{subtype}"),
                    data: value.clone(),
                }]
            }
        }
    }
}

// ── Helpers ──

fn parse_slash_commands(value: &Value) -> Vec<SlashCommandInfo> {
    value["slash_commands"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|cmd| {
                    if let Some(name) = cmd.as_str() {
                        Some(SlashCommandInfo {
                            name: name.to_string(),
                            description: None,
                            aliases: vec![],
                            is_skill: name.contains(':'),
                        })
                    } else if let Some(name) = cmd["name"].as_str() {
                        Some(SlashCommandInfo {
                            name: name.to_string(),
                            description: cmd["description"].as_str().map(String::from),
                            aliases: cmd["aliases"]
                                .as_array()
                                .map(|a| {
                                    a.iter()
                                        .filter_map(|v| v.as_str().map(String::from))
                                        .collect()
                                })
                                .unwrap_or_default(),
                            is_skill: cmd["is_skill"].as_bool().unwrap_or(false),
                        })
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_mcp_servers(value: &Value) -> Vec<McpServerInfo> {
    value["mcp_servers"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|s| McpServerInfo {
                    name: s["name"].as_str().unwrap_or("").to_string(),
                    status: s["status"].as_str().map(String::from),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_usage(value: &Value) -> MessageUsage {
    MessageUsage {
        input_tokens: value["input_tokens"].as_u64().unwrap_or(0),
        output_tokens: value["output_tokens"].as_u64().unwrap_or(0),
        cache_read_input_tokens: value["cache_read_input_tokens"].as_u64().unwrap_or(0),
        cache_creation_input_tokens: value["cache_creation_input_tokens"].as_u64().unwrap_or(0),
        service_tier: value["service_tier"].as_str().map(String::from),
    }
}

fn extract_tool_output(content: &Value) -> Option<String> {
    match content {
        Value::String(s) => Some(s.clone()),
        Value::Array(arr) => {
            let texts: Vec<_> = arr
                .iter()
                .filter_map(|block| {
                    if block["type"].as_str() == Some("text") {
                        block["text"].as_str().map(String::from)
                    } else {
                        None
                    }
                })
                .collect();
            if texts.is_empty() {
                None
            } else {
                Some(texts.join("\n"))
            }
        }
        _ => None,
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_system_init() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"system","subtype":"init","session_id":"sess_abc","model":"opus","tools":["Bash"],"claude_code_version":"2.1.153"}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::SessionInit {
                session_id,
                model,
                tools,
                cli_version,
                ..
            } => {
                assert_eq!(session_id, "sess_abc");
                assert_eq!(model.as_deref(), Some("opus"));
                assert_eq!(tools, &vec!["Bash".to_string()]);
                assert_eq!(cli_version.as_deref(), Some("2.1.153"));
            }
            _ => panic!("expected SessionInit, got {:?}", events[0]),
        }
    }

    #[test]
    fn parse_system_status() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"system","subtype":"status","status":"requesting"}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::SystemStatus { status } => assert_eq!(status, "requesting"),
            _ => panic!("expected SystemStatus"),
        }
    }

    #[test]
    fn parse_stream_event_envelope() {
        let mut p = ProtocolParser::new();
        // First: message_start
        let line1 = r#"{"type":"stream_event","event":{"type":"message_start","message":{"id":"msg_001","role":"assistant","model":"opus","content":[]}}}"#;
        let events = p.parse_line(line1);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::MessageStart { message_id, model } => {
                assert_eq!(message_id, "msg_001");
                assert_eq!(model.as_deref(), Some("opus"));
            }
            _ => panic!("expected MessageStart"),
        }
    }

    #[test]
    fn parse_text_delta() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hello"}}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::TextDelta { text } => assert_eq!(text, "Hello"),
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_thinking_delta() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ThinkingDelta { text } => assert_eq!(text, "Let me think..."),
            _ => panic!("expected ThinkingDelta"),
        }
    }

    #[test]
    fn parse_tool_use_start() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"tu_abc","name":"Bash"}}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ContentBlockStart {
                index,
                block_type,
                tool_use_id,
                tool_name,
            } => {
                assert_eq!(*index, 2);
                assert_eq!(*block_type, ContentBlockType::ToolUse);
                assert_eq!(tool_use_id.as_deref(), Some("tu_abc"));
                assert_eq!(tool_name.as_deref(), Some("Bash"));
            }
            _ => panic!("expected ContentBlockStart"),
        }
    }

    #[test]
    fn parse_input_json_delta() {
        let mut p = ProtocolParser::new();
        // First register the tool index
        p.parse_line(r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_abc","name":"Bash"}}}"#);
        // Then parse the delta
        let events = p.parse_line(r#"{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"cmd\":\"ls\"}"}}}"#);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ToolInputDelta {
                tool_use_id,
                json_delta,
            } => {
                assert_eq!(tool_use_id, "tu_abc");
                assert_eq!(json_delta, r#"{"cmd":"ls"}"#);
            }
            _ => panic!("expected ToolInputDelta"),
        }
    }

    #[test]
    fn parse_tool_result() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_abc","content":"output text","is_error":false}]},"tool_use_result":{"stdout":"output text","stderr":"","interrupted":false,"exitCode":0}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ToolResult {
                tool_use_id,
                output,
                is_error,
                stdout,
                exit_code,
                ..
            } => {
                assert_eq!(tool_use_id, "tu_abc");
                assert_eq!(output.as_deref(), Some("output text"));
                assert!(!is_error);
                assert_eq!(stdout.as_deref(), Some("output text"));
                assert_eq!(*exit_code, Some(0));
            }
            _ => panic!("expected ToolResult"),
        }
    }

    #[test]
    fn parse_result_with_usage() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"result","stop_reason":"end_turn","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":80,"cache_creation_input_tokens":20},"total_cost_usd":0.003,"duration_ms":1234,"num_turns":1,"is_error":false,"terminal_reason":"completed"}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 2);
        match &events[0] {
            ChatEvent::UsageUpdate {
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_write_tokens,
                cost,
                ..
            } => {
                assert_eq!(*input_tokens, 100);
                assert_eq!(*output_tokens, 50);
                assert_eq!(*cache_read_tokens, 80);
                assert_eq!(*cache_write_tokens, 20);
                assert_eq!(*cost, Some(0.003));
            }
            _ => panic!("expected UsageUpdate"),
        }
        match &events[1] {
            ChatEvent::TurnComplete {
                stop_reason,
                duration_ms,
                ..
            } => {
                assert_eq!(stop_reason.as_deref(), Some("end_turn"));
                assert_eq!(*duration_ms, 1234);
            }
            _ => panic!("expected TurnComplete"),
        }
    }

    #[test]
    fn parse_control_request_permission() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"control_request","request_id":"req_abc","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -rf ./build"},"suggestions":[]}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::PermissionRequest {
                request_id,
                tool_name,
                ..
            } => {
                assert_eq!(request_id, "req_abc");
                assert_eq!(tool_name, "Bash");
            }
            _ => panic!("expected PermissionRequest"),
        }
    }

    #[test]
    fn parse_invalid_json_returns_empty() {
        let mut p = ProtocolParser::new();
        let events = p.parse_line("not json at all");
        assert!(events.is_empty());
    }

    #[test]
    fn parse_empty_line() {
        let mut p = ProtocolParser::new();
        assert!(p.parse_line("").is_empty());
        assert!(p.parse_line("   ").is_empty());
    }

    #[test]
    fn parse_unknown_event_becomes_raw() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"future_feature","data":42}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::Raw { raw_type, data } => {
                assert_eq!(raw_type, "future_feature");
                assert!(data.is_object());
            }
            _ => panic!("expected Raw"),
        }
    }

    #[test]
    fn parse_assistant_message_thinking_and_text() {
        let mut p = ProtocolParser::new();
        // Thinking block first
        p.parse_line(r#"{"type":"assistant","message":{"id":"msg_001","role":"assistant","model":"opus","content":[{"type":"thinking","thinking":"let me think","signature":"msg_001"}]}}"#);
        // Text block second (with stop_reason + usage)
        let line2 = r#"{"type":"assistant","message":{"id":"msg_001","role":"assistant","model":"opus","content":[{"type":"text","text":"Here is the answer"}],"stop_reason":"end_turn","usage":{"input_tokens":100,"output_tokens":50}}}"#;
        let events = p.parse_line(line2);
        assert!(!events.is_empty());
        // The first should be the text
        match &events[0] {
            ChatEvent::AssistantMessage { text, .. } => {
                assert_eq!(text.as_deref(), Some("Here is the answer"));
            }
            _ => panic!("expected AssistantMessage with text"),
        }
    }

    #[test]
    fn parse_assistant_message_tool_use() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"assistant","message":{"id":"msg_002","role":"assistant","model":"opus","content":[{"type":"tool_use","id":"tu_123","name":"Bash","input":{"command":"ls -la"}}]}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::AssistantMessage {
                tool_use_id,
                tool_name,
                tool_input,
                ..
            } => {
                assert_eq!(tool_use_id.as_deref(), Some("tu_123"));
                assert_eq!(tool_name.as_deref(), Some("Bash"));
                assert!(tool_input.is_some());
            }
            _ => panic!("expected AssistantMessage with tool_use"),
        }
    }

    #[test]
    fn parse_content_block_stop() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_stop","index":0}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ContentBlockStop { index } => assert_eq!(*index, 0),
            _ => panic!("expected ContentBlockStop"),
        }
    }

    #[test]
    fn parse_message_delta() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":80,"cache_creation_input_tokens":20}}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::MessageDelta { stop_reason, input_tokens, output_tokens, .. } => {
                assert_eq!(stop_reason.as_deref(), Some("end_turn"));
                assert_eq!(*input_tokens, 100);
                assert_eq!(*output_tokens, 50);
            }
            _ => panic!("expected MessageDelta"),
        }
    }

    #[test]
    fn parse_signature_delta() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig_abc"}}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::SignatureDelta { signature } => assert_eq!(signature, "sig_abc"),
            _ => panic!("expected SignatureDelta"),
        }
    }

    #[test]
    fn parse_user_message_echo() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"user","uuid":"echo-001","message":{"role":"user","content":"hello"}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::UserMessageEcho { uuid } => assert_eq!(uuid, "echo-001"),
            _ => panic!("expected UserMessageEcho"),
        }
    }

    #[test]
    fn parse_hook_callback() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"control_request","request_id":"hook-001","request":{"subtype":"hook_callback","hook_name":"PreToolUse","hook_event":"Bash","command":"/test.sh"}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::HookCallback { request_id, hook_name, .. } => {
                assert_eq!(request_id, "hook-001");
                assert_eq!(hook_name, "PreToolUse");
            }
            _ => panic!("expected HookCallback"),
        }
    }

    #[test]
    fn parse_elicitation_request() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"control_request","request_id":"el-001","request":{"subtype":"elicitation","mcp_server":"test-srv","message":"Choose option"}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ElicitationRequest { request_id, mcp_server, .. } => {
                assert_eq!(request_id, "el-001");
                assert_eq!(mcp_server, "test-srv");
            }
            _ => panic!("expected ElicitationRequest"),
        }
    }

    #[test]
    fn parse_unknown_delta_type_is_filtered() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"future_delta_type","data":"x"}}}"#;
        let events = p.parse_line(line);
        assert!(events.is_empty());
    }

    #[test]
    fn parse_stream_event_missing_inner() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event"}"#;
        let events = p.parse_line(line);
        assert!(events.is_empty());
    }

    #[test]
    fn parse_assistant_no_message_field() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"assistant"}"#;
        let events = p.parse_line(line);
        assert!(events.is_empty());
    }

    #[test]
    fn parse_control_request_unknown_subtype() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"control_request","request_id":"r1","request":{"subtype":"future_control","data":42}}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::Raw { raw_type, .. } => assert!(raw_type.contains("future_control")),
            _ => panic!("expected Raw"),
        }
    }

    #[test]
    fn parse_system_unknown_subtype() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"system","subtype":"future_subtype","data":42}"#;
        let events = p.parse_line(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::Raw { raw_type, .. } => assert!(raw_type.contains("future_subtype")),
            _ => panic!("expected Raw"),
        }
    }

    #[test]
    fn parse_content_block_start_text() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}}"#;
        let events = p.parse_line(line);
        match &events[0] {
            ChatEvent::ContentBlockStart { block_type, .. } => {
                assert_eq!(*block_type, ContentBlockType::Text);
            }
            _ => panic!("expected ContentBlockStart for text"),
        }
    }

    #[test]
    fn parse_content_block_start_thinking() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}}"#;
        let events = p.parse_line(line);
        match &events[0] {
            ChatEvent::ContentBlockStart { block_type, .. } => {
                assert_eq!(*block_type, ContentBlockType::Thinking);
            }
            _ => panic!("expected ContentBlockStart for thinking"),
        }
    }

    #[test]
    fn parse_content_block_start_unknown_type() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_start","index":5,"content_block":{"type":"future_block"}}}"#;
        let events = p.parse_line(line);
        match &events[0] {
            ChatEvent::ContentBlockStart { block_type, .. } => {
                assert!(matches!(block_type, ContentBlockType::Unknown(_)));
            }
            _ => panic!("expected ContentBlockStart for unknown"),
        }
    }

    #[test]
    fn parse_content_block_start_missing_content_block() {
        let mut p = ProtocolParser::new();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_start","index":0}}"#;
        let events = p.parse_line(line);
        assert!(events.is_empty());
    }
}
