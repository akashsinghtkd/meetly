import { useEffect, useState } from "react";
import { Loader2, UserMinus, Users } from "lucide-react";
import { Button } from "../ui";
import { useAdminConsole } from "../../store/adminConsoleStore";
import { usePlatformAdmin } from "../../store/platformAdminStore";
import { relativeDate } from "../../lib/format";

export function TeamsTab() {
  const teamspaces = useAdminConsole((s) => s.teamspaces);
  const members = useAdminConsole((s) => s.members);
  const busy = useAdminConsole((s) => s.busy);
  const loadTeamspaces = useAdminConsole((s) => s.loadTeamspaces);
  const loadMembers = useAdminConsole((s) => s.loadMembers);
  const removeMember = useAdminConsole((s) => s.removeMember);
  const setTeamPlan = useAdminConsole((s) => s.setTeamPlan);
  const plans = usePlatformAdmin((s) => s.plans);

  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadTeamspaces();
  }, [loadTeamspaces]);

  const toggle = (id: string) => {
    if (expanded === id) return setExpanded(null);
    setExpanded(id);
    if (!members[id]) loadMembers(id);
  };

  if (!teamspaces.length && busy) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-faint py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading teamspaces…
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-ink-faint mb-3">{teamspaces.length} teamspace{teamspaces.length === 1 ? "" : "s"}</p>
      <div className="space-y-2">
        {teamspaces.map((t) => (
          <div key={t.id} className="rounded-xl border border-line">
            <button
              type="button"
              onClick={() => toggle(t.id)}
              className="w-full flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span>{t.emoji}</span>
                  <span className="font-semibold text-ink text-sm">{t.name}</span>
                  <span className="text-[11px] font-medium rounded-md px-1.5 py-0.5 bg-surface-active text-ink-faint">
                    {t.plan_name ?? t.plan_id}
                  </span>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">
                  {t.owner_email ?? "unknown owner"} · {t.member_count} member{t.member_count === 1 ? "" : "s"}
                  {t.seat_limit ? ` / ${t.seat_limit} seats` : ""} · created {relativeDate(t.created_at)}
                </p>
              </div>
              <select
                className="field text-xs shrink-0"
                value={t.plan_id}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setTeamPlan(t.id, e.target.value)}
                disabled={busy}
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </button>

            {expanded === t.id && (
              <div className="border-t border-line px-4 py-3">
                <p className="text-xs font-semibold text-ink-faint flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5" /> Members
                </p>
                {!members[t.id] ? (
                  <div className="flex items-center gap-2 text-xs text-ink-faint">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : members[t.id].length === 0 ? (
                  <p className="text-xs text-ink-faint">No members.</p>
                ) : (
                  <div className="space-y-1.5">
                    {members[t.id].map((m) => (
                      <div key={m.user_id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-ink">
                          {m.email ?? m.user_id} <span className="text-ink-faint">· {m.role}</span>
                          {m.status !== "active" && (
                            <span className="ml-1.5 text-[10px] rounded px-1 py-0.5 bg-surface-active text-ink-faint">
                              {m.status}
                            </span>
                          )}
                        </span>
                        {m.status === "active" && (
                          <Button
                            variant="ghost"
                            className="text-xs px-2 py-1"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Remove ${m.email ?? m.user_id} from ${t.name}?`)) {
                                removeMember(t.id, m.user_id);
                              }
                            }}
                          >
                            <UserMinus className="h-3.5 w-3.5" /> Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
