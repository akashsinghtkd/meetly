import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { MeetingList } from "./components/MeetingList";
import { MeetingPage } from "./components/MeetingPage";
import { ProjectPage } from "./components/ProjectPage";
import { ProjectHome } from "./components/ProjectHome";
import { ActionItemsView } from "./components/ActionItemsView";
import { GlobalTasksView } from "./components/GlobalTasksView";
import { SearchView } from "./components/SearchView";
import { SettingsView } from "./components/SettingsView";
import { TeamSettingsView } from "./components/TeamSettingsView";
import { SuperAdminView } from "./components/SuperAdminView";
import { RecordBar } from "./components/RecordBar";
import { AIChatPanel } from "./components/AIChatPanel";
import { NewProjectModal } from "./components/NewProjectModal";
import { SignIn } from "./components/SignIn";
import { CreateTeamspace } from "./components/CreateTeamspace";
import {
  AcceptInvite,
  clearInviteToken,
  readInviteToken,
} from "./components/AcceptInvite";
import { useStore } from "./store/store";
import { useAuth } from "./store/authStore";
import { useTheme } from "./store/themeStore";
import { useTeamspace } from "./store/teamspaceStore";
import { useBilling } from "./store/billingStore";
import { usePlatformAdmin } from "./store/platformAdminStore";
import { cloudEnabled } from "./lib/supabase";
import { inTauri } from "./lib/tauri";
import { startMeetingDetection, stopMeetingDetection } from "./lib/meetingDetect";
import { clearWorkspace, startSync, stopSync } from "./lib/sync";

function Toast() {
  const notice = useStore((s) => s.notice);
  const setNotice = useStore((s) => s.setNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);
  if (!notice) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-lg bg-chip text-chip-fg px-4 py-2.5 shadow-panel text-sm max-w-md">
      <span>{notice}</span>
      <button onClick={() => setNotice(null)} className="text-white/70 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function App() {
  const view = useStore((s) => s.view);
  const meetings = useStore((s) => s.meetings);
  const openMeeting = useStore((s) => s.openMeeting);
  const recordingActive = useStore((s) => s.recording.active);
  const recordingStartedAt = useStore((s) => s.recording.startedAt);
  const [chatOpen, setChatOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(() =>
    cloudEnabled() ? readInviteToken() : null,
  );
  const [inviteDone, setInviteDone] = useState(false);
  const [pendingMeeting, setPendingMeeting] = useState<string | null>(() => {
    try {
      return new URL(window.location.href).searchParams.get("meeting");
    } catch {
      return null;
    }
  });

  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const userId = user?.id ?? null;
  const tsReady = useTeamspace((s) => s.ready);
  const teamspaces = useTeamspace((s) => s.teamspaces);
  const activeId = useTeamspace((s) => s.activeId);
  const loadTeamspaces = useTeamspace((s) => s.load);
  const resetTeamspaces = useTeamspace((s) => s.reset);
  const loadBilling = useBilling((s) => s.load);
  const resetBilling = useBilling((s) => s.reset);
  const loadAdmin = usePlatformAdmin((s) => s.load);
  const resetAdmin = usePlatformAdmin((s) => s.reset);

  useEffect(() => {
    useTheme.getState().init();
    useAuth.getState().init();
  }, []);

  // Deep-link: ?meeting=<id> opens that meeting once it's loaded, then clears.
  useEffect(() => {
    if (!pendingMeeting) return;
    if (meetings.some((m) => m.id === pendingMeeting)) {
      openMeeting(pendingMeeting);
      setPendingMeeting(null);
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("meeting");
        window.history.replaceState({}, "", u.pathname + u.search + u.hash);
      } catch {
        /* ignore */
      }
    }
  }, [pendingMeeting, meetings, openMeeting]);

  // Desktop: floating recorder — detect calls and relay the pill's actions to
  // the recording flow that lives here in the main window.
  useEffect(() => {
    if (!inTauri()) return;
    const unlisteners: Array<() => void> = [];
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisteners.push(
        await listen("overlay:start-recording", () =>
          useStore.getState().startMeeting(undefined, { micOnly: true }),
        ),
      );
      unlisteners.push(
        await listen("overlay:stop-recording", () => useStore.getState().stopMeeting()),
      );
      unlisteners.push(
        await listen("overlay:open-main", async () => {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          await getCurrentWindow().setFocus();
        }),
      );
      startMeetingDetection();
    })();
    return () => {
      unlisteners.forEach((u) => u());
      stopMeetingDetection();
    };
  }, []);

  // Broadcast recording state + start time so the overlay pill shows a live timer.
  useEffect(() => {
    if (!inTauri()) return;
    (async () => {
      const { emit } = await import("@tauri-apps/api/event");
      await emit("recording:changed", {
        active: recordingActive,
        startedAt: recordingStartedAt,
      });
    })();
  }, [recordingActive, recordingStartedAt]);

  // Load teamspaces whenever auth user changes (by id, not object identity).
  useEffect(() => {
    if (!cloudEnabled()) return;
    if (!userId) {
      resetTeamspaces();
      resetBilling();
      resetAdmin();
      stopSync();
      return;
    }
    loadTeamspaces();
    loadAdmin();
  }, [userId, loadTeamspaces, resetTeamspaces, resetBilling, resetAdmin, loadAdmin]);

  // Sync + billing when active teamspace is set.
  useEffect(() => {
    if (!cloudEnabled() || !userId || !activeId) {
      stopSync();
      return;
    }
    clearWorkspace();
    startSync().catch((e) => console.error("[sync]", e));
    loadBilling().catch((e) => console.error("[billing]", e));
    return () => stopSync();
  }, [userId, activeId, loadBilling]);

  if (cloudEnabled() && !ready) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-surface-sidebar text-ink-faint">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <span className="text-sm">Loading Meetly…</span>
        </div>
      </div>
    );
  }

  if (cloudEnabled() && !user) return <SignIn />;

  if (cloudEnabled() && user && inviteToken && !inviteDone) {
    return (
      <AcceptInvite
        token={inviteToken}
        onDone={() => {
          clearInviteToken();
          setInviteToken(null);
          setInviteDone(true);
          loadTeamspaces();
        }}
      />
    );
  }

  if (cloudEnabled() && user && !tsReady) {
    return (
      <div className="h-screen w-screen grid place-items-center bg-surface-sidebar text-ink-faint">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
          <span className="text-sm">Loading teamspaces…</span>
        </div>
      </div>
    );
  }

  if (cloudEnabled() && user && tsReady && teamspaces.length === 0) {
    return <CreateTeamspace />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 h-full overflow-y-auto relative">
        {view.kind === "all-meetings" && <MeetingList />}
        {view.kind === "action-items" && <ActionItemsView />}
        {view.kind === "tasks" && <GlobalTasksView />}
        {view.kind === "projects" && <ProjectHome />}
        {view.kind === "search" && <SearchView />}
        {view.kind === "settings" && <SettingsView />}
        {view.kind === "team" && <TeamSettingsView />}
        {view.kind === "admin" && <SuperAdminView />}
        {view.kind === "meeting" && (
          <MeetingPage meetingId={view.id} onOpenChat={() => setChatOpen(true)} />
        )}
        {view.kind === "project" && <ProjectPage projectId={view.id} tab={view.tab} />}
      </main>

      {chatOpen && <AIChatPanel onClose={() => setChatOpen(false)} />}

      <RecordBar />
      <Toast />
      <NewProjectModal />
    </div>
  );
}
