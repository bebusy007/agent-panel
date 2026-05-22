//! Session message loader — loads all messages from a session JSONL file.
//! This is the core of GET /api/sessions/:id — parses every line into a structured Message.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    pub index: u32,
    pub media_type: String,
    pub source_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_use_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Vec<ImageMeta>>,
    /// Raw JSON entry for the "raw view" toggle in the UI.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<serde_json::Value>,
    /// Agent hash from toolUseResult.agentId for precise subagent matching.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_hash: Option<String>,
}

/// Load all messages from a session JSONL file.
pub fn load_messages(file_path: &Path) -> Result<Vec<Message>, String> {
    let file = fs::File::open(file_path).map_err(|e| format!("open: {e}"))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();
    let mut idx = 0u32;
    // Accumulate thinking from thinking-only assistant entries to attach to the next text assistant
    let mut pending_thinking: Option<String> = None;

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.is_empty() {
            continue;
        }

        let entry: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if msg_type.is_empty() || msg_type == "file-history-snapshot" {
            // Cursor format: {"role": "user"|"assistant", "message": {"content": [...]}}
            if let Some(role) = entry.get("role").and_then(|v| v.as_str()) {
                let cursor_msgs = parse_cursor_entry(&entry, role, &mut idx);
                messages.extend(cursor_msgs);
            }
            continue;
        }

        let uuid = entry.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
        let timestamp = entry.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string());

        // Codex format: {"type":"event_msg"|"response_item", "payload":{...}, "timestamp":"..."}
        if matches!(msg_type, "event_msg" | "response_item") {
            if let Some(codex_msgs) = parse_codex_entry(&entry, msg_type, &timestamp, &mut idx) {
                messages.extend(codex_msgs);
            }
            continue;
        }

        // Non-message metadata entries → emit as role="meta"
        if !matches!(msg_type, "user" | "assistant" | "tool_use" | "tool_result" | "system") {
            idx += 1;
            let meta_text = extract_meta_summary(msg_type, &entry);
            messages.push(Message {
                id: format!("{}-{}", uuid, idx),
                role: "meta".to_string(),
                text: Some(meta_text),
                tool_name: Some(msg_type.to_string()),
                tool_input: None,
                tool_output: None,
                tool_use_id: None,
                tool_status: None,
                timestamp: timestamp.clone(),
                model: None,
                images: None,
                raw: Some(entry.clone()),
                agent_hash: None,
                thinking_text: None,
            });
            continue;
        }

        // System entries: prioritize content — if there's readable text,
        // keep as system message regardless of subtype. Only treat as
        // meta when there's no user-facing content.
        if msg_type == "system" {
            let content_text = entry.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let subtype = entry.get("subtype").and_then(|v| v.as_str());

            if !content_text.is_empty() {
                // Has content (recap, away_summary with text, etc.) — real system message
                idx += 1;
                messages.push(Message {
                    id: format!("{}-{}", uuid, idx),
                    role: "system".to_string(),
                    text: Some(content_text.to_string()),
                    tool_name: subtype.map(|s| s.to_string()),
                    tool_input: None,
                    tool_output: None,
                    tool_use_id: None,
                    tool_status: None,
                    timestamp: timestamp.clone(),
                    model: None,
                    images: None,
                    raw: Some(entry.clone()),
                    agent_hash: None,
                    thinking_text: None,
                });
                continue;
            }

            // No content — telemetry/metadata (turn_duration, etc.)
            let summary = match subtype {
                Some(st) => {
                    let duration = entry.get("durationMs").and_then(|v| v.as_u64());
                    let msg_count = entry.get("messageCount").and_then(|v| v.as_u64());
                    match (duration, msg_count) {
                        (Some(d), Some(c)) => format!("system/{st}: {c} msgs, {:.1}s", d as f64 / crate::constants::MS_PER_SECOND),
                        _ => format!("system/{st}"),
                    }
                }
                None => "system".to_string(),
            };
            idx += 1;
            messages.push(Message {
                id: format!("{}-{}", uuid, idx),
                role: "meta".to_string(),
                text: Some(summary),
                tool_name: Some(format!("system{}", subtype.map(|s| format!("/{s}")).unwrap_or_default())),
                tool_input: None,
                tool_output: None,
                tool_use_id: None,
                tool_status: None,
                timestamp: timestamp.clone(),
                model: None,
                images: None,
                raw: Some(entry.clone()),
                agent_hash: None,
                thinking_text: None,
            });
            continue;
        }

        let message_obj = entry.get("message");
        let content = message_obj.and_then(|m| m.get("content"));
        let model = message_obj.and_then(|m| m.get("model")).and_then(|v| v.as_str()).map(|s| s.to_string());

        // Extract content blocks
        let blocks = extract_blocks(content);

        if blocks.is_empty() {
            // Check if this is a thinking-only assistant (content is an
            // array of only thinking blocks with empty text).
            if msg_type == "assistant" && is_thinking_only(content) {
                idx += 1;
                messages.push(Message {
                    id: format!("{}-{}", uuid, idx),
                    role: "assistant".to_string(),
                    text: Some("(thinking)".to_string()),
                    timestamp: timestamp.clone(),
                    model: model.clone(),
                    raw: Some(entry.clone()),
                    ..Default::default()
                });
                continue;
            }

            let text = match content {
                Some(serde_json::Value::String(s)) => Some(s.clone()),
                _ => None,
            };

            // Skip assistant entries with no content at all
            if msg_type == "assistant" && text.is_none() {
                continue;
            }

            idx += 1;
            messages.push(Message {
                id: format!("{}-{}", uuid, idx),
                role: msg_type.to_string(),
                text,
                tool_name: None,
                tool_input: None,
                tool_output: None,
                tool_use_id: None,
                tool_status: None,
                timestamp: timestamp.clone(),
                model: model.clone(),
                images: None,
                raw: Some(entry.clone()),
                agent_hash: None,
                thinking_text: None,
            });
            continue;
        }

        // Check if this entry is a pure image-source-path entry:
        // all text blocks are just `[Image: source: /path]` lines.
        // If so, back-fill paths onto the preceding message's images
        // and skip creating new Messages.
        let all_paths: Vec<String> = blocks.iter()
            .filter_map(|b| match b { ContentBlock::Text(t) => Some(t.as_str()), _ => None })
            .flat_map(|t| extract_image_source_paths(t))
            .collect();
        let text_blocks: Vec<&str> = blocks.iter()
            .filter_map(|b| match b { ContentBlock::Text(t) => Some(t.as_str()), _ => None })
            .collect();
        let is_pure_image_ref_entry = !text_blocks.is_empty()
            && !all_paths.is_empty()
            && text_blocks.iter().all(|t| t.trim().starts_with("[Image: source:") && t.trim().ends_with(']'));

        if is_pure_image_ref_entry {
            // Back-fill cache_path onto the most recent message that has images
            for msg in messages.iter_mut().rev() {
                if let Some(ref mut imgs) = msg.images {
                    for (i, path) in all_paths.iter().enumerate() {
                        if let Some(img) = imgs.get_mut(i) {
                            img.cache_path = Some(path.clone());
                        }
                    }
                    break;
                }
            }
            continue;
        }

        // Multiple blocks: emit one Message per block.
        // Image blocks are back-filled onto the most recently emitted
        // Message (typically the preceding Text block).
        let agent_hash_from_entry: Option<String> = entry.get("toolUseResult")
            .and_then(|tur| tur.get("agentId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let mut image_counter: u32 = 0;
        // Collect [Image: source:] paths from text blocks for cache_path
        let image_source_paths: Vec<String> = all_paths;

        // For assistant messages: collect thinking text to attach to the text message
        let mut collected_thinking: Option<String> = None;
        if msg_type == "assistant" {
            for block in &blocks {
                if let ContentBlock::Thinking(t) = block {
                    collected_thinking = Some(match collected_thinking {
                        Some(existing) => format!("{}\n{}", existing, t),
                        None => t.clone(),
                    });
                }
            }
        }

        // Check if this is a thinking-only assistant (no text/tool blocks)
        let has_non_thinking = blocks.iter().any(|b| !matches!(b, ContentBlock::Thinking(_)));
        if msg_type == "assistant" && !has_non_thinking && collected_thinking.is_some() {
            // Store thinking for the next text-assistant message
            pending_thinking = collected_thinking;
            continue;
        }

        // If we have pending thinking from a previous entry, attach it
        if msg_type == "assistant" && has_non_thinking && pending_thinking.is_some() {
            collected_thinking = match collected_thinking {
                Some(ct) => Some(format!("{}\n{}", pending_thinking.take().unwrap(), ct)),
                None => pending_thinking.take(),
            };
        }

        for block in blocks {
            match block {
                ContentBlock::Image { media_type, source_type } => {
                    let meta = ImageMeta {
                        index: image_counter,
                        media_type,
                        source_type,
                        cache_path: image_source_paths.get(image_counter as usize).cloned(),
                        file_path: None,
                    };
                    image_counter += 1;
                    if let Some(last) = messages.last_mut() {
                        last.images.get_or_insert_with(Vec::new).push(meta);
                    }
                }
                ContentBlock::Thinking(_) => {
                    // Already collected above, will be attached to the text message
                }
                ContentBlock::Text(text) => {
                    idx += 1;
                    let id = format!("{}-b{}", uuid, idx);
                    let role = if msg_type == "user" { "user" } else { "assistant" };
                    let cursor_images: Vec<ImageMeta> = parse_cursor_image_refs(&text)
                        .into_iter()
                        .map(|mut img| { img.index = { let i = image_counter; image_counter += 1; i }; img })
                        .collect();
                    let images = if cursor_images.is_empty() { None } else { Some(cursor_images) };
                    messages.push(Message {
                        id,
                        role: role.to_string(),
                        text: Some(text),
                        thinking_text: collected_thinking.take(),
                        images,
                        timestamp: timestamp.clone(),
                        model: model.clone(),
                        ..Default::default()
                    });
                }
                ContentBlock::ToolUse { name, input, tool_use_id } => {
                    idx += 1;
                    let id = format!("{}-b{}", uuid, idx);
                    messages.push(Message {
                        id,
                        role: "tool_use".to_string(),
                        tool_name: Some(name),
                        tool_input: Some(input),
                        tool_use_id: Some(tool_use_id),
                        timestamp: timestamp.clone(),
                        model: model.clone(),
                        ..Default::default()
                    });
                }
                ContentBlock::ToolResult { content, tool_use_id, is_error } => {
                    idx += 1;
                    let id = format!("{}-b{}", uuid, idx);
                    messages.push(Message {
                        id,
                        role: "tool_result".to_string(),
                        tool_output: Some(content),
                        tool_use_id: Some(tool_use_id),
                        tool_status: if is_error { Some("error".to_string()) } else { None },
                        timestamp: timestamp.clone(),
                        agent_hash: agent_hash_from_entry.clone(),
                        ..Default::default()
                    });
                }
            }
        }
    }

    tracing::debug!(file = %file_path.display(), message_count = messages.len(), "messages loaded");
    Ok(messages)
}

/// Parse a Codex-format JSONL entry into Messages.
///
/// Codex entries: `{"type":"event_msg","payload":{"type":"user_message","message":"..."},"timestamp":"..."}`
/// or `{"type":"response_item","payload":{"type":"message","role":"assistant","content":[...]}}`
fn parse_codex_entry(
    entry: &serde_json::Value,
    msg_type: &str,
    timestamp: &Option<String>,
    idx: &mut u32,
) -> Option<Vec<Message>> {
    let payload = entry.get("payload")?;
    let sub_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");

    let mut msgs = Vec::new();

    if msg_type == "event_msg" {
        match sub_type {
            "user_message" => {
                let text = payload.get("message").and_then(|m| {
                    m.as_str().map(|s| s.to_string())
                        .or_else(|| m.get("content").and_then(|c| c.as_str()).map(|s| s.to_string()))
                });
                if let Some(t) = text {
                    if !t.trim().is_empty() {
                        *idx += 1;
                        msgs.push(Message {
                            id: format!("codex-{}", idx),
                            role: "user".to_string(),
                            text: Some(t),
                            tool_name: None, tool_input: None, tool_output: None,
                            tool_use_id: None, tool_status: None,
                            timestamp: timestamp.clone(),
                            model: None, images: None, raw: None,
                            agent_hash: None, thinking_text: None,
                        });
                    }
                }
            }
            "agent_message" | "agent_reasoning" => {
                let text = payload.get("message").and_then(|v| v.as_str());
                if let Some(t) = text {
                    *idx += 1;
                    let role = if sub_type == "agent_reasoning" { "meta" } else { "assistant" };
                    msgs.push(Message {
                        id: format!("codex-{}", idx),
                        role: role.to_string(),
                        text: Some(t.to_string()),
                        tool_name: None, tool_input: None, tool_output: None,
                        tool_use_id: None, tool_status: None,
                        timestamp: timestamp.clone(),
                        model: None, images: None, raw: None,
                        agent_hash: None, thinking_text: None,
                    });
                }
            }
            _ => {}
        }
    } else if msg_type == "response_item" {
        let role = payload.get("role").and_then(|v| v.as_str()).unwrap_or("");
        if role == "user" || role == "assistant" {
            let content = payload.get("content").and_then(|c| c.as_array());
            if let Some(arr) = content {
                for block in arr {
                    let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    match block_type {
                        "output_text" | "input_text" => {
                            let text = block.get("text").and_then(|v| v.as_str()).unwrap_or("");
                            if text.is_empty() || text.starts_with('<') { continue; }
                            *idx += 1;
                            msgs.push(Message {
                                id: format!("codex-{}", idx),
                                role: role.to_string(),
                                text: Some(text.to_string()),
                                tool_name: None, tool_input: None, tool_output: None,
                                tool_use_id: None, tool_status: None,
                                timestamp: timestamp.clone(),
                                model: None, images: None, raw: None,
                                agent_hash: None, thinking_text: None,
                            });
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    if msgs.is_empty() { None } else { Some(msgs) }
}

/// Parse a Cursor-format JSONL entry into Messages.
///
/// Cursor entries have the shape: `{"role": "user"|"assistant", "message": {"content": [...]}}`
/// Content blocks are `{"type": "text", "text": "..."}` or `{"type": "tool_use", "name": "...", "input": {...}}`.
fn parse_cursor_entry(entry: &serde_json::Value, role: &str, idx: &mut u32) -> Vec<Message> {
    let mut msgs = Vec::new();
    let content = match entry.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
        Some(arr) => arr,
        None => return msgs,
    };

    for block in content {
        let block_type = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match block_type {
            "text" => {
                let text = block.get("text").and_then(|v| v.as_str()).unwrap_or("");
                if text.is_empty() { continue; }
                *idx += 1;
                let cleaned = strip_cursor_tags(text);
                msgs.push(Message {
                    id: format!("cursor-{}", idx),
                    role: role.to_string(),
                    text: Some(cleaned),
                    tool_name: None,
                    tool_input: None,
                    tool_output: None,
                    tool_use_id: None,
                    tool_status: None,
                    timestamp: None,
                    model: None,
                    images: None,
                    raw: None,
                    agent_hash: None,
                    thinking_text: None,
                });
            }
            "tool_use" => {
                let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                let input = block.get("input").cloned().unwrap_or(serde_json::Value::Null);
                let tool_use_id = block.get("id").and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                *idx += 1;
                msgs.push(Message {
                    id: format!("cursor-{}", idx),
                    role: "tool_use".to_string(),
                    text: None,
                    tool_name: Some(name),
                    tool_input: Some(input),
                    tool_output: None,
                    tool_use_id: if tool_use_id.is_empty() { None } else { Some(tool_use_id) },
                    tool_status: None,
                    timestamp: None,
                    model: None,
                    images: None,
                    raw: None,
                    agent_hash: None,
                    thinking_text: None,
                });
            }
            "tool_result" => {
                let output = block.get("content")
                    .and_then(|c| {
                        if let Some(s) = c.as_str() { return Some(s.to_string()); }
                        if let Some(arr) = c.as_array() {
                            let texts: Vec<String> = arr.iter()
                                .filter_map(|b| b.get("text").and_then(|t| t.as_str()).map(|s| s.to_string()))
                                .collect();
                            if !texts.is_empty() { return Some(texts.join("\n")); }
                        }
                        None
                    })
                    .unwrap_or_default();
                let tool_use_id = block.get("tool_use_id").and_then(|v| v.as_str())
                    .unwrap_or("").to_string();
                let is_error = block.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                *idx += 1;
                msgs.push(Message {
                    id: format!("cursor-{}", idx),
                    role: "tool_result".to_string(),
                    text: None,
                    tool_name: None,
                    tool_input: None,
                    tool_output: Some(output),
                    tool_use_id: if tool_use_id.is_empty() { None } else { Some(tool_use_id) },
                    tool_status: if is_error { Some("error".to_string()) } else { None },
                    timestamp: None,
                    model: None,
                    images: None,
                    raw: None,
                    agent_hash: None,
                    thinking_text: None,
                });
            }
            _ => {}
        }
    }
    msgs
}

/// Strip Cursor prompt-wrapping XML tags from text content.
pub fn strip_cursor_tags(text: &str) -> String {
    let tags = [
        "<user_query>", "</user_query>",
        "<additional_data>", "</additional_data>",
        "<attached_context>", "</attached_context>",
        "<repo_instruction>", "</repo_instruction>",
    ];
    let mut result = text.to_string();
    for tag in &tags {
        result = result.replace(tag, "");
    }
    let trimmed = result.trim();
    if trimmed.is_empty() { text.to_string() } else { trimmed.to_string() }
}

fn extract_meta_summary(msg_type: &str, entry: &serde_json::Value) -> String {
    match msg_type {
        "permission-mode" => {
            let mode = entry.get("permissionMode").and_then(|v| v.as_str()).unwrap_or("unknown");
            format!("permission-mode: {mode}")
        }
        "ai-title" => {
            let title = entry.get("aiTitle").and_then(|v| v.as_str()).unwrap_or("");
            format!("ai-title: {title}")
        }
        "attachment" => {
            let cwd = entry.get("cwd").and_then(|v| v.as_str()).unwrap_or("");
            let branch = entry.get("gitBranch").and_then(|v| v.as_str()).unwrap_or("");
            if branch.is_empty() {
                format!("attachment: {cwd}")
            } else {
                format!("attachment: {cwd} @ {branch}")
            }
        }
        "last-prompt" => "last-prompt".to_string(),
        "queue-operation" => {
            let op = entry.get("operation").and_then(|v| v.as_str()).unwrap_or("unknown");
            format!("queue: {op}")
        }
        other => other.to_string(),
    }
}

fn is_thinking_only(content: Option<&serde_json::Value>) -> bool {
    let arr = match content {
        Some(serde_json::Value::Array(a)) => a,
        _ => return false,
    };
    if arr.is_empty() {
        return false;
    }
    arr.iter().all(|item| {
        item.get("type").and_then(|v| v.as_str()) == Some("thinking")
    })
}

enum ContentBlock {
    Text(String),
    Thinking(String),
    Image { media_type: String, source_type: String },
    ToolUse { name: String, input: serde_json::Value, tool_use_id: String },
    ToolResult { content: String, tool_use_id: String, is_error: bool },
}

fn extract_blocks(content: Option<&serde_json::Value>) -> Vec<ContentBlock> {
    let arr = match content {
        Some(serde_json::Value::Array(a)) => a,
        _ => return vec![],
    };

    let mut blocks = Vec::new();

    for item in arr {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match item_type {
            "text" => {
                if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                    if !text.is_empty() {
                        blocks.push(ContentBlock::Text(text.to_string()));
                    }
                }
            }
            "thinking" => {
                let text = item.get("thinking")
                    .or_else(|| item.get("text"))
                    .and_then(|v| v.as_str());
                if let Some(t) = text {
                    if !t.is_empty() {
                        blocks.push(ContentBlock::Thinking(t.to_string()));
                    }
                }
            }
            "tool_use" => {
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                let input = item.get("input").cloned().unwrap_or(serde_json::Value::Null);
                let tool_use_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                blocks.push(ContentBlock::ToolUse { name, input, tool_use_id });
            }
            "tool_result" => {
                let content_val = item.get("content");
                let content_str = match content_val {
                    Some(serde_json::Value::String(s)) => s.clone(),
                    Some(serde_json::Value::Array(arr)) => {
                        arr.iter()
                            .filter_map(|v| v.get("text").and_then(|t| t.as_str()))
                            .collect::<Vec<_>>()
                            .join("\n")
                    }
                    _ => String::new(),
                };
                let tool_use_id = item.get("tool_use_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let is_error = item.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false);
                blocks.push(ContentBlock::ToolResult { content: content_str, tool_use_id, is_error });
            }
            "image" => {
                let source = item.get("source");
                let media_type = source
                    .and_then(|s| s.get("media_type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("image/png")
                    .to_string();
                let source_type = source
                    .and_then(|s| s.get("type"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("base64")
                    .to_string();
                blocks.push(ContentBlock::Image { media_type, source_type });
            }
            _ => {}
        }
    }

    blocks
}

/// Extract `[Image: source: /path/to/file.png]` references from text.
fn extract_image_source_paths(text: &str) -> Vec<String> {
    let mut paths = Vec::new();
    let prefix = "[Image: source: ";
    let mut from = 0;
    while let Some(start) = text[from..].find(prefix) {
        let abs_start = from + start + prefix.len();
        if let Some(end) = text[abs_start..].find(']') {
            let path = text[abs_start..abs_start + end].trim();
            if !path.is_empty() {
                paths.push(path.to_string());
            }
            from = abs_start + end + 1;
        } else {
            break;
        }
    }
    paths
}

/// Parse Cursor `<image_files>` tags in text blocks to extract file path references.
fn parse_cursor_image_refs(text: &str) -> Vec<ImageMeta> {
    let mut images = Vec::new();
    let start_tag = "<image_files>";
    let end_tag = "</image_files>";
    let mut search_from = 0;
    while let Some(start) = text[search_from..].find(start_tag) {
        let abs_start = search_from + start + start_tag.len();
        if let Some(end) = text[abs_start..].find(end_tag) {
            let block = &text[abs_start..abs_start + end];
            for line in block.lines() {
                let trimmed = line.trim();
                // Match lines like "1. /path/to/image.png"
                if let Some(dot_pos) = trimmed.find(". /") {
                    let path = trimmed[dot_pos + 2..].trim();
                    let lower = path.to_lowercase();
                    let media_type = if lower.ends_with(".png") {
                        "image/png"
                    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
                        "image/jpeg"
                    } else if lower.ends_with(".gif") {
                        "image/gif"
                    } else if lower.ends_with(".webp") {
                        "image/webp"
                    } else {
                        continue;
                    };
                    images.push(ImageMeta {
                        index: 0, // caller will set correct index
                        media_type: media_type.to_string(),
                        source_type: "file_ref".to_string(),
                        cache_path: None,
                        file_path: Some(path.to_string()),
                    });
                }
            }
            search_from = abs_start + end + end_tag.len();
        } else {
            break;
        }
    }
    images
}

/// Resolve an image from a session JSONL, returning (bytes, media_type).
///
/// Resolution chain:
/// 1. image-cache file on disk
/// 2. JSONL base64 decode
/// 3. Cursor local file path
pub fn resolve_image(
    jsonl_path: &Path,
    session_id_raw: Option<&str>,
    message_uuid: &str,
    image_index: u32,
) -> Result<(Vec<u8>, String), String> {
    // Step 1: Try image-cache file.
    // We need to compute the global image number (1-based) by scanning the JSONL.
    if let Some(raw_id) = session_id_raw {
        if let Some(home) = dirs::home_dir() {
            let cache_dir = home.join(".claude").join("image-cache").join(raw_id);
            if cache_dir.is_dir() {
                // Count all image blocks up to target to get global number
                if let Ok(global_num) = compute_global_image_number(jsonl_path, message_uuid, image_index) {
                    // Try common extensions
                    for ext in &["png", "jpg", "jpeg", "gif", "webp"] {
                        let cache_file = cache_dir.join(format!("{}.{}", global_num, ext));
                        if cache_file.is_file() {
                            let bytes = fs::read(&cache_file).map_err(|e| format!("read cache: {e}"))?;
                            let media = match *ext {
                                "png" => "image/png",
                                "jpg" | "jpeg" => "image/jpeg",
                                "gif" => "image/gif",
                                "webp" => "image/webp",
                                _ => "application/octet-stream",
                            };
                            return Ok((bytes, media.to_string()));
                        }
                    }
                }
            }
        }
    }

    // Step 2: Parse JSONL and decode base64
    let file = fs::File::open(jsonl_path).map_err(|e| format!("open jsonl: {e}"))?;
    let reader = BufReader::new(file);
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.is_empty() { continue; }
        let entry: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let uuid = entry.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
        if uuid != message_uuid { continue; }

        // Found the entry — extract the image
        let content = entry.get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_array());
        let content = match content {
            Some(arr) => arr,
            None => return Err("no content array".to_string()),
        };

        let mut img_idx: u32 = 0;
        for item in content {
            let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if item_type == "image" {
                if img_idx == image_index {
                    let source = item.get("source");
                    let src_type = source.and_then(|s| s.get("type")).and_then(|v| v.as_str()).unwrap_or("");
                    let media_type = source.and_then(|s| s.get("media_type")).and_then(|v| v.as_str()).unwrap_or("image/png");

                    if src_type == "base64" {
                        let data = source.and_then(|s| s.get("data")).and_then(|v| v.as_str()).unwrap_or("");
                        use base64::Engine;
                        let bytes = base64::engine::general_purpose::STANDARD
                            .decode(data)
                            .map_err(|e| format!("base64 decode: {e}"))?;
                        return Ok((bytes, media_type.to_string()));
                    }
                }
                img_idx += 1;
            } else if item_type == "text" {
                // Check for Cursor file_ref images
                let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("");
                let cursor_refs = parse_cursor_image_refs(text);
                for cref in &cursor_refs {
                    if img_idx == image_index {
                        if let Some(fp) = &cref.file_path {
                            let path = Path::new(fp);
                            if path.is_file() {
                                let bytes = fs::read(path).map_err(|e| format!("read file_ref: {e}"))?;
                                return Ok((bytes, cref.media_type.clone()));
                            } else {
                                return Err(format!("file_ref not found: {fp}"));
                            }
                        }
                    }
                    img_idx += 1;
                }
            }
        }
        return Err(format!("image index {image_index} out of range"));
    }
    Err(format!("message uuid {message_uuid} not found"))
}

/// Count all image blocks in JSONL up to (and including) the target to get a 1-based global number.
fn compute_global_image_number(jsonl_path: &Path, target_uuid: &str, target_index: u32) -> Result<u32, String> {
    let file = fs::File::open(jsonl_path).map_err(|e| format!("{e}"))?;
    let reader = BufReader::new(file);
    let mut global: u32 = 0;
    for line in reader.lines() {
        let line = match line { Ok(l) => l, Err(_) => continue };
        if line.is_empty() { continue; }
        let entry: serde_json::Value = match serde_json::from_str(&line) { Ok(v) => v, Err(_) => continue };
        let uuid = entry.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
        let content = entry.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array());
        if let Some(arr) = content {
            let mut local_idx: u32 = 0;
            for item in arr {
                let t = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if t == "image" {
                    global += 1;
                    if uuid == target_uuid && local_idx == target_index {
                        return Ok(global);
                    }
                    local_idx += 1;
                } else if t == "text" {
                    let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    let cursor_count = parse_cursor_image_refs(text).len() as u32;
                    for _ in 0..cursor_count {
                        global += 1;
                        if uuid == target_uuid && local_idx == target_index {
                            return Ok(global);
                        }
                        local_idx += 1;
                    }
                }
            }
        }
    }
    Err("image not found in scan".to_string())
}

/// Subagent metadata discovered from the session's subagents/ directory.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentMeta {
    pub agent_hash: String,
    pub agent_type: String,
    pub description: String,
    pub message_count: u32,
    pub file_path: String,
}

/// Discover subagent files for a claude-code session.
/// Subagents live at: <session_file_without_.jsonl>/subagents/agent-<hash>.jsonl
pub fn discover_subagents(session_file_path: &str) -> Vec<SubagentMeta> {
    let base = session_file_path.trim_end_matches(".jsonl");
    let sub_dir = format!("{}/subagents", base);
    let sub_path = Path::new(&sub_dir);

    if !sub_path.is_dir() {
        return vec![];
    }

    let entries = match std::fs::read_dir(sub_path) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    let mut results = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if !file_name.starts_with("agent-") || !file_name.ends_with(".jsonl") {
            continue;
        }

        let hash = file_name
            .strip_prefix("agent-")
            .and_then(|s| s.strip_suffix(".jsonl"))
            .unwrap_or("")
            .to_string();

        if hash.is_empty() {
            continue;
        }

        // Try to read metadata from a .meta.json sidecar
        let meta_path = sub_path.join(format!("agent-{}.meta.json", hash));
        let (mut agent_type, mut description) = ("unknown".to_string(), String::new());

        if meta_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&meta_path) {
                if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                    agent_type = meta.get("agentType")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    description = meta.get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                }
            }
        }

        // If no meta file, peek first lines of the JSONL for agentType/description
        if description.is_empty() {
            if let Ok(file) = std::fs::File::open(&path) {
                let reader = std::io::BufReader::new(file);
                for line in reader.lines().take(3).flatten() {
                    if line.is_empty() { continue; }
                    if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) {
                        if let Some(at) = obj.get("agentType").and_then(|v| v.as_str()) {
                            agent_type = at.to_string();
                        }
                        if let Some(at) = obj.get("agentId").and_then(|_| obj.get("agentType")).and_then(|v| v.as_str()) {
                            agent_type = at.to_string();
                        }
                        if let Some(msg) = obj.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_str()) {
                            description = msg.chars().take(crate::constants::SUBAGENT_DESC_MAX_LEN).collect();
                            break;
                        }
                    }
                }
            }
        }

        // Count lines (= approximate message count)
        let message_count = std::fs::File::open(&path)
            .map(|f| std::io::BufReader::new(f).lines().count() as u32)
            .unwrap_or(0);

        results.push(SubagentMeta {
            agent_hash: hash,
            agent_type,
            description,
            message_count,
            file_path: path.to_string_lossy().to_string(),
        });
    }

    results.sort_by(|a, b| b.message_count.cmp(&a.message_count));
    results
}

/// Search within a loaded message list.
pub fn search_in_messages(messages: &[Message], query: &str, limit: usize) -> Vec<SearchHit> {
    let ql = query.to_lowercase();
    let mut hits = Vec::new();

    for msg in messages {
        let text = msg.text.as_deref()
            .or(msg.tool_output.as_deref())
            .unwrap_or("");

        if text.is_empty() {
            continue;
        }

        let lower = text.to_lowercase();
        if let Some(pos) = lower.find(&ql) {
            let snippet = make_snippet(text, pos, pos + ql.len());
            hits.push(SearchHit {
                message_id: msg.id.clone(),
                role: msg.role.clone(),
                snippet,
            });
            if hits.len() >= limit {
                break;
            }
        }
    }

    hits
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub message_id: String,
    pub role: String,
    pub snippet: String,
}

fn make_snippet(text: &str, match_start: usize, match_end: usize) -> String {
    let radius = crate::constants::SNIPPET_RADIUS_SMALL;
    let start = text[..match_start]
        .char_indices()
        .rev()
        .nth(radius)
        .map(|(i, _)| i)
        .unwrap_or(0);
    let end = text[match_end..]
        .char_indices()
        .nth(radius)
        .map(|(i, _)| match_end + i)
        .unwrap_or(text.len());

    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < text.len() { "…" } else { "" };
    let slice = &text[start..end];
    let ms = match_start - start;
    let me = match_end - start;

    format!("{}{}<mark>{}</mark>{}{}", prefix, &slice[..ms], &slice[ms..me], &slice[me..], suffix)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn write_session_file(dir: &TempDir, lines: &[&str]) -> std::path::PathBuf {
        let file = dir.path().join("test.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        for line in lines {
            writeln!(f, "{}", line).unwrap();
        }
        file
    }

    #[test]
    fn test_load_simple_messages() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"user","content":"Hello"}}"#,
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:01:00Z","message":{"role":"assistant","model":"claude-sonnet-4","content":[{"type":"text","text":"Hi there!"}]}}"#,
        ]);

        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].text, Some("Hello".to_string()));
        assert_eq!(msgs[1].role, "assistant");
        assert_eq!(msgs[1].text, Some("Hi there!".to_string()));
    }

    #[test]
    fn test_load_tool_use_messages() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"Bash","input":{"command":"ls -la"}}]}}"#,
        ]);

        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "tool_use");
        assert_eq!(msgs[0].tool_name, Some("Bash".to_string()));
        assert_eq!(msgs[0].tool_use_id, Some("tu1".to_string()));
    }

    #[test]
    fn test_load_tool_result() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"file1.txt\nfile2.txt"}]}}"#,
        ]);

        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "tool_result");
        assert_eq!(msgs[0].tool_use_id, Some("tu1".to_string()));
        assert_eq!(msgs[0].tool_output, Some("file1.txt\nfile2.txt".to_string()));
    }

    #[test]
    fn test_search_in_messages() {
        let messages = vec![
            Message { id: "1".into(), role: "user".into(), text: Some("How do I use Rust?".into()), thinking_text: None, tool_name: None, tool_input: None, tool_output: None, tool_use_id: None, tool_status: None, timestamp: None, model: None, images: None, raw: None, agent_hash: None },
            Message { id: "2".into(), role: "assistant".into(), text: Some("Rust is great for systems programming.".into()), thinking_text: None, tool_name: None, tool_input: None, tool_output: None, tool_use_id: None, tool_status: None, timestamp: None, model: None, images: None, raw: None, agent_hash: None },
            Message { id: "3".into(), role: "user".into(), text: Some("What about Python?".into()), thinking_text: None, tool_name: None, tool_input: None, tool_output: None, tool_use_id: None, tool_status: None, timestamp: None, model: None, images: None, raw: None, agent_hash: None },
        ];

        let hits = search_in_messages(&messages, "Rust", 10);
        assert_eq!(hits.len(), 2);
        assert!(hits[0].snippet.contains("<mark>"));
    }

    #[test]
    fn test_search_limit() {
        let messages: Vec<Message> = (0..20).map(|i| Message {
            id: format!("{i}"), role: "user".into(), text: Some(format!("match keyword {i}")),
            tool_name: None, tool_input: None, tool_output: None, tool_use_id: None,
            tool_status: None, timestamp: None, model: None, images: None, raw: None,
            agent_hash: None, thinking_text: None,
        }).collect();

        let hits = search_in_messages(&messages, "keyword", 5);
        assert_eq!(hits.len(), 5);
    }

    #[test]
    fn test_empty_file() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("empty.jsonl");
        fs::File::create(&file).unwrap();

        let msgs = load_messages(&file).unwrap();
        assert!(msgs.is_empty());
    }

    #[test]
    fn test_meta_permission_mode() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"permission-mode","uuid":"p1","timestamp":"2026-05-01T10:00:00Z","permissionMode":"auto","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("permission-mode: auto".to_string()));
        assert_eq!(msgs[0].tool_name, Some("permission-mode".to_string()));
    }

    #[test]
    fn test_meta_ai_title() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"ai-title","uuid":"t1","timestamp":"2026-05-01T10:00:00Z","aiTitle":"Fix login bug","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("ai-title: Fix login bug".to_string()));
        assert_eq!(msgs[0].tool_name, Some("ai-title".to_string()));
    }

    #[test]
    fn test_meta_attachment() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"attachment","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","cwd":"/home/user/project","gitBranch":"main","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("attachment: /home/user/project @ main".to_string()));
    }

    #[test]
    fn test_meta_attachment_no_branch() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"attachment","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","cwd":"/home/user/project","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs[0].text, Some("attachment: /home/user/project".to_string()));
    }

    #[test]
    fn test_meta_last_prompt() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"last-prompt","uuid":"l1","timestamp":"2026-05-01T10:00:00Z","lastPrompt":"test","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("last-prompt".to_string()));
    }

    #[test]
    fn test_meta_queue_operation() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"queue-operation","uuid":"q1","timestamp":"2026-05-01T10:00:00Z","operation":"enqueue","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("queue: enqueue".to_string()));
    }

    #[test]
    fn test_meta_unknown_type() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"some-future-type","uuid":"x1","timestamp":"2026-05-01T10:00:00Z","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("some-future-type".to_string()));
    }

    #[test]
    fn test_thinking_only_assistant() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"assistant","content":[{"type":"thinking","text":""}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "assistant");
        assert_eq!(msgs[0].text, Some("(thinking)".to_string()));
    }

    #[test]
    fn test_thinking_with_text_assistant() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"let me think"},{"type":"text","text":"Here is the answer"}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "assistant");
        assert_eq!(msgs[0].text, Some("Here is the answer".to_string()));
        assert_eq!(msgs[0].thinking_text, Some("let me think".to_string()));
    }

    #[test]
    fn test_empty_assistant_no_content_skipped() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"assistant"}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 0, "assistant with no content should be skipped");
    }

    #[test]
    fn test_file_history_snapshot_skipped() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"file-history-snapshot","uuid":"f1","timestamp":"2026-05-01T10:00:00Z"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert!(msgs.is_empty());
    }

    #[test]
    fn test_system_turn_duration_becomes_meta() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"system","uuid":"s1","timestamp":"2026-05-01T10:00:00Z","subtype":"turn_duration","durationMs":5000,"messageCount":10,"sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("system/turn_duration: 10 msgs, 5.0s".to_string()));
        assert_eq!(msgs[0].tool_name, Some("system/turn_duration".to_string()));
    }

    #[test]
    fn test_system_with_content_stays_system() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"system","uuid":"s1","timestamp":"2026-05-01T10:00:00Z","content":"You asked me to do X","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "system");
        assert_eq!(msgs[0].text, Some("You asked me to do X".to_string()));
    }

    #[test]
    fn test_system_away_summary_with_content_stays_system() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"system","uuid":"s1","timestamp":"2026-05-01T10:00:00Z","subtype":"away_summary","content":"Session recap text here","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "system");
        assert_eq!(msgs[0].text, Some("Session recap text here".to_string()));
        assert_eq!(msgs[0].tool_name, Some("away_summary".to_string()));
    }

    #[test]
    fn test_system_empty_no_subtype_becomes_meta() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"system","uuid":"s1","timestamp":"2026-05-01T10:00:00Z","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
    }

    #[test]
    fn test_mixed_messages_and_meta() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"permission-mode","uuid":"p1","timestamp":"2026-05-01T10:00:00Z","permissionMode":"auto","sessionId":"s1"}"#,
            r#"{"type":"user","uuid":"u1","timestamp":"2026-05-01T10:00:01Z","message":{"role":"user","content":"Hello"}}"#,
            r#"{"type":"ai-title","uuid":"t1","timestamp":"2026-05-01T10:00:02Z","aiTitle":"Test","sessionId":"s1"}"#,
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:03Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 4);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[1].role, "user");
        assert_eq!(msgs[2].role, "meta");
        assert_eq!(msgs[3].role, "assistant");
    }

    #[test]
    fn test_strip_cursor_tags_basic() {
        let input = "<user_query>Hello world</user_query>";
        assert_eq!(strip_cursor_tags(input), "Hello world");
    }

    #[test]
    fn test_strip_cursor_tags_multiple() {
        let input = "<user_query><additional_data>some data</additional_data>actual query</user_query>";
        let result = strip_cursor_tags(input);
        assert_eq!(result, "some dataactual query");
    }

    #[test]
    fn test_strip_cursor_tags_no_tags() {
        let input = "Just plain text";
        assert_eq!(strip_cursor_tags(input), "Just plain text");
    }

    #[test]
    fn test_strip_cursor_tags_all_tags_empty_result() {
        let input = "<user_query></user_query>";
        let result = strip_cursor_tags(input);
        assert_eq!(result, input);
    }

    #[test]
    fn test_strip_cursor_tags_repo_instruction() {
        let input = "<repo_instruction>Follow the rules</repo_instruction>Do something";
        let result = strip_cursor_tags(input);
        assert_eq!(result, "Follow the rulesDo something");
    }

    #[test]
    fn test_parse_cursor_entry_text_blocks() {
        let entry = serde_json::json!({
            "role": "user",
            "message": {
                "content": [
                    {"type": "text", "text": "Hello from cursor"}
                ]
            }
        });
        let mut idx = 0u32;
        let msgs = parse_cursor_entry(&entry, "user", &mut idx);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].text, Some("Hello from cursor".to_string()));
    }

    #[test]
    fn test_parse_cursor_entry_tool_use() {
        let entry = serde_json::json!({
            "role": "assistant",
            "message": {
                "content": [
                    {"type": "tool_use", "name": "Read", "id": "tool-1", "input": {"path": "/tmp/x"}}
                ]
            }
        });
        let mut idx = 0u32;
        let msgs = parse_cursor_entry(&entry, "assistant", &mut idx);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "tool_use");
        assert_eq!(msgs[0].tool_name, Some("Read".to_string()));
        assert_eq!(msgs[0].tool_use_id, Some("tool-1".to_string()));
    }

    #[test]
    fn test_parse_cursor_entry_tool_result() {
        let entry = serde_json::json!({
            "role": "user",
            "message": {
                "content": [
                    {"type": "tool_result", "tool_use_id": "tool-1", "content": "output text", "is_error": false}
                ]
            }
        });
        let mut idx = 0u32;
        let msgs = parse_cursor_entry(&entry, "user", &mut idx);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "tool_result");
        assert_eq!(msgs[0].tool_output, Some("output text".to_string()));
        assert_eq!(msgs[0].tool_status, None);
    }

    #[test]
    fn test_parse_cursor_entry_tool_result_error() {
        let entry = serde_json::json!({
            "role": "user",
            "message": {
                "content": [
                    {"type": "tool_result", "tool_use_id": "tool-2", "content": "failed", "is_error": true}
                ]
            }
        });
        let mut idx = 0u32;
        let msgs = parse_cursor_entry(&entry, "user", &mut idx);
        assert_eq!(msgs[0].tool_status, Some("error".to_string()));
    }

    #[test]
    fn test_parse_cursor_entry_no_content() {
        let entry = serde_json::json!({ "role": "user", "message": {} });
        let mut idx = 0u32;
        let msgs = parse_cursor_entry(&entry, "user", &mut idx);
        assert!(msgs.is_empty());
    }

    #[test]
    fn test_parse_codex_entry_user_message() {
        let entry = serde_json::json!({
            "type": "event_msg",
            "payload": {"type": "user_message", "message": "hello codex"},
            "timestamp": "2026-05-01T10:00:00Z"
        });
        let ts = Some("2026-05-01T10:00:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "event_msg", &ts, &mut idx);
        assert!(result.is_some());
        let msgs = result.unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].text, Some("hello codex".to_string()));
    }

    #[test]
    fn test_parse_codex_entry_agent_message() {
        let entry = serde_json::json!({
            "type": "event_msg",
            "payload": {"type": "agent_message", "message": "here is the result"},
            "timestamp": "2026-05-01T10:01:00Z"
        });
        let ts = Some("2026-05-01T10:01:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "event_msg", &ts, &mut idx);
        assert!(result.is_some());
        let msgs = result.unwrap();
        assert_eq!(msgs[0].role, "assistant");
    }

    #[test]
    fn test_parse_codex_entry_agent_reasoning() {
        let entry = serde_json::json!({
            "type": "event_msg",
            "payload": {"type": "agent_reasoning", "message": "thinking..."},
            "timestamp": "2026-05-01T10:01:00Z"
        });
        let ts = Some("2026-05-01T10:01:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "event_msg", &ts, &mut idx);
        assert!(result.is_some());
        let msgs = result.unwrap();
        assert_eq!(msgs[0].role, "meta");
    }

    #[test]
    fn test_parse_codex_entry_response_item() {
        let entry = serde_json::json!({
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "response text"}]
            },
            "timestamp": "2026-05-01T10:02:00Z"
        });
        let ts = Some("2026-05-01T10:02:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "response_item", &ts, &mut idx);
        assert!(result.is_some());
        let msgs = result.unwrap();
        assert_eq!(msgs[0].role, "assistant");
        assert_eq!(msgs[0].text, Some("response text".to_string()));
    }

    #[test]
    fn test_parse_codex_entry_unknown_event() {
        let entry = serde_json::json!({
            "type": "event_msg",
            "payload": {"type": "unknown_event"},
            "timestamp": "2026-05-01T10:00:00Z"
        });
        let ts = Some("2026-05-01T10:00:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "event_msg", &ts, &mut idx);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_codex_entry_no_payload() {
        let entry = serde_json::json!({"type": "event_msg"});
        let ts = None;
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "event_msg", &ts, &mut idx);
        assert!(result.is_none());
    }

    #[test]
    fn test_discover_subagents_no_dir() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("session.jsonl");
        fs::File::create(&file).unwrap();
        let result = discover_subagents(file.to_str().unwrap());
        assert!(result.is_empty());
    }

    #[test]
    fn test_discover_subagents_with_agents() {
        let dir = TempDir::new().unwrap();
        let session_dir = dir.path().join("session");
        let sub_dir = session_dir.join("subagents");
        fs::create_dir_all(&sub_dir).unwrap();

        let agent_file = sub_dir.join("agent-abc123.jsonl");
        let mut f = fs::File::create(&agent_file).unwrap();
        writeln!(f, r#"{{"type":"user","message":{{"content":"do something"}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"assistant","message":{{"content":"done"}}}}"#).unwrap();

        let session_path = format!("{}.jsonl", session_dir.to_str().unwrap());
        let result = discover_subagents(&session_path);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].agent_hash, "abc123");
        assert_eq!(result[0].message_count, 2);
    }

    #[test]
    fn test_discover_subagents_with_meta_json() {
        let dir = TempDir::new().unwrap();
        let session_dir = dir.path().join("session2");
        let sub_dir = session_dir.join("subagents");
        fs::create_dir_all(&sub_dir).unwrap();

        let agent_file = sub_dir.join("agent-def456.jsonl");
        let mut f = fs::File::create(&agent_file).unwrap();
        writeln!(f, r#"{{"type":"user"}}"#).unwrap();

        let meta_file = sub_dir.join("agent-def456.meta.json");
        let mut mf = fs::File::create(&meta_file).unwrap();
        writeln!(mf, r#"{{"agentType":"researcher","description":"Does research"}}"#).unwrap();

        let session_path = format!("{}.jsonl", session_dir.to_str().unwrap());
        let result = discover_subagents(&session_path);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].agent_type, "researcher");
        assert_eq!(result[0].description, "Does research");
    }

    #[test]
    fn test_discover_subagents_ignores_non_agent_files() {
        let dir = TempDir::new().unwrap();
        let session_dir = dir.path().join("session3");
        let sub_dir = session_dir.join("subagents");
        fs::create_dir_all(&sub_dir).unwrap();

        fs::File::create(sub_dir.join("other-file.jsonl")).unwrap();
        fs::File::create(sub_dir.join("notes.txt")).unwrap();

        let session_path = format!("{}.jsonl", session_dir.to_str().unwrap());
        let result = discover_subagents(&session_path);
        assert!(result.is_empty());
    }

    #[test]
    fn test_resolve_image_nonexistent_file() {
        let result = resolve_image(
            Path::new("/tmp/nonexistent_session_xyz.jsonl"),
            None,
            "fake-uuid",
            0,
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_image_uuid_not_found() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("resolve_test.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u1","message":{{"content":"hi"}}}}"#).unwrap();

        let result = resolve_image(&file, None, "nonexistent-uuid", 0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[test]
    fn test_extract_image_source_paths() {
        let text = "Look at this [Image: source: /tmp/img1.png] and [Image: source: /tmp/img2.jpg]";
        let paths = extract_image_source_paths(text);
        assert_eq!(paths, vec!["/tmp/img1.png", "/tmp/img2.jpg"]);
    }

    #[test]
    fn test_extract_image_source_paths_none() {
        let text = "No images here";
        let paths = extract_image_source_paths(text);
        assert!(paths.is_empty());
    }

    #[test]
    fn test_parse_cursor_image_refs_basic() {
        let text = "<image_files>\n1. /tmp/screenshot.png\n2. /tmp/photo.jpg\n</image_files>";
        let refs = parse_cursor_image_refs(text);
        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].file_path, Some("/tmp/screenshot.png".to_string()));
        assert_eq!(refs[0].media_type, "image/png");
        assert_eq!(refs[1].file_path, Some("/tmp/photo.jpg".to_string()));
        assert_eq!(refs[1].media_type, "image/jpeg");
    }

    #[test]
    fn test_parse_cursor_image_refs_no_tags() {
        let text = "Just normal text with no image tags";
        let refs = parse_cursor_image_refs(text);
        assert!(refs.is_empty());
    }

    #[test]
    fn test_parse_cursor_image_refs_unsupported_ext() {
        let text = "<image_files>\n1. /tmp/doc.pdf\n</image_files>";
        let refs = parse_cursor_image_refs(text);
        assert!(refs.is_empty());
    }

    #[test]
    fn test_search_in_messages_no_match() {
        let messages = vec![
            Message { id: "1".into(), role: "user".into(), text: Some("Hello".into()), thinking_text: None, tool_name: None, tool_input: None, tool_output: None, tool_use_id: None, tool_status: None, timestamp: None, model: None, images: None, raw: None, agent_hash: None },
        ];
        let hits = search_in_messages(&messages, "xyz", 10);
        assert!(hits.is_empty());
    }

    #[test]
    fn test_search_in_messages_tool_output() {
        let messages = vec![
            Message { id: "1".into(), role: "tool_result".into(), text: None, thinking_text: None, tool_name: None, tool_input: None, tool_output: Some("file content with keyword".into()), tool_use_id: None, tool_status: None, timestamp: None, model: None, images: None, raw: None, agent_hash: None },
        ];
        let hits = search_in_messages(&messages, "keyword", 10);
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("<mark>"));
    }

    #[test]
    fn test_resolve_image_base64() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("img_session.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        use base64::Engine;
        let pixel = base64::engine::general_purpose::STANDARD.encode(&[0x89, 0x50, 0x4E, 0x47]);
        writeln!(f, r#"{{"type":"assistant","uuid":"img-uuid","message":{{"content":[{{"type":"image","source":{{"type":"base64","media_type":"image/png","data":"{pixel}"}}}}]}}}}"#).unwrap();

        let result = resolve_image(&file, None, "img-uuid", 0);
        assert!(result.is_ok());
        let (bytes, media) = result.unwrap();
        assert_eq!(media, "image/png");
        assert_eq!(bytes, vec![0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn test_resolve_image_index_out_of_range() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("img_session2.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        use base64::Engine;
        let pixel = base64::engine::general_purpose::STANDARD.encode(&[0x89]);
        writeln!(f, r#"{{"type":"assistant","uuid":"img-uuid2","message":{{"content":[{{"type":"image","source":{{"type":"base64","media_type":"image/png","data":"{pixel}"}}}}]}}}}"#).unwrap();

        let result = resolve_image(&file, None, "img-uuid2", 5);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("out of range"));
    }

    #[test]
    fn test_resolve_image_no_content_array() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("no_content.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"assistant","uuid":"nc-uuid","message":{{"role":"assistant"}}}}"#).unwrap();

        let result = resolve_image(&file, None, "nc-uuid", 0);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no content array"));
    }

    #[test]
    fn test_load_messages_image_blocks() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Here is the image:"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"abc"}}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "assistant");
        assert!(msgs[0].images.is_some());
        let imgs = msgs[0].images.as_ref().unwrap();
        assert_eq!(imgs.len(), 1);
        assert_eq!(imgs[0].media_type, "image/png");
    }

    #[test]
    fn test_load_messages_image_source_paths_backfill() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"assistant","content":[{"type":"text","text":"see image"},{"type":"image","source":{"type":"base64","media_type":"image/png","data":"x"}}]}}"#,
            r#"{"type":"assistant","uuid":"a2","timestamp":"2026-05-01T10:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"[Image: source: /tmp/cached.png]"}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        let img_msg = msgs.iter().find(|m| m.images.is_some()).unwrap();
        let imgs = img_msg.images.as_ref().unwrap();
        assert_eq!(imgs[0].cache_path, Some("/tmp/cached.png".to_string()));
    }

    #[test]
    fn test_load_messages_multiple_tool_uses_in_one_entry() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu1","name":"Read","input":{"file_path":"/a"}},{"type":"tool_use","id":"tu2","name":"Bash","input":{"command":"ls"}}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].tool_name, Some("Read".to_string()));
        assert_eq!(msgs[1].tool_name, Some("Bash".to_string()));
    }

    #[test]
    fn test_load_messages_tool_result_with_content_array() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-05-01T10:00:00Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":[{"type":"text","text":"result line 1"},{"type":"text","text":"result line 2"}]}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "tool_result");
        let output = msgs[0].tool_output.as_ref().unwrap();
        assert!(output.contains("result line 1"));
    }

    #[test]
    fn test_load_messages_agent_hash_from_tool_result() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-05-01T10:00:00Z","toolUseResult":{"agentId":"agent-abc"},"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu1","content":"output"}]}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].agent_hash, Some("agent-abc".to_string()));
    }

    #[test]
    fn test_compute_global_image_number() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("global_img.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"assistant","uuid":"a1","message":{{"content":[{{"type":"image","source":{{"type":"base64","media_type":"image/png","data":"x"}}}},{{"type":"image","source":{{"type":"base64","media_type":"image/png","data":"y"}}}}]}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"assistant","uuid":"a2","message":{{"content":[{{"type":"image","source":{{"type":"base64","media_type":"image/png","data":"z"}}}}]}}}}"#).unwrap();

        assert_eq!(compute_global_image_number(&file, "a1", 0).unwrap(), 1);
        assert_eq!(compute_global_image_number(&file, "a1", 1).unwrap(), 2);
        assert_eq!(compute_global_image_number(&file, "a2", 0).unwrap(), 3);
    }

    #[test]
    fn test_compute_global_image_number_not_found() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("no_img.jsonl");
        let mut f = fs::File::create(&file).unwrap();
        writeln!(f, r#"{{"type":"user","uuid":"u1","message":{{"content":"hi"}}}}"#).unwrap();

        let result = compute_global_image_number(&file, "nonexistent", 0);
        assert!(result.is_err());
    }

    #[test]
    fn test_make_snippet_long_text() {
        let text = "a".repeat(500) + "FIND_ME" + &"b".repeat(500);
        let pos = text.find("FIND_ME").unwrap();
        let snippet = make_snippet(&text, pos, pos + 7);
        assert!(snippet.contains("<mark>FIND_ME</mark>"));
        assert!(snippet.starts_with('…'));
        assert!(snippet.ends_with('…'));
    }

    #[test]
    fn test_make_snippet_start_of_text() {
        let text = "FIND at start followed by more text";
        let snippet = make_snippet(text, 0, 4);
        assert!(snippet.starts_with("<mark>FIND</mark>"));
        assert!(!snippet.starts_with('…'));
    }

    #[test]
    fn test_discover_subagents_with_agent_id_in_jsonl() {
        let dir = TempDir::new().unwrap();
        let session_dir = dir.path().join("session4");
        let sub_dir = session_dir.join("subagents");
        fs::create_dir_all(&sub_dir).unwrap();

        let agent_file = sub_dir.join("agent-xyz789.jsonl");
        let mut f = fs::File::create(&agent_file).unwrap();
        writeln!(f, r#"{{"agentId":"xyz789","agentType":"code-agent"}}"#).unwrap();
        writeln!(f, r#"{{"type":"user","message":{{"content":"implement feature X"}}}}"#).unwrap();

        let session_path = format!("{}.jsonl", session_dir.to_str().unwrap());
        let result = discover_subagents(&session_path);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].agent_type, "code-agent");
        assert!(result[0].description.contains("implement feature X"));
    }

    #[test]
    fn test_parse_codex_entry_response_item_user_input() {
        let entry = serde_json::json!({
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "user input text"}]
            },
            "timestamp": "2026-05-01T10:00:00Z"
        });
        let ts = Some("2026-05-01T10:00:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "response_item", &ts, &mut idx);
        assert!(result.is_some());
        let msgs = result.unwrap();
        assert_eq!(msgs[0].role, "user");
        assert_eq!(msgs[0].text, Some("user input text".to_string()));
    }

    #[test]
    fn test_parse_codex_entry_response_item_skips_xml() {
        let entry = serde_json::json!({
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "<system>hidden</system>"}]
            },
            "timestamp": "2026-05-01T10:00:00Z"
        });
        let ts = Some("2026-05-01T10:00:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "response_item", &ts, &mut idx);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_codex_entry_response_item_empty_text() {
        let entry = serde_json::json!({
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": ""}]
            },
            "timestamp": "2026-05-01T10:00:00Z"
        });
        let ts = Some("2026-05-01T10:00:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "response_item", &ts, &mut idx);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_codex_entry_user_message_empty_trimmed() {
        let entry = serde_json::json!({
            "type": "event_msg",
            "payload": {"type": "user_message", "message": "   "},
            "timestamp": "2026-05-01T10:00:00Z"
        });
        let ts = Some("2026-05-01T10:00:00Z".to_string());
        let mut idx = 0u32;
        let result = parse_codex_entry(&entry, "event_msg", &ts, &mut idx);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_cursor_entry_mixed_blocks() {
        let entry = serde_json::json!({
            "role": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Let me check..."},
                    {"type": "tool_use", "name": "Read", "id": "t1", "input": {"path": "/a"}},
                    {"type": "text", "text": "Found it."}
                ]
            }
        });
        let mut idx = 0u32;
        let msgs = parse_cursor_entry(&entry, "assistant", &mut idx);
        assert_eq!(msgs.len(), 3);
        assert_eq!(msgs[0].role, "assistant");
        assert_eq!(msgs[1].role, "tool_use");
        assert_eq!(msgs[2].role, "assistant");
    }

    #[test]
    fn test_parse_cursor_image_refs_webp() {
        let text = "<image_files>\n1. /tmp/photo.webp\n</image_files>";
        let refs = parse_cursor_image_refs(text);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].media_type, "image/webp");
    }

    #[test]
    fn test_parse_cursor_image_refs_gif() {
        let text = "<image_files>\n1. /tmp/anim.gif\n</image_files>";
        let refs = parse_cursor_image_refs(text);
        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].media_type, "image/gif");
    }

    #[test]
    fn test_system_subtype_no_duration() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            r#"{"type":"system","uuid":"s1","timestamp":"2026-05-01T10:00:00Z","subtype":"some_event","sessionId":"s1"}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].role, "meta");
        assert_eq!(msgs[0].text, Some("system/some_event".to_string()));
    }

    #[test]
    fn test_load_messages_malformed_lines_skipped() {
        let dir = TempDir::new().unwrap();
        let file = write_session_file(&dir, &[
            "this is not json",
            "",
            r#"{"type":"user","uuid":"u1","message":{"role":"user","content":"Hello"}}"#,
        ]);
        let msgs = load_messages(&file).unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].text, Some("Hello".to_string()));
    }
}
