//! Transcription HTTP, done in Rust so we avoid browser CORS on the OpenAI API
//! and keep the API key out of the webview. The frontend's provider layer calls
//! the `transcribe_file` command; adding Gemini/Deepgram later means adding a
//! sibling command (or branching on `model`) here.

use serde::{Deserialize, Serialize};

/// Normalized result handed back to the frontend (snake_case matches the TS type).
#[derive(Debug, Serialize)]
pub struct TranscribeResult {
    pub text: String,
    pub segments: Vec<Seg>,
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct Seg {
    pub t_start: f64,
    pub t_end: f64,
    pub text: String,
}

// ── OpenAI response shapes ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OAResp {
    #[serde(default)]
    text: String,
    #[serde(default)]
    segments: Option<Vec<OASeg>>,
    #[serde(default)]
    usage: Option<OAUsage>,
}

#[derive(Debug, Deserialize)]
struct OASeg {
    start: f64,
    end: f64,
    text: String,
}

#[derive(Debug, Deserialize)]
struct OAUsage {
    #[serde(default)]
    input_tokens: Option<u32>,
    #[serde(default)]
    output_tokens: Option<u32>,
    #[serde(default)]
    prompt_tokens: Option<u32>,
    #[serde(default)]
    completion_tokens: Option<u32>,
}

#[tauri::command]
pub async fn transcribe_file(
    path: String,
    model: String,
    api_key: String,
) -> Result<TranscribeResult, String> {
    if api_key.trim().is_empty() {
        return Err("missing API key".into());
    }

    let bytes = std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;

    // Only whisper-1 returns per-segment timestamps (verbose_json). The gpt-4o
    // transcribe models return plain text + token usage.
    let fmt = if model == "whisper-1" { "verbose_json" } else { "json" };

    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .text("model", model)
        .text("response_format", fmt)
        .part("file", part);

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI {status}: {body}"));
    }

    let parsed: OAResp =
        serde_json::from_str(&body).map_err(|e| format!("parse error: {e}; body: {body}"))?;

    let segments = parsed
        .segments
        .unwrap_or_default()
        .into_iter()
        .map(|s| Seg {
            t_start: s.start,
            t_end: s.end,
            text: s.text,
        })
        .collect();

    let (input_tokens, output_tokens) = match parsed.usage {
        Some(u) => (
            u.input_tokens.or(u.prompt_tokens),
            u.output_tokens.or(u.completion_tokens),
        ),
        None => (None, None),
    };

    Ok(TranscribeResult {
        text: parsed.text,
        segments,
        input_tokens,
        output_tokens,
    })
}

// ── Google Gemini (multimodal generateContent — plain-text transcript) ───────
//
// Gemini has no Whisper-style endpoint; it transcribes audio through the
// multimodal generateContent call and returns plain text (no timestamps), so
// the frontend treats each chunk as one segment, exactly like gpt-4o-transcribe.

#[derive(Debug, Deserialize)]
struct GemResp {
    #[serde(default)]
    candidates: Vec<GemCandidate>,
    #[serde(default, rename = "usageMetadata")]
    usage: Option<GemUsage>,
}
#[derive(Debug, Deserialize)]
struct GemCandidate {
    #[serde(default)]
    content: Option<GemContent>,
}
#[derive(Debug, Deserialize)]
struct GemContent {
    #[serde(default)]
    parts: Vec<GemPart>,
}
#[derive(Debug, Deserialize)]
struct GemPart {
    #[serde(default)]
    text: String,
}
#[derive(Debug, Deserialize)]
struct GemUsage {
    #[serde(default, rename = "promptTokenCount")]
    prompt_token_count: Option<u32>,
    #[serde(default, rename = "candidatesTokenCount")]
    candidates_token_count: Option<u32>,
}

#[tauri::command]
pub async fn transcribe_gemini(
    path: String,
    model: String,
    api_key: String,
) -> Result<TranscribeResult, String> {
    use base64::Engine;
    if api_key.trim().is_empty() {
        return Err("missing API key".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;
    let audio_b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    let body = serde_json::json!({
        "contents": [{
            "parts": [
                { "text": "Transcribe the spoken audio verbatim. Output only the transcript text — no timestamps, no speaker labels, no commentary. If there is no speech, output nothing." },
                { "inline_data": { "mime_type": "audio/wav", "data": audio_b64 } }
            ]
        }],
        "generationConfig": { "temperature": 0 }
    });

    let url =
        format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Gemini {status}: {raw}"));
    }

    let parsed: GemResp =
        serde_json::from_str(&raw).map_err(|e| format!("parse error: {e}; body: {raw}"))?;

    let text = parsed
        .candidates
        .into_iter()
        .next()
        .and_then(|c| c.content)
        .map(|c| c.parts.into_iter().map(|p| p.text).collect::<String>())
        .unwrap_or_default()
        .trim()
        .to_string();

    let (input_tokens, output_tokens) = match parsed.usage {
        Some(u) => (u.prompt_token_count, u.candidates_token_count),
        None => (None, None),
    };

    // Plain text → the frontend maps the whole chunk to one segment.
    Ok(TranscribeResult {
        text,
        segments: vec![],
        input_tokens,
        output_tokens,
    })
}

// ── Deepgram (cheaper, high quality, native diarization) ────────────────────

#[derive(Debug, Deserialize)]
struct DGResp {
    results: DGResults,
}
#[derive(Debug, Deserialize)]
struct DGResults {
    channels: Vec<DGChannel>,
}
#[derive(Debug, Deserialize)]
struct DGChannel {
    alternatives: Vec<DGAlt>,
}
#[derive(Debug, Deserialize)]
struct DGAlt {
    #[serde(default)]
    transcript: String,
}

#[tauri::command]
pub async fn transcribe_deepgram(
    path: String,
    model: String,
    api_key: String,
) -> Result<TranscribeResult, String> {
    if api_key.trim().is_empty() {
        return Err("missing API key".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;

    let url = format!(
        "https://api.deepgram.com/v1/listen?model={model}&smart_format=true&punctuate=true"
    );
    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .header("Authorization", format!("Token {api_key}"))
        .header("Content-Type", "audio/wav")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Deepgram {status}: {text}"));
    }

    let parsed: DGResp =
        serde_json::from_str(&text).map_err(|e| format!("parse error: {e}; body: {text}"))?;
    let transcript = parsed
        .results
        .channels
        .into_iter()
        .next()
        .and_then(|c| c.alternatives.into_iter().next())
        .map(|a| a.transcript)
        .unwrap_or_default();

    // Deepgram returns word-level detail; for the live per-chunk path we surface
    // the whole chunk as one segment (timed by the caller). Deepgram bills per
    // minute of audio, so no token usage is returned.
    Ok(TranscribeResult {
        text: transcript,
        segments: vec![],
        input_tokens: None,
        output_tokens: None,
    })
}

// ── Diarization (full-file, acoustic speaker separation) ────────────────────

#[derive(Debug, Serialize)]
pub struct DiarizeResult {
    pub segments: Vec<DiarSeg>,
}

#[derive(Debug, Serialize)]
pub struct DiarSeg {
    pub speaker: u32,
    pub t_start: f64,
    pub t_end: f64,
    pub text: String,
}

#[derive(Debug, Deserialize)]
struct DGDiarResp {
    results: DGDiarResults,
}
#[derive(Debug, Deserialize)]
struct DGDiarResults {
    channels: Vec<DGDiarChannel>,
}
#[derive(Debug, Deserialize)]
struct DGDiarChannel {
    alternatives: Vec<DGDiarAlt>,
}
#[derive(Debug, Deserialize)]
struct DGDiarAlt {
    #[serde(default)]
    words: Vec<DGWord>,
}
#[derive(Debug, Deserialize)]
struct DGWord {
    start: f64,
    end: f64,
    #[serde(default)]
    speaker: u32,
    #[serde(default)]
    word: String,
    #[serde(default)]
    punctuated_word: Option<String>,
}

#[tauri::command]
pub async fn diarize_deepgram(
    path: String,
    model: String,
    api_key: String,
) -> Result<DiarizeResult, String> {
    if api_key.trim().is_empty() {
        return Err("missing API key".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("read {path}: {e}"))?;

    let url = format!(
        "https://api.deepgram.com/v1/listen?model={model}&smart_format=true&punctuate=true&diarize=true"
    );
    let client = reqwest::Client::new();
    let resp = client
        .post(url)
        .header("Authorization", format!("Token {api_key}"))
        .header("Content-Type", "audio/wav")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Deepgram {status}: {text}"));
    }

    let parsed: DGDiarResp =
        serde_json::from_str(&text).map_err(|e| format!("parse error: {e}; body: {text}"))?;
    let words = parsed
        .results
        .channels
        .into_iter()
        .next()
        .and_then(|c| c.alternatives.into_iter().next())
        .map(|a| a.words)
        .unwrap_or_default();

    // Group consecutive words by speaker into turns.
    let mut segments: Vec<DiarSeg> = Vec::new();
    for w in words {
        let token = w.punctuated_word.unwrap_or(w.word);
        if token.is_empty() {
            continue;
        }
        match segments.last_mut() {
            Some(last) if last.speaker == w.speaker => {
                last.text.push(' ');
                last.text.push_str(&token);
                last.t_end = w.end;
            }
            _ => segments.push(DiarSeg {
                speaker: w.speaker,
                t_start: w.start,
                t_end: w.end,
                text: token,
            }),
        }
    }

    Ok(DiarizeResult { segments })
}
