import { create } from "zustand";
import { supabase } from "../lib/supabase";

export interface AdminTeamspace {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  created_at: string;
  owner_email: string | null;
  member_count: number;
  plan_id: string;
  plan_name: string | null;
  seat_limit: number | null;
  billing_status: string;
}

export interface AdminMember {
  user_id: string;
  email: string | null;
  role: string;
  status: string;
  created_at: string;
}

export interface AdminMeeting {
  id: string;
  title: string;
  teamspace_id: string | null;
  teamspace_name: string | null;
  user_email: string | null;
  started_at: string;
  duration_secs: number;
  status: string;
  has_audio: boolean;
}

export interface AdminBuild {
  name: string;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUsageRow {
  teamspace_id: string;
  teamspace_name: string;
  requests: number;
  audio_minutes: number;
  cost_usd: number;
}

interface AdminConsoleState {
  teamspaces: AdminTeamspace[];
  members: Record<string, AdminMember[]>;
  meetings: AdminMeeting[];
  meetingSearch: string;
  meetingTeamFilter: string | null;
  builds: AdminBuild[];
  usage: AdminUsageRow[];
  busy: boolean;
  error: string | null;

  loadTeamspaces: () => Promise<void>;
  loadMembers: (teamspaceId: string) => Promise<void>;
  removeMember: (teamspaceId: string, userId: string) => Promise<void>;
  setTeamPlan: (teamspaceId: string, planId: string) => Promise<void>;

  loadMeetings: (opts?: { search?: string; teamspaceId?: string | null }) => Promise<void>;
  deleteMeeting: (meetingId: string) => Promise<void>;

  loadBuilds: () => Promise<void>;
  deleteBuild: (name: string) => Promise<void>;
  triggerRelease: () => Promise<void>;

  loadUsage: () => Promise<void>;
}

export const useAdminConsole = create<AdminConsoleState>((set, get) => ({
  teamspaces: [],
  members: {},
  meetings: [],
  meetingSearch: "",
  meetingTeamFilter: null,
  builds: [],
  usage: [],
  busy: false,
  error: null,

  loadTeamspaces: async () => {
    set({ busy: true, error: null });
    const { data, error } = await supabase().rpc("admin_list_teamspaces");
    if (error) return set({ busy: false, error: error.message });
    set({ teamspaces: data ?? [], busy: false });
  },

  loadMembers: async (teamspaceId) => {
    const { data, error } = await supabase().rpc("admin_list_members", {
      p_teamspace_id: teamspaceId,
    });
    if (error) return set({ error: error.message });
    set({ members: { ...get().members, [teamspaceId]: data ?? [] } });
  },

  removeMember: async (teamspaceId, userId) => {
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("admin_remove_member", {
      p_teamspace_id: teamspaceId,
      p_user_id: userId,
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    await get().loadMembers(teamspaceId);
    await get().loadTeamspaces();
    set({ busy: false });
  },

  setTeamPlan: async (teamspaceId, planId) => {
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("admin_set_team_plan", {
      p_teamspace_id: teamspaceId,
      p_plan_id: planId,
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    await get().loadTeamspaces();
    set({ busy: false });
  },

  loadMeetings: async (opts) => {
    const search = opts?.search ?? get().meetingSearch;
    const teamspaceId = opts?.teamspaceId !== undefined ? opts.teamspaceId : get().meetingTeamFilter;
    set({ busy: true, error: null, meetingSearch: search, meetingTeamFilter: teamspaceId });
    const { data, error } = await supabase().rpc("admin_list_meetings", {
      p_search: search || null,
      p_teamspace_id: teamspaceId || null,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) return set({ busy: false, error: error.message });
    set({ meetings: data ?? [], busy: false });
  },

  deleteMeeting: async (meetingId) => {
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("admin_delete_meeting", { p_meeting_id: meetingId });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    set({ meetings: get().meetings.filter((m) => m.id !== meetingId), busy: false });
  },

  loadBuilds: async () => {
    set({ busy: true, error: null });
    const { data, error } = await supabase().rpc("admin_list_builds");
    if (error) return set({ busy: false, error: error.message });
    set({ builds: data ?? [], busy: false });
  },

  deleteBuild: async (name) => {
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("admin_delete_build", { p_name: name });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    set({ builds: get().builds.filter((b) => b.name !== name), busy: false });
  },

  triggerRelease: async () => {
    set({ busy: true, error: null });
    const { data, error } = await supabase().functions.invoke("trigger-release", { body: {} });
    if (error || data?.error) {
      const message = data?.error ?? error?.message ?? "Failed to trigger release";
      set({ busy: false, error: message });
      throw new Error(message);
    }
    set({ busy: false });
  },

  loadUsage: async () => {
    set({ busy: true, error: null });
    const { data, error } = await supabase().rpc("admin_usage_summary");
    if (error) return set({ busy: false, error: error.message });
    set({ usage: data ?? [], busy: false });
  },
}));
