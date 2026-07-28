import { create } from "zustand";
import { persist } from "zustand/middleware";
import { cloudEnabled, supabase } from "../lib/supabase";
import { useAuth } from "./authStore";
import type { Teamspace, TeamspaceInvite, TeamspaceMember, TeamspaceRole } from "../lib/types";

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function rowTeamspace(r: any, role: TeamspaceRole): Teamspace {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    emoji: r.emoji ?? "🏢",
    createdBy: r.created_by,
    createdAt: r.created_at,
    role,
  };
}

interface TeamspaceState {
  teamspaces: Teamspace[];
  activeId: string | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  members: TeamspaceMember[];
  invites: TeamspaceInvite[];

  load: () => Promise<void>;
  createTeamspace: (name: string, emoji?: string) => Promise<Teamspace>;
  setActive: (id: string) => void;
  active: () => Teamspace | null;
  myRole: () => TeamspaceRole | undefined;

  loadMembers: () => Promise<void>;
  loadInvites: () => Promise<void>;
  invite: (email: string, role?: Exclude<TeamspaceRole, "owner">) => Promise<TeamspaceInvite>;
  revokeInvite: (id: string) => Promise<void>;
  acceptInvite: (token: string) => Promise<Teamspace>;
  removeMember: (memberId: string) => Promise<void>;
  updateMemberRole: (memberId: string, role: TeamspaceRole) => Promise<void>;
  renameTeamspace: (name: string) => Promise<void>;
  reset: () => void;
}

const ACTIVE_KEY = "meetly-active-teamspace";

let loadGeneration = 0;

export const useTeamspace = create<TeamspaceState>()(
  persist(
    (set, get) => ({
      teamspaces: [],
      activeId: null,
      ready: !cloudEnabled(),
      busy: false,
      error: null,
      members: [],
      invites: [],

      reset: () => {
        loadGeneration += 1;
        set({
          teamspaces: [],
          activeId: null,
          ready: !cloudEnabled(),
          members: [],
          invites: [],
          error: null,
        });
      },

      active: () => {
        const { teamspaces, activeId } = get();
        return teamspaces.find((t) => t.id === activeId) ?? teamspaces[0] ?? null;
      },

      myRole: () => get().active()?.role,

      setActive: (id) => {
        if (get().teamspaces.some((t) => t.id === id)) set({ activeId: id });
      },

      load: async () => {
        if (!cloudEnabled()) {
          set({ ready: true, teamspaces: [], activeId: null });
          return;
        }
        const user = useAuth.getState().user;
        if (!user) {
          set({ ready: true, teamspaces: [], activeId: null, members: [], invites: [] });
          return;
        }

        const gen = ++loadGeneration;
        set({ busy: true, error: null });
        try {
          const sb = supabase();
          const { data: memberships, error } = await sb
            .from("teamspace_members")
            .select("role, teamspace_id")
            .eq("user_id", user.id)
            .eq("status", "active");

          if (gen !== loadGeneration) return;

          if (error) {
            set({ busy: false, ready: true, error: error.message });
            return;
          }

          const ids = [...new Set((memberships ?? []).map((m) => m.teamspace_id))];
          let teamspaces: Teamspace[] = [];
          if (ids.length) {
            const { data: rows, error: tsErr } = await sb
              .from("teamspaces")
              .select("*")
              .in("id", ids);
            if (gen !== loadGeneration) return;
            if (tsErr) {
              set({ busy: false, ready: true, error: tsErr.message });
              return;
            }
            const roleByTs = new Map(
              (memberships ?? []).map((m) => [m.teamspace_id, m.role as TeamspaceRole]),
            );
            teamspaces = (rows ?? []).map((r) =>
              rowTeamspace(r, roleByTs.get(r.id) ?? "member"),
            );
          }

          // Don't clobber a teamspace that was just created while this load was in flight.
          if (teamspaces.length === 0 && get().teamspaces.length > 0) {
            set({ busy: false, ready: true });
            return;
          }

          const prev = get().activeId;
          const activeId =
            (prev && teamspaces.some((t) => t.id === prev) && prev) ||
            teamspaces[0]?.id ||
            null;

          set({ teamspaces, activeId, busy: false, ready: true });
          if (activeId) {
            await get().loadMembers();
            await get().loadInvites();
          }
        } catch (e: any) {
          if (gen !== loadGeneration) return;
          set({ busy: false, ready: true, error: e?.message ?? "Failed to load teamspaces" });
        }
      },

      createTeamspace: async (name, emoji = "🏢") => {
        const user = useAuth.getState().user;
        if (!user) throw new Error("Not signed in");
        set({ busy: true, error: null });

        try {
          await useAuth.getState().ensureSession();
        } catch (e: any) {
          set({ busy: false, error: e?.message ?? "Please sign in again" });
          throw e;
        }

        // Invalidate in-flight loads so they can't wipe this create.
        loadGeneration += 1;

        const sb = supabase();
        const trimmed = name.trim() || "My teamspace";

        const { data, error: tsErr } = await sb.rpc("create_teamspace", {
          p_name: trimmed,
          p_emoji: emoji,
          p_id: newId("ts"),
          p_member_id: newId("tm"),
        });

        const row = (Array.isArray(data) ? data[0] : data) as {
          id: string;
          name: string;
          slug: string;
          emoji?: string;
          created_by?: string;
          created_at?: string;
        } | null;

        if (tsErr || !row?.id) {
          const msg = tsErr?.message ?? "Failed to create teamspace";
          // Auth/JWT problems should stay on this screen with a clear error — not a silent bounce.
          if (/not authenticated|jwt|session/i.test(msg)) {
            set({
              busy: false,
              error: "Session expired or missing. Please sign out and sign in again.",
            });
          } else {
            set({ busy: false, error: msg });
          }
          throw tsErr ?? new Error(msg);
        }

        const ts: Teamspace = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          emoji: row.emoji ?? emoji,
          createdBy: row.created_by ?? user.id,
          createdAt: row.created_at ?? new Date().toISOString(),
          role: "owner",
        };
        set((s) => ({
          teamspaces: [...s.teamspaces.filter((t) => t.id !== ts.id), ts],
          activeId: ts.id,
          busy: false,
          ready: true,
          error: null,
        }));
        return ts;
      },

      loadMembers: async () => {
        const ts = get().active();
        if (!ts || !cloudEnabled()) return;
        const sb = supabase();
        const { data, error } = await sb
          .from("teamspace_members")
          .select("id, teamspace_id, user_id, role, status")
          .eq("teamspace_id", ts.id)
          .eq("status", "active");
        if (error) {
          set({ error: error.message });
          return;
        }
        set({
          members: (data ?? []).map((m) => ({
            id: m.id,
            teamspaceId: m.teamspace_id,
            userId: m.user_id,
            role: m.role as TeamspaceRole,
            status: m.status as "active" | "removed",
          })),
        });
      },

      loadInvites: async () => {
        const ts = get().active();
        if (!ts || !cloudEnabled()) return;
        const sb = supabase();
        const { data, error } = await sb
          .from("teamspace_invites")
          .select("*")
          .eq("teamspace_id", ts.id)
          .is("accepted_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });
        if (error) {
          // Viewers may not have invite select — ignore
          return;
        }
        set({
          invites: (data ?? []).map((i) => ({
            id: i.id,
            teamspaceId: i.teamspace_id,
            email: i.email,
            role: i.role,
            token: i.token,
            expiresAt: i.expires_at,
            acceptedAt: i.accepted_at ?? undefined,
            createdAt: i.created_at,
          })),
        });
      },

      invite: async (email, role = "member") => {
        const ts = get().active();
        const user = useAuth.getState().user;
        if (!ts || !user) throw new Error("No active teamspace");
        const sb = supabase();
        const id = newId("inv");
        const token = crypto.randomUUID().replace(/-/g, "");
        const row = {
          id,
          teamspace_id: ts.id,
          email: email.trim().toLowerCase(),
          role,
          token,
          invited_by: user.id,
        };
        const { data, error } = await sb.from("teamspace_invites").insert(row).select("*").single();
        if (error) throw error;
        const invite: TeamspaceInvite = {
          id: data.id,
          teamspaceId: data.teamspace_id,
          email: data.email,
          role: data.role,
          token: data.token,
          expiresAt: data.expires_at,
          createdAt: data.created_at,
        };
        set((s) => ({ invites: [invite, ...s.invites] }));
        return invite;
      },

      revokeInvite: async (id) => {
        const sb = supabase();
        const { error } = await sb.from("teamspace_invites").delete().eq("id", id);
        if (error) throw error;
        set((s) => ({ invites: s.invites.filter((i) => i.id !== id) }));
      },

      acceptInvite: async (token) => {
        const user = useAuth.getState().user;
        if (!user?.email) throw new Error("Sign in to accept this invite");
        set({ busy: true, error: null });

        // Make sure the client is carrying a valid token before the privileged RPC.
        try {
          await useAuth.getState().ensureSession();
        } catch (e: any) {
          set({ busy: false, error: e?.message ?? "Please sign in again" });
          throw e;
        }

        const sb = supabase();

        // Validate + join atomically in the DB (RLS blocks a direct member insert
        // for someone who isn't a member yet — see accept_invite in 0006).
        const { data, error } = await sb.rpc("accept_invite", { p_token: token });
        const row = (Array.isArray(data) ? data[0] : data) as
          | { id: string; name: string; slug: string; emoji?: string; created_by?: string; created_at?: string }
          | null;

        if (error || !row?.id) {
          const msg = error?.message ?? "Invite not found or expired";
          set({ busy: false, error: msg });
          throw error ?? new Error(msg);
        }

        // Refresh membership list, then focus the joined teamspace.
        await get().load();
        set({ activeId: row.id, busy: false });
        const ts =
          get().teamspaces.find((t) => t.id === row.id) ?? rowTeamspace(row, "member");
        return ts;
      },

      removeMember: async (memberId) => {
        const sb = supabase();
        const { error } = await sb
          .from("teamspace_members")
          .update({ status: "removed" })
          .eq("id", memberId);
        if (error) throw error;
        set((s) => ({ members: s.members.filter((m) => m.id !== memberId) }));
      },

      updateMemberRole: async (memberId, role) => {
        if (role === "owner") throw new Error("Transfer ownership is not supported yet");
        const sb = supabase();
        const { error } = await sb
          .from("teamspace_members")
          .update({ role })
          .eq("id", memberId);
        if (error) throw error;
        set((s) => ({
          members: s.members.map((m) => (m.id === memberId ? { ...m, role } : m)),
        }));
      },

      renameTeamspace: async (name) => {
        const ts = get().active();
        if (!ts) return;
        const sb = supabase();
        const trimmed = name.trim();
        const { error } = await sb.from("teamspaces").update({ name: trimmed, updated_at: new Date().toISOString() }).eq("id", ts.id);
        if (error) throw error;
        set((s) => ({
          teamspaces: s.teamspaces.map((t) => (t.id === ts.id ? { ...t, name: trimmed } : t)),
        }));
      },
    }),
    {
      name: ACTIVE_KEY,
      partialize: (s) => ({ activeId: s.activeId }),
    },
  ),
);
