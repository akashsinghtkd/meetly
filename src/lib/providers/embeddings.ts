// Text embeddings for semantic search. Two providers:
//  - OpenAI (real embeddings) via a native command, so there's no browser CORS
//    and the key stays native — matching chat/transcription.
//  - A local, offline bag-of-words fallback (feature hashing) so search still
//    works with no API key. Cosine over these ≈ token overlap, i.e. a smarter
//    keyword match; true synonym-level semantics needs the OpenAI provider.

import { useSettings } from "../../store/settingsStore";
import { inTauri } from "../tauri";

export interface Embedder {
  /** Identifies the provider so a switch (e.g. adding a key) invalidates caches. */
  id: string;
  embed(texts: string[]): Promise<number[][]>;
}

const OPENAI_EMBED_MODEL = "text-embedding-3-small";

class OpenAIEmbedder implements Embedder {
  id = `openai:${OPENAI_EMBED_MODEL}`;
  constructor(private apiKey: string) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<{ vectors: number[][]; input_tokens: number | null }>("embed_texts", {
      model: OPENAI_EMBED_MODEL,
      apiKey: this.apiKey,
      texts,
    });
    return res.vectors;
  }
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

/** OpenAI when a key is configured under Tauri; the offline embedder otherwise. */
export function getEmbedder(): Embedder {
  const key = useSettings.getState().apiKeys?.openai?.trim();
  if (inTauri() && key) return new OpenAIEmbedder(key);
  return new LocalEmbedder();
}

/** True when real (OpenAI) embeddings are in use — for an honest UI label. */
export function usingRealEmbeddings(): boolean {
  return Boolean(inTauri() && useSettings.getState().apiKeys?.openai?.trim());
}
