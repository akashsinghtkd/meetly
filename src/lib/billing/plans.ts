/** Plan catalog + limit helpers (client-side). Mirrors billing_plans in DB. */

export type PlanId = "free" | "team" | "business";

export interface BillingPlan {
  id: PlanId | string;
  name: string;
  description: string;
  seatLimit: number;
  aiMinutesLimit: number;
  priceUsdMonth: number;
  stripePriceId?: string | null;
  sortOrder: number;
  active?: boolean;
}

export interface TeamspaceSubscription {
  teamspaceId: string;
  planId: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingSnapshot {
  plan: BillingPlan;
  subscription: TeamspaceSubscription;
  seatsUsed: number;
  seatsLimit: number;
  aiMinutesUsed: number;
  aiMinutesLimit: number;
  seatsRemaining: number;
  aiMinutesRemaining: number;
  canInvite: boolean;
  canUseAi: boolean;
  pastDue: boolean;
}

export const FALLBACK_PLANS: BillingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Try Meetly with a small team.",
    seatLimit: 3,
    aiMinutesLimit: 60,
    priceUsdMonth: 0,
    sortOrder: 0,
  },
  {
    id: "team",
    name: "Team",
    description: "For growing teams that meet often.",
    seatLimit: 15,
    aiMinutesLimit: 500,
    priceUsdMonth: 29,
    sortOrder: 1,
  },
  {
    id: "business",
    name: "Business",
    description: "Higher limits and priority support.",
    seatLimit: 50,
    aiMinutesLimit: 2000,
    priceUsdMonth: 79,
    sortOrder: 2,
  },
];

export function rowPlan(r: any): BillingPlan {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    seatLimit: r.seat_limit,
    aiMinutesLimit: r.ai_minutes_limit,
    priceUsdMonth: Number(r.price_usd_month),
    stripePriceId: r.stripe_price_id,
    sortOrder: r.sort_order ?? 0,
    active: r.active !== false,
  };
}

export function rowSub(r: any): TeamspaceSubscription {
  return {
    teamspaceId: r.teamspace_id,
    planId: r.plan_id,
    status: r.status,
    stripeCustomerId: r.stripe_customer_id,
    stripeSubscriptionId: r.stripe_subscription_id,
    currentPeriodEnd: r.current_period_end,
    cancelAtPeriodEnd: !!r.cancel_at_period_end,
  };
}

export function buildSnapshot(
  plan: BillingPlan,
  subscription: TeamspaceSubscription,
  seatsUsed: number,
  aiMinutesUsed: number,
): BillingSnapshot {
  const seatsLimit = plan.seatLimit;
  const aiMinutesLimit = plan.aiMinutesLimit;
  const pastDue = subscription.status === "past_due" || subscription.status === "canceled";
  return {
    plan,
    subscription,
    seatsUsed,
    seatsLimit,
    aiMinutesUsed,
    aiMinutesLimit,
    seatsRemaining: Math.max(0, seatsLimit - seatsUsed),
    aiMinutesRemaining: Math.max(0, aiMinutesLimit - aiMinutesUsed),
    canInvite: !pastDue && seatsUsed < seatsLimit,
    canUseAi: !pastDue && aiMinutesUsed < aiMinutesLimit,
    pastDue,
  };
}

/** Stripe is configured when publishable key is present (checkout available). */
export function stripeEnabled(): boolean {
  return Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
}
