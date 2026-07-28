import { useMemo } from "react";
import { Plus, CalendarClock, ListChecks, FolderOpen } from "lucide-react";
import { useStore } from "../store/store";
import { PageHeader } from "./PageHeader";
import { Button, EmptyState } from "./ui";
import type { Meeting, Task } from "../lib/types";

function projectStats(pid: string, meetings: Meeting[], tasks: Task[]) {
  const m = meetings.filter((x) => x.projectId === pid).length;
  const t = tasks.filter((x) => x.projectId === pid);
  const done = t.filter((x) => x.status === "done").length;
  return { meetings: m, tasksTotal: t.length, tasksDone: done };
}

export function ProjectHome() {
  const projects = useStore((s) => s.projects);
  const meetings = useStore((s) => s.meetings);
  const tasks = useStore((s) => s.tasks);
  const openProject = useStore((s) => s.openProject);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);

  const cards = useMemo(
    () => projects.map((p) => ({ p, stats: projectStats(p.id, meetings, tasks) })),
    [projects, meetings, tasks],
  );

  return (
    <div className="max-w-5xl mx-auto px-8 sm:px-12 py-10 sm:py-12">
      <PageHeader
        title="Projects"
        subtitle="Group meetings and tasks into focused workspaces."
        action={
          <Button onClick={() => setNewProjectOpen(true)}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title="No projects yet"
          description="Create a project to organize meetings and tasks."
          action={
            <Button onClick={() => setNewProjectOpen(true)}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cards.map(({ p, stats }) => {
            const pct = stats.tasksTotal ? Math.round((stats.tasksDone / stats.tasksTotal) * 100) : 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openProject(p.id)}
                className="text-left rounded-xl border border-line bg-surface p-4 hover:border-ink-faint/40 hover:bg-surface-hover/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-lg grid place-items-center text-xl shrink-0"
                    style={{ background: `${p.color}1a` }}
                  >
                    {p.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-ink truncate">{p.name}</div>
                    <div className="text-xs text-ink-faint">
                      {stats.meetings} meeting{stats.meetings === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-ink-light line-clamp-2 min-h-[2.5rem]">
                  {p.description || "\u00A0"}
                </p>

                <div className="mt-3 flex items-center gap-3 text-xs text-ink-faint">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {stats.meetings}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="h-3.5 w-3.5" />
                    {stats.tasksDone}/{stats.tasksTotal || 0}
                  </span>
                  {stats.tasksTotal > 0 && (
                    <span className="ml-auto tabular-nums">{pct}%</span>
                  )}
                </div>
                {stats.tasksTotal > 0 && (
                  <div className="mt-2 h-1 rounded-full bg-surface-active overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
