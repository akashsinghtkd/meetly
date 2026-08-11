import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { MeetingIcon } from "./ui";
import { useStore } from "../store/store";
import { relativeDate } from "../lib/format";

interface Hit {
  meetingId: string;
  title: string;
  snippet: string;
  where: string;
}

export function SearchView() {
  const meetings = useStore((s) => s.meetings);
  const openMeeting = useStore((s) => s.openMeeting);
  const [q, setQ] = useState("");

  const hits = useMemo<Hit[]>(() => {
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

  return (
    <div className="max-w-2xl mx-auto px-16 py-12">
      <h1 className="text-2xl font-bold text-ink tracking-tight mb-6">Search</h1>

      <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 focus-within:border-accent">
        <Search className="h-4 w-4 text-ink-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search across all meetings, transcripts, and tasks…"
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </div>
      <p className="text-[11px] text-ink-faint mt-2">
        Keyword search today; semantic search (embeddings) lands in Phase 4.
      </p>

      <div className="mt-6 space-y-1">
        {hits.map((h, i) => (
          <button
            key={i}
            onClick={() => openMeeting(h.meetingId)}
            className="w-full text-left flex items-start gap-3 rounded-md px-3 py-2.5 hover:bg-surface-hover"
          >
            <MeetingIcon className="mt-0.5" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink text-sm">{h.title}</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-faint bg-surface-active rounded px-1.5 py-0.5">
                  {h.where}
                </span>
              </div>
              <div className="text-sm text-ink-light truncate">{h.snippet}</div>
            </div>
          </button>
        ))}
        {q && hits.length === 0 && (
          <p className="text-ink-faint text-sm px-3 py-6">No results for “{q}”.</p>
        )}
      </div>
    </div>
  );
}
