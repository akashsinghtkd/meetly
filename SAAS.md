# Meetly SaaS — implementation status

## Shipped

### Phase 0–1 — Teamspaces
- Teamspaces as tenancy boundary (`teamspaces`, `teamspace_members`, `teamspace_invites`)
- Domain tables scoped by `teamspace_id` + membership RLS
- Onboarding: create teamspace / accept `/?invite=TOKEN`
- Sidebar switcher + Team settings (invite, roles, rename)
- Roles: owner | admin | member | viewer

### Phase 2 — Billing
- Plans: **Free**, **Team**, **Business** (limits editable by platform admin)
- `teamspace_subscriptions` + seat/AI enforcement (DB triggers + client checks)
- Team → **Plan & usage** meters + upgrade UI
- **Dev mode**: activate plans without Stripe (`dev_set_teamspace_plan`)
- **Stripe**: edge functions `billing-checkout`, `billing-portal`, `stripe-webhook`

### Phase 2b — Platform admin (plans control)
- **Billing master switch** defaults **OFF** → everyone is free / unlimited
- Super admin can edit plan seats, AI minutes, price, visibility
- Activate Team/Business when ready; turn billing **ON** to enforce limits
- First operator can **Claim platform admin** once; `meetly@local.dev` is seeded locally

Migrations: `0001_init`, `0002_teamspaces`, `0003_billing`, `0004_platform_admin`

## Next

| Phase | Work |
| --- | --- |
| **SSO** | Google / Microsoft login |
| **Member emails** | Profiles table for teammate display names |
| **Transfer ownership** | Explicit owner handoff |

## Launch mode (everything free)

1. Keep **Platform admin → Billing master switch = Off**
2. Customers see Free with no seat/AI caps; paid upgrades are hidden
3. When ready to monetize: edit/activate Team & Business plans → turn billing **On** → (optional) configure Stripe

## Local billing (no Stripe)

1. `npm run db:start` (applies migrations)
2. Sign in as platform admin → **Platform admin** → turn billing **On** and activate paid plans
3. Team → Plan & usage → **Activate** Team/Business
4. Seat limit blocks invites when full; AI quota blocks new recordings/notes

## Stripe (production)

```bash
# Create products/prices in Stripe Dashboard, then:
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_TEAM=price_... \
  STRIPE_PRICE_BUSINESS=price_...

npx supabase functions deploy billing-checkout
npx supabase functions deploy billing-portal
npx supabase functions deploy stripe-webhook

# Webhook endpoint: https://<project>.supabase.co/functions/v1/stripe-webhook
# Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
```

Add to `.env.local`:
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Optional: set `billing_plans.stripe_price_id` in SQL instead of env price IDs.
