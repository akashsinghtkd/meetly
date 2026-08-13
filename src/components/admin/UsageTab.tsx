import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAdminConsole } from "../../store/adminConsoleStore";
import { formatUsd } from "../../lib/money";

export function UsageTab() {
  const usage = useAdminConsole((s) => s.usage);
  const busy = useAdminConsole((s) => s.busy);
  const loadUsage = useAdminConsole((s) => s.loadUsage);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const totalCost = usage.reduce((sum, r) => sum + r.cost_usd, 0);

  return (
    <div>
      <p className="text-xs text-ink-faint mb-3">
        This calendar month, across all teamspaces · total {formatUsd(totalCost)}
      </p>

      {busy && !usage.length ? (
        <div className="flex items-center gap-2 text-sm text-ink-faint py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
        </div>
      ) : usage.length === 0 ? (
        <p className="text-sm text-ink-faint py-8">No AI usage recorded this month yet.</p>
      ) : (
        <div className="space-y-1.5">
          {usage.map((row) => (
            <div
              key={row.teamspace_id}
              className="rounded-lg border border-line px-4 py-2.5 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink text-sm truncate">{row.teamspace_name}</p>
                <p className="text-[11px] text-ink-faint mt-0.5">
                  {row.requests} request{row.requests === 1 ? "" : "s"} · {row.audio_minutes.toFixed(1)} AI min
                </p>
              </div>
              <span className="text-sm font-semibold text-ink tabular-nums shrink-0">
                {formatUsd(row.cost_usd)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
