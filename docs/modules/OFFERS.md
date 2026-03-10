# Offer Management

> **ID:** D06
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — `offers`, `offer_templates`, `offer_approvals`), D02 (API patterns), D03 (billing — plan gating), D05 (design — status badges)
> **Depended on by:** D08 (Candidate Portal — offer acceptance), D19 (Migration — offer data import)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-007 (audit), ADR-008 (enums), ADR-009 (file storage)

---

## 1. Overview

Offer Management covers the full lifecycle of employment offers: drafting from templates, multi-step approval chains, e-signature delivery via Dropbox Sign, candidate response tracking, and expiry handling. An offer is always tied to a specific `application` (one candidate + one job opening).

**Scope:**
- In scope: Offer CRUD, templates, approval chain, e-sign delivery, status tracking, expiry cron, offer analytics.
- Out of scope: Compensation benchmarking (future), background checks (separate module), onboarding kickoff (separate trigger).

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

### 3.3 State Machine

```
                 ┌─────────┐
        ┌────────│  draft  │────────┐
        │        └─────────┘        │
        │ submit for approval       │ withdraw
        ▼                           ▼
  ┌──────────────┐          ┌───────────┐
  │pending_approval│────────►│ withdrawn │
  └──────────────┘ withdraw └───────────┘
        │                         ▲
        │ all approved            │ withdraw
        ▼                         │
  ┌──────────┐                    │
  │ approved │────────────────────┤
  └──────────┘                    │
        │                         │
        │ send for e-sign         │
        ▼                         │
  ┌──────────┐                    │
  │   sent   │────────────────────┤
  └──────────┘                    │
        │         │               │
        │ signed  │ declined      │ expired (cron)
        ▼         ▼               │
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
| `approved` | `sent` | `esign_provider` set, envelope created | Recruiter |
| `approved` | `withdrawn` | — | Recruiter, Admin |
| `sent` | `signed` | E-sign webhook confirms signing | Candidate (via e-sign) |
| `sent` | `declined` | Candidate declines in e-sign | Candidate (via e-sign) |
| `sent` | `expired` | `expiry_date < NOW()` | System (cron) |
| `sent` | `withdrawn` | Voids e-sign envelope | Recruiter, Admin |

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

```
Recruiter clicks "Send Offer"
  │
  ├─ Server Action: createEsignEnvelope
  │   ├─ Validate: offer status = 'approved'
  │   ├─ Generate offer PDF from template + compensation data
  │   ├─ Upload to Dropbox Sign via API [VERIFY]
  │   │   ├─ Create signature request
  │   │   ├─ Set signer = candidate email
  │   │   └─ Set callback_url = /api/webhooks/dropbox-sign
  │   ├─ Store esign_envelope_id on offer
  │   ├─ Set status = 'sent', sent_at = NOW()
  │   └─ Notify candidate via email
  │
  └─ Dropbox Sign unavailable (G-010)
      ├─ Inngest retries with exponential backoff (5 attempts over ~1 hour)
      ├─ If all retries fail: offer stays 'approved', recruiter notified
      ├─ Recruiter can retry manually or download PDF for manual signing
      └─ Manual signing: recruiter uploads signed PDF, manually sets status = 'signed'
```

**Decision (G-010 resolved):** When Dropbox Sign is unavailable, the offer stays in `approved` (not stuck in `sent`). The send action is retried via Inngest. If all retries fail, the recruiter is notified and can either retry or fall back to manual PDF signing. The manual fallback sets `esign_provider = NULL` and `esign_envelope_id = NULL` to indicate manual process.

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
| POST | `/api/v1/offers/:id/send` | JWT | Send for e-signature |
| POST | `/api/v1/offers/:id/withdraw` | JWT | Withdraw offer (voids e-sign if sent) |
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
| `offers/approval-notify` | `ats/offer.submitted` | 1. Find next pending approver 2. Send email + in-app notification | 10 | 20/min/org |
| `offers/approval-advanced` | `ats/offer.approval-decided` | 1. Check if chain complete 2. If yes: set approved 3. If rejected: reset to draft | 10 | 20/min/org |
| `offers/send-esign` | `ats/offer.send-requested` | 1. Generate PDF 2. Create Dropbox Sign envelope 3. Update offer status | 5 | 10/min/org |
| `offers/esign-webhook` | `dropboxsign/webhook.received` | 1. Verify event 2. Update offer status 3. Notify recruiter | 10 | — |
| `offers/check-expiry` | Cron: `0 * * * *` (hourly) | 1. Find sent offers past expiry_date 2. Set status = expired 3. Void e-sign envelope 4. Notify recruiter | 1 | — |
| `offers/withdraw` | `ats/offer.withdrawn` | 1. Void e-sign envelope (if sent) 2. Send cancellation email to candidate | 5 | 10/min/org |

## 7. UI Components

| Component | Page | Description |
|-----------|------|-------------|
| `OfferBuilder` | `/jobs/:id/offers/new` | Form with template picker, compensation editor, approver selector |
| `OfferDetail` | `/offers/:id` | Full offer view with status badge, compensation breakdown, approval timeline |
| `ApprovalTimeline` | `/offers/:id` | Vertical step indicator showing approval chain progress |
| `ApprovalInbox` | `/approvals` | List of pending approvals for current user across all offers |
| `OfferStatusBadge` | Various | Semantic status colors per D05 (success=signed, warning=pending, destructive=declined/expired) |
| `CompensationEditor` | `/offers/new`, `/offer-templates/new` | Structured form for OfferCompensation fields with currency picker |
| `OfferTemplateList` | `/settings/offer-templates` | Template management CRUD |

## 8. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Approver removed from organization mid-chain | Auto-skip with system note (§4.1, G-022 resolved) |
| Dropbox Sign unavailable during send | Inngest retry (5 attempts), then manual fallback (§4.2, G-010 resolved) |
| Candidate signs after expiry_date | Accept the signature — `signed` takes precedence over `expired`. Expiry cron checks `status = 'sent'` only. |
| Two offers for same application | Allowed but UI shows warning. Only one can be in `sent`/`signed` state — second send blocked. |
| Offer withdrawn after candidate signs | Not allowed — `signed` is a terminal state. Only `draft`, `pending_approval`, `approved`, `sent` can transition to `withdrawn`. |
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
- [x] Dropbox Sign webhook verified via HMAC signature [VERIFY]
- [x] Offer withdrawal voids e-sign envelope server-side — candidate link becomes invalid
- [x] Rate limiting on e-sign send (prevent mass sending)

## 10. Testing Strategy

| Type | File | What it tests |
|------|------|---------------|
| Unit | `tests/unit/offers/state-machine.test.ts` | All 11 state transitions, guard conditions |
| Unit | `tests/unit/offers/approval-chain.test.ts` | Sequential approval, rejection reset, auto-skip |
| Integration | `tests/integration/offers/api.test.ts` | CRUD endpoints, RLS enforcement, Zod validation |
| Integration | `tests/integration/offers/esign.test.ts` | Dropbox Sign envelope creation/voiding (MSW mock) |
| Integration | `tests/integration/offers/expiry.test.ts` | Expiry cron detects and transitions offers |
| E2E | `tests/e2e/offers.spec.ts` | Full flow: create → approve → send → sign |

## 11. Open Questions

*(None — all questions resolved via G-010 and G-022)*

---

*Changelog: Created 2026-03-10*
