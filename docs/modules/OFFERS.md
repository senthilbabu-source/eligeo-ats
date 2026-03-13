# Offer Management

> **ID:** D06
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-13
> **Depends on:** D01 (schema — `offers`, `offer_templates`, `offer_approvals`), D02 (API patterns), D03 (billing — plan gating), D05 (design — status badges)
> **Depended on by:** D08 (Candidate Portal — offer acceptance), D19 (Migration — offer data import)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-007 (audit), ADR-008 (enums), ADR-009 (file storage)

---

## 1. Overview

Offer Management covers the full lifecycle of employment offers: drafting from templates, multi-step approval chains, e-signature delivery via Dropbox Sign, candidate response tracking, and expiry handling. An offer is always tied to a specific `application` (one candidate + one job opening).

**Scope:**
- In scope: Offer CRUD, templates, approval chain, e-sign delivery, status tracking, expiry cron, offer analytics, AI compensation suggestion, salary band checking, offer letter drafting.
- Out of scope: Background checks (separate module), onboarding kickoff (separate trigger).
- **Build status (2026-03-13):** Phase 4 complete (5 waves) + P6-3 complete. State machine, server actions, AI layer, Inngest functions, UI pages all shipped. **Dropbox Sign e-sign fully integrated (P6-3):** real envelope creation/cancellation, HMAC-verified webhook, AI offer letter preview (Pro+), `send_offer` command bar intent. Manual "mark signed" also available as fallback.

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Recruiter | As a recruiter, I want to create an offer from a template so compensation is standardized | Given a template exists, when I select it for a candidate, then compensation fields are pre-filled |
| US-02 | Recruiter | As a recruiter, I want to submit an offer for approval | Given an offer in `draft` status, when I click "Submit for Approval", then the approval chain starts and first approver is notified |
| US-03 | Hiring Manager | As an approver, I want to approve or reject an offer from my inbox | Given I have a pending approval, when I approve/reject, then the next approver is notified (or offer advances to `approved`) |
| US-04 | Recruiter | As a recruiter, I want to send an approved offer for e-signature | Given an offer in `approved` status, when I click "Send", then a Dropbox Sign envelope is created and candidate receives the signing link |
| US-05 | Candidate | As a candidate, I want to sign or decline an offer | Given I received a signing request, when I sign/decline in Dropbox Sign, then the ATS updates to `signed`/`declined` |
| US-06 | Recruiter | As a recruiter, I want to withdraw an offer at any point before signing | Given an offer not yet `signed`, when I click "Withdraw", then the offer becomes `withdrawn` and e-sign request is voided |
| US-07 | Admin | As an admin, I want expired offers auto-detected | Given an offer is `sent` and `expiry_date` has passed, then the system auto-transitions to `expired` |

## 3. Data Model

### 3.1 Tables

Three tables defined in D01 schema ([schema/06-offers.md](../schema/06-offers.md)):

- **`offer_templates`** — reusable compensation + terms templates
- **`offers`** — the offer instance with 8-state lifecycle
- **`offer_approvals`** — sequential approval chain (one row per approver)

All DDL, indexes, RLS, and triggers defined in D01. This document specifies behavior, not schema.

### 3.2 JSONB Type Definitions

```typescript
// offers.compensation — defined in D01
interface OfferCompensation {
  base_salary: number;
  currency: string;             // ISO 4217 (e.g., 'USD', 'EUR')
  period: 'annual' | 'monthly' | 'hourly';
  bonus_pct?: number;
  bonus_amount?: number;
  equity_shares?: number;
  equity_type?: 'options' | 'rsu' | 'phantom';
  equity_vesting?: string;      // e.g., "4 years, 1-year cliff"
  sign_on_bonus?: number;
  relocation?: number;
  other_benefits?: string[];
}
```

**Currency rules:**

| Rule | Detail |
|------|--------|
| **Supported currencies** | USD, EUR, GBP, CAD, AUD, INR, SGD, JPY, CHF, SEK. Org can use any; no conversion between them. |
| **Validation** | `currency` must be a valid ISO 4217 code from the supported list. Reject unknown codes at API level (ATS-OF04). |
| **Display** | Format using `Intl.NumberFormat` with the offer's `currency` code. Example: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`. |
| **Comparison** | No cross-currency comparison in v1.0. Analytics group by currency. Mixed-currency aggregation deferred to v2.0+. |
| **Per-org default** | `organizations.default_currency` (not yet in schema — add when building offers). Pre-fills the currency picker; editable per offer. |
| **Stripe interaction** | Stripe billing is always in the org's subscription currency (set at checkout). Offer compensation currency is independent — offers are internal, not billed. |

### 3.3 State Machine

```
                 ┌─────────┐
        ┌────────│  draft  │◄───────┐
        │        └─────────┘        │
        │ submit for     │ withdraw │ approver rejected
        │ approval       ▼         │ (resets all approvals)
        │         ┌───────────┐     │
        │         │ withdrawn │     │
        │         └───────────┘     │
        ▼               ▲          │
  ┌──────────────┐      │ withdraw │
  │pending_approval│─────┤──────────┘
  └──────────────┘      │
        │               │
        │ all approved  │ withdraw
        ▼               │
  ┌──────────┐          │
  │ approved │──────────┘
  └──────────┘
        │         │               │
        │ signed  │ declined      │ expired (cron)
        ▼         ▼               ▼
  ┌────────┐ ┌─────────┐  ┌─────────┐
  │ signed │ │declined │  │ expired │
  └────────┘ └─────────┘  └─────────┘
```

**Transition rules:**

| From | To | Guard | Actor |
|------|----|-------|-------|
| `draft` | `pending_approval` | Compensation non-empty, at least 1 approver | Recruiter |
| `draft` | `withdrawn` | — | Recruiter, Admin |
| `pending_approval` | `approved` | All approvers approved (`sequence_order` complete) | System (auto) |
| `pending_approval` | `withdrawn` | — | Recruiter, Admin |
| `pending_approval` | `draft` | Any approver rejected (resets all approvals) | System (auto) |
| `approved` | `signed` | Candidate signs (manual mark or Dropbox Sign e-sign) | Recruiter |
| `approved` | `declined` | Candidate declines | Recruiter |
| `approved` | `expired` | `expiry_date < NOW()` | System (cron) |
| `approved` | `withdrawn` | — | Recruiter, Admin |

> **Note:** The `send` transition (`approved → sent`) was re-activated in Phase 5 B5-6. The state machine supports both paths: direct `approved → signed` (manual PDF) and `approved → sent → signed` (e-sign via Dropbox Sign). The `send` transition is guarded by `hasEsignProvider`. `sent` is withdrawable.

## 4. Architecture

### 4.1 Approval Chain Flow

```
Recruiter creates offer (draft)
  │
  ├─ Recruiter clicks "Submit for Approval"
  │   ├─ Validate: compensation non-empty, expiry_date in future
  │   ├─ Set status = 'pending_approval'
  │   └─ Notify first approver (sequence_order = 1) via Inngest
  │
  ├─ Approver 1 receives notification
  │   ├─ Approver approves → set approval status = 'approved', decided_at = NOW()
  │   │   └─ If more approvers: notify next (sequence_order = 2)
  │   │   └─ If last approver: set offer status = 'approved', notify recruiter
  │   └─ Approver rejects → set approval status = 'rejected', decided_at = NOW()
  │       └─ Reset ALL approvals to 'pending', set offer status = 'draft'
  │       └─ Notify recruiter with rejection notes
  │
  └─ Approver removed from organization mid-flow (G-022)
      ├─ Inngest function detects missing approver on next step
      ├─ Auto-skip: mark their approval as 'approved' with system note
      └─ Continue chain to next approver (or complete if last)
```

**Decision (G-022 resolved):** When an approver is removed from the organization during an active approval chain, the system auto-skips their step. Rationale: blocking the entire offer on a departed employee is worse than auto-advancing. The skip is logged in `offer_approvals.notes` as "Auto-approved: approver removed from organization" and recorded in `audit_logs`.

### 4.2 E-Sign Integration (Dropbox Sign)

> **Current state (P6-3 complete):** The `send` transition (`approved → sent`) and `offerSendEsign` Inngest function are fully integrated with Dropbox Sign. The `sendOffer()` Server Action validates the transition via state machine (guarded by `hasEsignProvider`), dispatches `ats/offer.send-requested` to Inngest. The Inngest function: (1) fetches offer context, (2) generates AI offer letter content for Pro+/Enterprise via `generateOfferLetterDraft()`, (3) creates a real Dropbox Sign envelope via `createSignatureEnvelope()`, (4) updates offer to `sent` with `esign_envelope_id`, (5) notifies the recruiter. Webhook at `/api/webhooks/dropbox-sign` receives signed/declined/canceled events via HMAC-verified callbacks → dispatches to `processEsignWebhook` Inngest function → updates offer status. Manual PDF signing remains available via `markOfferSigned()` from either `approved` or `sent` status.

**Decision (G-010 resolved):** When Dropbox Sign is unavailable, the offer stays in `approved`. The send action is retried via Inngest. If all retries fail, the recruiter is notified and can fall back to manual PDF signing.

### 4.3 Integration Points

| System | Direction | Purpose |
|--------|-----------|---------|
| Dropbox Sign | Outbound | Create signature request, void envelope |
| Dropbox Sign | Inbound | Webhook: signed, declined, voided events |
| Inngest | Internal | Approval notifications, e-sign retry, expiry cron, offer events |
| Supabase Realtime | Outbound | `org:{id}:offers` channel for live status updates |
| Email (Resend) | Outbound | Approval request, offer sent, signed/declined notifications |

## 5. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/offers` | JWT/Key | List offers (filterable by status, job, candidate) |
| POST | `/api/v1/offers` | JWT | Create offer (from template or blank) |
| GET | `/api/v1/offers/:id` | JWT/Key | Get offer details + approval chain |
| PATCH | `/api/v1/offers/:id` | JWT | Update draft offer |
| DELETE | `/api/v1/offers/:id` | JWT | Soft-delete offer |
| POST | `/api/v1/offers/:id/submit` | JWT | Submit for approval |
| POST | `/api/v1/offers/:id/approve` | JWT | Approve (current approver) |
| POST | `/api/v1/offers/:id/reject` | JWT | Reject (current approver, with notes) |
| POST | `/api/v1/offers/:id/send` | JWT | Send for e-signature via Dropbox Sign **✅ Active (P6-3)** |
| POST | `/api/v1/offers/:id/withdraw` | JWT | Withdraw offer |
| GET | `/api/v1/offer-templates` | JWT/Key | List templates |
| POST | `/api/v1/offer-templates` | JWT | Create template |
| PATCH | `/api/v1/offer-templates/:id` | JWT | Update template |
| DELETE | `/api/v1/offer-templates/:id` | JWT | Soft-delete template |

### 5.1 Request/Response Schemas

```typescript
// POST /api/v1/offers
const CreateOfferRequest = z.object({
  application_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
  compensation: OfferCompensationSchema,
  start_date: z.string().date().optional(),
  expiry_date: z.string().date().optional(),
  terms: z.string().optional(),
  esign_provider: z.enum(['dropbox_sign', 'docusign']).optional(),
  approvers: z.array(z.object({
    user_id: z.string().uuid(),
    sequence_order: z.number().int().positive(),
  })).min(1),
});

// GET /api/v1/offers/:id response
const OfferResponse = z.object({
  id: z.string().uuid(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'sent', 'signed', 'declined', 'expired', 'withdrawn']),
  compensation: OfferCompensationSchema,
  candidate: z.object({ id: z.string().uuid(), full_name: z.string() }),
  job: z.object({ id: z.string().uuid(), title: z.string() }),
  start_date: z.string().date().nullable(),
  expiry_date: z.string().date().nullable(),
  esign_provider: z.enum(['dropbox_sign', 'docusign']).nullable(),
  sent_at: z.string().datetime().nullable(),
  signed_at: z.string().datetime().nullable(),
  approvals: z.array(z.object({
    id: z.string().uuid(),
    approver: z.object({ id: z.string().uuid(), full_name: z.string() }),
    sequence_order: z.number(),
    status: z.enum(['pending', 'approved', 'rejected']),
    decided_at: z.string().datetime().nullable(),
    notes: z.string().nullable(),
  })),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
```

## 6. Background Jobs (Inngest)

| Function ID | Trigger Event | Steps | Concurrency | Rate Limit |
|-------------|---------------|-------|-------------|------------|
| `offers/approval-notify` | `ats/offer.submitted` | 1. Find next pending approver 2. Fetch offer context 3. Send email + in-app notification | 10/org | 20/min/org | **✅ Shipped** |
| `offers/approval-advanced` | `ats/offer.approval-decided` | 1. Check chain status 2. If all approved: advance to `approved` 3. If more pending: notify next (with G-022 auto-skip) 4. If rejected: notify recruiter | 10/org | 20/min/org | **✅ Shipped** |
| `offers/send-esign` | `ats/offer.send-requested` | 1. Fetch offer + context 2. Generate AI letter (Pro+) 3. Create Dropbox Sign envelope 4. Update to `sent` 5. Notify recruiter | 5 | 10/min/org | **✅ Shipped** (Phase 5 B5-6 re-registered, P6-3 real Dropbox Sign) |
| `offers/esign-webhook` (`processEsignWebhook`) | `dropboxsign/webhook.received` | 1. Validate offer exists + status=sent 2. Update offer status (signed/declined/withdrawn) 3. Set signed_at for signed events 4. Notify recruiter | 5 | — | **✅ Shipped** (P6-3 real Dropbox Sign webhook) |
| `offers/check-expiry` | Cron: `0 * * * *` (hourly) | 1. Find expired offers 2. Mark expired 3. Void e-sign envelope 4. Notify recruiters | 1 | — | **✅ Shipped** |
| `offers/withdraw` | `ats/offer.withdrawn` | 1. Void e-sign envelope via `cancelSignatureEnvelope()` 2. Notify recruiter | 5/org | 10/min/org | **✅ Shipped** (P6-3 real Dropbox Sign cancel) |

## 7. UI Components

| Component | Page | Description |
|-----------|------|-------------|
| `OfferForm` | `/offers/new?applicationId=X` | Full compensation editor (base, currency, period, bonus, equity, sign-on), offer details (start/expiry/terms), approver selector with sequence ordering. **✅ Built** |
| Offer list page | `/offers` | Status filter tabs (8 statuses), pagination, status badges, currency formatting. **✅ Built** |
| Offer detail page | `/offers/:id` | Compensation breakdown, details card, approval timeline with colored dots, action buttons via `offer-actions.tsx`. **✅ Built** |
| `OfferActions` | `/offers/:id` | Client component: Submit, Approve, Reject (with notes), Mark Signed, Send for E-Sign (opens preview modal), Withdraw. Uses `validActions()` from state machine. **✅ Built** |
| `OfferLetterPreviewModal` | `/offers/:id` | AI offer letter preview + edit modal (Pro+ only). Generate via `aiGenerateOfferTerms()`, editable textarea, compensation summary. Growth users see upgrade prompt. **✅ Built (P6-3)** |
| `ApprovalInbox` | `/approvals` | Pending approvals for current user, "your turn" indicator, candidate/job context. **✅ Built** |
| `OfferTemplateList` | `/settings/offer-templates` | Template management CRUD. Phase 5. |

## 8. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Approver removed from organization mid-chain | Auto-skip with system note (§4.1, G-022 resolved) |
| Dropbox Sign unavailable during send | Inngest retry (5 attempts), then manual fallback (§4.2, G-010 resolved) |
| Candidate signs after expiry_date | Accept the signature — `signed` takes precedence over `expired`. Expiry cron checks `status = 'approved'` (Phase 5: `'sent'`). |
| Two offers for same application | Allowed but UI shows warning. Only one can be in `approved`/`signed` state — second blocked. |
| Offer withdrawn after candidate signs | Not allowed — `signed` is a terminal state. Only `draft`, `pending_approval`, `approved` can transition to `withdrawn`. |
| Approval chain modified after submission | Not allowed while `pending_approval`. Withdraw first, edit approvers, resubmit. |
| Rejected offer resubmission | Rejection resets to `draft` with previous approvals cleared. Recruiter edits and resubmits. |
| E-sign envelope voided externally | Dropbox Sign webhook triggers `esign-webhook` function. If offer is `sent`, set to `withdrawn`. |
| Concurrent approval by admin override + regular approver | `offer_approvals` update uses `WHERE status = 'pending'` — only first update wins. |

## 9. Security Considerations

- [x] Only owner/admin/recruiter can create, edit, submit, send, withdraw offers
- [x] Hiring managers can only approve/reject their assigned approvals (RLS enforced)
- [x] Interviewers have no offer access (RLS excludes `interviewer` role)
- [x] Candidate never sees compensation details in ATS — only the PDF via e-sign
- [x] `esign_envelope_id` is opaque — no Dropbox Sign API keys exposed to client
- [x] Dropbox Sign webhook verified via HMAC signature (SHA-256 `crypto.timingSafeEqual`) ✅ Implemented P6-3
- [x] Offer withdrawal voids e-sign envelope server-side via `cancelSignatureEnvelope()` — candidate link becomes invalid
- [x] Rate limiting on e-sign send (prevent mass sending)

## 10. Testing Strategy

| Type | File | What it tests |
|------|------|---------------|
| Unit | `src/__tests__/offer-state-machine.test.ts` | 43 tests: State transitions (send removed, sign/decline/expire from approved), guard conditions, terminal states, valid actions, H4-2 verification | **✅ Built** |
| Unit | `src/__tests__/offer-ai.test.ts` | 14 tests: AI comp suggestion, offer letter draft, salary band check | **✅ Built** |
| Unit | `src/__tests__/offer-intent-patterns.test.ts` | 16 tests: create_offer/check_offer patterns, navigation, preserved patterns | **✅ Built** |
| Unit | `src/__tests__/offer-actions.test.ts` | 34 tests: Server action CRUD, state transitions, permission checks | **✅ Built** |
| Unit | `src/__tests__/offer-inngest.test.ts` | 17 tests: 5 Inngest functions (approval notify/advanced, expiry, withdraw, send-esign). send-esign real Dropbox Sign P6-3 (+2: Pro+ AI letter, Growth skip). | **✅ Built** |
| Unit | `src/__tests__/esign/dropbox-sign-hmac.test.ts` | 8 tests: HMAC verification (4) + event mapping (4). | **✅ Built (P6-3)** |
| Unit | `src/__tests__/esign/process-esign-webhook.test.ts` | 4 tests: Signed/declined events, skip non-sent, skip missing metadata. | **✅ Built (P6-3)** |
| Unit | `src/__tests__/esign/send-offer-intent.test.ts` | 4 tests: send_offer intent patterns (send/dispatch). | **✅ Built (P6-3)** |
| RLS | `src/__tests__/rls/offer-templates.rls.test.ts` | 15 tests: 4 ops × roles × 2 tenants | **✅ Built** |
| RLS | `src/__tests__/rls/offers.rls.test.ts` | 15 tests: 4 ops × roles × 2 tenants | **✅ Built** |
| RLS | `src/__tests__/rls/offer-approvals.rls.test.ts` | 14 tests: 4 ops × roles × 2 tenants | **✅ Built** |
| E2E | `src/__tests__/e2e/offers.spec.ts` | Full flow: create → approve → send → sign. **Planned** |

## 11. Open Questions

*(None — all questions resolved via G-010 and G-022)*

---

*Changelog: Created 2026-03-10. Updated 2026-03-13 — P6-3 build complete: Dropbox Sign full integration (real envelope creation/cancellation, HMAC webhook, AI offer letter preview Pro+, send_offer command bar intent, 18 new tests). All 6 Inngest offer functions shipped and active. Updated §1 build status, §3.3 transition table, §4.2 e-sign architecture, §5 endpoint status, §6 Inngest table, §7 UI components (+OfferLetterPreviewModal), §9 security (HMAC verified), §10 testing (+16 P6-3 tests). Prior: Phase 4 build complete (5 waves), H4-2 send transition deferred then re-activated Phase 5 B5-6.*
