// Supabase Edge Function: Stripe webhooks → update teamspace_subscriptions.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    return new Response("Stripe not configured", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (e) {
    return new Response(`Webhook Error: ${(e as Error).message}`, { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const teamspaceId = session.metadata?.teamspace_id;
        const planId = session.metadata?.plan_id;
        if (!teamspaceId || !planId) break;

        let periodStart: string | null = null;
        let periodEnd: string | null = null;
        const subId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          periodStart = new Date(sub.current_period_start * 1000).toISOString();
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        await admin.from("teamspace_subscriptions").upsert({
          teamspace_id: teamspaceId,
          plan_id: planId,
          status: "active",
          stripe_customer_id: typeof session.customer === "string"
            ? session.customer
            : session.customer?.id,
          stripe_subscription_id: subId,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const teamspaceId = sub.metadata?.teamspace_id;
        if (!teamspaceId) {
          // Fallback: find by stripe_subscription_id
          const { data } = await admin
            .from("teamspace_subscriptions")
            .select("teamspace_id, plan_id")
            .eq("stripe_subscription_id", sub.id)
            .maybeSingle();
          if (!data) break;
          await applySubscription(admin, data.teamspace_id, data.plan_id, sub, event.type);
        } else {
          const planId = sub.metadata?.plan_id ?? "team";
          await applySubscription(admin, teamspaceId, planId, sub, event.type);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error(e);
    return new Response((e as Error).message, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function applySubscription(
  admin: ReturnType<typeof createClient>,
  teamspaceId: string,
  planId: string,
  sub: Stripe.Subscription,
  eventType: string,
) {
  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    unpaid: "past_due",
  };
  const status =
    eventType === "customer.subscription.deleted"
      ? "canceled"
      : statusMap[sub.status] ?? "active";

  await admin.from("teamspace_subscriptions").upsert({
    teamspace_id: teamspaceId,
    plan_id: status === "canceled" ? "free" : planId,
    status: status === "canceled" ? "canceled" : status,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  });

  if (status === "canceled") {
    await admin.from("teamspace_subscriptions").update({
      plan_id: "free",
      status: "active",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }).eq("teamspace_id", teamspaceId);
  }
}
