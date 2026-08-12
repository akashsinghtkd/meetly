import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Sparkles } from "lucide-react";
import clsx from "clsx";
import { MeetingIcon } from "./ui";
import { useStore } from "../store/store";
import { relativeDate } from "../lib/format";
import { semanticSearch, type SemanticHit } from "../lib/semanticSearch";
import { usingRealEmbeddings } from "../lib/providers/embeddings";

interface Hit {
  meetingId: string;
  title: string;
  snippet: string;
  where: string;
}

type Mode = "keyword" | "semantic";

export function SearchView() {
  const meetings = useStore((s) => s.meetings);
  const openMeeting = useStore((s) => s.openMeeting);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("semantic");

  // Keyword: exact substring, synchronous.
  const keywordHits = useMemo<Hit[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const out: Hit[] = [];
    for (const m of meetings) {
      if (m.title.toLowerCase().includes(term)) {
        out.push({ meetingId: m.id, title: m.title, snippet: relativeDate(m.startedAt), where: "Title" });
      }
      if (m.summary?.executive.toLowerCase().includes(term)) {
        out.push({ meetingId: m.id, title: m.title, snippet: m.summary.executive, where: "Summary" });
      }
      for (const seg of m.transcript) {
        if (seg.text.toLowerCase().includes(term)) {
          out.push({ meetingId: m.id, title: m.title, snippet: seg.text, where: "Transcript" });
        }
      }
      for (const a of m.actionItems) {
        if (a.task.toLowerCase().includes(term)) {
          out.push({ meetingId: m.id, title: m.title, snippet: a.task, where: "Action item" });
        }
      }
    }
    return out.slice(0, 40);
  }, [q, meetings]);

  // Semantic: embedding similarity, async + debounced.
  const [semHits, setSemHits] = useState<SemanticHit[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);
  useEffect(() => {
    if (mode !== "semantic") return;
    const term = q.trim();
    if (!term) {
      setSemHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const hits = await semanticSearch(term, meetings, 25);
        if (reqId.current === id) setSemHits(hits);
      } catch (e) {
        console.error("[search] semantic failed:", e);
        if (reqId.current === id) setSemHits([]);
      } finally {
        if (reqId.current === id) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, mode, meetings]);

  const results: Hit[] = mode === "semantic" ? semHits : keywordHits;
  const hint =
    mode === "semantic"
      ? usingRealEmbeddings()
        ? "Semantic search — ranked by meaning (OpenAI embeddings)."
        : "Semantic search — offline mode. Add an OpenAI key in Settings for true meaning-based matching."
      : "Exact keyword match across titles, summaries, transcripts, and tasks.";

  return (
    <div className="max-w-2xl mx-auto px-16 py-12">
      <h1 className="text-2xl font-bold text-ink tracking-tight mb-6">Search</h1>

      <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 focus-within:border-accent">
        {mode === "semantic" ? (
          <Sparkles className="h-4 w-4 text-accent" />
        ) : (
          <Search className="h-4 w-4 text-ink-faint" />
        )}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            mode === "semantic"
              ? "Ask across all meetings — e.g. what did we decide about pricing?"
              : "Search across all meetings, transcripts, and tasks…"
          }
          className="flex-1 bg-transparent outline-none text-sm"
        />
        {searching && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
        <div className="flex items-center gap-0.5 rounded-md bg-surface-active p-0.5 text-xs">
          {(["semantic", "keyword"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                "rounded px-2 py-0.5 capitalize transition-colors",
                mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink-light",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-ink-faint mt-2">{hint}</p>

      <div className="mt-6 space-y-1">
        {results.map((h, i) => (
          <button
            key={`${h.meetingId}-${i}`}
            onClick={() => openMeeting(h.meetingId)}
            className="w-full text-left flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-hover"
          >
            <MeetingIcon className="mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink text-sm">{h.title || "Untitled meeting"}</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-faint bg-surface-active rounded px-1.5 py-0.5">
                  {h.where}
                </span>
              </div>
              <div className="text-sm text-ink-light truncate">{h.snippet}</div>
            </div>
          </button>
        ))}
        {q && !searching && results.length === 0 && (
          <p className="text-ink-faint text-sm px-3 py-6">No results for “{q}”.</p>
        )}
      </div>
    </div>
  );
}
