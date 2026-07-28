import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  Copy,
  HelpCircle,
  Link2,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Waves,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store/store";
import { useCost } from "../store/costStore";
import { formatClock, formatDuration, relativeDate } from "../lib/format";
import { copyToClipboard, meetingShareLink, meetingToMarkdown } from "../lib/exportMeeting";
import { CostChip } from "./cost/CostChip";
import { SpeakersBar, SpeakerSelect } from "./Speakers";
import type { Meeting } from "../lib/types";

function EditableTitle({ meeting }: { meeting: Meeting }) {
  const updateMeeting = useStore((s) => s.updateMeeting);
  return (
    <h1
      contentEditable
      suppressContentEditableWarning
      data-placeholder="Untitled meeting"
      className="text-page-title text-ink outline-none"
      onBlur={(e) => updateMeeting(meeting.id, { title: e.currentTarget.textContent || "Untitled meeting" })}
    >
      {meeting.title}
    </h1>
  );
}

function Block({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-ink-faint">{icon}</span>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-light">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-ink-faint text-xs tabular-nums">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/** Two-tone notepad: your words stay in ink; AI expansion renders muted. */
function NotesPane({ meeting }: { meeting: Meeting }) {
  const setNotes = useStore((s) => s.setMeetingNotes);
  const enhance = useStore((s) => s.enhanceNotesFor);
  const busy = useStore((s) => s.notesBusy) === meeting.id;
  const hasNotes = Boolean((meeting.notes ?? "").trim());

  return (
    <div>
      <textarea
        value={meeting.notes ?? ""}
        onChange={(e) => setNotes(meeting.id, e.target.value)}
        placeholder="Jot notes during the call — names, decisions, to-dos. They stay in your words, and AI fills in the context after."
        className="w-full min-h-[180px] resize-y bg-transparent text-ink outline-none text-[15px] leading-relaxed placeholder:text-ink-faint"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
        <span className="text-xs text-ink-faint">Your notes stay in ink; AI adds context in grey.</span>
        <button
          onClick={() => enhance(meeting.id)}
          disabled={busy || !hasNotes}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-light hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {meeting.notesEnhanced ? "Re-enhance" : "Enhance with AI"}
        </button>
      </div>
      {meeting.notesEnhanced && (
        <div className="mt-5 rounded-lg border border-line bg-surface-sidebar/60 p-4">
          <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold uppercase tracking-wide text-accent">
            <Sparkles className="h-3.5 w-3.5" /> AI-expanded
          </div>
          <div className="text-ink-light leading-relaxed whitespace-pre-wrap text-[14.5px]">
            {meeting.notesEnhanced}
          </div>
        </div>
      )}
    </div>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-ink-faint text-sm">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-ink">
          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-ink-light shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionItems({ meeting }: { meeting: Meeting }) {
  const toggle = useStore((s) => s.toggleActionItem);
  const add = useStore((s) => s.addActionItem);
  const update = useStore((s) => s.updateActionItem);

  return (
    <div className="space-y-1">
      {meeting.actionItems.map((a) => (
        <div key={a.id} className="group flex items-center gap-2.5 py-1 rounded hover:bg-surface-hover px-1 -mx-1">
          <input
            type="checkbox"
            checked={a.status === "done"}
            onChange={() => toggle(meeting.id, a.id)}
            className="h-4 w-4 rounded border-ink-faint accent-accent cursor-pointer"
          />
          <input
            value={a.task}
            placeholder="Describe the task…"
            onChange={(e) => update(meeting.id, a.id, { task: e.target.value })}
            className={clsx(
              "flex-1 bg-transparent outline-none text-sm",
              a.status === "done" && "line-through text-ink-faint",
            )}
          />
          <input
            value={a.owner}
            placeholder="owner"
            onChange={(e) => update(meeting.id, a.id, { owner: e.target.value })}
            className="w-24 bg-surface-active/60 rounded px-2 py-0.5 text-xs text-ink-light outline-none"
          />
          {a.due && (
            <span className="text-xs text-ink-faint bg-surface-active rounded px-1.5 py-0.5">
              {a.due}
            </span>
          )}
        </div>
      ))}
      <button
        onClick={() => add(meeting.id)}
        className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink-light mt-1 px-1"
      >
        <Plus className="h-3.5 w-3.5" /> Add action item
      </button>
    </div>
  );
}

function Transcript({ meeting }: { meeting: Meeting }) {
  if (!meeting.transcript.length) {
    return (
      <p className="text-ink-faint text-sm">
        Transcript will appear here as the meeting is captured.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {meeting.transcript.map((seg) => (
        <div key={seg.id} className="flex gap-3">
          <span className="text-[11px] text-ink-faint tabular-nums pt-1 w-10 shrink-0">
            {formatClock(Math.floor(seg.tStart))}
          </span>
          <div>
            <SpeakerSelect meeting={meeting} segment={seg} />
            <span className="text-ink">{seg.text}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProcessingBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-sidebar px-4 py-3 mb-6 text-sm text-ink-light">
      <Sparkles className="h-4 w-4 text-accent animate-pulse" />
      Generating your notes from the transcript…
    </div>
  );
}

type MeetingTab = "summary" | "notes" | "transcript";

export function MeetingPage({ meetingId, onOpenChat }: { meetingId: string; onOpenChat: () => void }) {
  const meeting = useStore((s) => s.meetings.find((m) => m.id === meetingId));
  const deleteMeeting = useStore((s) => s.deleteMeeting);
  const summarizeMeeting = useStore((s) => s.summarizeMeeting);
  const enhanceMeeting = useStore((s) => s.enhanceMeeting);
  const setNotice = useStore((s) => s.setNotice);
  // Select the stable `records` ref, then derive — returning a fresh array from a
  // zustand selector triggers React's infinite-loop guard (blank screen).
  const records = useCost((s) => s.records);
  const { meetingCost, anyEstimated } = useMemo(() => {
    const mine = records.filter((r) => r.meetingId === meetingId);
    return {
      meetingCost: mine.reduce((n, r) => n + r.costUsd, 0),
      anyEstimated: mine.some((r) => r.estimated),
    };
  }, [records, meetingId]);
  const [tab, setTab] = useState<MeetingTab>("summary");
  if (!meeting) return null;

  const isLive = meeting.status === "recording";
  const canProcess = meeting.transcript.length > 0 && meeting.status !== "processing";

  const copySummary = async () => {
    const ok = await copyToClipboard(meetingToMarkdown(meeting));
    setNotice(ok ? "Summary copied as Markdown" : "Couldn't access the clipboard");
  };
  const copyLink = async () => {
    const ok = await copyToClipboard(meetingShareLink(meeting.id));
    setNotice(
      ok ? "Link copied — teammates in this teamspace can open it" : "Couldn't access the clipboard",
    );
  };

  const tabs: { id: MeetingTab; label: string; count?: number }[] = [
    { id: "summary", label: "Summary" },
    { id: "notes", label: "Notes" },
    { id: "transcript", label: "Transcript", count: meeting.transcript.length },
  ];

  return (
    <div className="max-w-5xl mx-auto px-8 sm:px-12 py-12 pb-32">
      <div className="text-6xl mb-3">{meeting.emoji}</div>

      <div className="flex items-start justify-between gap-4">
        <EditableTitle meeting={meeting} />
        <div className="flex items-center gap-1 pt-3 shrink-0">
          {canProcess && (
            <button
              onClick={() => enhanceMeeting(meeting.id)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-light hover:bg-surface-hover"
              title="Re-transcribe the full recording and separate voices accurately"
            >
              <Waves className="h-4 w-4" /> Improve accuracy
            </button>
          )}
          {canProcess && (
            <button
              onClick={() => summarizeMeeting(meeting.id)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-light hover:bg-surface-hover"
              title="Generate notes from the transcript"
            >
              <Sparkles className="h-4 w-4" /> {meeting.summary ? "Regenerate" : "Generate notes"}
            </button>
          )}
          <button
            onClick={copySummary}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-light hover:bg-surface-hover"
            title="Copy a clean Markdown summary to paste anywhere"
          >
            <Copy className="h-4 w-4" /> Copy
          </button>
          <button
            onClick={copyLink}
            className="rounded-md p-1.5 text-ink-faint hover:bg-surface-hover hover:text-ink"
            title="Copy a link to this meeting"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            onClick={onOpenChat}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-light hover:bg-surface-hover"
          >
            <MessageSquare className="h-4 w-4" /> Ask AI
          </button>
          <button
            onClick={() => deleteMeeting(meeting.id)}
            className="rounded-md p-1.5 text-ink-faint hover:bg-surface-hover hover:text-red-500"
            title="Delete meeting"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLive && (
        <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-2.5 mt-5 text-sm text-red-700">
          <span className="h-2 w-2 rounded-full bg-red-500 recording-dot" />
          Recording &amp; transcribing live…
        </div>
      )}
      {meeting.error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 mt-5 text-sm text-amber-800">
          Transcription error: {meeting.error}
        </div>
      )}
      {meeting.status === "processing" && (
        <div className="mt-5">
          <ProcessingBanner />
        </div>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_296px]">
        {/* Main column: tabbed content */}
        <div className="min-w-0">
          <div className="flex items-center border-b border-line mb-7">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  "-mb-px border-b-2 px-1 pb-2.5 mr-6 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-faint hover:text-ink-light",
                )}
              >
                {t.label}
                {t.count ? <span className="ml-1.5 text-ink-faint tabular-nums">{t.count}</span> : null}
              </button>
            ))}
          </div>

          {tab === "summary" &&
            (meeting.summary ? (
              <>
                <Block icon={<ListChecks className="h-4 w-4" />} title="Summary">
                  <p className="text-ink leading-relaxed">{meeting.summary.executive}</p>
                </Block>
                <Block
                  icon={<ListChecks className="h-4 w-4" />}
                  title="Decisions"
                  count={meeting.summary.decisions.length}
                >
                  <BulletList items={meeting.summary.decisions} empty="No decisions captured." />
                </Block>
                {meeting.summary.risks.length > 0 && (
                  <Block
                    icon={<AlertTriangle className="h-4 w-4" />}
                    title="Risks"
                    count={meeting.summary.risks.length}
                  >
                    <BulletList items={meeting.summary.risks} empty="No risks flagged." />
                  </Block>
                )}
                {meeting.summary.openQuestions.length > 0 && (
                  <Block icon={<HelpCircle className="h-4 w-4" />} title="Open questions">
                    <BulletList items={meeting.summary.openQuestions} empty="None." />
                  </Block>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-surface-sidebar/60 py-12 px-6 text-center">
                <Sparkles className="h-5 w-5 text-ink-faint mx-auto mb-3" />
                <p className="text-ink font-medium mb-1">No notes yet</p>
                <p className="text-ink-light text-sm max-w-xs mx-auto mb-4">
                  {meeting.transcript.length
                    ? "Generate an AI summary from the transcript, or jot your own in the Notes tab."
                    : "Once this meeting has a transcript, AI notes will appear here."}
                </p>
                {canProcess && (
                  <button
                    onClick={() => summarizeMeeting(meeting.id)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-hover"
                  >
                    <Sparkles className="h-4 w-4" /> Generate notes
                  </button>
                )}
              </div>
            ))}

          {tab === "notes" && <NotesPane meeting={meeting} />}

          {tab === "transcript" && (
            <>
              {meeting.transcript.length > 0 && (
                <Block icon={<Users className="h-4 w-4" />} title="Speakers" count={meeting.speakers.length}>
                  <SpeakersBar meeting={meeting} />
                </Block>
              )}
              <Block
                icon={<MessageSquare className="h-4 w-4" />}
                title="Transcript"
                count={meeting.transcript.length}
              >
                <Transcript meeting={meeting} />
              </Block>
            </>
          )}
        </div>

        {/* Sticky sidebar: the at-a-glance essentials */}
        <aside className="lg:sticky lg:top-12 h-max space-y-4">
          <div className="rounded-xl border border-line bg-surface-sidebar/50 p-4 space-y-2 text-sm">
            <MetaRow label="Date" value={relativeDate(meeting.startedAt)} />
            <MetaRow
              label="Duration"
              value={meeting.durationSecs ? formatDuration(meeting.durationSecs) : "In progress…"}
            />
            <div className="flex gap-3 items-center">
              <span className="w-20 text-ink-faint shrink-0">Project</span>
              <ProjectPicker meeting={meeting} />
            </div>
            <div className="flex gap-3 items-center">
              <span className="w-20 text-ink-faint shrink-0">API cost</span>
              <CostChip value={meetingCost} estimated={anyEstimated && meetingCost > 0} />
            </div>
          </div>

          <div className="rounded-xl border border-line p-4">
            <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-light">
              <CheckSquare className="h-4 w-4 text-ink-faint" /> Action items
              {meeting.actionItems.length > 0 && (
                <span className="text-ink-faint text-xs tabular-nums">{meeting.actionItems.length}</span>
              )}
            </div>
            <ActionItems meeting={meeting} />
          </div>

          {meeting.participants.length > 0 && (
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-1.5 mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-light">
                <Users className="h-4 w-4 text-ink-faint" /> People
              </div>
              <div className="flex flex-wrap gap-1.5">
                {meeting.participants.map((p) => (
                  <span key={p} className="rounded-md bg-surface-active px-2 py-0.5 text-xs text-ink-light">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 text-ink-faint shrink-0">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}

function ProjectPicker({ meeting }: { meeting: Meeting }) {
  const projects = useStore((s) => s.projects);
  const assign = useStore((s) => s.assignMeetingToProject);
  const openProject = useStore((s) => s.openProject);
  const [open, setOpen] = useState(false);
  const current = projects.find((p) => p.id === meeting.projectId);

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm hover:bg-surface-hover",
          current ? "bg-surface-active text-ink" : "text-ink-faint",
        )}
      >
        {current ? (
          <>
            <span>{current.emoji}</span> {current.name}
          </>
        ) : (
          "Inbox (unassigned)"
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 left-0 min-w-[180px] rounded-md border border-line bg-surface shadow-panel py-1">
            <button
              onClick={() => {
                assign(meeting.id, null);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-hover text-ink-light"
            >
              Inbox (unassigned)
            </button>
            {projects.map((p) => (
              <div key={p.id} className="flex items-center hover:bg-surface-hover">
                <button
                  onClick={() => {
                    assign(meeting.id, p.id);
                    setOpen(false);
                  }}
                  className="flex-1 flex items-center gap-2 px-3 py-1.5 text-sm text-left"
                >
                  <span>{p.emoji}</span> {p.name}
                </button>
                <button
                  onClick={() => {
                    setOpen(false);
                    openProject(p.id);
                  }}
                  className="px-2 text-ink-faint hover:text-accent"
                  title="Open project"
                >
                  →
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
