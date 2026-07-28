import { useMemo, useState } from "react";
import { useStore } from "../store/store";
import { TasksBoard } from "./TasksBoard";
import { PageHeader } from "./PageHeader";
import type { TaskStatus } from "../lib/types";

// Filter value: "all" | "general" (no project) | a project id.
type Filter = string;

export function GlobalTasksView() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const addTask = useStore((s) => s.addTask);
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "general") return tasks.filter((t) => !t.projectId);
    return tasks.filter((t) => t.projectId === filter);
  }, [tasks, filter]);

  // New tasks go to the filtered project (or General when viewing all/general).
  const targetProject = filter === "all" || filter === "general" ? null : filter;

  const openCount = visible.filter((t) => t.status !== "done").length;

  return (
    <div className="max-w-6xl mx-auto px-8 sm:px-12 py-10 sm:py-12">
      <PageHeader
        title="Tasks"
        subtitle={`${openCount} open · drag cards between columns`}
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="field py-2 w-auto min-w-[160px]"
          >
            <option value="all">All projects</option>
            <option value="general">General (no project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        }
      />

      <TasksBoard
        tasks={visible}
        showProject
        onAdd={(status: TaskStatus, title: string) => addTask(targetProject, title, status)}
      />
    </div>
  );
}
