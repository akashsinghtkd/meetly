import clsx from "clsx";
import { AlertTriangle, CheckSquare } from "lucide-react";
import { useStore } from "../store/store";
import { MeetingIcon } from "./ui";
import type { ActionItem, Meeting } from "../lib/types";

type Row = { meeting: Meeting; item: ActionItem };

const isYou = (owner: string) => /^(you|me)$/i.test((owner || "").trim());
const ownerName = (owner: string) => (isYou(owner) ? "You" : owner.trim() || "Unassigned");
// Urgent items sort ahead of the rest within a group.
const urgentFirst = (a: Row, b: Row) =>
  (a.item.urgency === "urgent" ? 0 : 1) - (b.item.urgency === "urgent" ? 0 : 1);

/**
 * Every open action item across all meetings, answering "what do I owe, what
 * does each person owe, and what's urgent" — the cross-meeting sibling of a
 * single meeting's Overview.
 */
export function ActionItemsView() {
  const meetings = useStore((s) => s.meetings);
  const toggle = useStore((s) => s.toggleActionItem);
  const openMeeting = useStore((s) => s.openMeeting);

  const rows: Row[] = meetings.flatMap((m) => m.actionItems.map((item) => ({ meeting: m, item })));
  const open = rows.filter((r) => r.item.status === "open" && r.item.task.trim());
  const done = rows.filter((r) => r.item.status === "done" && r.item.task.trim());

  const urgent = open.filter((r) => r.item.urgency === "urgent");
  const yours = open.filter((r) => isYou(r.item.owner)).sort(urgentFirst);

  const others: Record<string, Row[]> = {};
  for (const r of open) {
    if (isYou(r.item.owner)) continue;
    (others[ownerName(r.item.owner)] ||= []).push(r);
  }
  const ownerNames = Object.keys(others).sort();

  return (
    <div className="max-w-3xl mx-auto px-16 py-12">
      <h1 className="text-2xl font-bold text-ink tracking-tight mb-1">Action items</h1>
      <p className="text-ink-light mb-8">Everything owed across your meetings — urgent first.</p>

      {rows.length === 0 && <p className="text-ink-faint py-12 text-center">No action items yet.</p>}

      {urgent.length > 0 && (
        <Section
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          title="Urgent"
          count={urgent.length}
          rows={urgent}
          toggle={toggle}
          openMeeting={openMeeting}
          showOwner
        />
      )}

      {yours.length > 0 && (
        <Section
          icon={<CheckSquare className="h-4 w-4 text-ink-faint" />}
          title="What you need to do"
          count={yours.length}
          rows={yours}
          toggle={toggle}
          openMeeting={openMeeting}
        />
      )}

      {ownerNames.map((name) => (
        <Section
          key={name}
          icon={<Avatar name={name} />}
          title={name}
          count={others[name].length}
          rows={others[name].sort(urgentFirst)}
          toggle={toggle}
          openMeeting={openMeeting}
        />
      ))}

      {done.length > 0 && (
        <Section
          icon={<CheckSquare className="h-4 w-4 text-ink-faint" />}
          title="Done"
          count={done.length}
          rows={done}
          toggle={toggle}
          openMeeting={openMeeting}
          showOwner
          muted
        />
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  rows,
  toggle,
  openMeeting,
  showOwner,
  muted,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  rows: Row[];
  toggle: (m: string, i: string) => void;
  openMeeting: (id: string) => void;
  showOwner?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="mb-8">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-ink-faint">{icon}</span>
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-light">{title}</h2>
        <span className="text-xs tabular-nums text-ink-faint">{count}</span>
      </div>
      <div className="border-t border-line">
        {rows.map(({ meeting, item }) => {
          const isDone = item.status === "done";
          return (
            <div
              key={item.id}
              className="flex items-start gap-3 border-b border-line px-1 py-2.5 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={isDone}
                onChange={() => toggle(meeting.id, item.id)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-faint accent-accent cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <span className={clsx("text-sm", (muted || isDone) && "text-ink-faint line-through")}>
                  {item.task}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {item.urgency === "urgent" && !isDone && (
                    <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-600">
                      <AlertTriangle className="h-3 w-3" /> Urgent
                    </span>
                  )}
                  {showOwner && item.owner?.trim() && (
                    <span className="rounded bg-surface-active px-1.5 py-0.5 text-ink-light">
                      {ownerName(item.owner)}
                    </span>
                  )}
                  {item.due && (
                    <span className="rounded bg-surface-active px-1.5 py-0.5 text-ink-faint">{item.due}</span>
                  )}
                  <button
                    onClick={() => openMeeting(meeting.id)}
                    className="inline-flex items-center gap-1 text-ink-faint hover:text-accent"
                  >
                    <MeetingIcon className="h-3.5 w-3.5" />
                    <span className="max-w-[160px] truncate">{meeting.title || "Untitled meeting"}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
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
