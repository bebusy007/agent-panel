use crate::conversation::types::ChatEvent;
use serde_json::Value;

/// Parse a single JSON line from Claude CLI stdout into zero or more ChatEvents.
///
/// The CLI outputs newline-delimited JSON objects. Each line may produce
/// 0, 1, or multiple events (e.g., a `result` line produces both UsageUpdate
/// and TurnComplete).
pub fn parse_stream_event(line: &str) -> Vec<ChatEvent> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return vec![];
    }

    let value: Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(line = trimmed, error = %e, "Failed to parse CLI JSON line");
            return vec![];
        }
    };

    let event_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match event_type {
        "system" => parse_system(&value),
        "content_block_start" => parse_content_block_start(&value),
        "content_block_delta" => parse_content_block_delta(&value),
        "content_block_stop" => parse_content_block_stop(&value),
        "assistant" => parse_assistant(&value),
        "user" => parse_user(&value),
        "result" => parse_result(&value),
        "" => {
            tracing::debug!("Skipping CLI line with empty type");
            vec![]
        }
        _ => {
            // Check if it's a stream_event envelope wrapping an inner event
            if let Some(inner) = value.get("event") {
                return parse_stream_event(&inner.to_string());
            }
            // Check for control_request at top level
            if event_type == "control_request" {
                return parse_control_request(&value);
            }
            tracing::debug!(event_type, "Unknown CLI event type, emitting Raw");
            vec![ChatEvent::Raw { data: value }]
        }
    }
}

fn parse_system(value: &Value) -> Vec<ChatEvent> {
    let subtype = value
        .get("subtype")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if subtype == "init" {
        let session_id = value
            .get("session_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let model = value.get("model").and_then(|v| v.as_str()).map(String::from);

        let slash_commands = value
            .get("slash_commands")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|cmd| {
                        serde_json::from_value(cmd.clone()).ok()
                    })
                    .collect()
            })
            .unwrap_or_default();

        vec![ChatEvent::SessionInit {
            session_id,
            model,
            slash_commands,
        }]
    } else {
        vec![ChatEvent::Raw {
            data: value.clone(),
        }]
    }
}

fn parse_content_block_start(value: &Value) -> Vec<ChatEvent> {
    let content_block = value.get("content_block").unwrap_or(value);
    let block_type = content_block
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match block_type {
        "tool_use" => {
            let tool_use_id = content_block
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_name = content_block
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            vec![ChatEvent::ToolUseStart {
                tool_use_id,
                tool_name,
            }]
        }
        _ => vec![],
    }
}

fn parse_content_block_delta(value: &Value) -> Vec<ChatEvent> {
    let delta = match value.get("delta") {
        Some(d) => d,
        None => return vec![],
    };

    let delta_type = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match delta_type {
        "text_delta" => {
            let text = delta
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if text.is_empty() {
                vec![]
            } else {
                vec![ChatEvent::TextDelta { text }]
            }
        }
        "thinking_delta" => {
            let text = delta
                .get("thinking")
                .or_else(|| delta.get("text"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if text.is_empty() {
                vec![]
            } else {
                vec![ChatEvent::ThinkingDelta { text }]
            }
        }
        "input_json_delta" => {
            let json_delta = delta
                .get("partial_json")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            // We need the tool_use_id from the index mapping, but since
            // stream-json doesn't always include it inline, we use the index.
            // For now we pass the index as a string; the caller accumulates.
            let index = value
                .get("index")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            vec![ChatEvent::ToolInputDelta {
                tool_use_id: format!("__index_{}", index),
                json_delta,
            }]
        }
        _ => vec![],
    }
}

fn parse_content_block_stop(value: &Value) -> Vec<ChatEvent> {
    let index = value.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
    vec![ChatEvent::ToolUseEnd {
        tool_use_id: format!("__index_{}", index),
    }]
}

fn parse_assistant(value: &Value) -> Vec<ChatEvent> {
    let mut events = vec![];
    let message = match value.get("message") {
        Some(m) => m,
        None => {
            return vec![ChatEvent::Raw { data: value.clone() }];
        }
    };

    let message_id = message
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Extract content blocks from the complete assistant message
    if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
        for block in content {
            let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match block_type {
                "text" => {
                    if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                        if !text.is_empty() {
                            events.push(ChatEvent::TextDelta {
                                text: text.to_string(),
                            });
                        }
                    }
                }
                "thinking" => {
                    if let Some(thinking) = block.get("thinking").and_then(|t| t.as_str()) {
                        if !thinking.is_empty() {
                            events.push(ChatEvent::ThinkingDelta {
                                text: thinking.to_string(),
                            });
                        }
                    }
                }
                "tool_use" => {
                    let tool_use_id = block
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let tool_name = block
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    events.push(ChatEvent::ToolUseStart {
                        tool_use_id: tool_use_id.clone(),
                        tool_name,
                    });
                    // If input is present (complete message), add it as delta
                    if let Some(input) = block.get("input") {
                        let input_str = serde_json::to_string(input).unwrap_or_default();
                        events.push(ChatEvent::ToolInputDelta {
                            tool_use_id: tool_use_id.clone(),
                            json_delta: input_str,
                        });
                        events.push(ChatEvent::ToolUseEnd { tool_use_id });
                    }
                }
                _ => {}
            }
        }
    }

    events.push(ChatEvent::AssistantMessage { message_id });
    events
}

fn parse_user(value: &Value) -> Vec<ChatEvent> {
    let message = value.get("message").unwrap_or(value);
    let content = message.get("content");

    // Check if this is a tool_result message
    if let Some(content_arr) = content.and_then(|c| c.as_array()) {
        for block in content_arr {
            if block.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                let tool_use_id = block
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let output = block
                    .get("content")
                    .and_then(|c| {
                        if let Some(s) = c.as_str() {
                            Some(s.to_string())
                        } else if let Some(arr) = c.as_array() {
                            arr.iter()
                                .find_map(|b| {
                                    if b.get("type").and_then(|t| t.as_str()) == Some("text") {
                                        b.get("text").and_then(|t| t.as_str()).map(String::from)
                                    } else {
                                        None
                                    }
                                })
                        } else {
                            None
                        }
                    });
                let is_error = block
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                return vec![ChatEvent::ToolResult {
                    tool_use_id,
                    output,
                    is_error,
                }];
            }
        }
    }

    // Regular user message echo
    let uuid = value
        .get("uuid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if !uuid.is_empty() {
        vec![ChatEvent::UserMessageEcho { uuid }]
    } else {
        vec![]
    }
}

fn parse_result(value: &Value) -> Vec<ChatEvent> {
    let mut events = vec![];

    // Extract usage
    if let Some(usage) = value.get("usage") {
        let input_tokens = usage
            .get("input_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let output_tokens = usage
            .get("output_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let cache_read_tokens = usage
            .get("cache_read_input_tokens")
            .or_else(|| usage.get("cache_read_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let cache_write_tokens = usage
            .get("cache_creation_input_tokens")
            .or_else(|| usage.get("cache_write_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let cost = value
            .get("cost")
            .or_else(|| value.get("cost_usd"))
            .and_then(|v| v.as_f64());
        let model_usage = value.get("model_usage").cloned();

        events.push(ChatEvent::UsageUpdate {
            input_tokens,
            output_tokens,
            cache_read_tokens,
            cache_write_tokens,
            cost,
            model_usage,
        });
    }

    // TurnComplete
    let stop_reason = value
        .get("stop_reason")
        .and_then(|v| v.as_str())
        .map(String::from);
    let error = value
        .get("error")
        .and_then(|v| {
            if let Some(s) = v.as_str() {
                Some(s.to_string())
            } else if v.is_object() {
                v.get("message").and_then(|m| m.as_str()).map(String::from)
            } else {
                None
            }
        });

    events.push(ChatEvent::TurnComplete { stop_reason, error });
    events
}

fn parse_control_request(value: &Value) -> Vec<ChatEvent> {
    let request_id = value
        .get("request_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let request = value.get("request").unwrap_or(value);
    let subtype = request
        .get("subtype")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match subtype {
        "can_use_tool" => {
            let tool_name = request
                .get("tool_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_input = request.get("input").cloned();
            let suggestions = request
                .get("suggestions")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            vec![ChatEvent::PermissionRequest {
                request_id,
                tool_name,
                tool_input,
                suggestions,
            }]
        }
        _ => vec![ChatEvent::Raw {
            data: value.clone(),
        }],
    }
}

/// Stateful protocol parser that tracks tool_use_id ↔ index mapping.
///
/// Since `content_block_delta` and `content_block_stop` only carry an `index`
/// field (not tool_use_id), we need to maintain the mapping from index →
/// tool_use_id established in `content_block_start`.
pub struct ProtocolParser {
    /// Maps content block index → tool_use_id
    index_to_tool_id: std::collections::HashMap<u64, String>,
}

impl ProtocolParser {
    pub fn new() -> Self {
        Self {
            index_to_tool_id: std::collections::HashMap::new(),
        }
    }

    /// Parse a line and return events with resolved tool_use_ids.
    pub fn parse_line(&mut self, line: &str) -> Vec<ChatEvent> {
        let events = parse_stream_event(line);

        events
            .into_iter()
            .map(|ev| self.resolve_tool_ids(ev, line))
            .collect()
    }

    fn resolve_tool_ids(&mut self, event: ChatEvent, raw_line: &str) -> ChatEvent {
        match event {
            ChatEvent::ToolUseStart {
                ref tool_use_id, ..
            } => {
                // Register index → tool_use_id from the raw line
                if let Ok(value) = serde_json::from_str::<Value>(raw_line.trim()) {
                    if let Some(index) = value.get("index").and_then(|v| v.as_u64()) {
                        self.index_to_tool_id
                            .insert(index, tool_use_id.clone());
                    }
                }
                event
            }
            ChatEvent::ToolInputDelta {
                tool_use_id,
                json_delta,
            } if tool_use_id.starts_with("__index_") => {
                let resolved = self.resolve_index_id(&tool_use_id);
                ChatEvent::ToolInputDelta {
                    tool_use_id: resolved,
                    json_delta,
                }
            }
            ChatEvent::ToolUseEnd { tool_use_id } if tool_use_id.starts_with("__index_") => {
                let resolved = self.resolve_index_id(&tool_use_id);
                ChatEvent::ToolUseEnd {
                    tool_use_id: resolved,
                }
            }
            other => other,
        }
    }

    fn resolve_index_id(&self, placeholder: &str) -> String {
        let index_str = placeholder.strip_prefix("__index_").unwrap_or("0");
        let index: u64 = index_str.parse().unwrap_or(0);
        self.index_to_tool_id
            .get(&index)
            .cloned()
            .unwrap_or_else(|| format!("unknown_{}", index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_system_init() {
        let line = r#"{"type":"system","subtype":"init","session_id":"sess_abc","model":"claude-sonnet-4-20250514"}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::SessionInit {
                session_id, model, ..
            } => {
                assert_eq!(session_id, "sess_abc");
                assert_eq!(model.as_deref(), Some("claude-sonnet-4-20250514"));
            }
            _ => panic!("expected SessionInit"),
        }
    }

    #[test]
    fn parse_text_delta() {
        let line = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::TextDelta { text } => assert_eq!(text, "Hello"),
            _ => panic!("expected TextDelta"),
        }
    }

    #[test]
    fn parse_thinking_delta() {
        let line = r#"{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ThinkingDelta { text } => assert_eq!(text, "Let me think..."),
            _ => panic!("expected ThinkingDelta"),
        }
    }

    #[test]
    fn parse_tool_use_start() {
        let line = r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_abc","name":"Bash"}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ToolUseStart {
                tool_use_id,
                tool_name,
            } => {
                assert_eq!(tool_use_id, "tu_abc");
                assert_eq!(tool_name, "Bash");
            }
            _ => panic!("expected ToolUseStart"),
        }
    }

    #[test]
    fn parse_input_json_delta() {
        let line = r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"cmd\":\"ls\"}"}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ToolInputDelta {
                tool_use_id,
                json_delta,
            } => {
                assert_eq!(tool_use_id, "__index_1");
                assert_eq!(json_delta, r#"{"cmd":"ls"}"#);
            }
            _ => panic!("expected ToolInputDelta"),
        }
    }

    #[test]
    fn parse_tool_result() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_abc","content":"output text","is_error":false}]}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ToolResult {
                tool_use_id,
                output,
                is_error,
            } => {
                assert_eq!(tool_use_id, "tu_abc");
                assert_eq!(output.as_deref(), Some("output text"));
                assert!(!is_error);
            }
            _ => panic!("expected ToolResult"),
        }
    }

    #[test]
    fn parse_result_with_usage() {
        let line = r#"{"type":"result","stop_reason":"end_turn","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":80,"cache_creation_input_tokens":20},"cost_usd":0.003}"#;
        let events = parse_stream_event(line);
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
                stop_reason, error, ..
            } => {
                assert_eq!(stop_reason.as_deref(), Some("end_turn"));
                assert!(error.is_none());
            }
            _ => panic!("expected TurnComplete"),
        }
    }

    #[test]
    fn parse_control_request_permission() {
        let line = r#"{"type":"control_request","request_id":"req_abc","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -rf ./build"},"suggestions":[]}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::PermissionRequest {
                request_id,
                tool_name,
                tool_input,
                suggestions,
            } => {
                assert_eq!(request_id, "req_abc");
                assert_eq!(tool_name, "Bash");
                assert!(tool_input.is_some());
                assert!(suggestions.is_empty());
            }
            _ => panic!("expected PermissionRequest"),
        }
    }

    #[test]
    fn parse_unknown_event_becomes_raw() {
        let line = r#"{"type":"some_future_event","data":42}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        assert!(matches!(&events[0], ChatEvent::Raw { .. }));
    }

    #[test]
    fn parse_invalid_json_returns_empty() {
        let events = parse_stream_event("not json at all");
        assert!(events.is_empty());
    }

    #[test]
    fn parse_empty_line_returns_empty() {
        let events = parse_stream_event("");
        assert!(events.is_empty());
        let events = parse_stream_event("   ");
        assert!(events.is_empty());
    }

    #[test]
    fn protocol_parser_resolves_tool_ids() {
        let mut parser = ProtocolParser::new();

        // ToolUseStart registers index 1 → "tu_abc"
        let start_line = r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu_abc","name":"Bash"}}"#;
        let events = parser.parse_line(start_line);
        assert_eq!(events.len(), 1);

        // ToolInputDelta with index 1 should resolve to "tu_abc"
        let delta_line = r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"x\":1}"}}"#;
        let events = parser.parse_line(delta_line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ToolInputDelta { tool_use_id, .. } => {
                assert_eq!(tool_use_id, "tu_abc");
            }
            _ => panic!("expected ToolInputDelta"),
        }

        // ToolUseEnd with index 1 should also resolve
        let stop_line = r#"{"type":"content_block_stop","index":1}"#;
        let events = parser.parse_line(stop_line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::ToolUseEnd { tool_use_id } => {
                assert_eq!(tool_use_id, "tu_abc");
            }
            _ => panic!("expected ToolUseEnd"),
        }
    }

    #[test]
    fn parse_assistant_message() {
        let line = r#"{"type":"assistant","message":{"id":"msg_001","role":"assistant","content":[]}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::AssistantMessage { message_id } => {
                assert_eq!(message_id, "msg_001");
            }
            _ => panic!("expected AssistantMessage"),
        }
    }

    #[test]
    fn parse_user_message_echo() {
        let line = r#"{"type":"user","uuid":"550e8400-e29b-41d4-a716-446655440000","message":{"role":"user","content":"hello"}}"#;
        let events = parse_stream_event(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            ChatEvent::UserMessageEcho { uuid } => {
                assert_eq!(uuid, "550e8400-e29b-41d4-a716-446655440000");
            }
            _ => panic!("expected UserMessageEcho"),
        }
    }
}
