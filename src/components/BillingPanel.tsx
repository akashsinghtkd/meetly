import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, Sparkles, Users } from "lucide-react";
import clsx from "clsx";
import { useBilling } from "../store/billingStore";
import { useTeamspace } from "../store/teamspaceStore";
import { canAdminRole } from "../lib/types";
import { stripeEnabled, type PlanId } from "../lib/billing/plans";
import { Button } from "./ui";

export function BillingPanel() {
  const role = useTeamspace((s) => s.myRole());
  const plans = useBilling((s) => s.plans);
  const snapshot = useBilling((s) => s.snapshot);
  const billingEnabled = useBilling((s) => s.billingEnabled);
  const busy = useBilling((s) => s.busy);
  const error = useBilling((s) => s.error);
  const load = useBilling((s) => s.load);
  const activatePlanDev = useBilling((s) => s.activatePlanDev);
  const startCheckout = useBilling((s) => s.startCheckout);
  const openPortal = useBilling((s) => s.openPortal);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isAdmin = canAdminRole(role);
  const paid = stripeEnabled();

  useEffect(() => {
    load();
  }, [load]);

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-line p-4 text-sm text-ink-faint flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading billing…
      </div>
    );
  }

  // Launch mode: platform admin has billing OFF → everything free
  if (!billingEnabled) {
    return (
      <section className="mb-8 rounded-xl border border-line p-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2 mb-1">
          <CreditCard className="h-4 w-4" /> Plan
        </h2>
        <p className="text-sm text-ink-light">
          You’re on <span className="font-medium text-ink">Free</span> — all features are included
          while paid billing is turned off by Meetly.
        </p>
        <p className="text-xs text-ink-faint mt-2">
          Seats & AI minutes are not limited right now.
        </p>
      </section>
    );
  }

  const seatPct = Math.min(1, snapshot.seatsUsed / Math.max(1, snapshot.seatsLimit));
  const aiPct = Math.min(1, snapshot.aiMinutesUsed / Math.max(1, snapshot.aiMinutesLimit));

  const onSelect = async (planId: PlanId) => {
    setErr(null);
    setMsg(null);
    try {
      if (planId === snapshot.plan.id) return;
      if (planId === "free") {
        if (paid && snapshot.subscription.stripeSubscriptionId) {
          await openPortal();
          return;
        }
        await activatePlanDev("free");
        setMsg("Switched to Free plan.");
        return;
      }
      if (paid) {
        await startCheckout(planId);
        return;
      }
      await activatePlanDev(planId);
      setMsg(`Activated ${planId} plan (dev mode — configure Stripe for real billing).`);
    } catch (e: any) {
      setErr(e?.message ?? "Billing action failed");
    }
  };

  return (
    <section className="mb-8 rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Plan & usage
          </h2>
          <p className="text-xs text-ink-faint mt-0.5">
            Current plan:{" "}
            <span className="font-medium text-ink capitalize">{snapshot.plan.name}</span>
            {snapshot.subscription.status !== "active" && (
              <span className="text-amber-700"> · {snapshot.subscription.status}</span>
            )}
          </p>
        </div>
        {isAdmin && paid && snapshot.subscription.stripeCustomerId && (
          <Button
            variant="secondary"
            className="text-xs py-1.5"
            onClick={() => openPortal().catch((e) => setErr(e.message))}
          >
            Manage billing
          </Button>
        )}
      </div>

      {(msg || error || err) && (
        <p
          className={clsx(
            "mb-3 text-sm rounded-lg px-3 py-2 border",
            msg
              ? "text-emerald-700 bg-emerald-50 border-emerald-100"
              : "text-red-600 bg-red-50 border-red-100",
          )}
        >
          {msg ?? err ?? error}
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        <UsageMeter
          icon={<Users className="h-3.5 w-3.5" />}
          label="Seats"
          used={snapshot.seatsUsed}
          limit={snapshot.seatsLimit}
          pct={seatPct}
          warn={!snapshot.canInvite}
        />
        <UsageMeter
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="AI minutes (this month)"
          used={Number(snapshot.aiMinutesUsed.toFixed(1))}
          limit={snapshot.aiMinutesLimit}
          pct={aiPct}
          warn={!snapshot.canUseAi}
        />
      </div>

      {!paid && (
        <p className="text-[12px] text-ink-faint mb-3 rounded-lg bg-surface-sidebar border border-line px-3 py-2">
          Stripe keys not set — upgrades use <strong>dev mode</strong> until Stripe is configured.
        </p>
      )}

      <div className="grid gap-2">
        {plans.map((p) => {
          const current = p.id === snapshot.plan.id;
          return (
            <div
              key={p.id}
              className={clsx(
                "rounded-lg border px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-3",
                current ? "border-accent bg-accent-soft/40" : "border-line",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink text-sm">{p.name}</span>
                  {current && (
                    <span className="text-[11px] font-medium text-accent inline-flex items-center gap-0.5">
                      <Check className="h-3 w-3" /> Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-light mt-0.5">{p.description}</p>
                <p className="text-[11px] text-ink-faint mt-1">
                  {p.seatLimit} seats · {p.aiMinutesLimit.toLocaleString()} AI min/mo
                  {p.priceUsdMonth > 0 ? ` · $${p.priceUsdMonth}/mo` : " · $0"}
                </p>
              </div>
              {isAdmin && !current && (
                <Button
                  variant={p.id === "free" ? "secondary" : "primary"}
                  className="shrink-0 text-xs"
                  disabled={busy}
                  onClick={() => onSelect(p.id as PlanId)}
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {p.priceUsdMonth > 0 ? (paid ? "Upgrade" : "Activate") : "Downgrade"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function UsageMeter({
  icon,
  label,
  used,
  limit,
  pct,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
  pct: number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-ink-light inline-flex items-center gap-1.5">
          {icon} {label}
        </span>
        <span className={clsx("tabular-nums font-medium", warn ? "text-amber-700" : "text-ink")}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-active overflow-hidden">
        <div
          className={clsx("h-full rounded-full transition-all", warn ? "bg-amber-500" : "bg-accent")}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
      </div>
    </div>
  );
}
