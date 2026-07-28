import { Clock, Monitor, Plus, Users } from "lucide-react";
import { useStore } from "../store/store";
import { PageHeader } from "./PageHeader";
import { Button, EmptyState, RecordGlyph } from "./ui";
import { formatDuration, relativeDate } from "../lib/format";
import { inTauri } from "../lib/tauri";

export function MeetingList() {
  const meetings = useStore((s) => s.meetings);
  const projects = useStore((s) => s.projects);
  const openMeeting = useStore((s) => s.openMeeting);
  const openProject = useStore((s) => s.openProject);
  const startMeeting = useStore((s) => s.startMeeting);
  const recording = useStore((s) => s.recording);
  const desktop = inTauri();

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const sorted = [...meetings].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="max-w-3xl mx-auto px-8 sm:px-12 py-10 sm:py-12">
      <PageHeader
        title="All meetings"
        subtitle={
          meetings.length
            ? `${meetings.length} meeting${meetings.length === 1 ? "" : "s"}`
            : "Record, transcribe, and summarize your calls"
        }
      />

      {meetings.length === 0 ? (
        <EmptyState
          bare
          icon={<RecordGlyph size="lg" />}
          title="No meetings yet"
          description={
            desktop
              ? "Start a recording to capture mic and system audio, then get notes and action items automatically."
              : "Recording works in the Meetly desktop app. Sign in there to sync meetings here."
          }
          action={
            desktop ? (
              <Button onClick={() => startMeeting()} disabled={recording.active}>
                <Plus className="h-4 w-4" /> New meeting
              </Button>
            ) : (
              <p className="text-xs text-ink-faint inline-flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" /> Open the desktop app to record
              </p>
            )
          }
        />
      ) : (
        <div className="rounded-xl border border-line overflow-hidden bg-surface">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_88px] gap-3 px-4 py-2.5 text-[12px] font-medium text-ink-faint bg-surface-sidebar border-b border-line">
            <div>Meeting</div>
            <div className="flex items-center gap-1 justify-end">
              <Clock className="h-3.5 w-3.5" />
            </div>
            <div className="text-right">Date</div>
          </div>

          <ul className="divide-y divide-line">
            {sorted.map((m) => {
              const project = m.projectId ? projectById[m.projectId] : null;
              const people = m.participants.filter(Boolean);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMeeting(m.id)}
                    className="w-full text-left grid grid-cols-[minmax(0,1fr)_72px_88px] gap-3 px-4 py-3.5 hover:bg-surface-hover transition-colors group focus-visible:outline-none focus-visible:bg-accent-soft"
                  >
                    <div className="min-w-0 flex gap-3">
                      <span
                        className="mt-0.5 h-9 w-9 rounded-lg bg-surface-active grid place-items-center text-base shrink-0"
                        aria-hidden
                      >
                        {m.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-ink truncate group-hover:text-accent">
                            {m.title || "Untitled meeting"}
                          </span>
                          {m.status === "recording" && (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 rounded-md px-1.5 py-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 recording-dot" />
                              Live
                            </span>
                          )}
                          {m.status === "processing" && (
                            <span className="shrink-0 text-[11px] font-medium text-amber-700 bg-amber-50 rounded-md px-1.5 py-0.5">
                              Processing
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-faint">
                          {project && (
                            <span
                              role="link"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                openProject(project.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  openProject(project.id);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-surface-active text-ink-light px-1.5 py-0.5 hover:bg-surface-hover hover:text-ink"
                            >
                              <span aria-hidden>{project.emoji}</span>
                              {project.name}
                            </span>
                          )}
                          {people.length > 0 && (
                            <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                              <Users className="h-3 w-3 shrink-0" />
                              {people.slice(0, 3).join(", ")}
                              {people.length > 3 ? ` +${people.length - 3}` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end text-sm text-ink-light tabular-nums">
                      {m.durationSecs ? formatDuration(m.durationSecs) : "—"}
                    </div>
                    <div className="flex items-center justify-end text-sm text-ink-light whitespace-nowrap">
                      {relativeDate(m.startedAt).split(",")[0]}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
