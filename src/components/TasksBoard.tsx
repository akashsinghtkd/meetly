import { useState } from "react";
import { Mic, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store/store";
import { TASK_COLUMNS } from "../lib/types";
import type { Task, TaskStatus } from "../lib/types";

/** Reusable Kanban board. `onAdd` creates a task in the given column. */
export function TasksBoard({
  tasks,
  onAdd,
  showProject,
}: {
  tasks: Task[];
  onAdd: (status: TaskStatus, title: string) => void;
  showProject?: boolean;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {TASK_COLUMNS.map((col) => (
        <Column
          key={col.status}
          status={col.status}
          label={col.label}
          dot={col.dot}
          tasks={tasks.filter((t) => t.status === col.status)}
          onAdd={onAdd}
          showProject={showProject}
        />
      ))}
    </div>
  );
}

function Column({
  status,
  label,
  dot,
  tasks,
  onAdd,
  showProject,
}: {
  status: TaskStatus;
  label: string;
  dot: string;
  tasks: Task[];
  onAdd: (status: TaskStatus, title: string) => void;
  showProject?: boolean;
}) {
  const moveTask = useStore((s) => s.moveTask);
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) moveTask(id, status);
      }}
      className={clsx("w-64 shrink-0 rounded-lg p-2 transition-colors", over ? "bg-accent-soft" : "bg-surface-sidebar")}
    >
      <div className="flex items-center gap-2 px-1.5 py-1 text-sm">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <span className="font-medium text-ink-light">{label}</span>
        <span className="text-ink-faint">{tasks.length}</span>
      </div>

      <div className="space-y-1.5 mt-1">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} showProject={showProject} />
        ))}
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            onAdd(status, draft.trim());
            setDraft("");
          }
        }}
        placeholder="+ New task"
        className="w-full mt-1.5 bg-transparent text-sm px-2 py-1.5 rounded-md hover:bg-surface-hover outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}

function TaskCard({ task, showProject }: { task: Task; showProject?: boolean }) {
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const openMeeting = useStore((s) => s.openMeeting);
  const openProject = useStore((s) => s.openProject);
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined));
  const meeting = useStore((s) =>
    task.sourceMeetingId ? s.meetings.find((m) => m.id === task.sourceMeetingId) : undefined,
  );

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
      className="group rounded-md border border-line bg-surface p-2.5 shadow-sm cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start gap-1.5">
        <textarea
          value={task.title}
          onChange={(e) => updateTask(task.id, { title: e.target.value })}
          rows={1}
          className="flex-1 bg-transparent text-sm text-ink outline-none resize-none leading-snug"
        />
        <button
          onClick={() => deleteTask(task.id)}
          className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-red-500 shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {showProject && project && (
          <button
            onClick={() => openProject(project.id)}
            className="text-[10px] text-ink-light bg-surface-active rounded px-1.5 py-0.5 hover:bg-surface-hover"
          >
            {project.emoji} {project.name}
          </button>
        )}
        {showProject && !project && (
          <span className="text-[10px] text-ink-faint bg-surface-active rounded px-1.5 py-0.5">General</span>
        )}
        {task.owner && (
          <span className="text-[10px] text-ink-light bg-surface-active rounded px-1.5 py-0.5">{task.owner}</span>
        )}
        {task.due && <span className="text-[10px] text-ink-faint">{task.due}</span>}
        {meeting && (
          <button
            onClick={() => openMeeting(meeting.id)}
            className="ml-auto flex items-center gap-1 text-[10px] text-ink-faint hover:text-accent"
            title="From this meeting"
          >
            <Mic className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
