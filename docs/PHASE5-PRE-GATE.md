# Eligeo — Phase 5 (Billing) Pre-Gate Document

> **Purpose:** Complete §21 pre-start gate, declare the ADR-004 test plan, and enumerate every blocker that must be cleared before a single line of Phase 5 code is written.
> **Date:** 2026-03-12
> **Author:** Senior AI Product Architect + QA Lead review
> **Status:** ✅ PASSED — all blockers cleared 2026-03-12

---

## Part 1 — State of the Codebase (What We Are Starting From)

Before running the gate, confirm the baseline is accurate. Every number here is cross-checked against DEVLOG (2026-03-12), INDEX.md, and HARDENING.md.

| Metric | Value | Source |
|---|---|---|
| Migrations | 029 (000–029) | DEVLOG 2026-03-12, HARDENING §Wave H1 |
| Vitest tests | 1,038 passing | DEVLOG 2026-03-12 hardening entry |
| E2E tests | 68 passing | DEVLOG Phase 4 complete |
| Pre-existing failures | 12 (`talent-pool-members.rls`) | DEVLOG — noted as unrelated |
| Inngest functions registered | 11 (deregistered `send-esign`, added `auto-summarize` + `refresh-stale-embedding`) | DEVLOG H1–H4 |
| D29 shipped count | 12 | INDEX.md D29 entry |
| Phase | 4 ✅ → 5 ⬅ | CLAUDE.md Current State |
| Last migration | M029 (`hardening.sql`) — 2 RPCs, 3 cols, 1 trigger, 1 table, 1 RPC mod | DEVLOG |

### Hardening Confirmation (H1–H4)

All 12 hardening items confirmed complete per DEVLOG 2026-03-12. Listing here for traceability:

| Wave | Item | Status | Code Evidence |
|---|---|---|---|
| H1-1 | Atomic stage move → `move_application_stage()` RPC | ✅ | M029, candidates.ts |
| H1-2 | Offer approval locking → `approve_offer_rpc()` with `SELECT FOR UPDATE` | ✅ | M029, offers.ts |
| H1-3 | Fuzzy candidate dedup → `findPossibleDuplicates()` by phone/LinkedIn | ✅ | candidates.ts |
| H1-4 | Public apply email verification → HMAC-SHA256 tokens, `/api/verify-email` | ✅ | M029 (email_verified_at), route.ts |
| H2-1 | Auto-refresh embedding on skill change → `candidates/refresh-stale-embedding` Inngest | ✅ | M029 (candidate_skills_updated trigger), inngest/ |
| H2-2 | Staleness flag in match RPC → `embedding_stale BOOLEAN` in return | ✅ | M029 (modified RPC) |
| H3-1 | `recordInteraction()` wired into 7 call sites | ✅ | candidates.ts, offers.ts, interviews.ts |
| H3-2 | AI match explanation → `generateMatchExplanation()` + `ai_match_explanations` table | ✅ | M029 (table), generate.ts |
| H3-3 | Scorecard auto-summarize → `interviews/auto-summarize` Inngest on `ats/scorecard.submitted` | ✅ | inngest/interviews.ts |
| H3-4 | NBA enhancement → 5 rule types (offer_ready, scorecard_complete, high_match_no_interview, at_risk) | ✅ | candidates.ts |
| H4-1 | Match score percentile labels → `getMatchLabel()`, `computePercentiles()` | ✅ | lib/scoring.ts |
| H4-2 | E-sign dead code removed → `send` transition removed from state machine | ✅ | lib/offers/state-machine.ts, D06 §4.3 updated |
| H4-3 | EU AI Act disclosure + `human_review_requested` column + `requestHumanReview()` SA | ✅ | M029 (column), candidate-portal, actions/applications.ts |

**HARDENING.md status: ✅ COMPLETE.**

---

## Part 2 — §21 Pre-Start Gate: Phase 5 (Billing)

Running all 6 gate checks against Phase 5 deliverables. Source: AI-RULES.md §21, rules 88–90.

---

### G1 — All Upstream Dependencies Are Complete

Phase 5 Billing (D03) depends on: **D01, D02, ADR-001, ADR-005, ADR-006, ADR-007, ADR-008**.

| Dependency | INDEX Status | What Phase 5 Needs From It | Gate |
|---|---|---|---|
| **D01** (Database Schema) | ✅ Complete (Review) | `organizations` billing columns: `stripe_customer_id`, `plan`, `ai_credits_used`, `ai_credits_limit`, `billing_email`. All confirmed in M029 DEVLOG. | ✅ PASS |
| **D02** (API Specification) | ✅ Complete (Review) | Billing endpoint contracts, Stripe webhook inbound route (`/api/webhooks/stripe`), error codes, rate limiting tiers per plan. | ✅ PASS |
| **D03** (Billing) | ✅ Complete (Review) | This IS the deliverable spec. | ✅ PASS |
| **D24** (Testing Strategy) | ✅ Complete (Review) | RLS matrix §6.2, golden tenant, MSW registry, test naming §12.2. Required before writing billing tests. | ✅ PASS |
| **ADR-001** | ✅ Accepted | Supabase client for user-context SA, service role for Inngest webhook handlers (Stripe events don't carry user context — explicit `WHERE org_id =` required). | ✅ PASS |
| **ADR-005** | ✅ Accepted | `last_active_org_id` + JWT refresh — billing plan is per-org, not per-user. No ambiguity. | ✅ PASS |
| **ADR-006** | ✅ Accepted | Soft delete on `organizations` — downgrade preserves data, never deletes. | ✅ PASS |
| **ADR-007** | ✅ Accepted | Audit trigger fires on `organizations` UPDATE (plan change, credit reset). Billing events automatically logged. | ✅ PASS |
| **ADR-008** | ✅ Accepted | `plan` column uses CHECK constraint (`starter`, `growth`, `pro`, `enterprise`) — not a PG ENUM. D03 §2 confirms this. | ✅ PASS |
| **HARDENING.md** | ✅ Complete | Phase 4 technical debt is cleared. No unresolved regressions carry forward. | ✅ PASS |

**G1 Result: ✅ PASS** — all upstream docs are Complete.

---

### G2 — All Referenced ADRs Are Accepted

ADRs assumed by Phase 5 Billing work:

| ADR | Title | Status | How Billing Uses It |
|---|---|---|---|
| ADR-001 | Supabase client only | ✅ Accepted | Inngest billing handlers use service role + explicit org scoping. No ORM. |
| ADR-005 | Multi-org switching | ✅ Accepted | `stripe_customer_id` is org-scoped. Plan is per-org, JWT carries `org_id` for billing enforcement. |
| ADR-006 | Soft delete policy | ✅ Accepted | `organizations` not hard-deleted on cancellation. Data preserved per D03 §8.2. |
| ADR-007 | Audit logging | ✅ Accepted | Plan changes via webhooks trigger audit_trigger_func automatically. |
| ADR-008 | Enum strategy | ✅ Accepted | `plan` is a CHECK constraint, not a PG ENUM — tenant-safe and migration-safe. |

**No new ADR required for Phase 5.** D03 is fully resolved against existing ADRs. No `Open` decisions in PLAN.md affect billing.

**G2 Result: ✅ PASS**

---

### G3 — No Unresolved [VERIFY] Markers in Dependencies

This is the most important gate check. D03 is the primary spec for Phase 5. It has **4 confirmed `[VERIFY]` markers** in the code examples.

> **Rule 78 (AI-RULES §18):** `[VERIFY]` markers are acceptable in Draft status but MUST be resolved before Review status. D03 is currently in `Review` status — these markers should have been resolved before that status was set, but per the DEVLOG there is no record of them being cleared.

| # | Location in D03 | Claim | [VERIFY] Text | Resolution Status |
|---|---|---|---|---|
| V-1 | §4.4 Checkout Flow | `stripe.checkout.sessions.create()` parameter shape | `[VERIFY] Stripe Checkout API` | ⚠️ UNRESOLVED |
| V-2 | §4.5 Customer Portal | `stripe.billingPortal.sessions.create()` parameter shape | `[VERIFY] Stripe Customer Portal API` | ⚠️ UNRESOLVED |
| V-3 | §6.3 Overage Reporting | `stripe.subscriptionItems.createUsageRecord()` — metered billing | `[VERIFY] Stripe Usage Records API` | ⚠️ UNRESOLVED |
| V-4 | §7.1 Seat Count Sync | `stripe.subscriptionItems.update()` + `stripe.subscriptions.list()` — seat subscription item lookup | `[VERIFY] Stripe subscription items API` | ⚠️ UNRESOLVED |

**Why V-3 is highest risk:** `createUsageRecord()` on `subscriptionItems` was deprecated in Stripe's 2024 API changes. Stripe now uses `stripe.billing.meterEvents.create()` for usage-based billing in the newer SDK versions (circa SDK v16+). Your package.json has `stripe: 20.4.1`. **This API shape may have changed.** If you build against the D03 code example and the method signature is wrong, the overage cron silently fails and you bill $0 in overages. This is a revenue leak, not just a bug.

**V-4 is also high risk:** Looking up the seat subscription item via `stripe.subscriptions.list({ customer: ... })` and then filtering by `item.price.metadata.type === 'extra_seat'` relies on Stripe Metadata being set correctly during product setup in the Stripe Dashboard. If the Stripe product metadata is not configured, this filter returns `undefined` and seat sync silently fails.

**G3 Result: ✅ PASS — All 4 [VERIFY] markers resolved against Stripe SDK 20.4.1 types.**

**Resolution:**
- V-1 ✅ `stripe.checkout.sessions.create()` — `subscription_data.metadata`, `trial_period_days`, `success_url`, `cancel_url` all confirmed in `Checkout/SessionsResource.d.ts`.
- V-2 ✅ `stripe.billingPortal.sessions.create()` — `customer`, `return_url` confirmed in `BillingPortal/SessionsResource.d.ts`.
- V-3 ⚠️→✅ `createUsageRecord()` removed in API 2025-03-31.basil. **D03 §6.3 updated** to use `stripe.billing.meterEvents.create()` (Billing Meters API). Requires pre-configured Meter in Stripe Dashboard with `event_name = 'ai_credit_overage'`. Added to P-4 prerequisites.
- V-4 ✅ `stripe.subscriptionItems.update()` with `quantity` and `proration_behavior: 'create_prorations'` confirmed in `SubscriptionItemsResource.d.ts`.

---

### G4 — DEVLOG Has No Pending Audit Fixes

Reviewing DEVLOG latest entries (2026-03-12):

- Hardening H1–H4: ✅ COMPLETE
- Post-Phase 4 doc audit: ✅ COMPLETE (19/19 checks passed)
- No open FAIL items from any audit report in DEVLOG

**However: 12 pre-existing `talent-pool-members.rls` test failures.**

These have been noted as "unrelated" in every DEVLOG entry since Phase 4. They are failing RLS tests, not missing tests. Per CLAUDE.md: *"Test debt is a blocking defect. If RLS tests are missing for existing tables, that is P0."* That rule addresses missing tests. These are **failing tests** — a different (and arguably worse) category.

The exact classification matters: if these 12 failures are failing because the RLS policy is wrong, that is a security defect that blocks Phase 5. If they are failing because of a test fixture setup issue unrelated to RLS policy correctness, it is a P1 (must be understood and documented, not necessarily fixed before Phase 5).

**This gate check cannot fully pass until the 12 failures are investigated and one of the following is true:**

- **(a)** The failures are confirmed as fixture/setup issues, not policy issues — document in DEVLOG with specific reason, mark as P1 known issue.
- **(b)** The failures reveal actual RLS policy bugs — fix them before Phase 5. This is P0.

**G4 Result: ✅ PASS — 12 pre-existing failures diagnosed as Scenario A (fixture/setup collisions on junction table unique constraints). Fixed by adding pre-cleanup for `(talent_pool_id, candidate_id)` and `(candidate_id, job_opening_id)` pairs. All 1049 Vitest tests now pass with zero failures.**

---

### G5 — Git Working Tree Is Clean

Cannot be mechanically verified here. Must be confirmed by running `git status` before starting Phase 5 work.

**Required action:** Run `git status` and `git log --oneline -5`. Confirm:
- Working tree clean (no uncommitted changes)
- DEVLOG hardening entry is committed
- Migration 029 is committed
- All H1–H4 code changes are committed
- CLAUDE.md Current State section is updated (tests: 1038 Vitest + 68 E2E = 1106 total, migration count: 30 including 000–029)

**G5 Result: ✅ PASS — git tree clean (only untracked: PHASE5-PRE-GATE.md, audit docs). CLAUDE.md updated: 1049 Vitest + 68 E2E = 1117 total, migrations 29.**

---

### G6 — Definition of Done Is Identified

Phase 5 Billing is a **module spec build** (category: module implementation + Inngest functions + API routes + UI components).

DoD per AI-RULES §12 rule 55 (module specs) + ADR-004 Tier 1 requirements:

**Documentation DoD (before writing code):**
- [ ] All 4 `[VERIFY]` markers in D03 resolved and replaced with confirmed API signatures
- [ ] D24 §6.2 RLS matrix confirmed: no new billing tables means no new RLS cases required. If `billing_events` table is added, 4 ops × 2 tenants × 2 roles = minimum 16 new RLS tests.
- [ ] D29 (Inngest Registry) billing section verified against D03 §5.4 (6 webhook handlers + 1 cron = 7 total functions)
- [ ] Golden tenant fixture updated with billing fields (see §4 below)
- [ ] MSW handlers for Stripe mock responses added to `src/__mocks__/handlers.ts`

**Code DoD (per ADR-004 Tier 1, all mandatory):**
- [ ] Unit tests for every exported function in `lib/billing/plans.ts` and `lib/billing/credits.ts`
- [ ] Role boundary tests: `owner` only for `billing:manage` routes. 403 for all other roles.
- [ ] API integration tests for all 5 billing endpoints + webhook route
- [ ] Inngest function tests for all 7 billing functions (idempotency, failure, retry, tenant scoping)
- [ ] RLS tests for `organizations` billing column updates (2 tenants, confirm Tenant B cannot read Tenant A's `ai_credits_used`)
- [ ] E2E tests: upgrade flow, usage display, downgrade banner, trial banner
- [ ] `npm test` passing, `npx tsc --noEmit` clean, lint clean
- [ ] DEVLOG entry before committing

**G6 Result: ✅ PASS** — DoD is clearly identified from D03 §13 and ADR-004.

---

### Gate Summary

| Gate | Check | Result |
|---|---|---|
| G1 | All upstream dependencies complete | ✅ PASS |
| G2 | All referenced ADRs are Accepted | ✅ PASS |
| G3 | No unresolved [VERIFY] in dependencies | ✅ PASS — 4 resolved (V-3 required D03 architecture update to Billing Meters API) |
| G4 | No pending audit fixes in DEVLOG | ✅ PASS — 12 pre-existing RLS failures fixed (fixture collisions, not policy bugs) |
| G5 | Git working tree is clean | ✅ PASS — confirmed clean, CLAUDE.md updated |
| G6 | DoD identified | ✅ PASS |

**OVERALL GATE STATUS: ✅ PASSED — all 6 gates clear. Phase 5 Wave 1 is unblocked.**

---

## Part 3 — Pre-Code Blockers (Must Clear Before Line 1)

These are ordered by dependency — resolve in this exact sequence.

### Blocker 1 (G3): Resolve D03 [VERIFY] Markers Against Stripe SDK 20.4.1 ⛔ BLOCKS ALL

**What to do:** For each of the 4 `[VERIFY]` markers, open the Stripe Node.js SDK 20.4.1 documentation and verify the exact method signature. Update D03 with confirmed, correct code. Remove the `[VERIFY]` tag. Log in DEVLOG.

Specific verifications required:

**V-1 — Checkout Session Create:**
Confirm `stripe.checkout.sessions.create()` accepts `subscription_data.metadata` and `trial_period_days` at the path shown in D03 §4.4. Verify `success_url` and `cancel_url` parameter names haven't changed.

**V-2 — Portal Session Create:**
Confirm `stripe.billingPortal.sessions.create()` is the correct method path in SDK 20.4.1. (In some SDK versions this moved to `stripe.billingPortal.sessions.create` vs older `stripe.billingPortal.sessions.create`.) Confirm `return_url` parameter name.

**V-3 — Usage Records (CRITICAL):**
The `stripe.subscriptionItems.createUsageRecord()` API was deprecated in Stripe's 2024 metered billing overhaul. In SDK v20+, metered billing uses `stripe.billing.meters` and `stripe.billing.meterEvents`. Confirm whether D03's overage billing approach (subscriptionItems usage records) still works with SDK 20.4.1, or whether the billing architecture needs to be updated to use the new Meters API. **This may require a D03 architecture update before any code is written.** If the Meters API is required, update D03 §6.3 completely.

**V-4 — Subscription Items Update:**
Confirm `stripe.subscriptionItems.update(itemId, { quantity, proration_behavior })` is the correct method for updating seat quantities. Confirm `proration_behavior: 'create_prorations'` is a valid value in SDK 20.4.1. Confirm the subscription lookup pattern (`stripe.subscriptions.list({ customer, limit: 1 })`) will reliably find the seat item — or identify a more robust approach (e.g., storing the subscription item ID on `organizations` to avoid the lookup).

---

### Blocker 2 (G4): Investigate 12 `talent-pool-members.rls` Test Failures ⚠️ INVESTIGATE

**What to do:** Run the specific failing test file in isolation:

```bash
npx vitest run src/__tests__/rls/talent-pool-members.rls.test.ts --reporter=verbose
```

Read the failure messages carefully. Determine:

- **Scenario A (Fixture/Setup):** The failures are caused by missing seed data, incorrect UUID references in the golden tenant fixture, or a test setup ordering issue. These are not security defects. Document the root cause in DEVLOG, add `// known: fixture issue — see DEVLOG 2026-03-12` comment to the test file, and proceed to Phase 5. File a P1 ticket to fix before launch.

- **Scenario B (RLS Policy Bug):** The failures are caused by an actual RLS policy permitting cross-tenant reads, incorrect `deleted_at` handling, or a missing operation. This is a P0 security defect. Fix the RLS policy and migration before Phase 5 starts. Do not proceed until these tests pass.

**Expected time to diagnose: 30 minutes.**

---

### Blocker 3 (G5): Confirm Git State ⚠️ VERIFY

Run before starting any Phase 5 work:

```bash
git status
git log --oneline -10
git stash list
```

Confirm:
- `nothing to commit, working tree clean`
- Last 3+ commits show hardening wave entries (H1, H2, H3/H4)
- No stashed changes

Also confirm CLAUDE.md is updated post-hardening:

```bash
grep "Test count" CLAUDE.md
grep "Migrations" CLAUDE.md
```

Expected values: `1038 Vitest + 68 E2E = 1106 total`, `30 total (000–029)`. If stale, update CLAUDE.md before proceeding.

---

## Part 4 — ADR-004 Test Plan Declaration

This must be declared **before writing any Phase 5 code**. Per CLAUDE.md mandatory pre-task gates rule 3.

### Tier 1 (Day 1 Mandatory) — Billing Module

#### Unit Tests (`*.test.ts`)

| File | Functions to Test | Estimated Cases |
|---|---|---|
| `lib/billing/plans.test.ts` | `hasFeature()` (all 16 features × 4 plans), `PLAN_LIMITS` enforcement, `assertPlanAllows()` | 40 |
| `lib/billing/credits.test.ts` | `consumeAiCredits()` atomic check, overage calculation, `logAiUsage()` skipped status, `getRemainingCredits()` | 20 |
| `lib/billing/seats.test.ts` | `syncSeatCount()` extra seat calculation, seat limit enforcement in `inviteMember()` | 15 |
| `lib/billing/downgrade.test.ts` | Downgrade rules per D03 §8.1 (excess seats, jobs over limit, feature disablement, credit cap) | 12 |
| **Total unit** | | **~87** |

#### RLS Tests (`*.rls.test.ts`)

No new tables are introduced by Phase 5 (D03 §4.1 confirms Stripe is source of truth for invoices; `organizations` already has billing columns). Therefore no new RLS test file is required.

**However:** The billing column updates to `organizations` must be confirmed as RLS-correct:

| Test | Scenario | Expected |
|---|---|---|
| Tenant A owner reads `organizations.ai_credits_used` | Via `GET /billing/usage` | ✅ Returns own org's value |
| Tenant A recruiter reads `organizations.ai_credits_used` | Via `GET /billing/plan` | ✅ Returns value (plan endpoint is any-member) |
| Tenant A owner reads Tenant B `ai_credits_used` | Direct Supabase query with Tenant A JWT | ❌ Returns 0 rows (RLS blocks) |
| Stripe webhook updates Tenant A org | Uses service role, org identified by `stripe_customer_id` | ✅ Updates correct row |
| Stripe webhook with wrong `stripe_customer_id` | Service role, no matching org | Returns 0 rows, handler logs warning, returns 200 |

Add these 5 cases to the existing `organizations.rls.test.ts` file (or create `organizations.billing.rls.test.ts` if the file is already at capacity).

**Estimated new RLS cases: ~5**

#### Role Boundary Tests

| Endpoint / Action | Owner | Admin | Recruiter | Hiring Manager | Interviewer |
|---|---|---|---|---|---|
| `POST /api/v1/billing/checkout-session` | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| `POST /api/v1/billing/portal-session` | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| `GET /api/v1/billing/usage` | ✅ 200 | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 |
| `GET /api/v1/billing/plan` | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 |
| `requestHumanReview()` SA (billing-adjacent) | ✅ | ✅ | ✅ | ✅ | ❌ |

**Estimated role boundary cases: ~22**

#### API Integration Tests (`*.integration.test.ts`)

| File | Scenarios | Est. Cases |
|---|---|---|
| `billing/stripe-webhooks.integration.test.ts` | 6 webhook events × (valid signature, invalid signature, duplicate event, out-of-order event) | 24 |
| `billing/checkout.integration.test.ts` | Checkout session create (new customer, existing customer, trial), portal session create | 8 |
| `billing/usage.integration.test.ts` | Usage GET (pro plan, starter plan, enterprise), plan GET (all 4 plans) | 10 |
| **Total integration** | | **~42** |

#### Inngest Function Tests

D03 §5.4 defines 6 webhook handlers + D29 confirms 1 cron = **7 billing Inngest functions**.

| Function | Test Scenarios | Est. Cases |
|---|---|---|
| `billing/checkout-completed` | Happy path, missing org, duplicate event (idempotency), Inngest retry | 4 |
| `billing/subscription-updated` | Plan upgrade, plan downgrade, same plan (no-op), missing org | 4 |
| `billing/subscription-canceled` | Happy path (downgrade to starter), data preservation check | 3 |
| `billing/invoice-paid` | Credits reset, billing period boundary, missing org | 3 |
| `billing/payment-failed` | Dunning email trigger, duplicate event | 2 |
| `billing/trial-ending` | 3-day warning email, already converted (no-op) | 2 |
| `billing/report-overage` (cron) | Has overage, no overage, zero limit (enterprise), Stripe API error handling | 4 |
| **Total Inngest** | | **~22** |

#### E2E Tests (`billing.spec.ts`)

| Scenario | User | Description |
|---|---|---|
| Upgrade flow | Owner | Starter → Growth: click Upgrade → Stripe Checkout (mocked) → plan badge updates |
| Downgrade banner | Owner | Over seat limit after downgrade: banner visible, new invite blocked |
| Usage meter display | Owner | AI credits and seat usage bars render with correct values |
| Trial banner | Owner | New org in trial: banner shows days remaining and upgrade CTA |
| Payment required banner | Owner | `past_due` status: full-page banner, write operations blocked |
| `GET /billing/plan` all roles | All 5 roles | Plan endpoint accessible by all roles, returns correct plan data |
| `POST /checkout-session` non-owner | Recruiter | Returns 403, user sees appropriate error message |

**Estimated E2E cases: ~15**

### Test Count Summary

| Category | New Tests | Running Total |
|---|---|---|
| Current (post-hardening) | — | 1,106 (1,038 Vitest + 68 E2E) |
| Unit (billing) | +87 | 1,193 |
| RLS additions (billing) | +5 | 1,198 |
| Role boundary (billing) | +22 | 1,220 |
| API integration (billing) | +42 | 1,262 |
| Inngest function (billing) | +22 | 1,284 |
| E2E (billing) | +15 | 1,299 (1,284 Vitest + 83 E2E) |
| **Phase 5 target** | **+193** | **~1,299** |

> Test count must not decrease. If any refactor during Phase 5 removes tests, the removal requires explicit justification in the DEVLOG.

---

## Part 5 — Infrastructure Prerequisites (Before First Migration)

These are not code changes — they are environment and fixture setup tasks that gate the migration work.

### P-1: Update Golden Tenant Fixture for Billing

**File:** `src/__fixtures__/golden-tenant.ts`

Add billing fields to both tenant organization objects. These are needed by all webhook handler tests and role boundary tests:

```typescript
// TENANT_A — already plan: 'pro'
org: {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme Corp',
  slug: 'acme-corp',
  plan: 'pro' as const,
  // ADD:
  stripe_customer_id: 'cus_test_acme_pro_00001',
  ai_credits_used: 1450,       // ~72% of pro limit (2000) — triggers UpgradeBanner (>80% at 1600)
  ai_credits_limit: 2000,
  billing_cycle: 'monthly' as const,
  current_period_end: '2026-04-12T00:00:00Z',
  cancel_at_period_end: false,
},

// TENANT_B — already plan: 'starter'
org: {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Globex Inc',
  slug: 'globex-inc',
  plan: 'starter' as const,
  // ADD:
  stripe_customer_id: 'cus_test_globex_starter_0001',
  ai_credits_used: 9,          // 9/10 — at limit
  ai_credits_limit: 10,
  billing_cycle: 'monthly' as const,
  current_period_end: '2026-04-12T00:00:00Z',
  cancel_at_period_end: false,
},
```

**Why these values:** TENANT_A at 72% tests the "approaching limit" path without triggering the upgrade banner. TENANT_B at 9/10 tests the "at limit" / `402 Payment Required` path. Both have `stripe_customer_id` populated so webhook handler tests can perform the Stripe customer → org lookup without mocking the DB lookup.

### P-2: Add Stripe MSW Handlers

**File:** `src/__mocks__/handlers.ts`

Add the following MSW intercepts before any test file imports them:

```typescript
// Stripe endpoints to mock (add to existing handlers array)

// Checkout Session
http.post('https://api.stripe.com/v1/checkout/sessions', () =>
  HttpResponse.json({
    id: 'cs_test_checkout_session_001',
    url: 'https://checkout.stripe.com/test',
    status: 'open',
  })
),

// Customer Portal
http.post('https://api.stripe.com/v1/billing_portal/sessions', () =>
  HttpResponse.json({
    id: 'bps_test_portal_session_001',
    url: 'https://billing.stripe.com/test',
  })
),

// Subscription retrieve (for seat sync lookup)
http.get('https://api.stripe.com/v1/subscriptions', ({ request }) => {
  const url = new URL(request.url);
  const customer = url.searchParams.get('customer');
  return HttpResponse.json({
    data: [{
      id: 'sub_test_001',
      status: 'active',
      current_period_end: 1744416000,
      items: {
        data: [
          {
            id: 'si_test_seat_001',
            price: { metadata: { type: 'extra_seat' }, unit_amount: 1000 },
            quantity: 2,
          },
          {
            id: 'si_test_ai_001',
            price: { metadata: { type: 'ai_overage' } },
          },
        ],
      },
    }],
  });
}),

// Subscription item update (seat sync)
http.post('https://api.stripe.com/v1/subscription_items/:itemId', () =>
  HttpResponse.json({ id: 'si_test_seat_001', quantity: 3 })
),

// Billing Meters — overage reporting (V-3 resolved: uses Billing Meters API, not usage_records)
http.post('https://api.stripe.com/v1/billing/meter_events', () =>
  HttpResponse.json({ identifier: 'mevt_test_001' })
),
```

> Note: V-3 resolved (2026-03-12). `createUsageRecord()` replaced with `stripe.billing.meterEvents.create()`. MSW handler updated to match Billing Meters API path.

### P-3: Verify D29 Inngest Registry Matches D03

**File:** `docs/INNGEST-REGISTRY.md` — billing section

D03 §5.4 specifies 6 webhook-triggered functions. D29 reports 7 billing functions total (6 + the existing `billing/report-overage` cron). Confirm the registry lists exactly:

| Function ID | Event / Cron | Shipped? |
|---|---|---|
| `billing/checkout-completed` | `stripe/webhook.received` filter: `checkout.session.completed` | ⬜ Phase 5 |
| `billing/subscription-updated` | `stripe/webhook.received` filter: `customer.subscription.updated` | ⬜ Phase 5 |
| `billing/subscription-canceled` | `stripe/webhook.received` filter: `customer.subscription.deleted` | ⬜ Phase 5 |
| `billing/invoice-paid` | `stripe/webhook.received` filter: `invoice.paid` | ⬜ Phase 5 |
| `billing/payment-failed` | `stripe/webhook.received` filter: `invoice.payment_failed` | ⬜ Phase 5 |
| `billing/trial-ending` | `stripe/webhook.received` filter: `customer.subscription.trial_will_end` | ⬜ Phase 5 |
| `billing/report-overage` | Cron: `55 23 * * *` (23:55 UTC daily) | ⬜ Phase 5 |

If D29 differs from this table, update D29 before writing any Inngest function code.

### P-4: Confirm Stripe Products Are Set Up in Stripe Test Mode

**Non-code prerequisite.** Before integration tests can run against real Stripe Test Mode (not just MSW), the following must exist in the Stripe Dashboard under your test-mode account:

- [ ] 4 products (Starter, Growth, Pro, Enterprise) with monthly + annual Prices
- [ ] Extra seat metered Price per plan with `metadata.type = 'extra_seat'`
- [ ] AI Credit Overage metered Price with `metadata.type = 'ai_overage'`
- [ ] Webhook endpoint registered pointing to your staging URL with all 6 events subscribed
- [ ] `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in `.env.local` and staging `.env`

> This is a one-time setup. Document the Stripe Product IDs and Price IDs as constants in `.env.example` after creation (e.g., `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`). Hardcoded IDs in code violate ADR-001's "no environment assumptions" principle.

---

## Part 6 — Phase 5 Build Waves

Once all blockers are cleared and the gate passes, Phase 5 executes in 4 waves. No wave starts until the previous wave's tests pass.

### Wave 1: Core Billing Library + Plan Enforcement

**Deliverables:**
- `src/lib/billing/plans.ts` — `PLAN_LIMITS`, `PLAN_FEATURE_DEFAULTS`, `hasFeature()`, `assertPlanAllows()`
- `src/lib/billing/credits.ts` — `consumeAiCredits()` (consolidate from `lib/ai/credits.ts`), `logAiUsage()`, `getRemainingCredits()`
- `src/lib/billing/seats.ts` — `syncSeatCount()`, seat limit enforcement
- `src/lib/billing/downgrade.ts` — `applyDowngradeRules()`, `getActiveJobCount()`, `getActiveSeatCount()`
- Wire `assertPlanAllows()` into existing Server Actions that reference plan gates (`createJobOpening`, `inviteMember`, AI functions)

**Tests ship with this wave:**
- `billing/plans.test.ts` (~40 cases)
- `billing/credits.test.ts` (~20 cases)
- `billing/seats.test.ts` (~15 cases)
- `billing/downgrade.test.ts` (~12 cases)

**Gate before Wave 2:** All unit tests pass. `tsc --noEmit` clean. No regression in existing test count.

---

### Wave 2: Stripe Webhook Route + Inngest Functions

**Deliverables:**
- `src/app/api/webhooks/stripe/route.ts` — signature verification + Inngest dispatch
- `src/inngest/billing.ts` — all 7 billing Inngest functions (6 webhook handlers + 1 cron)
- Connect `billing/checkout-completed` to update `organizations.plan`, `ai_credits_limit`, reset `ai_credits_used`, send welcome email via `ats/notification.requested`
- Connect `billing/invoice-paid` to reset `ai_credits_used = 0`
- Connect `billing/subscription-canceled` to call `applyDowngradeRules()`
- Register all 7 functions in `/api/inngest/route.ts`

**Tests ship with this wave:**
- `billing/stripe-webhooks.integration.test.ts` (~24 cases)
- All 7 Inngest function tests (~22 cases)
- Organizations billing RLS additions (~5 cases)

**Gate before Wave 3:** All integration + Inngest tests pass. Verify idempotency: run the same Stripe event twice → second run is a no-op (Stripe event ID dedup in Inngest).

---

### Wave 3: Billing API Routes + Server Actions

**Deliverables:**
- `src/app/api/v1/billing/checkout-session/route.ts`
- `src/app/api/v1/billing/portal-session/route.ts`
- `src/app/api/v1/billing/usage/route.ts`
- `src/app/api/v1/billing/plan/route.ts`
- `src/lib/actions/billing.ts` — `createCheckoutSession()`, `createPortalSession()`, `getBillingUsage()`, `getBillingPlan()` Server Actions
- Apply `requireFeature()` middleware to AI routes (check plan gate before credit check)
- Apply rate limits per plan tier to API routes (update `proxy.ts`)

**Tests ship with this wave:**
- `billing/checkout.integration.test.ts` (~8 cases)
- `billing/usage.integration.test.ts` (~10 cases)
- Role boundary tests for all billing endpoints (~22 cases)

**Gate before Wave 4:** All API integration + role boundary tests pass. Manually test webhook signature rejection (send request with wrong `stripe-signature` header → confirm 400 returned).

---

### Wave 4: Billing UI + E2E

**Deliverables:**
- `src/app/(app)/settings/billing/page.tsx` — billing settings page (Server Component)
- `src/components/billing/PlanCard.tsx` — current plan, usage meters, upgrade/downgrade CTAs
- `src/components/billing/UsageMeter.tsx` — seat + AI credit progress bars
- `src/components/billing/UpgradeBanner.tsx` — global banner at >80% usage
- `src/components/billing/PaymentRequiredBanner.tsx` — full-page dunning state
- `src/components/billing/TrialBanner.tsx` — trial countdown with upgrade CTA
- Wire global banners into root layout (check plan state on every page load — cache in Redis with 5-min TTL per D16)
- Add "Billing" link to `app-nav.tsx` settings section (owner/admin only)

**Tests ship with this wave:**
- `billing.spec.ts` E2E tests (~15 cases)
- Axe accessibility check on billing page (Tier 2 per ADR-004)

**Gate before Phase 5 complete:** Full test suite passes. `tsc --noEmit` clean. DEVLOG entry written. Post-build audit §13 run on billing module.

---

## Part 7 — Post-Phase 5 Mandatory Audit

Per AI-RULES §13 rule 59, a post-build audit is mandatory after completing Phase 5. The audit must check all 7 categories (A1–A7).

**Specific items to verify in the Phase 5 post-build audit:**

| # | Check | What to verify |
|---|---|---|
| A1 | Cross-reference consistency | D03 endpoint paths match actual `app/api/v1/billing/` route files. D29 function IDs match `inngest/billing.ts` exports. |
| A2 | Decision contradictions | `PLAN_LIMITS` in `lib/billing/plans.ts` matches D03 §2 table. `AI_CREDITS_PER_ACTION` in `lib/ai/credits.ts` matches D03 §6.1. |
| A3 | Schema consistency | `organizations` billing columns used in code match D01 DDL exactly (no `billing_status` column that doesn't exist in schema). |
| A4 | Completeness | Zero `[VERIFY]` markers in any billing-related file. All Stripe product/price IDs are in `.env.example`. |
| A5 | Tracking accuracy | D29 shipped count updated. CLAUDE.md test count updated. CLAUDE.md phase status updated to Phase 5 ✅. |
| A6 | Template compliance | `lib/billing/plans.ts` exports only typed functions, no `any`. All Server Actions have explicit return type `Promise<{ success: true } \| { error: string }>`. |
| A7 | Regression check | `npm test` count at start of Phase 5 audit ≥ Phase 5 target (~1,299). No previously-passing test now fails. |

---

## Summary: What Must Be True Before Line 1 of Phase 5 Code

```
Pre-Start Gate — Phase 5 Billing
─────────────────────────────────────────────────────────
G1 Dependencies:     ✅ PASS — D01, D02, D03, D24, all ADRs complete
G2 ADRs:             ✅ PASS — ADR-001,005,006,007,008 all Accepted
G3 [VERIFY] markers: ✅ PASS — All 4 resolved. V-3 required D03 §6.3 rewrite
                              (createUsageRecord → billing.meterEvents.create).
G4 Pending fixes:    ✅ PASS — 12 RLS failures fixed (fixture collisions on
                              junction table unique constraints). 1049/1049 passing.
G5 Clean git:        ✅ PASS — Working tree clean. CLAUDE.md updated.
G6 DoD:              ✅ PASS — ~193 new tests, 4 build waves.
─────────────────────────────────────────────────────────
→ GATE PASSED (2026-03-12). Phase 5 Wave 1 is unblocked.
```

---

*Document created: 2026-03-12 | Gate PASSED: 2026-03-12 — all blockers cleared. V-3 required D03 architecture update (Billing Meters API). 12 RLS fixture failures fixed. Ready for Wave 1.*
