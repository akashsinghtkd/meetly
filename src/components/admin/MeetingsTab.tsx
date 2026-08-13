import { useEffect, useState } from "react";
import { Loader2, Mic, Search, Trash2, X } from "lucide-react";
import { Button } from "../ui";
import { useAdminConsole } from "../../store/adminConsoleStore";
import { supabase } from "../../lib/supabase";
import { formatDuration, relativeDate } from "../../lib/format";

export function MeetingsTab() {
  const meetings = useAdminConsole((s) => s.meetings);
  const teamspaces = useAdminConsole((s) => s.teamspaces);
  const busy = useAdminConsole((s) => s.busy);
  const loadTeamspaces = useAdminConsole((s) => s.loadTeamspaces);
  const loadMeetings = useAdminConsole((s) => s.loadMeetings);
  const deleteMeeting = useAdminConsole((s) => s.deleteMeeting);

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamspaces.length) loadTeamspaces();
    loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    loadMeetings({ search, teamspaceId: teamFilter || null });
  };

  return (
    <div>
      <form onSubmit={runSearch} className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            className="field pl-8 w-full"
            placeholder="Search by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="field"
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value);
            loadMeetings({ search, teamspaceId: e.target.value || null });
          }}
        >
          <option value="">All teamspaces</option>
          {teamspaces.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      <p className="text-xs text-ink-faint mb-3">
        {meetings.length} meeting{meetings.length === 1 ? "" : "s"} (most recent 100)
      </p>

      {busy && !meetings.length ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading meetings…
        </div>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-ink-faint py-8">No meetings match.</p>
      ) : (
        <div className="space-y-1.5">
          {meetings.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-line px-4 py-2.5 flex items-center gap-3"
            >
              <button
                type="button"
                onClick={() => setOpenId(m.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink text-sm truncate">{m.title || "Untitled meeting"}</span>
                  {m.has_audio && <Mic className="h-3 w-3 text-ink-faint shrink-0" />}
                  <span className="text-[11px] rounded px-1.5 py-0.5 bg-surface-active text-ink-faint shrink-0">
                    {m.status}
                  </span>
                </div>
                <p className="text-xs text-ink-faint mt-0.5 truncate">
                  {m.teamspace_name ?? "(no team)"} · {m.user_email ?? "unknown"} · {relativeDate(m.started_at)}
                  {m.duration_secs ? ` · ${formatDuration(m.duration_secs)}` : ""}
                </p>
              </button>
              <Button
                variant="ghost"
                className="text-xs px-2 py-1 shrink-0 text-red-600 hover:bg-red-50"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Permanently delete "${m.title || "Untitled meeting"}"? This can't be undone.`)) {
                    deleteMeeting(m.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {openId && <MeetingDetail meetingId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function MeetingDetail({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const [meeting, setMeeting] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase()
      .rpc("admin_get_meeting", { p_meeting_id: meetingId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else setMeeting(data);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="font-semibold text-ink">{meeting?.title ?? "Loading…"}</h3>
          <button onClick={onClose} className="text-ink-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {!meeting && !error && (
          <div className="flex items-center gap-2 text-sm text-ink-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {meeting && (
          <div className="space-y-4 text-sm">
            <p className="text-xs text-ink-faint">
              {relativeDate(meeting.started_at)} · {formatDuration(meeting.duration_secs)} · status: {meeting.status}
            </p>
            {meeting.summary && (
              <div>
                <p className="text-xs font-semibold text-ink-faint mb-1">Summary</p>
                <pre className="whitespace-pre-wrap text-xs bg-surface-active rounded-lg p-3 text-ink">
                  {JSON.stringify(meeting.summary, null, 2)}
                </pre>
              </div>
            )}
            {meeting.action_items?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-ink-faint mb-1">Action items</p>
                <pre className="whitespace-pre-wrap text-xs bg-surface-active rounded-lg p-3 text-ink">
                  {JSON.stringify(meeting.action_items, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-ink-faint mb-1">
                Transcript ({meeting.transcript?.length ?? 0} segments)
              </p>
              <pre className="whitespace-pre-wrap text-xs bg-surface-active rounded-lg p-3 text-ink max-h-64 overflow-y-auto">
                {JSON.stringify(meeting.transcript, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
