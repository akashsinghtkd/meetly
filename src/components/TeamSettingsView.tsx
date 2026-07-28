import { useEffect, useState, type FormEvent } from "react";
import { Copy, Link2, Loader2, Trash2, UserPlus } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Button } from "./ui";
import { BillingPanel } from "./BillingPanel";
import { useTeamspace } from "../store/teamspaceStore";
import { useBilling } from "../store/billingStore";
import { canAdminRole, type TeamspaceRole } from "../lib/types";
import { useAuth } from "../store/authStore";

export function TeamSettingsView() {
  const active = useTeamspace((s) => s.active());
  const role = useTeamspace((s) => s.myRole());
  const members = useTeamspace((s) => s.members);
  const invites = useTeamspace((s) => s.invites);
  const loadMembers = useTeamspace((s) => s.loadMembers);
  const loadInvites = useTeamspace((s) => s.loadInvites);
  const invite = useTeamspace((s) => s.invite);
  const revokeInvite = useTeamspace((s) => s.revokeInvite);
  const removeMember = useTeamspace((s) => s.removeMember);
  const updateMemberRole = useTeamspace((s) => s.updateMemberRole);
  const renameTeamspace = useTeamspace((s) => s.renameTeamspace);
  const me = useAuth((s) => s.user);
  const billing = useBilling((s) => s.snapshot);
  const refreshBilling = useBilling((s) => s.refreshUsage);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState(active?.name ?? "");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const isAdmin = canAdminRole(role);
  const seatsFull = billing ? !billing.canInvite : false;

  useEffect(() => {
    loadMembers();
    loadInvites();
    refreshBilling();
  }, [active?.id, loadMembers, loadInvites, refreshBilling]);

  useEffect(() => {
    setNameDraft(active?.name ?? "");
  }, [active?.name]);

  if (!active) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-12 text-ink-light text-sm">
        No active teamspace.
      </div>
    );
  }

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    if (seatsFull) {
      setErr("Seat limit reached — upgrade your plan to invite more people.");
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const inv = await invite(email.trim(), inviteRole);
      const link = `${window.location.origin}/?invite=${inv.token}`;
      setLastLink(link);
      setMsg(`Invite created for ${inv.email}. Share the link below.`);
      setEmail("");
      await refreshBilling();
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to invite");
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!nameDraft.trim() || nameDraft.trim() === active.name) return;
    try {
      await renameTeamspace(nameDraft.trim());
      setMsg("Teamspace renamed");
    } catch (ex: any) {
      setErr(ex?.message ?? "Rename failed");
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-8 sm:px-12 py-10 sm:py-12">
      <PageHeader
        title="Team"
        subtitle={`${active.emoji} ${active.name} · your role: ${role}`}
      />

      {msg && (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          {msg}
        </p>
      )}
      {err && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
          {err}
        </p>
      )}

      <BillingPanel />

      {isAdmin && (
        <section className="mb-8 rounded-xl border border-line p-4">
          <h2 className="text-sm font-semibold text-ink mb-3">Teamspace name</h2>
          <div className="flex gap-2">
            <input
              className="field flex-1"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <Button variant="secondary" onClick={saveName}>
              Save
            </Button>
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="mb-8 rounded-xl border border-line p-4">
          <h2 className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Invite people
          </h2>
          <p className="text-xs text-ink-faint mb-3">
            They’ll need to sign up / sign in with the invited email, then open the invite link.
            {billing && (
              <>
                {" "}
                Seats: {billing.seatsUsed}/{billing.seatsLimit}.
              </>
            )}
          </p>
          {seatsFull && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
              Seat limit reached. Upgrade your plan above to invite more teammates.
            </p>
          )}
          <form onSubmit={sendInvite} className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              className="field flex-1"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={seatsFull}
            />
            <select
              className="field w-auto"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
              disabled={seatsFull}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <Button type="submit" disabled={busy || seatsFull || !email.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Invite
            </Button>
          </form>
          {lastLink && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-sidebar border border-line px-3 py-2 text-xs">
              <Link2 className="h-3.5 w-3.5 text-ink-faint shrink-0" />
              <code className="truncate flex-1 text-ink-light">{lastLink}</code>
              <button
                type="button"
                className="shrink-0 text-accent font-medium inline-flex items-center gap-1"
                onClick={() => navigator.clipboard.writeText(lastLink)}
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          )}
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-ink mb-3">Members</h2>
        <ul className="rounded-xl border border-line divide-y divide-line overflow-hidden">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <div className="h-8 w-8 rounded-full bg-surface-active grid place-items-center text-xs font-semibold text-ink-light">
                {(me?.email && m.userId === me.id ? me.email : m.userId).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink truncate">
                  {m.userId === me?.id ? `${me.email ?? "You"} (you)` : m.userId.slice(0, 8) + "…"}
                </div>
                <div className="text-xs text-ink-faint capitalize">{m.role}</div>
              </div>
              {isAdmin && m.role !== "owner" && m.userId !== me?.id && (
                <div className="flex items-center gap-1">
                  <select
                    className="field py-1 text-xs w-auto"
                    value={m.role}
                    onChange={(e) =>
                      updateMemberRole(m.id, e.target.value as TeamspaceRole).catch((ex) =>
                        setErr(ex.message),
                      )
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-ink-faint hover:text-red-600 hover:bg-red-50"
                    title="Remove"
                    onClick={() =>
                      removeMember(m.id)
                        .then(() => refreshBilling())
                        .catch((ex) => setErr(ex.message))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
          {members.length === 0 && (
            <li className="px-4 py-6 text-sm text-ink-faint text-center">No members loaded</li>
          )}
        </ul>
      </section>

      {isAdmin && invites.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink mb-3">Pending invites</h2>
          <ul className="rounded-xl border border-line divide-y divide-line overflow-hidden">
            {invites.map((inv) => {
              const link = `${window.location.origin}/?invite=${inv.token}`;
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink truncate">{inv.email}</div>
                    <div className="text-xs text-ink-faint capitalize">
                      {inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-accent font-medium"
                    onClick={() => navigator.clipboard.writeText(link)}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-ink-faint hover:text-red-600"
                    onClick={() =>
                      revokeInvite(inv.id)
                        .then(() => refreshBilling())
                        .catch((ex) => setErr(ex.message))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
