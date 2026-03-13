# Billing & Subscription Architecture

> **ID:** D03
> **Status:** Review
> **Priority:** P0
> **Last updated:** 2026-03-12
> **Depends on:** D01 (schema — `organizations`, `ai_usage_logs`)
> **Depended on by:** D06-D12 (feature modules — plan gating), D14 (Observability — billing metrics), D19 (Data Migration — plan assignment)
> **Last validated against deps:** 2026-03-12
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-005 (multi-org), ADR-006 (soft delete), ADR-007 (audit), ADR-008 (enums)

---

## 1. Overview

Billing manages plan enforcement, Stripe subscription lifecycle, seat-based pricing, and AI credit metering for multi-tenant organizations. Stripe is the single payment processor. The ATS stores minimal billing state — Stripe is the source of truth for subscriptions, invoices, and payment methods. The ATS owns plan enforcement, feature gating, and AI credit tracking.

**Scope boundaries:**
- **In scope:** Plan tiers, feature matrix, Stripe Checkout/Portal, subscription lifecycle, seat pricing, AI credit metering, webhook handling, dunning, downgrade logic.
- **Out of scope:** Tax calculation (delegated to Stripe Tax), payment method management UI (delegated to Stripe Customer Portal), invoice PDF generation (Stripe hosted).

## 2. Plan Tier Feature Matrix

Four tiers. The `organizations.plan` CHECK constraint enforces: `starter`, `growth`, `pro`, `enterprise`.

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| **Seats included** | 2 | 10 | 25 | Unlimited |
| **Extra seat price** | $15/mo | $12/mo | $10/mo | Custom |
| **Active jobs** | 5 | 25 | Unlimited | Unlimited |
| **AI resume parsing** | ❌ | ✅ | ✅ | ✅ |
| **AI candidate matching** | ❌ | ❌ | ✅ | ✅ |
| **AI scorecard summarize** | ❌ | ❌ | ✅ | ✅ |
| **AI credits/month** | 10 | 500 | 2,000 | 10,000 |
| **Custom fields** | ❌ | ✅ | ✅ | ✅ |
| **Bulk import** | ❌ | ✅ | ✅ | ✅ |
| **API access** | ❌ | ❌ | ✅ | ✅ |
| **Advanced analytics** | ❌ | ❌ | ✅ | ✅ |
| **White-label** | ❌ | ❌ | ❌ | ✅ |
| **Nurture sequences** | ❌ | ❌ | ✅ | ✅ |
| **Webhook outbound** | ❌ | ✅ | ✅ | ✅ |
| **SSO/SAML** | ❌ | ❌ | ❌ | ✅ |
| **Dedicated support** | ❌ | ❌ | ❌ | ✅ |
| **API rate limit** | 500/min | 2,000/min | 5,000/min | 10,000/min |
| **AI operations/day** (rate limit) | 100 | 500 | 2,000 | 10,000 |

> **Two-layer AI enforcement:** "AI credits/month" is the **billing quota** — each AI operation consumes 1 credit, resets on `invoice.paid` (§6.2), overage at $5/100 credits. "AI operations/day" is the **rate limit** (burst cap) — enforced in `proxy.ts` via Upstash Redis (D02 §6), resets daily at midnight UTC. Both apply simultaneously. When monthly credits are exhausted, AI endpoints return `402` even if the daily rate limit has headroom.

### 2.1 Feature Flag Enforcement

The `organizations.feature_flags` JSONB column stores per-organization overrides. Plan defaults are applied at the application layer; the database stores only explicit overrides.

```typescript
// Feature gating logic (server-side only)
interface PlanLimits {
  max_seats: number;          // -1 = unlimited
  max_active_jobs: number;    // -1 = unlimited
  ai_credits_monthly: number;
  extra_seat_price_cents: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  starter:    { max_seats: 2,  max_active_jobs: 5,  ai_credits_monthly: 10,    extra_seat_price_cents: 1500 },
  growth:     { max_seats: 10, max_active_jobs: 25, ai_credits_monthly: 500,   extra_seat_price_cents: 1200 },
  pro:        { max_seats: 25, max_active_jobs: -1, ai_credits_monthly: 2000,  extra_seat_price_cents: 1000 },
  enterprise: { max_seats: -1, max_active_jobs: -1, ai_credits_monthly: 10000, extra_seat_price_cents: 0    },
};

function hasFeature(org: Organization, feature: keyof FeatureFlags): boolean {
  // Explicit override takes precedence
  if (org.feature_flags[feature] !== undefined) {
    return org.feature_flags[feature];
  }
  // Fall back to plan defaults
  return PLAN_FEATURE_DEFAULTS[org.plan][feature];
}
```

The `PLAN_LIMITS` and `PLAN_FEATURE_DEFAULTS` configs live in `lib/billing/plans.ts` — not in the database. Plan definitions change with deploys, not with migrations.

### 2.2 Enforcement Points

| Check | Where | How |
|-------|-------|-----|
| Seat limit | `inviteMember` Server Action | Count active `organization_members` vs `max_seats` |
| Active job limit | `createJobOpening` Server Action | Count `job_openings` where `status = 'open'` and `deleted_at IS NULL` |
| AI credits | `consumeAiCredits()` utility | Compare `ai_credits_used` vs `ai_credits_limit`; reject if exceeded |
| Feature flag | `requireFeature(org, flag)` middleware | Check `hasFeature()`; return 403 if disabled |
| API access | API route middleware | Check `hasFeature(org, 'api_access')`; return 403 |

## 3. Pricing Model

### 3.1 Base Subscription

Seat-based pricing with included seats per tier. Monthly and annual billing cycles (annual = 2 months free).

| Plan | Monthly | Annual (per month) | Included Seats |
|------|---------|-------------------|----------------|
| Starter | $29/mo | $24/mo | 2 |
| Growth | $79/mo | $66/mo | 10 |
| Pro | $199/mo | $166/mo | 25 |
| Enterprise | Custom | Custom | Unlimited |

### 3.2 Metered Add-Ons

Two metered dimensions tracked alongside the base subscription:

1. **Extra seats:** Billed per seat beyond included count. Prorated on add, credited on remove. Stripe `quantity` on a metered subscription item.
2. **AI credit overages:** When `ai_credits_used` exceeds `ai_credits_limit`, overage is billed at end of billing cycle. Reported to Stripe via `stripe.billing.meterEvents.create()` (Billing Meters API — see §6.3).

| Metered Item | Unit | Price |
|--------------|------|-------|
| Extra seat (starter) | per seat/month | $15 |
| Extra seat (growth) | per seat/month | $12 |
| Extra seat (pro) | per seat/month | $10 |
| AI credit overage | per 100 credits | $5 |

## 4. Stripe Integration Architecture

### 4.1 Stripe Objects Mapping

| Stripe Object | ATS Equivalent | Sync Direction |
|---------------|---------------|----------------|
| `Customer` | `organizations` (via `stripe_customer_id`) | ATS → Stripe (on org create) |
| `Subscription` | `organizations.plan` + billing state | Stripe → ATS (via webhooks) |
| `Product` | Plan tier (starter/growth/pro/enterprise) | Configured in Stripe Dashboard |
| `Price` | Monthly/annual price per plan | Configured in Stripe Dashboard |
| `Invoice` | Not stored locally — accessed via Stripe API | Stripe-hosted |
| `PaymentMethod` | Not stored locally — Stripe Customer Portal | Stripe-hosted |

### 4.2 Stripe Products Setup

Each plan tier has two Prices (monthly + annual) plus a metered extra-seat Price. One shared "AI Credit Overage" product ($5/100 credits, metered).

| Product | Monthly | Annual | Extra Seat |
|---------|---------|--------|------------|
| ATS Starter | $29/mo | $288/yr ($24/mo) | $15/seat/mo |
| ATS Growth | $79/mo | $792/yr ($66/mo) | $12/seat/mo |
| ATS Pro | $199/mo | $1,992/yr ($166/mo) | $10/seat/mo |
| AI Credit Overage | $5/100 credits (metered) | — | — |

### 4.3 Subscription Lifecycle

```
                    ┌──────────┐
         ┌─────────│  trialing │──────────┐
         │         └──────────┘           │
         │ trial ends                     │ trial ends
         │ (payment succeeds)             │ (no payment method)
         ▼                                ▼
    ┌──────────┐                    ┌───────────┐
    │  active  │◄───────────────────│ past_due  │
    └──────────┘  payment succeeds  └───────────┘
         │                                │
         │ cancel                         │ 3 retries fail
         ▼                                ▼
    ┌───────────┐                   ┌───────────┐
    │ canceling │                   │ unpaid    │
    │(end of    │                   │(grace     │
    │ period)   │                   │ period)   │
    └───────────┘                   └───────────┘
         │                                │
         │ period ends                    │ 14 days
         ▼                                ▼
    ┌──────────┐                    ┌──────────┐
    │ canceled │                    │ canceled │
    └──────────┘                    └──────────┘
```

**State mapping in ATS:**

The ATS stores subscription lifecycle state directly on the `organizations` table (not in a separate billing table). All billing columns are updated **exclusively by Stripe webhook handlers** — never by user-facing API routes. Eight columns handle billing state:

```sql
-- These columns are updated by Stripe webhook handlers only
-- (defined in D01 organizations table — 01-core-tenancy.md)
-- organizations.plan                  → current active plan tier ('starter'|'growth'|'pro'|'enterprise')
-- organizations.subscription_status   → Stripe subscription status ('trialing'|'active'|'past_due'|'canceled'|'unpaid')
-- organizations.stripe_customer_id    → links to Stripe Customer object
-- organizations.stripe_subscription_id → links to active Stripe Subscription object
-- organizations.billing_email         → invoice recipient (may differ from owner email)
-- organizations.ai_credits_used       → current billing period usage counter
-- organizations.ai_credits_limit      → current billing period cap (set by plan tier)
-- organizations.trial_ends_at         → trial expiry timestamp; NULL after conversion to paid
```

`subscription_status` is the authoritative dunning signal: `PaymentFailedBanner` reads it for `past_due`/`unpaid` states; plan enforcement gates read it to allow/deny access. Stripe remains source of truth — the ATS syncs on every relevant webhook event.

### 4.4 Checkout Flow

```
User clicks "Upgrade"
  │
  ├─ POST /api/v1/billing/checkout-session
  │   ├─ Verify user is organization owner (RBAC: billing:manage)
  │   ├─ Create or retrieve Stripe Customer (upsert stripe_customer_id)
  │   ├─ stripe.checkout.sessions.create({ // ✅ VERIFIED: Stripe SDK 20.4.1 — SessionsResource.d.ts
  │   │     customer: stripe_customer_id,
  │   │     mode: 'subscription',
  │   │     line_items: [{ price: selected_price_id, quantity: seat_count }],
  │   │     success_url: '/settings/billing?session_id={CHECKOUT_SESSION_ID}',
  │   │     cancel_url: '/settings/billing',
  │   │     subscription_data: {
  │   │       metadata: { organization_id: org.id },
  │   │       trial_period_days: 14,  // first subscription only
  │   │     },
  │   │   })
  │   └─ Return checkout session URL
  │
  ├─ Redirect to Stripe Checkout (hosted page)
  │
  └─ Stripe webhook: checkout.session.completed
      ├─ Update organizations.plan
      ├─ Update organizations.ai_credits_limit
      └─ Reset organizations.ai_credits_used = 0
```

### 4.5 Customer Portal

Stripe Customer Portal handles payment method updates, invoice history, and cancellation. No custom UI needed.

```typescript
// POST /api/v1/billing/portal-session ✅ VERIFIED: Stripe SDK 20.4.1 — BillingPortal/SessionsResource.d.ts
const session = await stripe.billingPortal.sessions.create({
  customer: org.stripe_customer_id,
  return_url: `${baseUrl}/settings/billing`,
});
// Return session.url → redirect
```

## 5. Webhook Handling

### 5.1 Inbound Stripe Webhooks

Route: `POST /api/webhooks/stripe` (defined in D02 §2.5)

```typescript
// Webhook signature verification
const event = stripe.webhooks.constructEvent(
  rawBody,
  request.headers.get('stripe-signature'),
  process.env.STRIPE_WEBHOOK_SECRET
);
```

### 5.2 Event → Action Mapping

| Stripe Event | ATS Action |
|-------------|------------|
| `checkout.session.completed` | Set `plan`, `ai_credits_limit`, reset `ai_credits_used`. Send welcome email via Inngest. |
| `customer.subscription.updated` | Sync `plan` if product changed. Update `ai_credits_limit`. |
| `customer.subscription.deleted` | Downgrade to `starter`. Reset `feature_flags` to plan defaults. Disable overage features. |
| `invoice.paid` | Reset `ai_credits_used = 0` (new billing period). Log to `audit_logs`. |
| `invoice.payment_failed` | Send dunning email via Inngest. Log warning. |
| `customer.subscription.trial_will_end` | Send trial-ending email (3 days before). |

### 5.3 Webhook Handler Pattern

Handler verifies signature, then dispatches to Inngest for reliable processing. See D02 §2.5 for the full webhook handler pattern. Key: return 200 immediately, process asynchronously.

```typescript
// app/api/webhooks/stripe/route.ts — verify, then dispatch
await inngest.send({
  name: 'stripe/webhook.received',
  data: { event_type: event.type, event_id: event.id, payload: event.data.object },
});
```

### 5.4 Inngest Billing Functions

All functions triggered by `stripe/webhook.received`. Idempotent via Stripe event ID.

| Function ID | Event Filter | Steps |
|-------------|-------------|-------|
| `billing/checkout-completed` | `checkout.session.completed` | Lookup org → update plan + limits → send welcome email |
| `billing/subscription-updated` | `customer.subscription.updated` | Lookup org → sync plan tier → update feature flags |
| `billing/subscription-canceled` | `customer.subscription.deleted` | Downgrade to starter → reset flags → send cancellation email |
| `billing/invoice-paid` | `invoice.paid` | Reset `ai_credits_used` → log billing event |
| `billing/payment-failed` | `invoice.payment_failed` | Send dunning email → log warning → schedule retry reminder |
| `billing/trial-ending` | `customer.subscription.trial_will_end` | Send trial-ending email |
| `billing/report-overage` | Cron: `55 23 * * *` (daily 23:55 UTC) | Calculate AI credit overage → report to Stripe via Billing Meters API |

## 6. AI Credit Metering

### 6.1 Credit Consumption Flow

```
AI action requested (e.g., resume parse)
  │
  ├─ Check: ai_credits_used < ai_credits_limit?
  │   ├─ YES → Proceed
  │   └─ NO  → Return 402 (Payment Required) with upgrade prompt
  │
  ├─ Execute AI action
  │
  ├─ Record in ai_usage_logs (action, model, tokens, cost_cents)
  │
  └─ Increment organizations.ai_credits_used
      └─ UPDATE organizations
         SET ai_credits_used = ai_credits_used + 1
         WHERE id = $org_id AND ai_credits_used < ai_credits_limit
         RETURNING ai_credits_used;
         -- Atomic check-and-increment prevents race conditions
```

### 6.2 Credit Reset

Credits reset when `invoice.paid` webhook fires (start of new billing period). The Inngest function:

```typescript
// Step: reset AI credits
await supabase
  .from('organizations')
  .update({ ai_credits_used: 0 })
  .eq('stripe_customer_id', invoice.customer);
```

### 6.3 Overage Reporting

At the end of each billing period, report overage to Stripe:

```typescript
// Inngest cron: billing/report-overage (daily 23:55 UTC) — orgs over limit
const overage = org.ai_credits_used - org.ai_credits_limit;
if (overage > 0) {
  // ✅ VERIFIED: Legacy createUsageRecord() removed in API 2025-03-31.basil.
  // Replaced with Billing Meters API (stripe.billing.meterEvents.create).
  // Requires a pre-configured Meter in Stripe Dashboard with event_name = 'ai_credit_overage'.
  await stripe.billing.meterEvents.create({
    event_name: 'ai_credit_overage',
    payload: {
      stripe_customer_id: org.stripe_customer_id,
      value: String(Math.ceil(overage / 100)),
    },
  });
}
```

## 7. Seat Management

### 7.1 Seat Count Sync

Seat count = active `organization_members` (where `deleted_at IS NULL`). When members are added/removed, update Stripe subscription quantity:

```typescript
// After adding/removing a member: ✅ VERIFIED: Stripe SDK 20.4.1 — SubscriptionItemsResource.d.ts
async function syncSeatCount(orgId: string): Promise<void> {
  const { count } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('deleted_at', null);

  const limits = PLAN_LIMITS[org.plan];
  const extraSeats = Math.max(0, (count ?? 0) - limits.max_seats);

  // Look up seat subscription item via Stripe API (not stored locally)
  const subscription = await stripe.subscriptions.list({
    customer: org.stripe_customer_id, limit: 1,
  });
  const seatItem = subscription.data[0]?.items.data.find(
    (item) => item.price.metadata.type === 'extra_seat'
  );
  if (seatItem) {
    await stripe.subscriptionItems.update(seatItem.id, {
      quantity: extraSeats,
      proration_behavior: 'create_prorations',
    });
  }
}
```

### 7.2 Seat Limit Enforcement

```typescript
// In inviteMember Server Action:
const { count } = await supabase
  .from('organization_members')
  .select('*', { count: 'exact', head: true })
  .eq('organization_id', orgId)
  .is('deleted_at', null);

const limits = PLAN_LIMITS[org.plan];
if (limits.max_seats !== -1 && (count ?? 0) >= limits.max_seats) {
  // Check if org allows extra seats (all plans do, but require billing)
  if (!org.stripe_customer_id) {
    throw new BillingError('Seat limit reached. Add a payment method to add extra seats.');
  }
  // Extra seat will be billed — proceed and sync
}
```

## 8. Downgrade & Cancellation

### 8.1 Downgrade Rules

When an organization downgrades (e.g., Pro → Growth):

| Resource | Action |
|----------|--------|
| Excess members | Keep active but show "over seat limit" banner. Block new invites. |
| Active jobs over limit | Keep open but block creating new jobs. |
| Disabled features | Graceful degradation: hide UI, return 403 on API calls. Existing data preserved. |
| AI credits | Reset limit to new tier. If `ai_credits_used > new_limit`, block further AI actions. |
| API keys | If `api_access` disabled, return 403 on all API key authenticated requests. Keys preserved. |

### 8.2 Cancellation Flow

1. User initiates cancellation via Stripe Customer Portal.
2. Stripe sets subscription to `cancel_at_period_end`.
3. Webhook `customer.subscription.updated` fires — ATS shows "Canceling" banner with end date.
4. At period end, `customer.subscription.deleted` fires — ATS downgrades to `starter`.
5. Organization data preserved. User can re-subscribe at any time.

### 8.3 Dunning (Failed Payments)

Stripe Smart Retries handle payment retry logic (3 attempts over ~14 days). The ATS:

1. On `invoice.payment_failed`: send in-app notification + email to billing owner.
2. After 3 failed retries (`customer.subscription.updated` with `status: unpaid`): show full-page "Update payment" banner, restrict write operations.
3. After 14-day grace period (`customer.subscription.deleted`): downgrade to starter.

## 9. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/billing/checkout-session` | JWT (owner) | Create Stripe Checkout session |
| POST | `/api/v1/billing/portal-session` | JWT (owner) | Create Stripe Customer Portal session |
| GET | `/api/v1/billing/usage` | JWT (owner/admin) | Current period AI credit usage |
| GET | `/api/v1/billing/plan` | JWT (any member) | Current plan details + feature matrix |
| POST | `/api/webhooks/stripe` | Stripe signature | Inbound Stripe webhook handler |

### 9.1 Response Schemas

```typescript
// GET /api/v1/billing/plan
const BillingPlanResponse = z.object({
  plan: z.enum(['starter', 'growth', 'pro', 'enterprise']),
  seats_used: z.number(),
  seats_included: z.number(),
  seats_extra: z.number(),
  ai_credits_used: z.number(),
  ai_credits_limit: z.number(),
  features: z.record(z.string(), z.boolean()),  // resolved feature flags
  billing_cycle: z.enum(['monthly', 'annual']).nullable(),
  current_period_end: z.string().datetime().nullable(),
  cancel_at_period_end: z.boolean(),
});

// GET /api/v1/billing/usage
const BillingUsageResponse = z.object({
  ai_credits_used: z.number(),
  ai_credits_limit: z.number(),
  ai_credits_remaining: z.number(),
  usage_by_action: z.array(z.object({
    action: z.string(),
    count: z.number(),
    total_cost_cents: z.number(),
  })),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
});
```

## 10. UI Components

| Component | Page | Description |
|-----------|------|-------------|
| `PlanCard` | `/settings/billing` | Shows current plan, usage meters, upgrade/downgrade CTAs |
| `UsageMeter` | `/settings/billing` | Progress bar for seats and AI credits |
| `UpgradeBanner` | Global (top bar) | Shown when approaching limits (>80% usage) |
| `PaymentRequiredBanner` | Global (full page) | Shown during dunning (past_due/unpaid) |
| `PricingTable` | `/pricing` (public) | Plan comparison table with Checkout CTAs |
| `TrialBanner` | Global (top bar) | Days remaining in trial with upgrade CTA |

## 11. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Stripe webhook delivered out of order | Idempotency via Stripe event ID. Each Inngest function checks current state before applying. |
| Organization created without Stripe Customer | `stripe_customer_id` is NULL during trial. Checkout creates Customer when org adds payment method or trial ends. All plans are paid ($29/mo+); the 14-day trial is the only "free" period. |
| Concurrent AI credit consumption | Atomic `UPDATE ... WHERE ai_credits_used < ai_credits_limit RETURNING` prevents overshoot. |
| Member removed during billing cycle | Seat count synced to Stripe immediately. Proration credit applied. |
| Stripe outage during checkout | Client-side retry. Checkout session has 24h expiry. No ATS state changed until webhook confirms. |
| Trial expiry without payment method | Downgrade to starter. Send "trial expired" email. Data preserved. |
| Annual plan mid-cycle upgrade | Stripe prorates automatically. Webhook syncs new plan immediately. |
| Enterprise custom pricing | Manual setup via Stripe Dashboard. No self-serve checkout. Org `plan` set to `enterprise` by admin. |

## 12. Security Considerations

- [x] Only `owner` role can access billing endpoints (RBAC: `billing:manage` permission)
- [x] Stripe webhook signature verified on every request (`stripe.webhooks.constructEvent`)
- [x] No Stripe secret key exposed to client — all Stripe API calls are server-side
- [x] `stripe_customer_id` is organization-scoped, enforced by RLS
- [x] AI credit check is atomic SQL — no TOCTOU race condition
- [x] Plan changes only via Stripe webhooks — never from client request
- [x] Billing email validated as email format (Zod)
- [x] Rate limiting on checkout/portal session creation (prevent abuse)

## 13. Testing Strategy

| Type | File | What it tests |
|------|------|---------------|
| Unit | `tests/unit/billing/plans.test.ts` | `hasFeature()`, `PLAN_LIMITS`, enforcement logic |
| Unit | `tests/unit/billing/credits.test.ts` | AI credit consumption, atomic check, overage calculation |
| Integration | `tests/integration/billing/stripe-webhooks.test.ts` | Webhook handler → plan sync (MSW mocks Stripe) |
| Integration | `tests/integration/billing/checkout.test.ts` | Checkout session creation, portal session creation |
| E2E | `tests/e2e/billing.spec.ts` | Upgrade flow, usage display, downgrade banner |

**Stripe test mode:** All tests use Stripe test-mode keys. Webhook tests use `stripe.webhooks.generateTestHeaderString()` for signatures.

---
*Changelog: Created 2026-03-10*
