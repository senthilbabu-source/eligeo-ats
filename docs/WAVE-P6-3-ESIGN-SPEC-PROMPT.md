# Wave P6-3: Dropbox Sign Full Integration — Build Prompt

## Context

You are building Wave P6-3 of the Eligeo ATS. Read these files before writing any code:

1. `docs/CLAUDE.md` — architecture rules, ADRs, mandatory pre-task gates
2. `docs/AI-RULES.md` — all 90 rules (§1–§21)
3. `docs/modules/PHASE6-CANDIDATE-INTELLIGENCE.md` — D32 spec (§6 is P6-3)
4. `docs/TESTING-STRATEGY.md` — D24 (full doc)
5. `docs/ADRs/004-testing-strategy.md` — ADR-004
6. `src/__fixtures__/golden-tenant.ts` — fixture UUIDs
7. `supabase/seed.sql` — verify fixture UUIDs
8. `src/inngest/functions/offers/send-esign.ts` — existing stub to replace
9. `src/lib/ai/generate.ts` — `generateOfferLetterContent()` already exists (H6-5)
10. `src/app/api/webhooks/stripe/route.ts` — pattern for webhook receiver

## Pre-Start Gate (§21)

Run all 6 checks (G1–G6) and state results before writing any code.

## What P6-3 Builds

Replace all Dropbox Sign stubs with real API integration. Three areas:

### 1. Replace `offers/send-esign` Inngest stub

File: `src/inngest/functions/offers/send-esign.ts`

Replace the stub steps with real Dropbox Sign API calls using `@dropbox/sign` npm package:

```typescript
import * as DropboxSign from "@dropbox/sign";

const dropboxSign = new DropboxSign.SignatureRequestApi();
dropboxSign.username = process.env.DROPBOX_SIGN_API_KEY!;
```

Steps:
1. **load-offer** — fetch offer + candidate + org + compensation from Supabase (service role)
2. **generate-letter** — call `generateOfferLetterContent()` (already in `generate.ts`) for Pro+ orgs. Build template custom fields for all plans.
3. **create-envelope** — call `signatureRequest.sendWithTemplate()` with:
   - `templateIds: [org.dropbox_sign_template_id ?? process.env.DROPBOX_SIGN_TEMPLATE_ID]`
   - `subject`: `Offer Letter — ${offer.job_title}`
   - `message`: `Please review and sign your offer letter from ${org.name}.`
   - `signers`: `[{ emailAddress: candidate.email, name: candidate.full_name, role: 'Candidate' }]`
   - `customFields`: candidate_name, job_title, start_date, base_salary + currency, offer_letter_body (AI-generated or empty)
   - `metadata`: `{ ats_offer_id: offer.id, ats_org_id: offer.organization_id }`
   - Store returned `signature_request_id` in `offers.esign_envelope_id`
4. **update-status** — update offer to `sent`, set `sent_at = NOW()`
5. **notify** — send notification to recruiter via existing notification system

**Plan gating:** AI letter generation (step 2) only for `pro` and `enterprise` plan orgs. Growth uses static template fields only.

**Error handling:** If Dropbox Sign API call fails, keep offer in `approved` state, notify recruiter. Retries: 5 with exponential backoff (already configured on the function).

### 2. Replace `offers/esign-webhook` stub

**New file:** `src/app/api/webhooks/dropbox-sign/route.ts`

Note: D32 says `/api/v1/webhooks/dropbox-sign/route.ts` but use `/api/webhooks/dropbox-sign/route.ts` to match the existing Stripe webhook pattern at `/api/webhooks/stripe/route.ts`.

**HMAC verification:**
```typescript
import crypto from "crypto";

function verifyDropboxSignWebhook(payload: string, signature: string): boolean {
  if (!process.env.DROPBOX_SIGN_WEBHOOK_SECRET) return false;
  const expected = crypto
    .createHmac("sha256", process.env.DROPBOX_SIGN_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
```

**Pattern:** Identical to Stripe — verify signature, return 200 immediately, fire Inngest event for async processing.

**Event mapping:**
| Dropbox Sign Event | Inngest Event | Offer Transition |
|---|---|---|
| `signature_request_signed` | `dropboxsign/webhook.received` | `sent → signed` |
| `signature_request_declined` | `dropboxsign/webhook.received` | `sent → declined` |
| `signature_request_canceled` | `dropboxsign/webhook.received` | `sent → withdrawn` |

**New Inngest function:** `src/inngest/functions/offers/process-esign-webhook.ts`
- Triggered by `dropboxsign/webhook.received`
- Reads `metadata.ats_offer_id` from the event
- Updates offer status accordingly
- Fires notification to recruiter + candidate

### 3. Replace `offers/withdraw` void stub

File: `src/inngest/functions/offers/withdraw.ts` (or wherever the withdraw logic lives — find it)

Add real envelope cancellation:
```typescript
if (offer.esign_envelope_id) {
  const dropboxSign = new DropboxSign.SignatureRequestApi();
  dropboxSign.username = process.env.DROPBOX_SIGN_API_KEY!;
  await dropboxSign.cancel(offer.esign_envelope_id);
}
```

### 4. AI Offer Letter Preview Modal (Pro+)

Before the recruiter hits Send, show a preview modal with the AI-generated offer letter content. The recruiter can edit before the envelope is created.

- Component: `src/components/offers/offer-letter-preview-modal.tsx`
- Wired into the Send flow in `offers/new/offer-form.tsx` (the Send button that fires `approved → send-requested`)
- Plan gated: Pro+ only. Growth users skip the modal and go straight to send.
- Command bar: add intent `send_offer` → opens Send flow

### 5. MSW Handler for Tests

New file: `src/__mocks__/handlers/dropbox-sign.ts`

```typescript
export const dropboxSignHandlers = [
  http.post('https://api.hellosign.com/v3/signature_request/send_with_template', () => {
    return HttpResponse.json({
      signature_request: {
        signature_request_id: 'mock-esign-001',
        title: 'Offer Letter',
        signing_url: 'https://app.hellosign.com/sign/mock',
      },
    });
  }),
  http.post('https://api.hellosign.com/v3/signature_request/cancel/:id', () => {
    return new HttpResponse(null, { status: 200 });
  }),
];
```

Register in `src/__tests__/setup/msw.ts` (or wherever MSW handlers are registered).

## No New Migration

P6-3 requires no new migration. The `offers` table already has `esign_envelope_id` (check — if missing, add as a migration `00032_esign_envelope.sql` with a single `ALTER TABLE offers ADD COLUMN IF NOT EXISTS esign_envelope_id TEXT`). The P6-4 screening migration is `00032_phase6_screening.sql` — do NOT create it here.

**Check first:** `grep -n "esign_envelope_id" supabase/migrations/*.sql` — if it exists, no migration needed.

## Environment Variables

Already in `.env.example` and `.env.local`:
- `DROPBOX_SIGN_API_KEY` ✅
- `DROPBOX_SIGN_WEBHOOK_SECRET` ✅ (blank until webhook URL is registered — that's fine)

Add to `.env.example` (not yet there):
- `DROPBOX_SIGN_TEMPLATE_ID=` — default template ID

## ADR-004 Test Plan (Declare Before Writing)

State these before writing any test:

**Tier 1 — Day 1 mandatory:**
- Unit tests for HMAC verification function (valid sig, invalid sig, missing secret)
- Unit tests for offer letter content builder (Pro+ with AI, Growth without)
- Unit tests for webhook event mapping (signed, declined, canceled)
- Inngest function tests for send-esign (mock Dropbox Sign API via MSW)
- Inngest function tests for process-esign-webhook (each event type)
- API integration test for webhook receiver (valid payload, invalid sig → 401)

**Estimated:** ~20 new tests

**RLS:** No new tables → no new RLS tests required. Existing `offers.rls.test.ts` covers the offers table.

## ADR Compliance Checks

- ADR-001: Supabase client only (service role in Inngest steps) ✅
- ADR-002: Next.js 16, middleware is `proxy.ts` ✅
- ADR-006: No new tables → soft delete N/A ✅
- ADR-007: No new tables → audit trigger N/A ✅
- ADR-008: No new enums ✅
- ADR-011: AI offer letter generation ships Day 1 (Pro+), not deferred ✅

## Definition of Done

- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` clean
- [ ] All existing tests pass + ~20 new tests added
- [ ] `send-esign.ts` stub replaced with real Dropbox Sign API calls
- [ ] `/api/webhooks/dropbox-sign/route.ts` created with HMAC verification
- [ ] `process-esign-webhook.ts` Inngest function created
- [ ] Offer withdraw voids envelope if `esign_envelope_id` is set
- [ ] AI offer letter preview modal ships for Pro+ before Send
- [ ] MSW handler for Dropbox Sign API
- [ ] DEVLOG.md entry at top
- [ ] Commit: `feat(offers): P6-3 Dropbox Sign full integration — real e-sign, webhook, AI letter preview`
