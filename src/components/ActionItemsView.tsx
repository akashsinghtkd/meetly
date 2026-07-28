import clsx from "clsx";
import { useStore } from "../store/store";

export function ActionItemsView() {
  const meetings = useStore((s) => s.meetings);
  const toggle = useStore((s) => s.toggleActionItem);
  const openMeeting = useStore((s) => s.openMeeting);

  const rows = meetings.flatMap((m) =>
    m.actionItems.map((a) => ({ meeting: m, item: a })),
  );
  const open = rows.filter((r) => r.item.status === "open");
  const done = rows.filter((r) => r.item.status === "done");

  return (
    <div className="max-w-3xl mx-auto px-16 py-12">
      <h1 className="text-2xl font-bold text-ink tracking-tight mb-1">Action items</h1>
      <p className="text-ink-light mb-8">
        Every task pulled from your meetings, across the whole workspace.
      </p>

      <Group title={`To do · ${open.length}`} rows={open} toggle={toggle} openMeeting={openMeeting} />
      {done.length > 0 && (
        <Group title={`Done · ${done.length}`} rows={done} toggle={toggle} openMeeting={openMeeting} muted />
      )}

      {rows.length === 0 && (
        <p className="text-ink-faint py-12 text-center">No action items yet.</p>
      )}
    </div>
  );
}

function Group({
  title,
  rows,
  toggle,
  openMeeting,
  muted,
}: {
  title: string;
  rows: { meeting: any; item: any }[];
  toggle: (m: string, i: string) => void;
  openMeeting: (id: string) => void;
  muted?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <div className="mb-8">
      <div className="block-heading">{title}</div>
      <div className="border-t border-line">
        {rows.map(({ meeting, item }) => (
          <div
            key={item.id}
            className="flex items-center gap-3 py-2.5 px-1 border-b border-line hover:bg-surface-hover group"
          >
            <input
              type="checkbox"
              checked={item.status === "done"}
              onChange={() => toggle(meeting.id, item.id)}
              className="h-4 w-4 rounded border-ink-faint accent-accent cursor-pointer"
            />
            <span className={clsx("flex-1 text-sm", muted && "line-through text-ink-faint")}>
              {item.task || <span className="text-ink-faint">Untitled task</span>}
            </span>
            {item.owner && (
              <span className="text-xs text-ink-light bg-surface-active rounded px-1.5 py-0.5">
                {item.owner}
              </span>
            )}
            {item.due && <span className="text-xs text-ink-faint">{item.due}</span>}
            <button
              onClick={() => openMeeting(meeting.id)}
              className="text-xs text-ink-faint hover:text-accent flex items-center gap-1"
            >
              <span>{meeting.emoji}</span>
              <span className="max-w-[140px] truncate">{meeting.title}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
