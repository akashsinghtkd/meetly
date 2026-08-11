import { useState } from "react";
import {
  Check,
  CheckSquare,
  ChevronsUpDown,
  Coins,
  FolderPlus,
  Home,
  LayoutGrid,
  Monitor,
  Plus,
  Search,
  Settings,
  Shield,
  Circle,
  Users,
  Moon,
  Sun,
} from "lucide-react";
import clsx from "clsx";
import { useStore } from "../store/store";
import { useCost } from "../store/costStore";
import { useAuth } from "../store/authStore";
import { useTheme } from "../store/themeStore";
import { useTeamspace } from "../store/teamspaceStore";
import { usePlatformAdmin } from "../store/platformAdminStore";
import { formatUsd } from "../lib/money";
import { inTauri } from "../lib/tauri";
import { cloudEnabled } from "../lib/supabase";
import { BrandMark, Button, MeetingIcon } from "./ui";
import { canEditRole, type Meeting, type View } from "../lib/types";

function recentMeetings(meetings: Meeting[], limit = 8): Meeting[] {
  return [...meetings]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

export function Sidebar() {
  const meetings = useStore((s) => s.meetings);
  const projects = useStore((s) => s.projects);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const openMeeting = useStore((s) => s.openMeeting);
  const openProject = useStore((s) => s.openProject);
  const isPlatformAdmin = usePlatformAdmin((s) => s.isAdmin);
  const setNewProjectOpen = useStore((s) => s.setNewProjectOpen);
  const startMeeting = useStore((s) => s.startMeeting);
  const recording = useStore((s) => s.recording);

  const tasks = useStore((s) => s.tasks);
  const authUser = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const totalCost = useCost((s) => s.total());
  const estimatedTotal = useCost((s) => s.estimatedTotal());

  const resolvedTheme = useTheme((s) => s.resolved);
  const setThemePref = useTheme((s) => s.setPref);

  const teamspaces = useTeamspace((s) => s.teamspaces);
  const activeTs = useTeamspace((s) => s.active());
  const setActive = useTeamspace((s) => s.setActive);
  const role = useTeamspace((s) => s.myRole());
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isActive = (v: View["kind"]) => view.kind === v;
  const openTaskCount = tasks.filter((t) => t.status !== "done").length;
  const desktop = inTauri();
  const recent = recentMeetings(meetings);
  const canEdit = !cloudEnabled() || canEditRole(role);

  const switchTeamspace = (id: string) => {
    if (id === activeTs?.id) {
      setSwitcherOpen(false);
      return;
    }
    setActive(id);
    setSwitcherOpen(false);
    setView({ kind: "all-meetings" });
  };

  return (
    <aside className="w-[232px] shrink-0 h-full bg-surface-sidebar border-r border-line flex flex-col">
      <div className="titlebar-drag h-10 flex items-center px-3 pt-1">
        <div className="w-14" />
      </div>

      <div className="px-3 pb-2 titlebar-drag">
        <div className="no-drag flex items-center gap-2 px-1 mb-2">
          <BrandMark size="sm" />
          <span className="font-semibold text-ink text-[15px] tracking-tight">Meetly</span>
        </div>

        {cloudEnabled() && activeTs && (
          <div className="no-drag relative">
            <button
              type="button"
              onClick={() => setSwitcherOpen((o) => !o)}
              className="w-full flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2 text-left hover:bg-surface-hover transition-colors"
            >
              <span className="text-base leading-none">{activeTs.emoji}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                {activeTs.name}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-ink-faint shrink-0" />
            </button>
            {switcherOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSwitcherOpen(false)} />
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-line bg-surface shadow-panel py-1 max-h-64 overflow-y-auto">
                  {teamspaces.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-sm hover:bg-surface-hover"
                      onClick={() => switchTeamspace(t.id)}
                    >
                      <span>{t.emoji}</span>
                      <span className="truncate flex-1 text-left">{t.name}</span>
                      {t.id === activeTs.id && <Check className="h-3.5 w-3.5 text-accent" />}
                    </button>
                  ))}
                  <div className="border-t border-line mt-1 pt-1">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-ink-light hover:bg-surface-hover"
                      onClick={() => {
                        setSwitcherOpen(false);
                        setView({ kind: "team" });
                      }}
                    >
                      <Users className="h-4 w-4" /> Team settings
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 no-drag">
        {desktop && canEdit ? (
          <Button
            className="w-full"
            onClick={() => startMeeting()}
            disabled={recording.active}
          >
            {recording.active ? (
              <>
                <Circle className="h-3 w-3 fill-current recording-dot" /> Recording…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> New meeting
              </>
            )}
          </Button>
        ) : (
          <div
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] text-ink-light"
            title={
              !desktop
                ? "Audio capture requires the desktop app"
                : "Viewers can’t create meetings"
            }
          >
            <Monitor className="h-3.5 w-3.5 shrink-0" />
            {!desktop ? "View & sync only" : "View only"}
          </div>
        )}
      </div>

      <nav className="px-2 space-y-0.5 no-drag">
        <button
          type="button"
          className={clsx("nav-item w-full", isActive("all-meetings") && "active")}
          onClick={() => setView({ kind: "all-meetings" })}
        >
          <Home className="h-4 w-4" /> All meetings
        </button>
        <button
          type="button"
          className={clsx("nav-item w-full", isActive("projects") && "active")}
          onClick={() => setView({ kind: "projects" })}
        >
          <LayoutGrid className="h-4 w-4" /> Projects
        </button>
        <button
          type="button"
          className={clsx("nav-item w-full", isActive("tasks") && "active")}
          onClick={() => setView({ kind: "tasks" })}
        >
          <CheckSquare className="h-4 w-4" /> Tasks
          {openTaskCount > 0 && (
            <span className="ml-auto text-[11px] font-medium bg-surface-active text-ink-light rounded-md px-1.5 py-0.5 tabular-nums">
              {openTaskCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={clsx("nav-item w-full", isActive("search") && "active")}
          onClick={() => setView({ kind: "search" })}
        >
          <Search className="h-4 w-4" /> Search
        </button>
        {cloudEnabled() && (
          <button
            type="button"
            className={clsx("nav-item w-full", isActive("team") && "active")}
            onClick={() => setView({ kind: "team" })}
          >
            <Users className="h-4 w-4" /> Team
          </button>
        )}
        {cloudEnabled() && isPlatformAdmin && (
          <button
            type="button"
            className={clsx("nav-item w-full", isActive("admin") && "active")}
            onClick={() => setView({ kind: "admin" })}
          >
            <Shield className="h-4 w-4" /> Platform admin
          </button>
        )}
      </nav>

      <div className="mt-5 px-3 flex items-center justify-between no-drag">
        <span className="section-label">Projects</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setNewProjectOpen(true)}
            className="p-1 rounded-md text-ink-faint hover:text-ink hover:bg-surface-hover"
            title="New project"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="px-2 pt-1 no-drag">
        {projects.map((p) => (
          <button
            type="button"
            key={p.id}
            className={clsx(
              "nav-item w-full",
              view.kind === "project" && view.id === p.id && "active",
            )}
            onClick={() => openProject(p.id)}
          >
            <span className="text-[15px] leading-none">{p.emoji}</span>
            <span className="truncate">{p.name}</span>
          </button>
        ))}
        {projects.length === 0 && canEdit && (
          <button
            type="button"
            onClick={() => setNewProjectOpen(true)}
            className="nav-item text-ink-faint w-full"
          >
            <Plus className="h-4 w-4" /> New project
          </button>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <div className="mt-5 px-3 no-drag">
            <span className="section-label">Recent</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2 no-drag min-h-0">
            {recent.map((m) => (
              <button
                type="button"
                key={m.id}
                className={clsx(
                  "nav-item w-full",
                  view.kind === "meeting" && view.id === m.id && "active",
                )}
                onClick={() => openMeeting(m.id)}
              >
                <MeetingIcon />
                <span className="truncate">{m.title || "Untitled"}</span>
                {m.status === "recording" && (
                  <Circle className="ml-auto h-2.5 w-2.5 fill-red-500 text-red-500 recording-dot shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
      {recent.length === 0 && <div className="flex-1" />}

      <div className="px-2 py-2 border-t border-line no-drag space-y-0.5">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-ink-light rounded-md hover:bg-surface-hover"
          onClick={() => setView({ kind: "settings" })}
          title={estimatedTotal > 0 ? "Includes estimated (mock) costs" : "Actual API spend"}
        >
          <Coins className="h-4 w-4 text-ink-faint" />
          <span>API usage</span>
          <span className="ml-auto font-medium tabular-nums text-ink">{formatUsd(totalCost)}</span>
        </button>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={clsx("nav-item flex-1", isActive("settings") && "active")}
            onClick={() => setView({ kind: "settings" })}
          >
            <Settings className="h-4 w-4" /> Settings
          </button>
          <button
            type="button"
            onClick={() => setThemePref(resolvedTheme === "dark" ? "light" : "dark")}
            className="shrink-0 p-2 rounded-md text-ink-faint hover:text-ink hover:bg-surface-hover"
            title={resolvedTheme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
        {authUser && (
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-ink-faint">
            <span className="truncate flex-1" title={authUser.email ?? ""}>
              {authUser.email}
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              className="shrink-0 text-ink-light hover:text-ink font-medium"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
