import { useMemo, useState } from "react";
import { CalendarClock, ListChecks, LayoutGrid, Trash2, Link2, Mic, ArrowRight } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store/store";
import { relativeDate, formatDuration } from "../lib/format";
import { TASK_COLUMNS } from "../lib/types";
import { TasksBoard } from "./TasksBoard";
import type { Meeting } from "../lib/types";

const EMOJI_CHOICES = ["📁", "🚀", "🛠️", "📊", "🎯", "💡", "🧩", "📦", "🌐", "🔬", "✏️", "🏁", "🎨", "📣", "🧪", "⚙️"];

export function ProjectPage({ projectId, tab }: { projectId: string; tab: "overview" | "meetings" | "tasks" }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const renameProject = useStore((s) => s.renameProject);
  const setProjectEmoji = useStore((s) => s.setProjectEmoji);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const openProject = useStore((s) => s.openProject);
  const startMeeting = useStore((s) => s.startMeeting);
  const meetings = useStore((s) => s.meetings);
  const tasks = useStore((s) => s.tasks);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const stats = useMemo(() => {
    const pm = meetings.filter((m) => m.projectId === projectId);
    const pt = tasks.filter((t) => t.projectId === projectId);
    const done = pt.filter((t) => t.status === "done").length;
    return {
      meetings: pm.length,
      open: pt.filter((t) => t.status !== "done").length,
      done,
      total: pt.length,
      pct: pt.length ? Math.round((done / pt.length) * 100) : 0,
    };
  }, [meetings, tasks, projectId]);

  if (!project) return null;

  return (
    <div className="max-w-5xl mx-auto px-16 py-12 pb-32">
      {/* ── header ── */}
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <button
            onClick={() => setEmojiOpen((o) => !o)}
            className="h-16 w-16 rounded-2xl grid place-items-center text-3xl hover:brightness-95 transition"
            style={{ background: `${project.color}1a` }}
          >
            {project.emoji}
          </button>
          {emojiOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setEmojiOpen(false)} />
              <div className="absolute z-20 mt-1 grid grid-cols-6 gap-1 rounded-lg border border-line bg-surface shadow-panel p-2">
                {EMOJI_CHOICES.map((e) => (
                  <button
                    key={e}
                    onClick={() => {
                      setProjectEmoji(project.id, e);
                      setEmojiOpen(false);
                    }}
                    className="text-xl hover:bg-surface-hover rounded p-1"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-1">
          <input
            value={project.name}
            onChange={(e) => renameProject(project.id, e.target.value)}
            className="text-3xl font-bold text-ink bg-transparent outline-none w-full"
            spellCheck={false}
          />
          <textarea
            value={project.description ?? ""}
            onChange={(e) => updateProject(project.id, { description: e.target.value })}
            placeholder="Add a description…"
            rows={1}
            className="w-full mt-1 bg-transparent text-ink-light text-sm outline-none resize-none placeholder:text-ink-faint"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-1">
          <button
            onClick={() => startMeeting(project.id)}
            className="flex items-center gap-1.5 rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:brightness-105 shadow-sm"
          >
            <Mic className="h-4 w-4" /> Record meeting
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete project "${project.name}"? Its meetings return to All meetings.`))
                deleteProject(project.id);
            }}
            className="rounded-lg p-2 text-ink-faint hover:bg-surface-hover hover:text-red-500"
            title="Delete project"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── stats ── */}
      <div className="grid grid-cols-3 gap-3 mt-7">
        <StatCard icon={<CalendarClock className="h-4 w-4" />} label="Meetings" value={String(stats.meetings)} />
        <StatCard icon={<ListChecks className="h-4 w-4" />} label="Open tasks" value={String(stats.open)} />
        <StatCard
          icon={<LayoutGrid className="h-4 w-4" />}
          label="Task progress"
          value={`${stats.done}/${stats.total}`}
          progress={stats.total ? stats.pct : undefined}
          color={project.color}
        />
      </div>

      {/* ── tabs ── */}
      <div className="flex items-center gap-1 mt-8 mb-6 border-b border-line">
        <Tab active={tab === "overview"} onClick={() => openProject(project.id, "overview")} icon={<LayoutGrid className="h-4 w-4" />} label="Overview" />
        <Tab active={tab === "meetings"} onClick={() => openProject(project.id, "meetings")} icon={<CalendarClock className="h-4 w-4" />} label="Meetings" count={stats.meetings} />
        <Tab active={tab === "tasks"} onClick={() => openProject(project.id, "tasks")} icon={<ListChecks className="h-4 w-4" />} label="Tasks" count={stats.open} />
      </div>

      {tab === "overview" && <Overview projectId={project.id} />}
      {tab === "meetings" && <MeetingsTab projectId={project.id} />}
      {tab === "tasks" && <ProjectTasks projectId={project.id} />}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  progress,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress?: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <div className="text-xs text-ink-faint mb-1.5 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink tabular-nums">{value}</div>
      {progress !== undefined && (
        <div className="h-1.5 mt-2 rounded-full bg-surface-active overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: color ?? "#2383e2" }} />
        </div>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
        active ? "border-ink text-ink font-medium" : "border-transparent text-ink-light hover:text-ink",
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && <span className="text-ink-faint">{count}</span>}
    </button>
  );
}

function EmptyRecord({ projectId, subtitle }: { projectId: string; subtitle: string }) {
  const startMeeting = useStore((s) => s.startMeeting);
  return (
    <div className="rounded-2xl border border-dashed border-line py-16 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-accent-soft grid place-items-center">
        <Mic className="h-5 w-5 text-accent" />
      </div>
      <p className="text-ink font-medium mb-1">Record your first meeting</p>
      <p className="text-ink-light text-sm mb-5">{subtitle}</p>
      <button
        onClick={() => startMeeting(projectId)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:brightness-105"
      >
        <Mic className="h-4 w-4" /> Record meeting
      </button>
    </div>
  );
}

function Overview({ projectId }: { projectId: string }) {
  const meetings = useStore((s) => s.meetings);
  const tasks = useStore((s) => s.tasks);
  const openMeeting = useStore((s) => s.openMeeting);
  const openProject = useStore((s) => s.openProject);

  const recent = useMemo(
    () =>
      meetings
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, 4),
    [meetings, projectId],
  );
  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId]);

  if (recent.length === 0 && projectTasks.length === 0) {
    return <EmptyRecord projectId={projectId} subtitle="Notes, action items, and tasks will appear here automatically." />;
  }

  return (
    <div className="space-y-8">
      {/* recent meetings */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-ink">Recent meetings</h2>
          {recent.length > 0 && (
            <button onClick={() => openProject(projectId, "meetings")} className="text-xs text-ink-faint hover:text-accent flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-faint">No meetings yet.</p>
        ) : (
          <div className="space-y-1.5">
            {recent.map((m) => (
              <MeetingRow key={m.id} meeting={m} onClick={() => openMeeting(m.id)} />
            ))}
          </div>
        )}
      </section>

      {/* task snapshot */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-ink">Tasks</h2>
          <button onClick={() => openProject(projectId, "tasks")} className="text-xs text-ink-faint hover:text-accent flex items-center gap-1">
            Open board <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {TASK_COLUMNS.map((col) => {
            const n = projectTasks.filter((t) => t.status === col.status).length;
            return (
              <button
                key={col.status}
                onClick={() => openProject(projectId, "tasks")}
                className="rounded-xl border border-line px-4 py-3 text-left hover:bg-surface-hover"
              >
                <div className="flex items-center gap-1.5 text-xs text-ink-light mb-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: col.dot }} />
                  {col.label}
                </div>
                <div className="text-xl font-semibold text-ink tabular-nums">{n}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MeetingRow({ meeting, onClick }: { meeting: Meeting; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-hover text-left transition-colors"
    >
      <div className="h-9 w-9 rounded-lg bg-surface-active grid place-items-center text-lg shrink-0">{meeting.emoji}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink truncate">{meeting.title}</div>
        <div className="text-xs text-ink-faint">
          {relativeDate(meeting.startedAt)}
          {meeting.durationSecs ? ` · ${formatDuration(meeting.durationSecs)}` : ""}
          {meeting.participants.length ? ` · ${meeting.participants.join(", ")}` : ""}
        </div>
      </div>
      {meeting.status === "recording" && <span className="text-[11px] text-red-500 shrink-0">● live</span>}
      {meeting.status === "processing" && (
        <span className="text-[11px] text-amber-600 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">processing</span>
      )}
    </button>
  );
}

function MeetingsTab({ projectId }: { projectId: string }) {
  const meetings = useStore((s) => s.meetings);
  const openMeeting = useStore((s) => s.openMeeting);
  const assign = useStore((s) => s.assignMeetingToProject);
  const [addOpen, setAddOpen] = useState(false);

  const mine = meetings
    .filter((m) => m.projectId === projectId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const unassigned = meetings.filter((m) => !m.projectId);

  if (mine.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyRecord projectId={projectId} subtitle="Or link a meeting you've already recorded." />
        <AddExisting projectId={projectId} unassigned={unassigned} open={addOpen} setOpen={setAddOpen} assign={assign} centered />
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-1.5">
        {mine.map((m) => (
          <MeetingRow key={m.id} meeting={m} onClick={() => openMeeting(m.id)} />
        ))}
      </div>
      <div className="mt-3">
        <AddExisting projectId={projectId} unassigned={unassigned} open={addOpen} setOpen={setAddOpen} assign={assign} />
      </div>
    </div>
  );
}

function AddExisting({
  projectId,
  unassigned,
  open,
  setOpen,
  assign,
  centered,
}: {
  projectId: string;
  unassigned: Meeting[];
  open: boolean;
  setOpen: (o: boolean) => void;
  assign: (meetingId: string, projectId: string | null) => void;
  centered?: boolean;
}) {
  return (
    <div className={clsx("relative", centered && "text-center")}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink-light"
      >
        <Link2 className="h-4 w-4" /> Add existing meeting
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={clsx("absolute z-20 mt-1 w-72 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface shadow-panel py-1", centered && "left-1/2 -translate-x-1/2")}>
            {unassigned.length === 0 && <div className="px-3 py-2 text-sm text-ink-faint">No unassigned meetings.</div>}
            {unassigned.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  assign(m.id, projectId);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-surface-hover"
              >
                <span>{m.emoji}</span>
                <span className="truncate">{m.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProjectTasks({ projectId }: { projectId: string }) {
  const tasks = useStore((s) => s.tasks);
  const addTask = useStore((s) => s.addTask);
  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId]);
  return <TasksBoard tasks={projectTasks} onAdd={(status, title) => addTask(projectId, title, status)} />;
}
