import { create } from "zustand";
import { cloudEnabled, supabase } from "../lib/supabase";
import { useTeamspace } from "./teamspaceStore";
import { useCost } from "./costStore";
import { usePlatformAdmin } from "./platformAdminStore";
import {
  buildSnapshot,
  FALLBACK_PLANS,
  rowPlan,
  rowSub,
  stripeEnabled,
  type BillingPlan,
  type BillingSnapshot,
  type PlanId,
  type TeamspaceSubscription,
} from "../lib/billing/plans";

interface BillingState {
  plans: BillingPlan[];
  subscription: TeamspaceSubscription | null;
  seatsUsed: number;
  aiMinutesUsed: number;
  snapshot: BillingSnapshot | null;
  billingEnabled: boolean;
  busy: boolean;
  error: string | null;

  load: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  activatePlanDev: (planId: PlanId) => Promise<void>;
  startCheckout: (planId: PlanId) => Promise<void>;
  openPortal: () => Promise<void>;
  reset: () => void;
}

function monthStartIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export const useBilling = create<BillingState>((set, get) => ({
  plans: FALLBACK_PLANS,
  subscription: null,
  seatsUsed: 0,
  aiMinutesUsed: 0,
  snapshot: null,
  billingEnabled: false,
  busy: false,
  error: null,

  reset: () =>
    set({
      subscription: null,
      seatsUsed: 0,
      aiMinutesUsed: 0,
      snapshot: null,
      billingEnabled: false,
      error: null,
    }),

  load: async () => {
    if (!cloudEnabled()) {
      set({ plans: FALLBACK_PLANS, subscription: null, snapshot: null, billingEnabled: false });
      return;
    }
    const ts = useTeamspace.getState().active();
    if (!ts) {
      set({ subscription: null, snapshot: null });
      return;
    }

    set({ busy: true, error: null });
    const sb = supabase();

    const [plansRes, subRes, seatsRes, settingsRes] = await Promise.all([
      sb.from("billing_plans").select("*").eq("active", true).order("sort_order"),
      sb.from("teamspace_subscriptions").select("*").eq("teamspace_id", ts.id).maybeSingle(),
      sb.rpc("teamspace_seat_count", { ts: ts.id }),
      sb.from("app_settings").select("billing_enabled").eq("id", 1).maybeSingle(),
    ]);

    const billingEnabled = Boolean(settingsRes.data?.billing_enabled);
    usePlatformAdmin.setState({ billingEnabled });

    const plans =
      plansRes.data && plansRes.data.length
        ? plansRes.data.map(rowPlan)
        : FALLBACK_PLANS.filter((p) => p.id === "free" || billingEnabled);

    const subscription: TeamspaceSubscription = subRes.data
      ? rowSub(subRes.data)
      : {
          teamspaceId: ts.id,
          planId: "free",
          status: "active",
          cancelAtPeriodEnd: false,
        };

    const freePlan =
      plans.find((p) => p.id === "free") ??
      FALLBACK_PLANS.find((p) => p.id === "free") ??
      FALLBACK_PLANS[0];

    const plan = billingEnabled
      ? plans.find((p) => p.id === subscription.planId) ??
        FALLBACK_PLANS.find((p) => p.id === subscription.planId) ??
        freePlan
      : {
          ...freePlan,
          name: "Free",
          description: "All features included — billing is currently off.",
          seatLimit: 1000,
          aiMinutesLimit: 100000,
          priceUsdMonth: 0,
        };

    const seatsUsed = typeof seatsRes.data === "number" ? seatsRes.data : 0;

    let aiMinutesUsed = 0;
    const aiRes = await sb.rpc("teamspace_ai_minutes_used", {
      ts: ts.id,
      month_start: monthStartIso(),
    });
    if (typeof aiRes.data === "number") {
      aiMinutesUsed = aiRes.data;
    } else {
      const monthStart = new Date(monthStartIso()).getTime();
      const records = useCost.getState().records;
      aiMinutesUsed =
        records
          .filter(
            (r) =>
              !r.estimated &&
              r.kind === "transcription" &&
              new Date(r.at).getTime() >= monthStart,
          )
          .reduce((s, r) => s + (r.audioSeconds ?? 0), 0) / 60;
    }

    const effectiveSub: TeamspaceSubscription = billingEnabled
      ? subscription
      : { ...subscription, planId: "free", status: "active" };

    set({
      plans: billingEnabled ? plans : [plan],
      subscription: effectiveSub,
      seatsUsed,
      aiMinutesUsed,
      billingEnabled,
      snapshot: buildSnapshot(plan, effectiveSub, seatsUsed, aiMinutesUsed),
      busy: false,
      error: plansRes.error?.message ?? subRes.error?.message ?? null,
    });
  },

  refreshUsage: async () => {
    await get().load();
  },

  activatePlanDev: async (planId) => {
    if (!get().billingEnabled) {
      throw new Error("Billing is turned off by the platform admin. Paid plans are not available yet.");
    }
    const ts = useTeamspace.getState().active();
    if (!ts) throw new Error("No active teamspace");
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("dev_set_teamspace_plan", {
      ts: ts.id,
      new_plan: planId,
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    await get().load();
    set({ busy: false });
  },

  startCheckout: async (planId) => {
    if (!get().billingEnabled) {
      throw new Error("Billing is turned off by the platform admin.");
    }
    if (!stripeEnabled()) {
      throw new Error(
        "Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY and deploy billing functions.",
      );
    }
    const ts = useTeamspace.getState().active();
    if (!ts) throw new Error("No active teamspace");
    set({ busy: true, error: null });
    const { data, error } = await supabase().functions.invoke("billing-checkout", {
      body: {
        teamspaceId: ts.id,
        planId,
        successUrl: `${window.location.origin}/?billing=success`,
        cancelUrl: `${window.location.origin}/?billing=cancel`,
      },
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    const url = (data as any)?.url;
    if (!url) {
      set({ busy: false, error: "No checkout URL returned" });
      throw new Error("No checkout URL returned");
    }
    window.location.href = url;
  },

  openPortal: async () => {
    const ts = useTeamspace.getState().active();
    if (!ts) throw new Error("No active teamspace");
    set({ busy: true, error: null });
    const { data, error } = await supabase().functions.invoke("billing-portal", {
      body: {
        teamspaceId: ts.id,
        returnUrl: `${window.location.origin}/`,
      },
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    const url = (data as any)?.url;
    if (!url) {
      set({ busy: false, error: "No portal URL returned" });
      throw error ?? new Error("No portal URL");
    }
    window.location.href = url;
  },
}));
