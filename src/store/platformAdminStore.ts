import { create } from "zustand";
import { cloudEnabled, supabase } from "../lib/supabase";
import { rowPlan, type BillingPlan } from "../lib/billing/plans";

interface PlatformAdminState {
  isAdmin: boolean;
  billingEnabled: boolean;
  plans: BillingPlan[]; // all plans including inactive
  ready: boolean;
  busy: boolean;
  error: string | null;

  load: () => Promise<void>;
  bootstrap: () => Promise<boolean>;
  setBillingEnabled: (enabled: boolean) => Promise<void>;
  savePlan: (plan: {
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
  addAdmin: (email: string) => Promise<void>;
  reset: () => void;
}

export const usePlatformAdmin = create<PlatformAdminState>((set, get) => ({
  isAdmin: false,
  billingEnabled: false,
  plans: [],
  ready: !cloudEnabled(),
  busy: false,
  error: null,

  reset: () =>
    set({
      isAdmin: false,
      billingEnabled: false,
      plans: [],
      ready: !cloudEnabled(),
      error: null,
    }),

  load: async () => {
    if (!cloudEnabled()) {
      set({ ready: true, isAdmin: false });
      return;
    }
    set({ busy: true, error: null });
    const sb = supabase();

    const [{ data: settings }, { data: plans }, { data: isAdminRpc }] = await Promise.all([
      sb.from("app_settings").select("billing_enabled").eq("id", 1).maybeSingle(),
      sb.from("billing_plans").select("*").order("sort_order"),
      sb.rpc("is_platform_admin"),
    ]);

    set({
      isAdmin: Boolean(isAdminRpc),
      billingEnabled: Boolean(settings?.billing_enabled),
      plans: (plans ?? []).map(rowPlan),
      busy: false,
      ready: true,
      error: null,
    });
  },

  bootstrap: async () => {
    const { data, error } = await supabase().rpc("admin_bootstrap_self");
    if (error) {
      set({ error: error.message });
      return false;
    }
    await get().load();
    return Boolean(data);
  },

  setBillingEnabled: async (enabled) => {
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("admin_set_billing_enabled", { enabled });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    set({ billingEnabled: enabled, busy: false });
  },

  savePlan: async (plan) => {
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("admin_upsert_plan", {
      p_id: plan.id,
      p_name: plan.name,
      p_description: plan.description,
      p_seat_limit: plan.seatLimit,
      p_ai_minutes_limit: plan.aiMinutesLimit,
      p_price_usd_month: plan.priceUsdMonth,
      p_active: plan.active,
      p_stripe_price_id: plan.stripePriceId ?? null,
      p_sort_order: plan.sortOrder ?? 0,
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    await get().load();
    set({ busy: false });
  },

  addAdmin: async (email) => {
    set({ busy: true, error: null });
    const { error } = await supabase().rpc("admin_add_platform_admin", {
      admin_email: email.trim(),
    });
    if (error) {
      set({ busy: false, error: error.message });
      throw error;
    }
    set({ busy: false });
  },
}));
