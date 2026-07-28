import { useEffect, useState } from "react";
import { Loader2, Shield, ToggleLeft, ToggleRight } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "./PageHeader";
import { Button } from "./ui";
import { usePlatformAdmin } from "../store/platformAdminStore";
import { useBilling } from "../store/billingStore";
import type { BillingPlan } from "../lib/billing/plans";

export function SuperAdminView() {
  const isAdmin = usePlatformAdmin((s) => s.isAdmin);
  const ready = usePlatformAdmin((s) => s.ready);
  const billingEnabled = usePlatformAdmin((s) => s.billingEnabled);
  const plans = usePlatformAdmin((s) => s.plans);
  const busy = usePlatformAdmin((s) => s.busy);
  const error = usePlatformAdmin((s) => s.error);
  const load = usePlatformAdmin((s) => s.load);
  const bootstrap = usePlatformAdmin((s) => s.bootstrap);
  const setBillingEnabled = usePlatformAdmin((s) => s.setBillingEnabled);
  const savePlan = usePlatformAdmin((s) => s.savePlan);
  const addAdmin = usePlatformAdmin((s) => s.addAdmin);
  const refreshBilling = useBilling((s) => s.load);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [editing, setEditing] = useState<BillingPlan | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  if (!ready) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-12 text-ink-faint flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading admin…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-8 py-12">
        <PageHeader
          title="Platform admin"
          subtitle="Only Meetly platform admins can manage billing plans."
        />
        <p className="text-sm text-ink-light mb-4">
          If you’re the first operator on this install, claim admin once:
        </p>
        <Button
          onClick={async () => {
            setErr(null);
            const ok = await bootstrap();
            if (!ok) setErr("Could not claim admin (another admin may already exist).");
            else setMsg("You are now a platform admin.");
          }}
        >
          Claim platform admin
        </Button>
        {(err || error) && (
          <p className="mt-3 text-sm text-red-600">{err ?? error}</p>
        )}
      </div>
    );
  }

  const toggleBilling = async () => {
    setErr(null);
    setMsg(null);
    try {
      await setBillingEnabled(!billingEnabled);
      await refreshBilling();
      setMsg(
        !billingEnabled
          ? "Billing is ON — seat & AI limits apply; customers can upgrade to active paid plans."
          : "Billing is OFF — everything is free / unlimited for all teamspaces.",
      );
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-8 sm:px-12 py-10 sm:py-12">
      <PageHeader
        title="Platform admin"
        subtitle="Control whether billing is live and edit plan limits. Keep billing off until you’re ready to charge."
      />

      {(msg || err || error) && (
        <p
          className={clsx(
            "mb-4 text-sm rounded-lg px-3 py-2 border",
            msg
              ? "text-emerald-700 bg-emerald-50 border-emerald-100"
              : "text-red-600 bg-red-50 border-red-100",
          )}
        >
          {msg ?? err ?? error}
        </p>
      )}

      <section className="mb-8 rounded-xl border border-line p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Shield className="h-4 w-4" /> Billing master switch
            </h2>
            <p className="text-xs text-ink-faint mt-1 max-w-md">
              {billingEnabled
                ? "Limits and paid plans are enforced for customers."
                : "Recommended while launching: all teamspaces are free with no seat/AI caps."}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleBilling}
            disabled={busy}
            className={clsx(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors",
              billingEnabled
                ? "bg-accent text-white border-accent"
                : "bg-surface border-line text-ink-light hover:bg-surface-hover",
            )}
          >
            {billingEnabled ? (
              <>
                <ToggleRight className="h-4 w-4" /> On
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4" /> Off (free)
              </>
            )}
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-ink mb-3">Plans</h2>
        <p className="text-xs text-ink-faint mb-3">
          Inactive plans are hidden from customers. Activate Team/Business when you’re ready to sell.
        </p>
        <div className="space-y-2">
          {plans.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-line px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink text-sm">{p.name}</span>
                  <span
                    className={clsx(
                      "text-[11px] font-medium rounded-md px-1.5 py-0.5",
                      p.active !== false
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-surface-active text-ink-faint",
                    )}
                  >
                    {p.active === false ? "Hidden" : "Visible"}
                  </span>
                </div>
                <p className="text-xs text-ink-light mt-0.5">{p.description}</p>
                <p className="text-[11px] text-ink-faint mt-1 tabular-nums">
                  {p.seatLimit} seats · {p.aiMinutesLimit.toLocaleString()} AI min · $
                  {p.priceUsdMonth}/mo
                </p>
              </div>
              <Button variant="secondary" className="text-xs shrink-0" onClick={() => setEditing(p)}>
                Edit
              </Button>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <PlanEditor
          plan={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            await savePlan(draft);
            await refreshBilling();
            setEditing(null);
            setMsg(`Saved plan “${draft.name}”.`);
          }}
        />
      )}

      <section className="rounded-xl border border-line p-4">
        <h2 className="text-sm font-semibold text-ink mb-2">Add platform admin</h2>
        <p className="text-xs text-ink-faint mb-3">
          User must already have signed up. They’ll see Platform admin in the sidebar.
        </p>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              await addAdmin(adminEmail);
              setMsg(`Added ${adminEmail} as platform admin.`);
              setAdminEmail("");
            } catch (ex: any) {
              setErr(ex?.message ?? "Failed");
            }
          }}
        >
          <input
            type="email"
            className="field flex-1"
            placeholder="admin@company.com"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy || !adminEmail.trim()}>
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}

function PlanEditor({
  plan,
  busy,
  onClose,
  onSave,
}: {
  plan: BillingPlan;
  busy: boolean;
  onClose: () => void;
  onSave: (p: {
    id: string;
    name: string;
    description: string;
    seatLimit: number;
    aiMinutesLimit: number;
    priceUsdMonth: number;
    active: boolean;
    stripePriceId?: string;
    sortOrder?: number;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description);
  const [seatLimit, setSeatLimit] = useState(plan.seatLimit);
  const [aiMinutesLimit, setAiMinutesLimit] = useState(plan.aiMinutesLimit);
  const [priceUsdMonth, setPriceUsdMonth] = useState(plan.priceUsdMonth);
  const [active, setActive] = useState(plan.active !== false);
  const [stripePriceId, setStripePriceId] = useState(plan.stripePriceId ?? "");
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-panel">
        <h3 className="font-semibold text-ink mb-1">Edit plan · {plan.id}</h3>
        <p className="text-xs text-ink-faint mb-4">Plan id can’t change. Toggle Visible to sell it.</p>

        <label className="block text-[13px] font-medium text-ink mb-1">Name</label>
        <input className="field mb-3" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="block text-[13px] font-medium text-ink mb-1">Description</label>
        <input
          className="field mb-3"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-[13px] font-medium text-ink mb-1">Seats</label>
            <input
              type="number"
              min={1}
              className="field"
              value={seatLimit}
              onChange={(e) => setSeatLimit(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-ink mb-1">AI min / mo</label>
            <input
              type="number"
              min={0}
              className="field"
              value={aiMinutesLimit}
              onChange={(e) => setAiMinutesLimit(Number(e.target.value))}
            />
          </div>
        </div>

        <label className="block text-[13px] font-medium text-ink mb-1">Price USD / month</label>
        <input
          type="number"
          min={0}
          step={0.01}
          className="field mb-3"
          value={priceUsdMonth}
          onChange={(e) => setPriceUsdMonth(Number(e.target.value))}
        />

        <label className="block text-[13px] font-medium text-ink mb-1">
          Stripe price id (optional)
        </label>
        <input
          className="field mb-3"
          placeholder="price_..."
          value={stripePriceId}
          onChange={(e) => setStripePriceId(e.target.value)}
        />

        <label className="flex items-center gap-2 text-sm text-ink mb-4">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Visible to customers (active)
        </label>

        {localErr && <p className="text-sm text-red-600 mb-3">{localErr}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving || busy}>
            Cancel
          </Button>
          <Button
            disabled={saving || busy || !name.trim()}
            onClick={async () => {
              setSaving(true);
              setLocalErr(null);
              try {
                await onSave({
                  id: plan.id,
                  name: name.trim(),
                  description: description.trim(),
                  seatLimit,
                  aiMinutesLimit,
                  priceUsdMonth,
                  active,
                  stripePriceId: stripePriceId.trim() || undefined,
                  sortOrder: plan.sortOrder,
                });
              } catch (e: any) {
                setLocalErr(e?.message ?? "Save failed");
              } finally {
                setSaving(false);
              }
            }}
          >
            {(saving || busy) && <Loader2 className="h-4 w-4 animate-spin" />}
            Save plan
          </Button>
        </div>
      </div>
    </div>
  );
}
