# Phase 6 — Candidate Intelligence Layer

> **ID:** D32
> **Status:** Complete (Review)
> **Priority:** P0
> **Last updated:** 2026-03-12
> **Depends on:** D01 (schema), D03 (billing — plan gating + credits), D06 (offers — e-sign stubs), D08 (notifications — candidate email), D09 (candidate portal — status tracker + magic link auth), D10 (search — embeddings + credit weights), D24 (testing strategy), D29 (Inngest registry)
> **Depended on by:** Phase 7 (SMS, Screening v2, Nylas calendar)
> **Architecture decisions assumed:** ADR-001, ADR-004, ADR-006, ADR-007, ADR-008, ADR-009, ADR-010, ADR-011, ADR-012

---

## 1. Overview

Phase 6 is the **Candidate Intelligence Layer** — every candidate-facing and candidate-data surface gets an AI layer. The theme is completing unfinished infrastructure (resume parsing, status portal, Dropbox Sign) while adding the headline AI differentiator (conversational screening).

**ADR-011 mandate:** No CRUD-only features. Every user-facing surface ships with an AI-assisted path. Every new page answers "how does the command bar handle this?"

### 1.1 Scope

**IN Phase 6 (all 6 items ship):**

| # | Item | Wave | AI-First Angle |
|---|------|------|----------------|
| 1 | Resume PDF extraction pipeline | P6-1 | AI data foundation — match quality depends on clean parsed data |
| 2 | Candidate Status Portal | P6-2a | AI-narrated status messages, not stage labels |
| 3 | Candidate Merge UI | P6-2b | AI confidence scoring on duplicate resolution |
| 4 | AI Batch Shortlisting Report | P6-5 | 5-dimension scoring, tier classification, EEOC compliance |
| 5 | Dropbox Sign full integration | P6-3 | AI offer letter generation before send |
| 6 | Conversational AI Screening v1 | P6-4 | AI-orchestrated structured screening — headline differentiator |

**OUT of Phase 6:**

| Item | Reason | Target |
|------|--------|--------|
| SMS notifications | D08 out-of-scope. TCPA/GDPR adds scope. | Phase 7 |
| Screening v2 (free-form) | Legal/moderation risk. v1 ships structured. | Phase 7 |
| Nylas calendar activation | V-011/V-012 unverified. Complex. | Phase 7 (v2.0) |

### 1.2 Migration Scope

- **Migration 00030** — `supabase/migrations/00030_phase6_foundation.sql` (Waves P6-1 + P6-2)
- **Migration 00031** — `supabase/migrations/00031_ai_shortlist_reports.sql` (Wave P6-5)
- **Migration 00032** — `supabase/migrations/00032_phase6_screening.sql` (Wave P6-4)

### 1.3 Estimated Delivery

5 waves, sequential. Each wave builds on the previous. Total: ~166 new tests.

---

## 2. User Stories

### Wave P6-1 — Resume Extraction

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| P6-US-01 | Candidate | Upload a resume and have it automatically parsed | Given I upload a PDF/DOCX resume, when the parse completes, then my skills, experience, and education are extracted |
| P6-US-02 | Recruiter | See structured resume data on candidate profile | Given a resume was parsed, when I view the profile, then I see extracted skills, experience, and education |
| P6-US-03 | System | Feed parsed skills into match scoring | Given skills are extracted, when embedding refreshes, then match scores reflect the new data |

### Wave P6-2 — Candidate Experience

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| P6-US-04 | Candidate | See AI-narrated status on my portal | Given I open my status page (Growth+), then I see a warm, context-aware status message |
| P6-US-05 | Candidate | Withdraw my application | Given I'm on the status page, when I click Withdraw, then my application status changes and I see confirmation |
| P6-US-06 | Recruiter | Merge duplicate candidates | Given a duplicate warning appears, when I click Review, then I see a side-by-side comparison with AI confidence score and can confirm the merge |
| P6-US-07 | Recruiter | See merge audit trail | Given candidates were merged, when I view the primary record, then I see the merge history |

### Wave P6-3 — E-Sign

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| P6-US-08 | Recruiter | Send an approved offer via Dropbox Sign | Given an offer is `approved`, when I click Send, then a Dropbox Sign envelope is created and candidate receives signing link |
| P6-US-09 | Candidate | Sign an offer electronically | Given I receive a signing request, when I sign in Dropbox Sign, then the ATS shows `signed` status |
| P6-US-10 | Recruiter | AI-generate offer letter content before send (Pro+) | Given I'm about to send, when I click Generate, then AI creates professional offer letter text I can edit |

### Wave P6-4 — AI Screening

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| P6-US-11 | Recruiter | Configure screening questions for a job | Given I'm in job settings, when I add questions and enable screening, then candidates entering the screening stage get invited |
| P6-US-12 | Candidate | Complete an AI-assisted screening (Growth+) | Given I receive a screening invite, when I answer all questions, then AI generates follow-ups for short answers and produces a summary |
| P6-US-13 | Recruiter | Review screening results on candidate profile | Given screening is complete, when I view the candidate, then I see score badge, summary, and per-question breakdown |
| P6-US-14 | Candidate | Request human-only review | Given I'm on the screening page, when I click "Request human review", then `human_review_requested` is set |

---

## 3. Phase 6 Data Model

### 3.1 New Tables

```sql
-- candidate_merges — audit trail for merged duplicates
-- ADR-006 exception: no deleted_at (immutable audit record, like audit_logs)
CREATE TABLE candidate_merges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  primary_id        UUID NOT NULL REFERENCES candidates(id),
  secondary_id      UUID NOT NULL REFERENCES candidates(id),
  merged_by         UUID NOT NULL REFERENCES auth.users(id),
  ai_confidence     NUMERIC(3,2),
  merge_reason      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- screening_configs — recruiter-defined screening per job
CREATE TABLE screening_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  job_opening_id   UUID NOT NULL REFERENCES job_openings(id),
  questions        JSONB NOT NULL DEFAULT '[]',
  instructions     TEXT,
  max_duration_min INTEGER NOT NULL DEFAULT 15,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (organization_id, job_opening_id)
);

-- screening_sessions — individual screening conversations
CREATE TABLE screening_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  application_id   UUID NOT NULL REFERENCES applications(id),
  candidate_id     UUID NOT NULL REFERENCES candidates(id),
  config_id        UUID NOT NULL REFERENCES screening_configs(id),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned', 'skipped')),
  turns            JSONB NOT NULL DEFAULT '[]',
  ai_summary       TEXT,
  ai_score         NUMERIC(3,2),
  score_breakdown  JSONB,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
```

### 3.2 New Columns

```sql
-- On candidates table (Migration 030)
-- NOTE: candidates.resume_parsed JSONB already exists (M009). Reused instead of adding resume_parsed_data.
-- Added: resume_parsed_at TIMESTAMPTZ (fixes H6-4 phantom reference)
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS resume_parsed_at TIMESTAMPTZ;
```

### 3.3 JSONB Type Definitions

```typescript
// candidates.resume_parsed_data — structured extraction result
interface ResumeParsedData {
  full_name?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  summary?: string;
  skills: string[];
  experience: Array<{
    title: string;
    company: string;
    start_date?: string;
    end_date?: string;
    description?: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year?: string;
    field?: string;
  }>;
  certifications?: string[];
  parsed_at: string; // ISO 8601
}

// screening_configs.questions
interface ScreeningQuestion {
  id: string;          // UUID
  order: number;
  topic: string;       // e.g., "Technical background"
  raw_question: string;
  is_required: boolean;
  scoring_criteria?: string;
}

// screening_sessions.turns
interface ScreeningTurn {
  id: string;
  question_id: string;
  ai_question_text: string;
  candidate_answer: string;
  ai_follow_up?: string;
  candidate_follow_up_answer?: string;
  turn_score?: number;
  timestamp: string;
}

// screening_sessions.score_breakdown
type ScoreBreakdown = Record<string, number>; // question_id → score (0–1)
```

### 3.4 RLS Policies

All new tables follow the standard pattern:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `candidate_merges` | `org_id = auth.org_id()` | `org_id = auth.org_id()` | None (immutable) | None (immutable) |
| `screening_configs` | `org_id = auth.org_id()` | `org_id = auth.org_id()` | `org_id = auth.org_id()` | `org_id = auth.org_id()` (soft delete) |
| `screening_sessions` | `org_id = auth.org_id()` | `org_id = auth.org_id()` | `org_id = auth.org_id()` | `org_id = auth.org_id()` (soft delete) |

ADR-007: Audit triggers on all 3 new tables.

### 3.5 Indexes

```sql
CREATE INDEX idx_candidate_merges_org ON candidate_merges(organization_id);
CREATE INDEX idx_candidate_merges_primary ON candidate_merges(primary_id);
CREATE INDEX idx_candidate_merges_secondary ON candidate_merges(secondary_id);
CREATE INDEX idx_screening_configs_job ON screening_configs(organization_id, job_opening_id);
CREATE INDEX idx_screening_sessions_application ON screening_sessions(application_id);
CREATE INDEX idx_screening_sessions_candidate ON screening_sessions(candidate_id);
CREATE INDEX idx_screening_sessions_status ON screening_sessions(organization_id, status);
```

---

## 4. Wave P6-1: Resume Extraction Pipeline

### 4.1 Extraction Approach — Hybrid Model

**Decision:** Use a hybrid approach — `pdf-parse` for text extraction first, fall back to OpenAI vision for scanned/image PDFs.

| Step | Condition | Action | Cost |
|------|-----------|--------|------|
| 1 | PDF uploaded | Extract text via `pdf-parse` | Free |
| 2 | Text length ≥ 200 chars | Pass text to GPT-4o structured output | 2 AI credits |
| 3 | Text length < 200 chars (scanned) | Convert first 3 pages to images, pass to GPT-4o vision | 2 AI credits |
| 4 | DOCX uploaded | Extract text via `mammoth` | Free |

**Justification:** `pdf-parse` handles 90%+ of resumes (most modern resumes are text-based PDFs). OpenAI vision is the fallback for scanned documents. This optimizes cost while maintaining coverage.

### 4.2 Extraction Output Schema (Zod)

```typescript
import { z } from "zod/v4";

export const resumeExtractionSchema = z.object({
  full_name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  linkedin_url: z.string().url().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    description: z.string().optional(),
  })),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string().optional(),
    field: z.string().optional(),
  })),
  certifications: z.array(z.string()).optional(),
});
```

### 4.3 `portal-resume-parse` Inngest Function

Completing D09 §13 stub. Trigger: `portal/application-submitted`.

```
Step 1: Load application + candidate + file record
Step 2: Download file from Supabase Storage
Step 3: Extract raw text (pdf-parse for PDF, mammoth for DOCX)
Step 4: If text < 200 chars → convert to images, use GPT-4o vision
Step 5: Call GPT-4o structured output with resumeExtractionSchema
Step 6: Validate output against Zod schema
Step 7: Store result in candidates.resume_parsed_data
Step 8: Upsert extracted skills into candidate_skills table
Step 9: Mark candidates.resume_parsed_at = NOW()
Step 10: Fire ats/candidate.skills_updated → triggers embedding refresh (H2-1)
```

**Error handling:** If extraction fails at any step, set `resume_parsed_data = { error: message, raw_text: extractedText }`. Do NOT block the application — the candidate record is still valid.

**Credit cost:** 2 AI credits per parse (already defined in D10 CREDIT_WEIGHTS as `resume_parse`).

### 4.4 Integration with candidate_skills + Embedding Refresh

Parsed skills feed directly into `candidate_skills`:
1. Parse result contains `skills: string[]`
2. For each skill, upsert into `skills` table (name-normalized)
3. Link to candidate via `candidate_skills` junction
4. Fire `ats/candidate.skills_updated` event
5. H2-1 Inngest function `candidates/embed-and-score` picks up event → refreshes embedding

This closes the loop: resume upload → skills extraction → embedding → match scoring.

### 4.5 Error Handling + Graceful Degradation

| Failure | Behavior | User Impact |
|---------|----------|-------------|
| PDF text extraction fails | Store raw error, skip AI step | Candidate created without parsed data |
| OpenAI API timeout/error | Retry 3x (Inngest default), then store error | Resume marked "parse failed" — recruiter can re-trigger manually |
| Zod validation fails | Log warning, store raw AI output in `resume_parsed_data.raw` | Partial data available |
| File not found in Storage | Log error, mark `resume_parsed = false` | No impact — candidate still has application |

---

## 5. Wave P6-2: Candidate Experience

### 5.1 Candidate Status Portal (Building D09 §6)

D09 §6 provides the complete spec for the status tracker. Phase 6 builds it as-specified with one enhancement: **AI-narrated status messages (Growth+)**.

**Route:** `/careers/{slug}/status?token={jwt}` (token scope: `status`, 30-day expiry per D09 §3.2)

**UI Components:**
- Application summary card (job title, applied date, org name)
- Pipeline progress indicator (horizontal, simplified stage labels per D09 §6.2)
- Chronological timeline of status changes
- Withdrawal button (D09 §6.4)
- Data deletion request (D13 GDPR)

### 5.2 AI Status Narration

**Function:** `generateCandidateStatusNarration()` in `src/lib/ai/generate.ts`

```typescript
async function generateCandidateStatusNarration(params: {
  stageType: string;        // sourced | applied | screening | interview | offer | hired | rejected
  daysInStage: number;
  jobTitle: string;
  orgName: string;
  organizationId: string;
  userId?: string;
}): Promise<{ narration: string; error?: string }>
```

- **Model:** gpt-4o-mini
- **Credit cost:** 0.5 AI credits (charged to org, not candidate). Max 1 narration per week per application.
- **Output:** 1–2 sentence warm, professional status update
- **Constraints:** Never reveal internal notes, never imply acceptance/rejection, never mention specific dates
- **Caching:** Stored in `applications.metadata.status_narration` + `narration_generated_at`. Regenerate only on stage change.
- **Plan gating:** Growth+ only. Starter shows D09's plain stage labels.
- **Fallback:** If AI fails or org has 0 credits → show D09 plain stage label

**EU AI Act disclosure:** Status page shows subtle "ⓘ Status updates are AI-assisted" tooltip (Growth+ only). Extends H4-3 compliance.

### 5.3 Portal UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `StatusPage` | `src/app/careers/[slug]/status/page.tsx` | Server component — validates token, fetches application data |
| `StatusTimeline` | `src/components/portal/status-timeline.tsx` | Client component — chronological events |
| `StatusNarration` | `src/components/portal/status-narration.tsx` | Server component — AI narration (Suspense-wrapped) |
| `WithdrawButton` | `src/components/portal/withdraw-button.tsx` | Client component — calls withdraw server action |

### 5.4 Candidate Merge UI — MergeModal

**Trigger:** Recruiter clicks "Review duplicates" on the duplicate warning banner (wired in H6-4).

**UI flow:**
1. Warning banner → "Review" button
2. `MergeModal` opens: side-by-side comparison of primary vs secondary candidate
3. AI confidence badge: "87% confident — same person"
4. Signal list: "Matching phone number", "Same LinkedIn URL", etc.
5. "Keep this record" selector (defaults to the record with more data)
6. Confirm/Cancel buttons

**Component:** `src/components/candidates/merge-modal.tsx` (client component)

### 5.5 AI Merge Confidence — `scoreMergeCandidates()`

```typescript
async function scoreMergeCandidates(params: {
  candidateA: { full_name: string; email?: string; phone?: string; linkedin_url?: string; skills?: string[]; current_company?: string };
  candidateB: { full_name: string; email?: string; phone?: string; linkedin_url?: string; skills?: string[]; current_company?: string };
  organizationId: string;
  userId?: string;
}): Promise<{
  confidence: number;       // 0.00–1.00
  reasoning: string;        // e.g., "Strong match: same phone + similar name"
  signals: string[];        // e.g., ["Matching phone", "Same LinkedIn"]
  error?: string;
}>
```

- **Model:** gpt-4o-mini
- **Credit cost:** 1 AI credit (`merge_score` — new entry in CREDIT_WEIGHTS)
- **Plan gating:** Growth+ gets AI confidence. Starter shows "Possible match — review manually."

### 5.6 `mergeCandidate()` Server Action + RPC

**Server Action:** `mergeCandidate(primaryId, secondaryId)` in `src/lib/actions/candidates.ts`
- Requires `candidates:update` permission
- Validates both candidates belong to the same org

**RPC:** `merge_candidates(p_primary_id, p_secondary_id, p_org_id, p_merged_by)` — atomic transaction:

```sql
-- Wrapped in SECURITY DEFINER with SET LOCAL
1. Repoint applications: UPDATE applications SET candidate_id = p_primary_id WHERE candidate_id = p_secondary_id AND organization_id = p_org_id
   -- If duplicate job_opening_id: soft-delete secondary's application
2. Merge candidate_skills: INSERT INTO candidate_skills SELECT ... ON CONFLICT DO NOTHING
3. Repoint notes: UPDATE candidate_notes SET candidate_id = p_primary_id WHERE candidate_id = p_secondary_id
4. Repoint files: UPDATE files SET candidate_id = p_primary_id WHERE candidate_id = p_secondary_id
5. Create audit record: INSERT INTO candidate_merges (...)
6. Soft-delete secondary: UPDATE candidates SET deleted_at = NOW() WHERE id = p_secondary_id
7. Return primary candidate ID
```

**Post-merge:** Fire `ats/candidate.skills_updated` for primary → embedding refresh.

**Conflict resolution:**
- Same job application: keep primary's, soft-delete secondary's
- Conflicting emails: store secondary email in `candidates.metadata.previous_emails` JSONB array
- Resume: keep most recently uploaded (by `files.created_at`)

---

## 6. Wave P6-3: Dropbox Sign Full Integration

### 6.1 Envelope Creation (Replacing Stub)

Replace `offers/send-esign` Inngest function stub with real Dropbox Sign API:

```typescript
// In offers/send-esign Inngest function
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
    { name: 'base_salary', value: formatCurrency(comp.base_salary, comp.currency) },
    // ... all compensation fields
  ],
  metadata: {
    ats_offer_id: offer.id,
    ats_org_id: offer.organization_id,
  },
});
// Store signature_request_id in offers.esign_envelope_id
```

### 6.2 Webhook Receiver

**Route:** `POST /api/v1/webhooks/dropbox-sign/route.ts`

**Verification:** Dropbox Sign HMAC signature verification (V-DSIGN-001 — verify at implementation).

**Event mapping:**

| Dropbox Sign Event | Inngest Event | Offer Transition |
|--------------------|---------------|------------------|
| `signature_request_signed` | `dropboxsign/webhook.received` (signed) | `sent → signed` |
| `signature_request_declined` | `dropboxsign/webhook.received` (declined) | `sent → declined` |
| `signature_request_expired` | Handled by `offers/check-expiry` cron | `sent → expired` |
| `signature_request_canceled` | `dropboxsign/webhook.received` (voided) | `sent → withdrawn` |

**Pattern:** Same as Stripe webhook — return 200 immediately, process async via Inngest.

### 6.3 Envelope Voiding on Withdrawal

Replace stub in `offers/withdraw` Inngest function:

```typescript
if (offer.esign_envelope_id) {
  await dropboxSign.signatureRequest.cancel(offer.esign_envelope_id);
}
```

### 6.4 AI Offer Letter Generation (Pro+)

`generateOfferLetterContent()` already exists in `generate.ts` (wired as `aiGenerateOfferTerms` in H6-5). Phase 6 enhances it:
- Pre-populate the Dropbox Sign template custom field `offer_letter_body` with AI-generated content
- Recruiter can preview and edit before sending via a preview modal
- **Plan gating:** Pro+ gets AI generation. Growth uses static template.

### 6.5 Dropbox Sign MSW Handler

```typescript
// src/__mocks__/handlers/dropbox-sign.ts
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

### 6.6 New Environment Variables

```bash
DROPBOX_SIGN_API_KEY=           # Required v1.0 (Pro+)
DROPBOX_SIGN_WEBHOOK_SECRET=    # Required v1.0 (Pro+)
DROPBOX_SIGN_TEMPLATE_ID=       # Default template ID
```

Add to `docs/ENVIRONMENT-VARIABLES.md` (D28) and `.env.example`.

---

## 7. Wave P6-4: Conversational AI Screening v1

### 7.1 Architecture Overview

**Async, structured, candidate-paced.** Not real-time chat. Not free-form.

1. Recruiter defines screening questions per job (screening config)
2. When candidate enters a screening-configured pipeline stage → invite email sent
3. Candidate opens screening page via magic link (new scope: `screening`, 30-day expiry)
4. Questions displayed as natural conversation. AI rephrases recruiter's raw questions.
5. Candidate types answers at own pace (can leave and return)
6. Short/unclear answers get AI follow-up prompts
7. After all questions answered → AI generates summary + score
8. Recruiter sees results in candidate profile

**Why v1 is structured (not free-form):**
- Legal: open-ended AI in hiring can produce discriminatory outputs. Structured questions are auditable.
- Recruiter control: recruiters define the question set. AI rephrases and follows up, but stays on-script.
- Data quality: structured turns produce comparable data across candidates.

### 7.2 Schema

See §3.1 — `screening_configs` and `screening_sessions` tables.

### 7.3 AI Orchestration — 4 AI Functions

**1. `generateScreeningQuestion()`** — Rephrase recruiter's raw question

```typescript
async function generateScreeningQuestion(params: {
  rawQuestion: string;
  jobTitle: string;
  orgInstructions?: string;
  organizationId: string;
}): Promise<{ questionText: string; error?: string }>
```
- Model: gpt-4o-mini | Credits: 0 (amortized into session cost)

**2. `evaluateCandidateAnswer()`** — Decide if follow-up needed

```typescript
async function evaluateCandidateAnswer(params: {
  question: ScreeningQuestion;
  aiQuestionText: string;
  answer: string;
  organizationId: string;
}): Promise<{
  needsFollowup: boolean;
  followupText?: string;
  preliminaryScore: number; // 0–1
  error?: string;
}>
```
- Model: gpt-4o-mini | Credits: 0 (amortized)
- Triggers follow-up when: answer < 50 chars OR doesn't address the question topic

**3. `generateScreeningSummary()`** — After all answers: summary + score

```typescript
async function generateScreeningSummary(params: {
  turns: ScreeningTurn[];
  config: ScreeningConfig;
  jobTitle: string;
  organizationId: string;
  userId?: string;
}): Promise<{
  summary: string;
  overallScore: number;       // 0–1
  scoreBreakdown: Record<string, number>; // question_id → score
  keySignals: string[];       // e.g., ["Strong React experience", "No remote work history"]
  error?: string;
}>
```
- Model: gpt-4o | Credits: 5 (`screening_summary` — new CREDIT_WEIGHTS entry)

**4. `generateScreeningQuestionBatch()`** — Batch rephrase all questions upfront

```typescript
async function generateScreeningQuestionBatch(params: {
  questions: ScreeningQuestion[];
  jobTitle: string;
  orgInstructions?: string;
  organizationId: string;
}): Promise<{
  rephrased: Array<{ questionId: string; aiText: string }>;
  error?: string;
}>
```
- Model: gpt-4o-mini | Credits: 1 (batch is cheaper than per-question)
- Called once when candidate opens screening page

### 7.4 Credit Model + Plan Gating

| Plan | Screening Behavior |
|------|--------------------|
| Starter | Static form — recruiter's raw questions displayed as-is. No AI rephrasing, no follow-ups, no scoring, no summary. |
| Growth | Full AI screening — rephrasing, follow-ups, scoring, summary. |
| Pro | Full AI screening + higher concurrency limits. |
| Enterprise | Full AI screening + custom prompt instructions per job. |

**Credit cost per completed session:** 5 AI credits (the summary generation). Question rephrasing (1 credit) and answer evaluation (0 credits each, amortized) are included. Displayed to recruiter: "5 credits used — screening completed."

### 7.5 Candidate Screening Portal Flow

**Route:** `/careers/{slug}/screen/{sessionId}?token={jwt}`

**Token scope:** `screening` (30-day expiry)

**Flow:**
1. Candidate clicks screening invite link in email
2. Token verified → screening session loaded
3. Session status `pending` → `in_progress` on first load
4. All AI-rephrased questions displayed (batch-generated on load)
5. Candidate types answers sequentially
6. After each answer: `evaluateCandidateAnswer()` called
7. If follow-up needed: follow-up question appears below
8. After all questions: "Submit" button
9. On submit: fire `ats/screening.response-submitted`
10. Inngest generates summary → session status `completed`

**Save state:** Answers saved on each submit (candidate can close tab and return).

**EU AI Act disclosure:** "You are being screened by an AI system on behalf of {org_name}. A human recruiter will review all AI assessments. You may request human-only review." + `human_review_requested` flag accessible from screening page (extends H4-3).

### 7.6 Recruiter Screening Config UI + Results View

**Config UI:** `/jobs/[id]/settings/screening`
- Add/edit/reorder questions (drag-and-drop)
- Set AI tone instructions (optional)
- Enable/disable screening for this job
- Preview: see how AI will rephrase each question

**Results view on candidate profile:** `ScreeningResultsCard` component
- Score badge (green ≥75%, amber ≥50%, red <50%)
- AI summary text
- Per-question score breakdown (expandable)
- Full transcript (expandable)
- "View screening for [candidate]" command bar intent

### 7.7 Inngest Functions (4 new)

| # | Function ID | Trigger | Steps | Credits |
|---|-------------|---------|-------|---------|
| 1 | `screening/invite-candidate` | `ats/application.stage-entered` (where stage has screening config) | 1. Check screening config active 2. Create session (pending) 3. Generate magic link (scope: screening) 4. Send invite email | 0 |
| 2 | `screening/process-response` | `ats/screening.response-submitted` | 1. Load session 2. For incomplete answers: call `evaluateCandidateAnswer()` 3. If all complete: fire `ats/screening.all-answered` | 0 |
| 3 | `screening/generate-summary` | `ats/screening.all-answered` | 1. Load session + config 2. Call `generateScreeningSummary()` 3. Store ai_summary + ai_score 4. Mark session completed 5. Notify recruiter | 5 |
| 4 | `screening/send-reminder` | Delayed event: 48h after invite | 1. Check session still pending 2. Send reminder email | 0 |

### 7.8 EU AI Act Compliance

Phase 6 screening is a **high-risk AI system** under EU AI Act Article 6 (employment decisions). Required:

1. **Transparency:** Candidate sees explicit disclosure before screening begins
2. **Human oversight:** Recruiter reviews all AI assessments. Candidate can request `human_review_requested`
3. **Data quality:** Structured questions ensure consistent, comparable inputs
4. **Non-discrimination:** Scoring criteria defined by recruiter, not by AI
5. **Record keeping:** All turns, scores, and AI outputs stored in `screening_sessions.turns`

---

## 8. API Endpoints (All Waves)

### Wave P6-1

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/v1/candidates/:id/parse-resume` | Trigger manual resume re-parse | JWT (recruiter+) |

### Wave P6-2

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/v1/portal/status` | Candidate status page data | Candidate token (scope: status) |
| POST | `/api/v1/portal/withdraw` | Withdraw application | Candidate token (scope: status) |
| POST | `/api/v1/candidates/merge` | Merge two candidates | JWT (recruiter+) |
| GET | `/api/v1/candidates/:id/duplicates` | Get duplicate suggestions with AI confidence | JWT (recruiter+) |

### Wave P6-3

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/v1/webhooks/dropbox-sign` | Dropbox Sign webhook receiver | HMAC signature |

### Wave P6-4

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/v1/jobs/:id/screening-config` | Get screening config | JWT (recruiter+) |
| PUT | `/api/v1/jobs/:id/screening-config` | Create/update screening config | JWT (recruiter+) |
| GET | `/api/v1/portal/screening/:sessionId` | Get screening session data | Candidate token (scope: screening) |
| POST | `/api/v1/portal/screening/:sessionId/answer` | Submit screening answer | Candidate token (scope: screening) |
| POST | `/api/v1/portal/screening/:sessionId/complete` | Complete screening session | Candidate token (scope: screening) |
| GET | `/api/v1/candidates/:id/screening-results` | Get screening results for recruiter | JWT (recruiter+) |

---

## 9. Inngest Function Summary

### New Functions (Phase 6)

| # | Function ID | Wave | Trigger | v1.0 |
|---|-------------|------|---------|------|
| 1 | `portal-resume-parse` | P6-1 | `portal/application-submitted` | Yes |
| 2 | `screening/invite-candidate` | P6-4 | `ats/application.stage-entered` | Yes |
| 3 | `screening/process-response` | P6-4 | `ats/screening.response-submitted` | Yes |
| 4 | `screening/generate-summary` | P6-4 | `ats/screening.all-answered` | Yes |
| 5 | `screening/send-reminder` | P6-4 | Delayed: 48h after invite | Yes |

### Updated Functions (stub → real)

| # | Function ID | Wave | Change |
|---|-------------|------|--------|
| 10 | `offers/send-esign` | P6-3 | Stub → real Dropbox Sign API |
| 11 | `offers/esign-webhook` | P6-3 | Stub → real event processing |
| 13 | `offers/withdraw` | P6-3 | Stub void → real Dropbox Sign cancel |

**Post-Phase 6 registry total:** 59 + 5 = 64 functions. 25 shipped and active.

---

## 10. Migration Scope

### 10.1 Migration 00030 — `00030_phase6_foundation.sql`

**Scope:** Waves P6-1 + P6-2

```sql
-- New column on candidates
ALTER TABLE candidates ADD COLUMN resume_parsed_data JSONB;

-- New table: candidate_merges (immutable audit — no deleted_at per ADR-006 exception)
CREATE TABLE candidate_merges (...);  -- See §3.1

-- RLS policies for candidate_merges
CREATE POLICY candidate_merges_select ON candidate_merges FOR SELECT USING (organization_id = auth.org_id());
CREATE POLICY candidate_merges_insert ON candidate_merges FOR INSERT WITH CHECK (organization_id = auth.org_id());

-- Audit trigger
CREATE TRIGGER candidate_merges_audit AFTER INSERT OR UPDATE OR DELETE ON candidate_merges
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- RPC: merge_candidates (atomic transaction)
CREATE OR REPLACE FUNCTION merge_candidates(...) RETURNS UUID ...;

-- CREDIT_WEIGHTS update: add 'merge_score' = 1
-- (handled via application-level constant, not migration)
```

### 10.2 Migration 00031 — `00031_phase6_screening.sql`

**Scope:** Wave P6-4

```sql
-- New tables
CREATE TABLE screening_configs (...);  -- See §3.1
CREATE TABLE screening_sessions (...); -- See §3.1

-- RLS policies (full 4 ops)
-- Audit triggers
-- Indexes (see §3.5)

-- CREDIT_WEIGHTS update: add 'screening_summary' = 5, 'screening_batch' = 1
```

**ADR compliance:**
- ADR-006: `deleted_at` on screening_configs + screening_sessions. Exception: candidate_merges (immutable audit).
- ADR-007: Audit triggers on all 3 new tables.
- ADR-008: `status` column on screening_sessions uses CHECK constraint, not PG ENUM.

---

## 11. Test Plan (ADR-004 Declaration)

### 11.1 Coverage Targets (D24 §5.1)

| Module | Target | Categories |
|--------|--------|------------|
| Resume extraction | ≥90% | Unit (Zod validation, hybrid logic), Inngest (parse flow) |
| Status portal | ≥85% | Unit (narration), Integration (token auth), E2E |
| Merge | ≥90% | Unit (conflict resolution, AI scoring), RLS, Integration |
| Dropbox Sign | ≥85% | Unit (webhook verification, event mapping), Inngest, Integration (MSW) |
| Screening | ≥90% | Unit (AI functions, state machine), RLS, Inngest, E2E |

### 11.2 RLS Matrix (D24 §6.2)

| Table | SELECT | INSERT | UPDATE | DELETE | Cross-tenant |
|-------|--------|--------|--------|--------|-------------|
| `candidate_merges` | ✅ | ✅ | N/A | N/A | 2 tests |
| `screening_configs` | ✅ | ✅ | ✅ | ✅ (soft) | 2 tests |
| `screening_sessions` | ✅ | ✅ | ✅ | ✅ (soft) | 2 tests |

**Total RLS:** 4 + 8 + 8 = 20 RLS tests minimum.

### 11.3 Estimated Test Count

| Category | Wave | Count |
|----------|------|-------|
| Unit — resume extraction (Zod, hybrid switching, error) | P6-1 | ~12 |
| Unit — AI functions (narration, merge score, screening 4 funcs) | P6-2/4 | ~25 |
| Unit — screening session state machine | P6-4 | ~10 |
| Unit — merge conflict resolution | P6-2 | ~6 |
| Unit — webhook signature + event mapping | P6-3 | ~6 |
| RLS — candidate_merges | P6-2 | ~4 |
| RLS — screening_configs | P6-4 | ~8 |
| RLS — screening_sessions | P6-4 | ~8 |
| Integration — Dropbox Sign (MSW mock) | P6-3 | ~15 |
| Integration — full screening flow | P6-4 | ~10 |
| Integration — merge flow | P6-2 | ~8 |
| Inngest — all new + updated functions | P6-1/3/4 | ~12 |
| E2E — candidate portal + screening | P6-2/4 | ~10 |
| **Total** | | **~134** |

**Target:** 1310 → ~1444 total tests after Phase 6.

### 11.4 Golden Tenant Fixture Additions

```typescript
// New fixtures needed in golden-tenant.ts
TENANT_A.screening: {
  config: {
    id: "11111111-9001-4000-a000-000000000001",
    job_opening_id: TENANT_A.jobs.seniorEngineer.id,
  },
  session: {
    id: "11111111-9002-4000-a000-000000000001",
    application_id: TENANT_A.applications.aliceForEngineer.id,
    status: "completed",
  },
},
TENANT_A.merges: {
  target: {
    id: "11111111-4001-4000-a000-000000000004", // duplicate candidate for merge testing
    full_name: "Alice J.",
    email: "a.johnson@example.com",
  },
},
TENANT_B.screening: {
  config: {
    id: "22222222-9001-4000-a000-000000000001",
  },
  session: {
    id: "22222222-9002-4000-a000-000000000001",
  },
},
```

---

## 12. UI Components

| Component | Path | Wave | Type |
|-----------|------|------|------|
| `StatusPage` | `src/app/careers/[slug]/status/page.tsx` | P6-2a | Server |
| `StatusTimeline` | `src/components/portal/status-timeline.tsx` | P6-2a | Client |
| `StatusNarration` | `src/components/portal/status-narration.tsx` | P6-2a | Server (Suspense) |
| `WithdrawButton` | `src/components/portal/withdraw-button.tsx` | P6-2a | Client |
| `MergeModal` | `src/components/candidates/merge-modal.tsx` | P6-2b | Client |
| `MergeComparisonCard` | `src/components/candidates/merge-comparison.tsx` | P6-2b | Client |
| `EsignPreviewModal` | `src/components/offers/esign-preview.tsx` | P6-3 | Client |
| `ScreeningConfigBuilder` | `src/app/(app)/jobs/[id]/settings/screening.tsx` | P6-4 | Client |
| `ScreeningPage` | `src/app/careers/[slug]/screen/[sessionId]/page.tsx` | P6-4 | Server + Client |
| `ScreeningResultsCard` | `src/components/candidates/screening-results.tsx` | P6-4 | Server |
| `ScreeningTranscript` | `src/components/candidates/screening-transcript.tsx` | P6-4 | Client |

**Command bar intent wiring (ADR-011 §2):**
```
"screen [candidate] for [job]"        → navigate to screening config
"view screening for [candidate]"      → open screening results
"merge [candidate A] with [candidate B]" → open merge modal
"send offer to [candidate]"           → navigate to offer send flow
"check status [candidate]"            → recruiter view of candidate's portal status
```

---

## 13. Edge Cases

| # | Scenario | Handling |
|---|----------|----------|
| 1 | Resume upload with 0 bytes | Skip parse, mark `resume_parsed = false` |
| 2 | Image-only PDF with no OCR-able text | Vision API fallback; if < 200 chars after vision, store partial |
| 3 | Candidate opens screening on two devices | Session is server-authoritative; last write wins; answers auto-save |
| 4 | Screening invite sent but candidate never starts | `send-reminder` after 48h; session stays `pending` |
| 5 | Candidate abandons mid-screening | Session stays `in_progress`; no summary generated; recruiter sees partial |
| 6 | Merge attempted on candidate with active offer | Block merge — active offers must be resolved first |
| 7 | Merge of candidate with screening session | Repoint screening_sessions to primary candidate |
| 8 | Dropbox Sign webhook arrives before offer DB update | Inngest retries; on retry, offer.esign_envelope_id should exist |
| 9 | Two orgs have same candidate email | Org isolation via RLS — no cross-org merge possible |
| 10 | Screening config deleted while session in progress | Session continues with frozen config; no new invites |

---

## 14. Security Considerations

### 14.1 Screening Session Token Security

- Screening tokens are signed JWTs (HS256) with scope `screening`
- Tokens are single-application scoped — cannot access other applications
- 30-day expiry (same as status tokens per D09 §3.2)
- Token contains: `application_id`, `candidate_id`, `organization_id`, `scope`
- Rate limited: 60 requests/min per token (D02 public endpoint limits)

### 14.2 AI Output Guardrails

- Screening questions: AI can only rephrase, not generate new questions
- Status narration: system prompt forbids revealing internal notes, implying outcomes, or mentioning dates
- Merge confidence: AI scores similarity, never makes the merge decision
- All AI outputs stored for audit (screening turns, narrations, merge confidence)

### 14.3 Dropbox Sign Webhook Security

- HMAC signature verification on every incoming webhook
- Webhook endpoint only accepts POST from Dropbox Sign IPs (optional IP allowlist)
- Async processing via Inngest — webhook returns 200 immediately
- Idempotent: duplicate webhook events produce same result

---

## 15. AI Ethics & Compliance

### 15.1 EU AI Act Obligations for Screening AI

Phase 6 screening falls under **high-risk AI** (employment context, Article 6):

| Requirement | Implementation |
|-------------|----------------|
| Transparency | Explicit disclosure on screening page before first question |
| Human oversight | Recruiter reviews all results. No auto-advance based on AI score alone |
| Contestability | Candidate can request `human_review_requested` flag |
| Data quality | Structured questions ensure comparable inputs; scoring criteria recruiter-defined |
| Non-discrimination | AI rephrases for clarity, does not generate discriminatory content. System prompt includes anti-bias instructions |
| Record keeping | All turns + AI outputs stored in `screening_sessions` |
| Risk assessment | Documented in this spec (§15.3) |

### 15.2 Human Review Override

- `human_review_requested` flag (existing, from H4-3) accessible from screening page
- When set: recruiter sees "Human review requested" badge on candidate profile
- Does NOT block AI screening — but clearly flags for recruiter attention
- Recruiter must explicitly acknowledge the flag before advancing candidate

### 15.3 Bias Monitoring

| Metric | How to Track | Alert Threshold |
|--------|-------------|----------------|
| Score distribution by source | `screening_sessions.ai_score` grouped by `candidates.source` | >0.15 std dev across sources |
| Follow-up rate by name pattern | Count follow-ups per session, correlate with candidate demographics | Statistical anomaly detection |
| Completion rate by candidate type | `screening_sessions.status = 'completed'` rate | <70% completion for any cohort |

**Phase 6 scope:** Instrument the metrics. Phase 7: dashboard for monitoring.

---

## 17. Wave P6-5 — AI Batch Shortlisting Report

> **Added:** 2026-03-13 (post-build addendum). Wave inserted after P6-2b per revised build order: P6-2b → P6-5 → P6-3 → P6-4.

### 17.1 Overview

Every open job with applicants gets a single-click "AI Shortlist" action. The system scores all active applications against the job requirements using a 5-dimension model, classifies each into Shortlist / Hold / Reject tiers, and generates an executive summary. Recruiters can override any AI tier.

### 17.2 Scoring Model

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Skills | 35% | Match between candidate skills and job required skills |
| Experience | 25% | Years of experience relevance |
| Education | 15% | Degree and field alignment |
| Domain | 15% | Industry and domain knowledge fit |
| Trajectory | 10% | Career growth trajectory and potential |

**Composite score** = weighted sum of all 5 dimensions (0.00–1.00).

### 17.3 Tier Classification

| Tier | Criteria | Badge Color |
|------|----------|-------------|
| Shortlist | composite >= 0.72 AND skills >= 0.60 | Green |
| Hold | composite >= 0.45 (and not shortlist) | Amber |
| Reject | composite < 0.45 OR mandatory skill missing | Red |
| Insufficient Data | Resume data too sparse to score reliably | Gray |

**EEOC compliance:** Employment gaps MUST NOT auto-reject. Flagged as "clarification recommended" only. All AI tiers labeled "AI Recommendation."

### 17.4 Data Model (Migration 031)

**`ai_shortlist_reports`** — one per job per run:
- `job_opening_id`, `triggered_by`, `status` (pending/processing/complete/failed)
- `total_scored`, `shortlisted_count`, `hold_count`, `rejected_count`
- `executive_summary` (text), `hiring_manager_note` (text)
- RLS: org-scoped SELECT/INSERT/UPDATE, no DELETE (ADR-006)

**`ai_shortlist_candidates`** — one per application per report:
- `report_id`, `application_id`, `candidate_id`
- 5 dimension scores + `composite_score`
- `ai_tier`, `recruiter_tier` (nullable override), `tier_overridden_at`, `tier_overridden_by`
- `strengths[]`, `gaps[]`, `eeoc_flags[]`
- RLS: org-scoped SELECT/INSERT/UPDATE, no DELETE (ADR-006)

### 17.5 API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/jobs/[id]/shortlist` | Trigger batch shortlist (24h dedup, in-progress guard) |
| GET | `/api/jobs/[id]/shortlist/latest` | Poll latest report status |
| POST | `/api/jobs/[id]/shortlist/override` | Override AI tier classification |

### 17.6 Inngest Function

**`jobs/batch-shortlist`** — 9-step function:
1. Mark report as processing
2. Fetch job + required skills
3. Fetch active applications with candidate data
4. Fetch domain scores (existing embeddings)
5–7. Score batches of 10 applications (GPT-4o, 3 credits each)
8. Write candidate rows + generate executive summary (GPT-4o-mini, 1 credit)
9. Complete report + notify recruiter

Concurrency: max 3 per org.

### 17.7 Command Bar Integration

Intent `shortlist_candidates` added. Quick patterns: "shortlist", "screen all", "rank applicants", "who should I interview". Returns list of open jobs for user to select.

### 17.8 UI Components

- **ShortlistTriggerButton** — on job detail page, polls for completion, shows last run info
- **Report page** — executive summary, EEOC disclosure, stat cards (total/shortlisted/hold/rejected)
- **CandidateScoreCard** — 5-dimension horizontal bars, tier badge, strengths/gaps chips, override controls

### 17.9 Credit Costs

| Operation | Model | Credits |
|-----------|-------|---------|
| `shortlist_score` | GPT-4o | 3 |
| `shortlist_summary` | GPT-4o-mini | 1 |

### 17.10 Test Coverage (32 tests)

- **Unit (18):** tier classification (7), composite score (3), data sufficiency (3), AI function mocks (5)
- **RLS (14):** ai_shortlist_reports (8), ai_shortlist_candidates (6) — 4 ops × 2 tenants each

---

## 18. Open Questions

| # | Question | Owner | Impact | Resolution |
|---|----------|-------|--------|------------|
| Q1 | Dropbox Sign Node SDK package name: `@hellosign/openapi-javascript-sdk` or `hellosign-sdk`? | V-DSIGN-001 | P6-3 | Verify at implementation time |
| Q2 | Should screening AI score influence the match score in `ai_match_explanations`? | Architect | P6-4 | Recommend NO for v1 — keep scores independent. Combine in v2. |
| Q3 | Maximum questions per screening config? | Product | P6-4 | Recommend 10 max to balance candidate experience vs. data quality |
| Q4 | Should abandoned screenings auto-expire? | Product | P6-4 | Recommend YES — mark `abandoned` after 14 days of inactivity |
| Q5 | Dropbox Sign template management — org-specific or global? | Product | P6-3 | Recommend org-specific `organizations.dropbox_sign_template_id` column |

---

*Generated: 2026-03-12*
*Spec prompt: `docs/PHASE6-SPEC-PROMPT.md`*
*Gate: §21 PASSED — all 6 checks green*
