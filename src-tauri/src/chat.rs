//! Chat-completion HTTP (for AI notes/summary and Q&A), done in Rust for the
//! same reasons as transcription: no browser CORS, key stays native. Returns the
//! exact token usage so the frontend can compute an accurate cost.

use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize)]
pub struct ChatResult {
    pub content: String,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OAChatResp {
    choices: Vec<OAChoice>,
    #[serde(default)]
    usage: Option<OAUsage>,
}

#[derive(Debug, Deserialize)]
struct OAChoice {
    message: OAMessage,
}

#[derive(Debug, Deserialize)]
struct OAMessage {
    #[serde(default)]
    content: String,
}

#[derive(Debug, Deserialize)]
struct OAUsage {
    #[serde(default)]
    prompt_tokens: Option<u32>,
    #[serde(default)]
    completion_tokens: Option<u32>,
}

#[tauri::command]
pub async fn chat_completion(
    model: String,
    api_key: String,
    system: String,
    user: String,
    json_mode: bool,
) -> Result<ChatResult, String> {
    if api_key.trim().is_empty() {
        return Err("missing API key".into());
    }

    let mut body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "temperature": 0.3,
    });
    if json_mode {
        body["response_format"] = json!({ "type": "json_object" });
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI {status}: {text}"));
    }

    let parsed: OAChatResp =
        serde_json::from_str(&text).map_err(|e| format!("parse error: {e}; body: {text}"))?;

    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();
    let (input_tokens, output_tokens) = match parsed.usage {
        Some(u) => (u.prompt_tokens, u.completion_tokens),
        None => (None, None),
    };

    Ok(ChatResult {
        content,
        input_tokens,
        output_tokens,
    })
}
