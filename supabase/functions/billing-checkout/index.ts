// Supabase Edge Function: create Stripe Checkout Session for a teamspace plan.
// Secrets: STRIPE_SECRET_KEY, optional STRIPE_PRICE_TEAM, STRIPE_PRICE_BUSINESS
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return json({ error: "STRIPE_SECRET_KEY not set" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const teamspaceId = body.teamspaceId as string;
    const planId = body.planId as string;
    const successUrl = body.successUrl as string;
    const cancelUrl = body.cancelUrl as string;

    if (!teamspaceId || !planId || planId === "free") {
      return json({ error: "Invalid plan" }, 400);
    }

    const { data: role } = await admin.rpc("teamspace_role", { ts: teamspaceId });
    if (role !== "owner" && role !== "admin") {
      return json({ error: "Only owners/admins can upgrade" }, 403);
    }

    const { data: plan } = await admin
      .from("billing_plans")
      .select("*")
      .eq("id", planId)
      .single();
    if (!plan) return json({ error: "Plan not found" }, 404);

    const priceFromEnv =
      planId === "team"
        ? Deno.env.get("STRIPE_PRICE_TEAM")
        : planId === "business"
          ? Deno.env.get("STRIPE_PRICE_BUSINESS")
          : null;
    const priceId = plan.stripe_price_id || priceFromEnv;
    if (!priceId) {
      return json({
        error: `No Stripe price for plan ${planId}. Set stripe_price_id or STRIPE_PRICE_* secret.`,
      }, 400);
    }

    const { data: sub } = await admin
      .from("teamspace_subscriptions")
      .select("*")
      .eq("teamspace_id", teamspaceId)
      .maybeSingle();

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });

    let customerId = sub?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email ?? undefined,
        metadata: { teamspace_id: teamspaceId, user_id: userData.user.id },
      });
      customerId = customer.id;
      await admin.from("teamspace_subscriptions").upsert({
        teamspace_id: teamspaceId,
        plan_id: sub?.plan_id ?? "free",
        status: sub?.status ?? "active",
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { teamspace_id: teamspaceId, plan_id: planId },
      subscription_data: {
        metadata: { teamspace_id: teamspaceId, plan_id: planId },
      },
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
