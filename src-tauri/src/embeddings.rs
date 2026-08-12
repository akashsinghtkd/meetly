//! Text embeddings HTTP, in Rust for the same reasons as chat/transcription:
//! no browser CORS, and the API key stays native. Powers semantic search.

use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Serialize)]
pub struct EmbedResult {
    /// One vector per input text, in the same order as the input.
    pub vectors: Vec<Vec<f32>>,
    pub input_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OAEmbedResp {
    data: Vec<OAEmbedding>,
    #[serde(default)]
    usage: Option<OAUsage>,
}

#[derive(Debug, Deserialize)]
struct OAEmbedding {
    embedding: Vec<f32>,
    index: usize,
}

#[derive(Debug, Deserialize)]
struct OAUsage {
    #[serde(default)]
    prompt_tokens: Option<u32>,
}

#[tauri::command]
pub async fn embed_texts(
    model: String,
    api_key: String,
    texts: Vec<String>,
    // OpenAI-compatible base URL (e.g. Gemini's). Defaults to OpenAI.
    base_url: Option<String>,
) -> Result<EmbedResult, String> {
    if api_key.trim().is_empty() {
        return Err("missing API key".into());
    }
    if texts.is_empty() {
        return Ok(EmbedResult { vectors: vec![], input_tokens: Some(0) });
    }

    let base = base_url
        .filter(|b| !b.trim().is_empty())
        .unwrap_or_else(|| "https://api.openai.com/v1".into());
    let url = format!("{}/embeddings", base.trim_end_matches('/'));

    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .bearer_auth(api_key)
        .json(&json!({ "model": model, "input": texts }))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI {status}: {text}"));
    }

    let mut parsed: OAEmbedResp =
        serde_json::from_str(&text).map_err(|e| format!("parse error: {e}; body: {text}"))?;
    // The API returns items with an `index`; sort so vectors line up with inputs.
    parsed.data.sort_by_key(|d| d.index);

    Ok(EmbedResult {
        vectors: parsed.data.into_iter().map(|d| d.embedding).collect(),
        input_tokens: parsed.usage.and_then(|u| u.prompt_tokens),
    })
}
