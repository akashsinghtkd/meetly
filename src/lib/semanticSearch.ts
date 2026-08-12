// Semantic search across all meetings. Chunks each meeting into passages,
// embeds them once (cached until the meeting changes), and ranks by cosine
// similarity to the query embedding. Works offline (bag-of-words embedder) and
// upgrades to true embeddings when an OpenAI key is set.

import type { Meeting } from "./types";
import { getEmbedder, type Embedder } from "./providers/embeddings";

export interface SemanticHit {
  meetingId: string;
  title: string;
  where: string;
  snippet: string;
  /** Cosine similarity, 0..1. */
  score: number;
}

interface Chunk {
  text: string;
  where: string;
}
interface IndexedMeeting {
  hash: string;
  chunks: { text: string; where: string; vec: number[] }[];
}

// In-memory index, rebuilt lazily. Keyed by embedder id so adding a key (which
// switches to real embeddings) transparently re-indexes.
let cacheEmbedderId = "";
const cache = new Map<string, IndexedMeeting>();

const TRANSCRIPT_WINDOW = 700;
const MAX_TRANSCRIPT_CHUNKS = 10;

function meetingChunks(m: Meeting): Chunk[] {
  const chunks: Chunk[] = [];
  const head = [m.title, m.summary?.executive ?? "", ...(m.summary?.decisions ?? [])]
    .filter(Boolean)
    .join(". ");
  if (head.trim()) chunks.push({ text: head, where: "Summary" });

  const actions = m.actionItems
    .map((a) => `${a.owner ? `${a.owner}: ` : ""}${a.task}`)
    .filter((s) => s.trim());
  if (actions.length) chunks.push({ text: actions.join(". "), where: "Action items" });

  const transcript = m.transcript.map((s) => s.text).join(" ");
  for (let i = 0, n = 0; i < transcript.length && n < MAX_TRANSCRIPT_CHUNKS; i += TRANSCRIPT_WINDOW, n++) {
    const seg = transcript.slice(i, i + TRANSCRIPT_WINDOW).trim();
    if (seg) chunks.push({ text: seg, where: "Transcript" });
  }
  return chunks;
}

/** Cheap content signature: re-embed a meeting only when this changes. */
function hashMeeting(m: Meeting): string {
  return [
    m.title,
    m.summary?.executive ?? "",
    m.actionItems.length,
    m.transcript.length,
    m.transcript[m.transcript.length - 1]?.text ?? "",
  ].join("|");
}

async function ensureIndex(meetings: Meeting[], embedder: Embedder): Promise<void> {
  if (embedder.id !== cacheEmbedderId) {
    cache.clear();
    cacheEmbedderId = embedder.id;
  }

  const pending: { id: string; chunks: Chunk[]; hash: string }[] = [];
  for (const m of meetings) {
    const hash = hashMeeting(m);
    const cached = cache.get(m.id);
    if (cached && cached.hash === hash) continue;
    const chunks = meetingChunks(m);
    if (chunks.length === 0) {
      cache.set(m.id, { hash, chunks: [] });
      continue;
    }
    pending.push({ id: m.id, chunks, hash });
  }

  if (pending.length > 0) {
    const flat = pending.flatMap((p) => p.chunks.map((c) => c.text));
    const vecs = await embedder.embed(flat);
    let off = 0;
    for (const p of pending) {
      const chunks = p.chunks.map((c, i) => ({ text: c.text, where: c.where, vec: vecs[off + i] }));
      off += p.chunks.length;
      cache.set(p.id, { hash: p.hash, chunks });
    }
  }

  // Drop meetings that no longer exist.
  const live = new Set(meetings.map((m) => m.id));
  for (const key of [...cache.keys()]) if (!live.has(key)) cache.delete(key);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function semanticSearch(
  query: string,
  meetings: Meeting[],
  k = 20,
): Promise<SemanticHit[]> {
  if (!query.trim()) return [];
  const embedder = getEmbedder();
  await ensureIndex(meetings, embedder);
  const [qv] = await embedder.embed([query.trim()]);

  const titleById = new Map(meetings.map((m) => [m.id, m.title]));
  // Keep only the single best-matching passage per meeting.
  const best = new Map<string, SemanticHit>();
  for (const [meetingId, indexed] of cache) {
    for (const c of indexed.chunks) {
      const score = cosine(qv, c.vec);
      const cur = best.get(meetingId);
      if (!cur || score > cur.score) {
        best.set(meetingId, {
          meetingId,
          title: titleById.get(meetingId) || "Untitled meeting",
          where: c.where,
          snippet: c.text.slice(0, 240),
          score,
        });
      }
    }
  }

  return [...best.values()]
    .filter((h) => h.score > 0.001)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export interface Passage {
  meetingId: string;
  title: string;
  text: string;
  score: number;
}

/**
 * Top-k passages across all meetings (fuller text than {@link semanticSearch},
 * and NOT deduped per meeting) — the retrieval half of "ask across meetings".
 */
export async function retrievePassages(
  query: string,
  meetings: Meeting[],
  k = 8,
): Promise<Passage[]> {
  if (!query.trim()) return [];
  const embedder = getEmbedder();
  await ensureIndex(meetings, embedder);
  const [qv] = await embedder.embed([query.trim()]);
  const titleById = new Map(meetings.map((m) => [m.id, m.title]));

  const all: Passage[] = [];
  for (const [meetingId, indexed] of cache) {
    for (const c of indexed.chunks) {
      const score = cosine(qv, c.vec);
      if (score > 0.001) {
        all.push({ meetingId, title: titleById.get(meetingId) || "Untitled meeting", text: c.text, score });
      }
    }
  }
  return all.sort((a, b) => b.score - a.score).slice(0, k);
}
