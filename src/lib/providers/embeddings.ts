// Text embeddings for semantic search. Two providers:
//  - OpenAI (real embeddings) via a native command, so there's no browser CORS
//    and the key stays native — matching chat/transcription.
//  - A local, offline bag-of-words fallback (feature hashing) so search still
//    works with no API key. Cosine over these ≈ token overlap, i.e. a smarter
//    keyword match; true synonym-level semantics needs the OpenAI provider.

import { useSettings } from "../../store/settingsStore";
import { inTauri } from "../tauri";
import { apiBaseFor, isOpenAICompat, modelsFor } from "./catalog";

export interface Embedder {
  /** Identifies the provider so a switch (e.g. adding a key) invalidates caches. */
  id: string;
  embed(texts: string[]): Promise<number[][]>;
}

// Any OpenAI-compatible embeddings provider (OpenAI, Gemini) — only base + model differ.
class OpenAICompatEmbedder implements Embedder {
  id: string;
  constructor(
    provider: string,
    private model: string,
    private apiKey: string,
    private baseUrl?: string,
  ) {
    this.id = `${provider}:${model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<{ vectors: number[][]; input_tokens: number | null }>("embed_texts", {
      model: this.model,
      apiKey: this.apiKey,
      texts,
      baseUrl: this.baseUrl,
    });
    return res.vectors;
  }
}

/** Real embeddings from the active chat provider, or null to fall back offline. */
function resolveRemoteEmbedder(): OpenAICompatEmbedder | null {
  const { chatProvider, apiKeys } = useSettings.getState();
  const key = apiKeys[chatProvider]?.trim();
  const model = modelsFor(chatProvider, "embedding")[0]?.id;
  if (inTauri() && isOpenAICompat(chatProvider) && key && model) {
    return new OpenAICompatEmbedder(chatProvider, model, key, apiBaseFor(chatProvider));
  }
  return null;
}

// ── Offline fallback: feature-hashed bag-of-words ───────────────────────────
const DIM = 512;
const STOP = new Set(
  "the a an and or of to in is it that this for on with as are was be by at from we you they he she our your their but not no so if then than into over under about can will just have has had do does".split(
    " ",
  ),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !STOP.has(t),
  );
}

function hashToken(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % DIM;
}

class LocalEmbedder implements Embedder {
  id = "local:bow";

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const v = new Array<number>(DIM).fill(0);
      for (const t of tokenize(text)) v[hashToken(t)] += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }
}

/** The active provider's embeddings when a key is set; the offline embedder otherwise. */
export function getEmbedder(): Embedder {
  return resolveRemoteEmbedder() ?? new LocalEmbedder();
}

/** True when real (provider) embeddings are in use — for an honest UI label. */
export function usingRealEmbeddings(): boolean {
  return resolveRemoteEmbedder() !== null;
}
