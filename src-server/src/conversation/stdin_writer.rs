use crate::conversation::types::{AttachmentData, PermissionDecision};
use serde_json::Value;
use uuid::Uuid;

/// Build a user message payload for CLI stdin.
/// Returns (json_line, uuid) — UUID for dedup/tracking.
pub fn build_user_message(text: &str, attachments: &[AttachmentData]) -> (String, String) {
    let uuid = Uuid::new_v4().to_string();

    let content = if attachments.is_empty() {
        Value::String(text.to_string())
    } else {
        let mut parts: Vec<Value> = Vec::new();
        if !text.is_empty() {
            parts.push(serde_json::json!({"type": "text", "text": text}));
        }
        for att in attachments {
            if is_image_type(&att.media_type) {
                parts.push(serde_json::json!({
                    "type": "image",
                    "source": {"type": "base64", "media_type": att.media_type, "data": att.content_base64}
                }));
            } else if is_document_type(&att.media_type) {
                parts.push(serde_json::json!({
                    "type": "document",
                    "source": {"type": "base64", "media_type": att.media_type, "data": att.content_base64}
                }));
            }
        }
        Value::Array(parts)
    };

    let payload = serde_json::json!({
        "type": "user",
        "uuid": uuid,
        "message": {"role": "user", "content": content}
    });

    let mut line = serde_json::to_string(&payload).unwrap();
    line.push('\n');
    (line, uuid)
}

/// Build a permission response for CLI stdin.
pub fn build_permission_response(request_id: &str, decision: &PermissionDecision) -> String {
    let response = match decision {
        PermissionDecision::Allow => serde_json::json!({"behavior": "allow", "updatedInput": {}}),
        PermissionDecision::Deny => serde_json::json!({"behavior": "deny", "message": "User denied permission"}),
    };
    let payload = serde_json::json!({
        "type": "control_response",
        "response": {"subtype": "success", "request_id": request_id, "response": response}
    });
    let mut line = serde_json::to_string(&payload).unwrap();
    line.push('\n');
    line
}

/// Build an interrupt control request for CLI stdin.
pub fn build_interrupt_request() -> String {
    let request_id = format!("ap_int_{}", Uuid::new_v4());
    let payload = serde_json::json!({
        "type": "control_request",
        "request_id": request_id,
        "request": {"subtype": "interrupt"}
    });
    let mut line = serde_json::to_string(&payload).unwrap();
    line.push('\n');
    line
}

fn is_image_type(media_type: &str) -> bool {
    matches!(media_type, "image/png" | "image/jpeg" | "image/gif" | "image/webp")
}

fn is_document_type(media_type: &str) -> bool {
    media_type == "application/pdf"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_user_message_text_only() {
        let (line, uuid) = build_user_message("hello", &[]);
        assert!(!uuid.is_empty());
        assert!(line.ends_with('\n'));
        let parsed: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["type"], "user");
        assert_eq!(parsed["uuid"], uuid);
        assert_eq!(parsed["message"]["role"], "user");
        assert_eq!(parsed["message"]["content"], "hello");
    }

    #[test]
    fn build_user_message_with_image() {
        let att = AttachmentData {
            filename: "photo.png".into(),
            media_type: "image/png".into(),
            content_base64: "iVBOR...".into(),
        };
        let (line, _) = build_user_message("check this", &[att]);
        let parsed: Value = serde_json::from_str(line.trim()).unwrap();
        let content = parsed["message"]["content"].as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[1]["type"], "image");
    }

    #[test]
    fn build_permission_allow() {
        let line = build_permission_response("req_1", &PermissionDecision::Allow);
        let parsed: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["type"], "control_response");
        assert_eq!(parsed["response"]["response"]["behavior"], "allow");
    }

    #[test]
    fn build_permission_deny() {
        let line = build_permission_response("req_2", &PermissionDecision::Deny);
        let parsed: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["response"]["response"]["behavior"], "deny");
    }

    #[test]
    fn build_interrupt_has_request_id() {
        let line = build_interrupt_request();
        let parsed: Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["type"], "control_request");
        assert!(parsed["request_id"].as_str().unwrap().starts_with("ap_int_"));
        assert_eq!(parsed["request"]["subtype"], "interrupt");
    }
}
