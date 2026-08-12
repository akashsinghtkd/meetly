import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  Copy,
  HelpCircle,
  Link2,
  ListChecks,
  Loader2,
  Mail,
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
import { MeetingIcon } from "./ui";
import { AudioPlayer, type AudioPlayerHandle } from "./AudioPlayer";
import { SpeakersBar, SpeakerSelect } from "./Speakers";
import { FollowupEmailModal } from "./FollowupEmailModal";
import { MEETING_TEMPLATES, getTemplate } from "../lib/templates";
import type { ActionItem, Meeting, Summary } from "../lib/types";

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

/** Values the summariser emits when it couldn't find a real owner. */
const UNSET_OWNERS = new Set(["unspecified", "unknown", "none", "n/a", "na", "tbd", "-"]);

function ownerOrBlank(owner: string): string {
  return UNSET_OWNERS.has(owner.trim().toLowerCase()) ? "" : owner;
}

/**
 * A textarea that grows with its content. Action items live in a narrow
 * sidebar, so a single-line input clipped most tasks mid-word — the whole
 * point of the list is being able to read them.
 */
function TaskField({
  value,
  done,
  onChange,
}: {
  value: string;
  done: boolean;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      placeholder="Describe the task…"
      onChange={(e) => onChange(e.target.value)}
      // A task is one line of intent, not a paragraph — commit on Enter
      // instead of growing the field.
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className={clsx(
        "block w-full resize-none overflow-hidden bg-transparent outline-none",
        "text-sm leading-snug placeholder:text-ink-faint",
        done && "line-through text-ink-faint",
      )}
    />
  );
}

function ActionItems({ meeting }: { meeting: Meeting }) {
  const toggle = useStore((s) => s.toggleActionItem);
  const add = useStore((s) => s.addActionItem);
  const update = useStore((s) => s.updateActionItem);

  return (
    <div className="space-y-1.5">
      {meeting.actionItems.map((a) => {
        const done = a.status === "done";
        const owner = ownerOrBlank(a.owner);
        return (
          <div key={a.id} className="group -mx-1 rounded px-1 py-1.5 hover:bg-surface-hover">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={done}
                onChange={() => toggle(meeting.id, a.id)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-faint accent-accent cursor-pointer"
              />
              {/* min-w-0 is load-bearing: without it the intrinsic width of the
                  fields becomes the row's floor and the metadata overflows the
                  card. */}
              <div className="min-w-0 flex-1">
                <TaskField
                  value={a.task}
                  done={done}
                  onChange={(task) => update(meeting.id, a.id, { task })}
                />
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <input
                    value={owner}
                    placeholder="Assign"
                    // Hug the content like the due chip does, instead of a
                    // fixed box that reads as an empty field. -ml-1.5 cancels
                    // the padding so the text lines up under the task above.
                    size={Math.max(owner.length, 6)}
                    onChange={(e) => update(meeting.id, a.id, { owner: e.target.value })}
                    className={clsx(
                      "-ml-1.5 max-w-full rounded px-1.5 py-0.5 text-xs outline-none transition-colors",
                      "placeholder:text-ink-faint",
                      owner
                        ? "bg-surface-active/60 text-ink-light"
                        : "text-ink-light hover:bg-surface-active/50 focus:bg-surface-active/50",
                    )}
                  />
                  {a.due && (
                    <span className="shrink-0 whitespace-nowrap rounded bg-surface-active px-1.5 py-0.5 text-xs text-ink-faint">
                      {a.due}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <button
        onClick={() => add(meeting.id)}
        className="flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink-light mt-1 px-1"
      >
        <Plus className="h-3.5 w-3.5" /> Add action item
      </button>
    </div>
  );
}

function Transcript({
  meeting,
  playhead,
  onSeek,
}: {
  meeting: Meeting;
  /** Current playback position, so the line being spoken can be marked. */
  playhead?: number;
  onSeek?: (seconds: number) => void;
}) {
  if (!meeting.transcript.length) {
    return (
      <p className="text-ink-faint text-sm">
        Transcript will appear here as the meeting is captured.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {meeting.transcript.map((seg) => {
        const active =
          playhead !== undefined && playhead >= seg.tStart && playhead < seg.tEnd;
        return (
          <div
            key={seg.id}
            className={clsx(
              "flex gap-3 -mx-2 px-2 py-1 rounded-md transition-colors",
              active && "bg-accent-soft",
            )}
          >
            {/* The timestamp doubles as "play from here" — the fastest way to
                check a line you don't trust against the actual audio. */}
            <button
              type="button"
              onClick={() => onSeek?.(seg.tStart)}
              disabled={!onSeek}
              title={onSeek ? "Play from here" : undefined}
              className={clsx(
                "text-[11px] tabular-nums pt-1 w-10 shrink-0 text-left transition-colors",
                onSeek ? "text-ink-faint hover:text-accent cursor-pointer" : "text-ink-faint",
              )}
            >
              {formatClock(Math.floor(seg.tStart))}
            </button>
            <div>
              <SpeakerSelect meeting={meeting} segment={seg} />
              <span className="text-ink">{seg.text}</span>
            </div>
          </div>
        );
      })}
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

/** A colored initials badge so each person's task group is visually distinct. */
function OwnerAvatar({ name }: { name: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full bg-accent-soft text-[8px] font-semibold text-accent">
      {initials}
    </span>
  );
}

const isYouOwner = (owner: string) => /^(you|me)$/i.test((owner || "").trim());
const ownerLabel = (owner: string) => (isYouOwner(owner) ? "You" : owner.trim());

/** One row in the Overview: check it off, see who owns it, when, and if it's urgent. */
function OverviewTask({
  meetingId,
  item,
  showOwner,
}: {
  meetingId: string;
  item: ActionItem;
  showOwner?: boolean;
}) {
  const toggle = useStore((s) => s.toggleActionItem);
  const done = item.status === "done";
  return (
    <div className="group flex items-start gap-2.5 -mx-1 rounded px-1 py-1.5 hover:bg-surface-hover">
      <input
        type="checkbox"
        checked={done}
        onChange={() => toggle(meetingId, item.id)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-faint accent-accent cursor-pointer"
      />
      <div className="min-w-0 flex-1">
        <div className={clsx("text-[15px] leading-snug", done ? "text-ink-faint line-through" : "text-ink")}>
          {item.task}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 empty:hidden">
          {item.urgency === "urgent" && !done && (
            <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
              <AlertTriangle className="h-3 w-3" /> Urgent
            </span>
          )}
          {showOwner && item.owner?.trim() && (
            <span className="rounded bg-surface-active px-1.5 py-0.5 text-xs text-ink-light">
              {ownerLabel(item.owner)}
            </span>
          )}
          {item.due && (
            <span className="rounded bg-surface-active px-1.5 py-0.5 text-xs text-ink-faint">
              {item.due}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The at-a-glance answer to "who has to do what": urgent items first, then your
 * to-dos, then each other person's, and finally what the meeting was about.
 */
function Overview({ meeting }: { meeting: Meeting }) {
  const summarize = useStore((s) => s.summarizeMeeting);
  const canProcess = meeting.transcript.length > 0 && meeting.status !== "processing";
  const items = meeting.actionItems;

  if (!meeting.summary && items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface-sidebar/60 py-12 px-6 text-center">
        <Sparkles className="h-5 w-5 text-ink-faint mx-auto mb-3" />
        <p className="text-ink font-medium mb-1">No overview yet</p>
        <p className="text-ink-light text-sm max-w-xs mx-auto mb-4">
          {meeting.transcript.length
            ? "Generate notes and Meetly will lay out who needs to do what."
            : "Once this meeting has a transcript, the overview appears here."}
        </p>
        {canProcess && (
          <button
            onClick={() => summarize(meeting.id)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-hover"
          >
            <Sparkles className="h-4 w-4" /> Generate notes
          </button>
        )}
      </div>
    );
  }

  const openFirst = (a: ActionItem, b: ActionItem) =>
    a.status === b.status ? 0 : a.status === "open" ? -1 : 1;
  const urgent = items.filter((a) => a.urgency === "urgent" && a.status !== "done");
  const yours = items.filter((a) => isYouOwner(a.owner)).sort(openFirst);
  const others: Record<string, ActionItem[]> = {};
  for (const a of items) {
    if (isYouOwner(a.owner)) continue;
    const key = a.owner?.trim() || "Unassigned";
    (others[key] ||= []).push(a);
  }
  const ownerNames = Object.keys(others).sort();

  return (
    <>
      {urgent.length > 0 && (
        <Block icon={<AlertTriangle className="h-4 w-4 text-red-500" />} title="Urgent" count={urgent.length}>
          <div className="space-y-0.5">
            {urgent.map((a) => (
              <OverviewTask key={a.id} meetingId={meeting.id} item={a} showOwner />
            ))}
          </div>
        </Block>
      )}

      <Block icon={<CheckSquare className="h-4 w-4" />} title="What you need to do" count={yours.length}>
        {yours.length ? (
          <div className="space-y-0.5">
            {yours.map((a) => (
              <OverviewTask key={a.id} meetingId={meeting.id} item={a} />
            ))}
          </div>
        ) : (
          <p className="text-ink-faint text-sm">Nothing assigned to you.</p>
        )}
      </Block>

      {ownerNames.map((name) => (
        <Block key={name} icon={<OwnerAvatar name={name} />} title={name} count={others[name].length}>
          <div className="space-y-0.5">
            {others[name].sort(openFirst).map((a) => (
              <OverviewTask key={a.id} meetingId={meeting.id} item={a} />
            ))}
          </div>
        </Block>
      ))}

      {meeting.summary && (
        <Block icon={<Sparkles className="h-4 w-4" />} title="What we discussed">
          {meeting.summary.executive ? (
            <p className="text-ink leading-relaxed">{meeting.summary.executive}</p>
          ) : (
            <p className="text-ink-faint text-sm">No summary captured.</p>
          )}
          {discussSections(meeting.summary).map((s) => (
            <div key={s.heading} className="mt-3">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-ink-light">
                {s.heading}
              </div>
              <ul className="space-y-1.5">
                {s.items.map((d, i) => (
                  <li key={i} className="flex gap-2.5 text-ink text-[15px]">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-ink-light shrink-0" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Block>
      )}
    </>
  );
}

/** Choose the note format (template) for this meeting; regenerate to apply. */
function TemplatePicker({ meeting }: { meeting: Meeting }) {
  const setTemplate = useStore((s) => s.setMeetingTemplate);
  const [open, setOpen] = useState(false);
  const current = getTemplate(meeting.templateId);
  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Note format for this meeting"
        className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-light hover:bg-surface-hover"
      >
        <span>{current.emoji}</span> {current.label}
        <ChevronDown className="h-3.5 w-3.5 text-ink-faint" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-line bg-surface py-1 shadow-panel">
            {MEETING_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTemplate(meeting.id, t.id);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-hover",
                  current.id === t.id && "bg-accent-soft",
                )}
              >
                <span className="mt-0.5">{t.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{t.label}</span>
                  <span className="block text-xs text-ink-faint">{t.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/** The summary's template sections, or the legacy fixed blocks for old meetings. */
function SectionBlocks({ summary }: { summary: Summary }) {
  if (summary.sections?.length) {
    return (
      <>
        {summary.sections.map((s) => (
          <Block
            key={s.heading}
            icon={<ListChecks className="h-4 w-4" />}
            title={s.heading}
            count={s.items.length}
          >
            <BulletList items={s.items} empty="—" />
          </Block>
        ))}
      </>
    );
  }
  return (
    <>
      <Block icon={<ListChecks className="h-4 w-4" />} title="Decisions" count={summary.decisions.length}>
        <BulletList items={summary.decisions} empty="No decisions captured." />
      </Block>
      {summary.risks.length > 0 && (
        <Block icon={<AlertTriangle className="h-4 w-4" />} title="Risks" count={summary.risks.length}>
          <BulletList items={summary.risks} empty="No risks flagged." />
        </Block>
      )}
      {summary.openQuestions.length > 0 && (
        <Block icon={<HelpCircle className="h-4 w-4" />} title="Open questions">
          <BulletList items={summary.openQuestions} empty="None." />
        </Block>
      )}
    </>
  );
}

/** Compact sections for the Overview "What we discussed" (falls back to Decisions). */
function discussSections(summary: Summary) {
  if (summary.sections?.length) return summary.sections;
  return summary.decisions.length ? [{ heading: "Decisions", items: summary.decisions }] : [];
}

type MeetingTab = "overview" | "summary" | "notes" | "transcript";

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
  const [tab, setTab] = useState<MeetingTab>("overview");
  const [emailOpen, setEmailOpen] = useState(false);
  const playerRef = useRef<AudioPlayerHandle>(null);
  // Updated ~2×/sec by the player; drives the transcript highlight.
  const [playhead, setPlayhead] = useState<number | undefined>(undefined);
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

  const openItems = meeting.actionItems.filter((a) => a.status !== "done").length;
  const tabs: { id: MeetingTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview", count: openItems || undefined },
    { id: "summary", label: "Summary" },
    { id: "notes", label: "Notes" },
    { id: "transcript", label: "Transcript", count: meeting.transcript.length },
  ];

  return (
    <div className="max-w-5xl mx-auto px-8 sm:px-12 py-12 pb-32">
      <MeetingIcon size="lg" className="mb-3" />

      <div className="flex items-start justify-between gap-4">
        <EditableTitle meeting={meeting} />
        <div className="flex items-center gap-1 pt-3 shrink-0">
          <TemplatePicker meeting={meeting} />
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
          {(meeting.summary || meeting.actionItems.length > 0) && (
            <button
              onClick={() => setEmailOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-light hover:bg-surface-hover"
              title="Draft a follow-up email from these notes"
            >
              <Mail className="h-4 w-4" /> Follow-up
            </button>
          )}
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

          {tab === "overview" && <Overview meeting={meeting} />}

          {tab === "summary" &&
            (meeting.summary ? (
              <>
                <Block icon={<ListChecks className="h-4 w-4" />} title="Summary">
                  <p className="text-ink leading-relaxed">{meeting.summary.executive}</p>
                </Block>
                <SectionBlocks summary={meeting.summary} />
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
                <Transcript
                  meeting={meeting}
                  playhead={playhead}
                  onSeek={meeting.micPath ? (t) => playerRef.current?.seekTo(t) : undefined}
                />
              </Block>
            </>
          )}
        </div>

        {/* Sticky sidebar: the at-a-glance essentials */}
        <aside className="lg:sticky lg:top-12 h-max space-y-4">
          {/* Sticky, so the transport stays put while the transcript scrolls. */}
          <AudioPlayer ref={playerRef} meeting={meeting} onTime={setPlayhead} />

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

      {emailOpen && <FollowupEmailModal meeting={meeting} onClose={() => setEmailOpen(false)} />}
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
