// Low-level chat-completion wrapper. Delegates to the Rust `chat_completion`
// command (no CORS, key stays native). Returns exact token usage.

export interface ChatOutput {
  content: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function chatCompletion(
  model: string,
  apiKey: string,
  system: string,
  user: string,
  jsonMode: boolean,
  /** OpenAI-compatible base URL (e.g. Gemini's). Omit for OpenAI. */
  baseUrl?: string,
): Promise<ChatOutput> {
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<{
    content: string;
    input_tokens: number | null;
    output_tokens: number | null;
  }>("chat_completion", { model, apiKey, system, user, jsonMode, baseUrl });
  return {
    content: res.content,
    inputTokens: res.input_tokens ?? undefined,
    outputTokens: res.output_tokens ?? undefined,
  };
}
