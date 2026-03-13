# Phase 6 Spec Writing Prompt — D30

> **Purpose:** This is a Claude Code session prompt. Read this entire file before doing anything else.
> **Task:** Write `docs/D30-PHASE6-CANDIDATE-INTELLIGENCE.md` — the Phase 6 spec doc.
> **Created by:** Post-Phase-5 architecture session (2026-03-12)

---

## 0. Session Start Protocol (MANDATORY — do not skip)

Before writing a single line of the spec, complete these reads in order:

```
1. docs/DEVLOG.md              → Read the top 3 entries only (last work done)
2. docs/INDEX.md               → Read fully (doc statuses, numbering, what exists)
3. docs/CLAUDE.md              → Read fully (resolved ADRs, anti-drift rules, ADR-011)
4. docs/AI-RULES.md            → Read §13 (post-build audit) and §21 (pre-start gate)
5. docs/ADRs/011-ai-first-build-pivot.md → Read fully (this governs every feature in Phase 6)
6. docs/modules/CANDIDATE-PORTAL.md (D09) → Read fully (§6 Status Tracker, §13 Inngest)
7. docs/modules/OFFERS.md (D06) → Read §4.2 (Dropbox Sign stub), §6 (Inngest functions)
8. docs/HARDENING.md           → Read H1-3 (fuzzy dedup — Phase 6 completes the merge UI)
9. docs/INNGEST-REGISTRY.md (D29) → Read §4.2 (offers/esign-webhook stub), §4.3 (interviews)
10. docs/TESTING-STRATEGY.md (D24) → Read §5.1, §6.2, §12 (test plan requirements)
11. docs/ADRs/004-testing-strategy.md → Read fully
12. src/__fixtures__/golden-tenant.ts → Verify fixture UUIDs before writing any test plan
```

After each read, state what you learned that is relevant to Phase 6.

---

## 1. Pre-Start Gate (§21) — Run Before Writing

Run all 6 gate checks (G1–G6) and state PASS/FAIL for each:

- **G1:** No unresolved [VERIFY] markers in docs this spec depends on (D09, D06, D08)
- **G2:** All upstream specs that Phase 6 depends on are Complete status in INDEX.md
- **G3:** No open gaps in GAPS.md tagged to Phase 6 target docs
- **G4:** Current test count — run `npm test` or state last known count from DEVLOG (1271 total: 1203 Vitest + 68 E2E)
- **G5:** Git status clean — no uncommitted Phase 5 work
- **G6:** CLAUDE.md current state matches what DEVLOG says (Phase 5 ✅ COMPLETE, Phase 6 ← NEXT)

---

## 2. What You Are Building

**Document to create:** `docs/D30-PHASE6-CANDIDATE-INTELLIGENCE.md`

**Document ID:** D30
**Phase codename:** Candidate Intelligence Layer
**Theme:** AI-first candidate experience — every candidate-facing and candidate-data surface gets an AI layer. No CRUD-only features. No "AI deferred to v2." (ADR-011 §1–7)

---

## 3. Scope Decision (Final — do not re-debate)

### IN Phase 6 (all 5 items ship)

| # | Item | Wave | AI-First Angle | Completion Type |
|---|------|------|----------------|-----------------|
| 1 | Resume PDF extraction pipeline | P6-1 | This IS the AI data layer — all matching quality depends on it | Spec + spike decision + build |
| 2 | Candidate Status Portal | P6-2 | AI-narrated status messages, not dumb stage labels | Completes D09 §6 (fully specced, just unbuilt) |
| 3 | Candidate Merge UI | P6-2 | AI confidence scoring on duplicate resolution | Completes H1-3 (warning exists, action doesn't) |
| 4 | Dropbox Sign full integration | P6-3 | AI offer letter content generation before send | Completes Phase 5 stub (Inngest function #10, #11) |
| 5 | Conversational AI Screening v1 | P6-4 | This IS the headline AI differentiator — replaces legacy screening forms | New surface — structured multi-turn, not free-form |

### OUT of Phase 6

| Item | Reason | Target |
|------|--------|--------|
| SMS notifications | D08 explicitly marks out-of-scope. No AI angle. TCPA/GDPR compliance adds scope. | Phase 7 |
| Conversational AI Screening v2 (free-form) | Legal/moderation risk of fully open-ended AI conversation in hiring. v1 ships structured questions. | Phase 7 |
| Nylas calendar full activation | V-011/V-012 still unverified. Complex. | Phase 7 (v2.0) |

---

## 4. Wave Breakdown

### Wave P6-1 — AI Foundation (Resume Extraction)

**Deliverable:** A working resume parsing pipeline that extracts structured data from PDF and DOCX resumes uploaded via the candidate portal.

**Why first:** Every other AI feature in Phase 6 (screening, status narration, merge confidence) relies on having clean structured candidate data. If resume parsing is poor, match scores are poor, screening questions are poorly targeted, and merge confidence is unreliable. This is the data foundation.

**The spike:** D09 §13 specs the `portal-resume-parse` Inngest function but doesn't decide the extraction approach. The spec must resolve this:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **OpenAI vision** | Convert PDF pages to images, pass to GPT-4o vision | Handles complex layouts, tables, graphics | Expensive per resume (~$0.03–0.10), slow |
| **pdf-parse + GPT-4o** | Extract raw text with `pdf-parse` (npm), then GPT-4o structured output | Fast, cheap text layer, AI cleans structure | Fails on image-only PDFs, scanned docs |
| **Hybrid (recommended)** | Try `pdf-parse` first; if text < 200 chars (likely scanned), fall back to OpenAI vision | Best coverage, cost-optimized | Slightly more complex code path |
| **Firecrawl** | External service for document extraction | Handles edge cases | External dependency, latency, cost |

**Spec must define:**
- Extraction approach (recommend the hybrid model above — spec should justify this)
- Structured output schema (what fields GPT-4o extracts: name, email, phone, linkedin, skills[], experience[], education[], summary)
- Zod schema for the extraction output (strict — used for type safety downstream)
- Error handling: what happens if extraction fails (keep raw text, mark `resume_parsed = false`, don't block application)
- Credit cost: resume parsing costs 2 AI credits (already defined in D10's CREDIT_WEIGHTS)
- The `portal-resume-parse` Inngest function steps (already stubbed in D09 §13 — spec fully fleshes it out)
- Integration: parsed skills feed into `candidate_skills` table, triggering embedding refresh (H2-1 Inngest function already exists)
- New column needed: `candidates.resume_parsed_data JSONB` — structured extraction result
- Migration: `00030_phase6_foundation.sql`

**Tests (ADR-004 Tier 1):**
- Unit: extraction output Zod validation (valid resume, malformed resume, empty text fallback)
- Unit: hybrid switching logic (text length threshold, fallback trigger)
- Inngest: mock OpenAI response, verify `candidate_skills` upsert fires
- Integration: end-to-end upload → parse → skills appear on candidate profile

---

### Wave P6-2 — Candidate Experience (Portal + Merge UI)

#### P6-2a: Candidate Status Portal

**What exists:** D09 §6 has the COMPLETE spec. The status page design, polling hook, stage label mapping, withdrawal flow — all designed. Just unbuilt.

**What Phase 6 adds beyond the D09 spec (the AI layer):**

The D09 spec shows raw stage transitions. Phase 6 adds AI-narrated status updates — the candidate doesn't see "Under Review," they see a human-readable message generated by GPT-4o-mini.

```
Legacy ATS:   "Under Review"
Eligeo v1.1:  "Your application is with the hiring team. They've reviewed your resume
               and your background in [skill] aligns well with what they're looking for."
```

The spec must define:
- `generateCandidateStatusNarration(application, stage, org)` in `src/lib/ai/generate.ts`
  - Input: current stage type, days in stage, any public-safe recruiter notes (opt-in), job title, org name
  - Output: 1–2 sentence human-readable status update (warm, professional, non-committal on outcome)
  - Model: gpt-4o-mini (no credit cost to candidate — org absorbs as 0.5 AI credit on status view, max 1/week)
  - Constraints: never reveal internal notes, never imply acceptance/rejection, never mention specific dates
- New API endpoint: `GET /api/v1/portal/status` already in D09 — spec adds `ai_narration` field to response
- Caching: narration cached in `applications.metadata.status_narration` — regenerate only when stage changes (not on every poll)
- Fallback: if AI generation fails or org has 0 credits, show D09's plain stage label (graceful degradation)
- Plan gating: AI narration on Growth+ only. Starter shows plain labels.
- EU AI Act disclosure: already in portal form (H4-3). Status page adds subtle "ⓘ Status updates are AI-assisted" tooltip (Growth+ only).

**New schema:** No new tables. `applications.metadata` JSONB stores `status_narration` and `narration_generated_at`. Already a JSONB column.

**Inngest:** No new function. Narration generated synchronously in the status API route (fast — gpt-4o-mini < 500ms) or lazily on stage change via `workflow/stage-changed` event.

**Tests:**
- Unit: `generateCandidateStatusNarration()` — all 7 stage types, credit-exhausted fallback, plain label fallback
- Integration: status page returns `ai_narration` on Growth+ org, plain label on Starter
- RLS: status page token scope (`scope: 'status'`) enforced — no cross-application data
- E2E: candidate clicks magic link → sees AI-narrated status (Growth+ org)

#### P6-2b: Candidate Merge UI

**What exists:** H1-3 shipped `findPossibleDuplicates()` — detects potential duplicates by name+phone, name+LinkedIn, or phone alone. Returns up to 5 potential matches. The UI shows a "Possible duplicate" warning banner. The merge **action** doesn't exist.

**What Phase 6 builds:**

The merge flow: recruiter sees warning → clicks "Review duplicates" → merge modal opens → AI confidence scoring shown → recruiter confirms → server action executes merge.

**Spec must define:**

Schema additions (new migration):
```sql
-- Track merge history for audit trail
CREATE TABLE candidate_merges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  primary_id        UUID NOT NULL REFERENCES candidates(id),   -- kept record
  secondary_id      UUID NOT NULL REFERENCES candidates(id),   -- deleted/merged
  merged_by         UUID NOT NULL REFERENCES auth.users(id),
  ai_confidence     NUMERIC(3,2),   -- 0.00–1.00 AI confidence score
  merge_reason      TEXT,           -- recruiter-entered reason (optional)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

AI confidence scoring:
- `scoreMergeCandidates(candidateA, candidateB, org_id)` in `src/lib/ai/generate.ts`
- Inputs: full_name, email, phone, linkedin_url, skills[], last_employer, resume_text (first 500 chars)
- Output: `{ confidence: number, reasoning: string, signals: string[] }`
- Model: gpt-4o-mini
- Credit cost: 1 AI credit (merge_score added to CREDIT_WEIGHTS)
- Result shown in merge modal: "87% confident — same person. Matching phone number and LinkedIn URL."

Merge Server Action `mergeCandidate(primaryId, secondaryId, orgId)`:
- All `applications` on secondaryId repointed to primaryId (if no duplicate job_opening_id)
- All `candidate_skills` merged (union, deduplicated)
- All `candidate_notes` repointed
- All `files` repointed
- `candidate_merges` row created for audit trail
- Secondary candidate soft-deleted (`deleted_at = NOW()`)
- Primary candidate embedding refreshed (fire `ats/candidate.skills_updated`)
- Wrapped in RPC for atomicity: `merge_candidates(p_primary_id, p_secondary_id, p_org_id, p_merged_by)`

Conflict resolution rules:
- Same job application: keep primary's application, soft-delete secondary's
- Conflicting emails: keep both in a `previous_emails` JSONB field on primary
- Resume: keep most recently uploaded (by `files.created_at`)

UI:
- `MergeModal` component: side-by-side candidate comparison, AI confidence badge, signals list, "Keep this record" selector, confirm/cancel
- `CandidateCard` shows "Possible duplicate" warning badge when `findPossibleDuplicates()` returns results

**Tests:**
- Unit: merge conflict resolution (duplicate job applications, conflicting emails)
- Unit: `scoreMergeCandidates()` with high-confidence pair, low-confidence pair
- Integration: full merge — verify secondary soft-deleted, applications repointed, embedding refresh triggered
- RLS: `candidate_merges` — 4 ops × 2 tenants. Tenant A cannot see Tenant B merges.
- E2E: warning banner → merge modal → confirm → secondary candidate gone from list

---

### Wave P6-3 — Dropbox Sign Full Integration

**What exists:**
- `offers/send-esign` Inngest function (#10 in D29) — re-registered Phase 5 B5-6, creates a **stub** envelope
- `offers/esign-webhook` Inngest function (#11 in D29) — registered, handles `dropboxsign/webhook.received`, **stub**
- `offers/withdraw` Inngest function (#13) — calls "void e-sign envelope (stub)"
- D06 §4.2: full spec of the e-sign flow including retry logic and Dropbox Sign unavailability handling (G-010 resolved)
- `POST /api/v1/webhooks/dropbox-sign/route.ts` — needs to be created (not yet in codebase, analogous to Stripe webhook)

**What Phase 6 builds:**

The spec must define the actual Dropbox Sign API integration replacing every stub:

**1. Envelope creation** (`offers/send-esign` Inngest function — replace stub):
```typescript
// Replace stub with real Dropbox Sign API call
const response = await dropboxSign.signatureRequest.sendWithTemplate({
  templateIds: [org.dropbox_sign_template_id],
  subject: `Offer Letter — ${offer.job_title}`,
  message: `Please review and sign your offer letter from ${org.name}.`,
  signers: [{
    emailAddress: candidate.email,
    name: candidate.full_name,
    role: 'Candidate',
  }],
  customFields: [
    { name: 'candidate_name', value: candidate.full_name },
    { name: 'job_title', value: offer.job_title },
    { name: 'start_date', value: offer.start_date },
    { name: 'base_salary', value: formatCurrency(offer.compensation.base_salary, offer.compensation.currency) },
    // ... all compensation fields
  ],
  metadata: {
    ats_offer_id: offer.id,
    ats_org_id: offer.organization_id,
  },
});
// Store signature_request_id in offers.esign_envelope_id
```

**2. Webhook receiver** (`POST /api/v1/webhooks/dropbox-sign/route.ts`):
- Verify Dropbox Sign HMAC signature (V-mark in D06 §9 — needs resolving)
- Map event types to Inngest events:
  - `signature_request_signed` → `dropboxsign/webhook.received` (status: signed)
  - `signature_request_declined` → `dropboxsign/webhook.received` (status: declined)
  - `signature_request_expired` → `dropboxsign/webhook.received` (status: expired — handled by expiry cron)
  - `signature_request_canceled` → `dropboxsign/webhook.received` (status: voided)
- Return 200 immediately, process async via Inngest (same pattern as Stripe webhook)

**3. Envelope voiding** (`offers/withdraw` Inngest function — replace stub):
```typescript
if (offer.esign_envelope_id) {
  await dropboxSign.signatureRequest.cancel(offer.esign_envelope_id);
}
```

**4. AI offer letter content** (the AI-first angle):
- `generateOfferLetterContent(offer, candidate, job, org)` in `src/lib/ai/generate.ts`
- Input: compensation object, job title, start date, org name, custom terms
- Output: formatted offer letter body text (professional, warm, legally neutral)
- Model: gpt-4o (longer context, higher quality — this is a legal-adjacent document)
- Credit cost: 3 AI credits (offer_letter_draft already in CREDIT_WEIGHTS per D10)
- Gating: Pro+ only. Growth tier uses a static template.
- The generated content is loaded into the Dropbox Sign template's custom fields
- Recruiter can edit before sending (shown in a preview modal)

**New env vars needed (add to .env.example):**
```
DROPBOX_SIGN_API_KEY=           # Required v1.0 (Pro+)
DROPBOX_SIGN_WEBHOOK_SECRET=    # Required v1.0 (Pro+)
DROPBOX_SIGN_TEMPLATE_ID=       # Default template ID
```

**Schema:** No new tables. `offers.esign_envelope_id` already exists (D01). V-mark V-DSIGN-001: verify Dropbox Sign Node SDK package name (`@hellosign/openapi-javascript-sdk` or `hellosign-sdk`).

**Tests:**
- Unit: webhook signature verification (valid HMAC, invalid HMAC, missing header)
- Unit: event type → offer status mapping (signed, declined, voided)
- Inngest: mock Dropbox Sign API, verify `esign_envelope_id` stored on send
- Inngest: mock signed event, verify offer transitions `sent → signed`
- Inngest: withdraw with active envelope — verify cancel called
- Integration: offer `approved → sent → signed` end-to-end (MSW mock for Dropbox Sign)
- E2E: send offer → candidate signs (simulated) → ATS shows signed status

---

### Wave P6-4 — Conversational AI Screening v1

**This is Phase 6's headline AI-first feature.** Every legacy ATS sends a screening form. Eligeo conducts an AI-orchestrated screening conversation — async, candidate-paced, stored for recruiter review.

**Why v1 is structured (not free-form):**
- Legal risk: fully open-ended AI conversation in hiring can produce discriminatory outputs (age, family status, nationality) even with guardrails. Structured question sets are easier to audit.
- Recruiter control: recruiters define the question set. AI generates natural language versions of their questions, follows up on short answers, and summarizes — but doesn't go off-script.
- Data quality: structured turns produce comparable data across candidates. Free-form produces unstructured text harder to normalize.

**V2 (Phase 7):** Full free-form conversation with AI-generated questions, topic exploration, and dynamic follow-ups based on resume content.

**Spec must define:**

**New schema (Migration 030 or 031):**
```sql
-- Recruiter-defined screening configuration per job
CREATE TABLE screening_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  job_opening_id   UUID NOT NULL REFERENCES job_openings(id),
  questions        JSONB NOT NULL DEFAULT '[]',  -- ScreeningQuestion[]
  instructions     TEXT,  -- AI tone/persona instructions for this job
  max_duration_min INTEGER NOT NULL DEFAULT 15,  -- estimated completion time
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (organization_id, job_opening_id)
);

-- Individual screening sessions (one per application that goes through screening)
CREATE TABLE screening_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  application_id   UUID NOT NULL REFERENCES applications(id),
  candidate_id     UUID NOT NULL REFERENCES candidates(id),
  config_id        UUID NOT NULL REFERENCES screening_configs(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned', 'skipped')),
  turns            JSONB NOT NULL DEFAULT '[]',  -- ScreeningTurn[]
  ai_summary       TEXT,         -- Generated after completion
  ai_score         NUMERIC(3,2), -- 0.00–1.00 overall screening score
  score_breakdown  JSONB,        -- Per-question scores
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
```

**TypeScript types:**
```typescript
interface ScreeningQuestion {
  id: string;          // UUID
  order: number;
  topic: string;       // e.g., "Technical background", "Remote work"
  raw_question: string; // Recruiter's plain text question
  is_required: boolean;
  scoring_criteria?: string; // What a "good" answer looks like (optional)
}

interface ScreeningTurn {
  id: string;
  question_id: string;
  ai_question_text: string;  // AI's natural-language phrasing
  candidate_answer: string;
  ai_follow_up?: string;     // If answer was < 50 chars or unclear
  candidate_follow_up_answer?: string;
  turn_score?: number;       // 0–1 per-question score (filled after completion)
  timestamp: string;
}
```

**The AI orchestration** (`screening/conduct-session` Inngest function):

The core of the feature. This is NOT a real-time chat — it's async:
1. Candidate receives screening invite email with magic link (new token scope: `screening`)
2. Candidate opens the screening page — sees all questions displayed as natural conversation
3. Candidate types answers at their own pace (no time pressure, can leave and return)
4. After submitting all answers, AI generates summary + score
5. Recruiter sees results in candidate profile

```
screening/conduct-session Inngest function:
  Trigger: ats/screening.response-submitted
  Step 1: Load session, config, candidate
  Step 2: For each question, call generateScreeningQuestion() to get AI phrasing
  Step 3: Check if follow-up needed (answer < 50 chars OR answer fails to address question)
  Step 4: If all questions answered: call generateScreeningSummary()
  Step 5: Store ai_summary + ai_score on session
  Step 6: Fire ats/screening.completed → notify recruiter
```

**AI functions in `src/lib/ai/generate.ts`:**

```typescript
// Rephrase recruiter's raw question into natural conversational language
generateScreeningQuestion(rawQuestion: string, jobTitle: string, orgInstructions?: string)
  → { question_text: string }
  Model: gpt-4o-mini | Credits: 0 (amortized into session cost)

// Decide if a follow-up is warranted
evaluateCandidateAnswer(question: ScreeningQuestion, answer: string)
  → { needs_followup: boolean, followup_text?: string, preliminary_score: number }
  Model: gpt-4o-mini | Credits: 0 (amortized)

// After all answers: generate recruiter-facing summary + overall score
generateScreeningSummary(session: ScreeningSession, config: ScreeningConfig)
  → { summary: string, overall_score: number, score_breakdown: Record<string, number>, key_signals: string[] }
  Model: gpt-4o | Credits: 5 (screening_summary in CREDIT_WEIGHTS)
```

**Credit model:** Each completed screening session costs 5 AI credits (the summary generation). Individual question rephrasing and answer evaluation are batched into this cost. Displayed to recruiter as "5 credits used — screening completed."

**Plan gating:** Growth+ only. Starter shows a static screening form (no AI orchestration, just a form with recruiter's raw questions — no AI rephrasing, no scoring, no summary). This is a meaningful plan upgrade driver.

**EU AI Act (H4-3 extension):** Screening page includes disclosure: "You are being screened by an AI system on behalf of {org_name}. A human recruiter will review all AI assessments. You may request human-only review." The `human_review_requested` flag (already in applications table from H4-3) is accessible from the screening page.

**Candidate portal integration:**
- New route: `/careers/{slug}/screen/{applicationId}?token={jwt}`
- New token scope: `screening` (30-day expiry — same as `status`)
- Screening invite email sent automatically when application enters a stage configured for screening (configurable per pipeline stage)
- Status tracker shows "Screening in progress" / "Screening complete" as timeline events

**Recruiter-side UI:**
- Screening config builder in job settings: add questions, set instructions, enable/disable
- Candidate profile shows screening results card: score badge, summary, per-question breakdown, full transcript
- Command bar: "View screening for [candidate name]" → opens screening results

**Inngest functions:**
- `screening/invite-candidate` — triggered when application enters a screening-configured stage
- `screening/conduct-session` — triggered on each response submission, orchestrates follow-ups
- `screening/generate-summary` — triggered when all questions answered
- `screening/send-reminder` — cron or delayed event: nudge if screening not started in 48h

**Tests:**
- Unit: `generateScreeningQuestion()` — valid rephrasing, EU Act disclosure present
- Unit: `evaluateCandidateAnswer()` — short answer triggers follow-up, sufficient answer does not
- Unit: `generateScreeningSummary()` — score range 0–1, summary non-empty, key_signals populated
- Unit: session status machine (pending → in_progress → completed, abandoned path)
- RLS: `screening_configs` — 4 ops × 2 tenants (recruiter can create, hiring manager can view, interviewer cannot)
- RLS: `screening_sessions` — 4 ops × 2 tenants
- Inngest: invite fires when application enters screening stage
- Inngest: summary generates when last question answered
- Integration: full screening flow (invite → answer all questions → summary generated → recruiter notified)
- E2E: candidate receives invite → completes screening → recruiter sees results in candidate profile

---

## 5. Document Structure for D30

Write `docs/D30-PHASE6-CANDIDATE-INTELLIGENCE.md` with these sections:

```
# Phase 6 — Candidate Intelligence Layer

> ID: D30
> Status: In Progress
> Priority: P0
> Last updated: [today]
> Depends on: D01, D03, D06, D08, D09, D10, D29
> Depended on by: [TBD Phase 7]
> Architecture decisions: ADR-001, ADR-004, ADR-006, ADR-007, ADR-008, ADR-009, ADR-010, ADR-011

## 1. Overview
## 2. User Stories (one table per wave)
## 3. Phase 6 Data Model (new tables, new columns, migration scope)
## 4. Wave P6-1: Resume Extraction Pipeline
   §4.1 Extraction approach (spike resolution)
   §4.2 Extraction output schema (Zod)
   §4.3 `portal-resume-parse` Inngest function (full steps)
   §4.4 Integration with candidate_skills + embedding refresh
   §4.5 Error handling + graceful degradation
## 5. Wave P6-2: Candidate Experience
   §5.1 Candidate Status Portal (building D09 §6)
   §5.2 AI status narration — generateCandidateStatusNarration()
   §5.3 Portal UI components
   §5.4 Candidate Merge UI — MergeModal
   §5.5 AI merge confidence — scoreMergeCandidates()
   §5.6 mergeCandidate() Server Action + merge_candidates() RPC
## 6. Wave P6-3: Dropbox Sign Full Integration
   §6.1 Envelope creation (real API, not stub)
   §6.2 Webhook receiver (/api/v1/webhooks/dropbox-sign)
   §6.3 Envelope voiding on withdrawal
   §6.4 AI offer letter generation (Pro+)
   §6.5 dropbox-sign MSW handler (for tests)
## 7. Wave P6-4: Conversational AI Screening v1
   §7.1 Architecture overview (async, structured)
   §7.2 Schema: screening_configs + screening_sessions
   §7.3 AI orchestration — the 4 AI functions
   §7.4 Credit model + plan gating
   §7.5 Candidate screening portal flow
   §7.6 Recruiter screening config UI + results view
   §7.7 Inngest functions (4 functions)
   §7.8 EU AI Act compliance
## 8. API Endpoints (all 4 waves combined)
## 9. Inngest Function Summary (new functions, updated stubs)
## 10. Migration Scope
    §10.1 00030_phase6_foundation.sql (Wave P6-1 + P6-2 tables/columns)
    §10.2 00031_phase6_screening.sql (Wave P6-4 screening tables)
## 11. Test Plan (ADR-004 declaration)
    §11.1 Coverage targets (D24 §5.1)
    §11.2 RLS matrix (D24 §6.2) — new tables: screening_configs, screening_sessions, candidate_merges
    §11.3 Estimated test count per category
    §11.4 Golden tenant fixture additions needed (screening fixtures)
## 12. UI Components
## 13. Edge Cases
## 14. Security Considerations
    §14.1 Screening session token security
    §14.2 AI output guardrails (discriminatory question detection)
    §14.3 Dropbox Sign webhook security
## 15. AI Ethics & Compliance
    §15.1 EU AI Act obligations for screening AI
    §15.2 Human review override mechanism
    §15.3 Bias monitoring (what metrics to track)
## 16. Open Questions
```

---

## 6. ADR-011 Compliance Check (apply to every section you write)

Before finalizing each wave section, verify all 7 ADR-011 rules:

1. **No CRUD-only features** — every feature has AI path: ✅ all 5 items have explicit AI angle
2. **Command bar is primary** — each wave must define command bar intent patterns
3. **No "coming soon" dead-ends** — every UI component ships with the wave or is explicitly phase-targeted
4. **No "v2.0 on AI features"** — AI screening is v1.0, not "coming in v2.0"
5. **AI env vars are active** — DROPBOX_SIGN_API_KEY is v1.0 active, add to .env.example as required
6. **Scan code artifacts on pivot** — when adding screening, check for any "no AI screening" comments in existing code
7. **Every new page gets AI consideration** — screening config page, status portal, merge modal must each answer "how does command bar handle this?"

**Command bar intents to define (add to existing intent registry):**
```
"screen [candidate name] for [job]"        → open screening config, pre-select candidate
"view screening results for [candidate]"   → open screening results card
"merge [candidate A] with [candidate B]"   → open merge modal
"send offer to [candidate]"                → navigate to offer send flow
"check application status [candidate]"     → recruiter view of candidate's portal status
```

---

## 7. Test Plan Declaration (ADR-004 — state upfront before writing any code sections)

State the full test plan in D30 §11 before writing any implementation sections.

**Estimated new test counts:**

| Category | Wave | Estimated Count |
|----------|------|----------------|
| Unit — resume extraction | P6-1 | ~12 |
| Unit — AI functions (narration, merge score, screening) | P6-2/4 | ~25 |
| Unit — screening session state machine | P6-4 | ~10 |
| RLS — screening_configs (4 ops × 2 tenants) | P6-4 | ~8 |
| RLS — screening_sessions (4 ops × 2 tenants) | P6-4 | ~8 |
| RLS — candidate_merges (4 ops × 2 tenants) | P6-2 | ~8 |
| Integration — Dropbox Sign (MSW mock) | P6-3 | ~15 |
| Integration — full screening flow | P6-4 | ~10 |
| Integration — merge flow | P6-2 | ~8 |
| Inngest — all new functions | P6-1/3/4 | ~20 |
| E2E — candidate portal + screening | P6-2/4 | ~10 |
| **Total estimated** | | **~134** |

Target: 1271 → ~1405 total tests after Phase 6.

**Golden tenant fixture additions needed:**
- `SCREENING_CONFIG_ID` — a screening config on TENANT_A's first job
- `SCREENING_SESSION_ID` — a completed session for TENANT_A candidate
- `MERGE_TARGET_CANDIDATE_ID` — a duplicate candidate for merge testing
- `ESIGN_ENVELOPE_ID` — a mock Dropbox Sign envelope ID for offer tests

---

## 8. Migration Scope Declaration

**Migration 00030** — `supabase/migrations/00030_phase6_foundation.sql`:
- New column: `candidates.resume_parsed_data JSONB`
- New table: `candidate_merges` (with RLS + audit trigger)
- New table: `screening_configs` (with RLS + audit trigger)
- New table: `screening_sessions` (with RLS + audit trigger)
- New RPC: `merge_candidates(p_primary_id, p_secondary_id, p_org_id, p_merged_by)`
- Indexes: `idx_screening_sessions_application`, `idx_screening_configs_job`

ADR checks for M030:
- ADR-006: `deleted_at` on `candidate_merges`? No — merge records are immutable audit records, no soft delete needed (exception like `audit_logs`)
- ADR-006: `deleted_at` on `screening_configs`? Yes — recruiters can deactivate configs
- ADR-006: `deleted_at` on `screening_sessions`? Yes
- ADR-007: audit triggers on all 3 new tables
- ADR-008: `status` column uses CHECK constraint, not PG ENUM

---

## 9. What to Do After Writing D30

1. Run §13 post-build audit on D30 itself (before any code is written)
2. Add D30 to `docs/INDEX.md` under new section "## Phase 6 — Candidate Intelligence"
3. Add DEVLOG entry: "2026-03-XX — Phase 6 Spec D30 written"
4. Update CLAUDE.md current state from "Phase 6 ← NEXT" to "Phase 6 → In Progress (D30 written)"
5. Update D29 (INNGEST-REGISTRY.md) to add 7 new Phase 6 functions to the registry
6. Run pre-start gate §21 one more time before writing any code
7. Begin Wave P6-1 (resume extraction) — the foundation everything else depends on

---

## 10. Key Constraints (do not violate)

- **No Prisma.** Supabase client everywhere. Background jobs: service role. (ADR-001)
- **Middleware file is `proxy.ts`, not `middleware.ts`.** (ADR-002)
- **HNSW only.** No IVFFlat. Screening session embeddings (if added) use HNSW. (ADR-003)
- **`last_active_org_id` pattern for multi-org.** (ADR-005)
- **`deleted_at` on all new tables** unless they're immutable audit records. (ADR-006)
- **Audit trigger on all new tables.** Call `audit_trigger_func()`. (ADR-007)
- **CHECK constraints, not PG ENUMs.** (ADR-008)
- **Files metadata table, not inline URL columns.** (ADR-009)
- **GDPR: screening sessions contain PII** — `erase_candidate()` must be updated to include `screening_sessions` in its erasure scope. This is a compliance requirement, not optional.
- **OpenAI API** for all AI. No Anthropic API, no other providers. (ADR-011 stack decision)
- **Next migration is 00030.** Previous was 00029 (hardening). Do not skip numbers.
- **Test count must not decrease.** Current baseline: 1271 total. (pre-commit gate)

---

*This prompt was generated by post-Phase-5 architecture session — 2026-03-12*
*Scope decision owner: Senthil (Localvector)*
*Next session should produce: `docs/D30-PHASE6-CANDIDATE-INTELLIGENCE.md`*
