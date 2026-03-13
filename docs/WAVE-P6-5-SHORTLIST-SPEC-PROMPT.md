# Wave P6-5 — AI Batch Shortlisting Report
## Spec & Build Prompt for VS Code Claude Code Session

**Purpose:** Add Wave P6-5 (AI Batch Shortlisting Report) to Phase 6 as an addendum to D32.
**Prerequisite:** Wave P6-1 (Resume PDF extraction, M030) must be complete first — the shortlisting pipeline depends on parsed resume data.

---

## Section 0: Session Start Protocol (MANDATORY — run in order before writing any code)

1. Read `CLAUDE.md` — full file. Confirm resolved ADR table.
2. Read `docs/DEVLOG.md` — latest entry only.
3. Read `docs/INDEX.md` — confirm D32 is registered and current.
4. Read `docs/modules/PHASE6-CANDIDATE-INTELLIGENCE.md` (D32) — full document. This is the authoritative Phase 6 spec. Wave P6-5 is an addendum to D32.
5. Read `docs/AI-RULES.md` §21 (pre-start gate, G1–G6) and §13 (post-build audit).
6. Read `docs/TESTING-STRATEGY.md` (D24) — full document.
7. Read `docs/ADRs/004-testing-strategy.md`.
8. Read `src/__fixtures__/golden-tenant.ts` — verify fixture UUIDs.
9. Read `supabase/migrations/` — list all files, confirm last migration number to determine M0XX for this wave.
10. Read `src/lib/ai/generate.ts` — know all existing AI functions before writing new ones.
11. Read `src/app/(app)/jobs/[id]/page.tsx` — understand the job detail page where the "AI Shortlist" button will be added.
12. Read `src/inngest/functions/` — list existing functions, understand naming conventions.

---

## Section 1: Pre-Start Gate (§21 — state all 6 checks before writing any code)

- **G1 — Phase check:** Wave P6-5 is an approved addendum to Phase 6 per this spec document.
- **G2 — Spec exists:** This document IS the spec. D32 §17 (new section) must be written BEFORE any code.
- **G3 — ADR compliance:** Confirm no contradiction with ADR table. Key checks: ADR-001 (Supabase client, no Prisma), ADR-003 (HNSW only), ADR-006 (soft delete on all new tables), ADR-007 (audit triggers on new tables), ADR-008 (CHECK constraints, no PG ENUMs), ADR-009 (files table for any PDF output), ADR-011 (AI-first — this IS the AI feature).
- **G4 — Test plan:** Declared in Section 9 below. State count before writing code.
- **G5 — Fixtures:** TENANT_A (pro plan, has job_openings + applications + candidates with embeddings), TENANT_B (starter plan, for RLS isolation tests).
- **G6 — Migration scope:** One migration (M0XX — check last number in supabase/migrations/). Adds `ai_shortlist_reports` table + extends `ai_match_explanations` with dimension score columns.

---

## Section 2: What This Wave Delivers

A recruiter posts a job. 50 resumes arrive. Today they read every PDF manually. After Wave P6-5, they click **"✨ AI Shortlist"** on the job detail page and within 2 minutes receive a structured report that:

- **Classifies every applicant** into one of three tiers: Shortlist / Hold / Reject
- **Explains every decision** in plain language with specific evidence from the resume
- **Scores 5 dimensions** per candidate (not a single black-box number)
- **Flags EEOC compliance concerns** — criteria that could have adverse impact on protected classes
- **Is exportable as PDF** for audit trail and compliance record-keeping
- **Is accessible via command bar** — `⌘K` → "shortlist candidates for [job title]"

This is an industry-standard process based on SHRM, EEOC, and SIOP guidance on AI-assisted candidate screening. The human recruiter makes the final decision; the AI provides structured evidence.

---

## Section 3: D32 Addendum — Write §17 First

Before writing any code, add **§17 — Wave P6-5: AI Batch Shortlisting Report** to D32 (`docs/modules/PHASE6-CANDIDATE-INTELLIGENCE.md`).

The section must cover: feature overview, multi-dimensional scoring model, tier classification logic, schema (new tables + column extensions), Inngest function spec, API route spec, UI spec (report page + job detail button), command bar intent, EEOC compliance note, test plan, and ADR-011 compliance check.

Use the same structure and depth as existing D32 sections (§5 Resume Extraction, §8 Candidate Merge, etc.).

---

## Section 4: Multi-Dimensional Scoring Model (industry standard)

### Why a single embedding score is insufficient

Cosine similarity between job embedding and candidate embedding captures semantic proximity of text. It does NOT evaluate: whether the candidate has the specific required skills, whether their experience years meet the minimum threshold, whether their education matches stated requirements, or whether their career trajectory is appropriate for the role level. A candidate who writes "I aspire to become a senior engineer" will score high on embedding similarity for a Senior Engineer role — but should not be shortlisted.

### The 5 Scoring Dimensions

Every candidate is scored on 5 independent dimensions, each 0.0–1.0. These are combined into a composite score using weighted averaging.

**Dimension 1 — Skills Coverage** (`skills_score`) — Weight: 35%
Compare job's `job_required_skills` against candidate's parsed skills from `resume_parse_results.structured_data.skills`.
- Score = (required skills present in resume) / (total required skills)
- Boost: +0.1 if candidate has ≥3 preferred skills beyond required
- Hard gate: if a skill is marked `required = true` with `is_mandatory = true` and is absent → auto-classify as Reject regardless of other scores

**Dimension 2 — Experience Match** (`experience_score`) — Weight: 25%
Compare job's seniority signal (from JD text + job title) against candidate's years of relevant experience from parsed resume.
- Extract minimum required years from JD (via GPT-4o structured output if not explicit)
- Score based on: meets minimum (1.0), within 1 year under minimum (0.6), 2+ years under (0.2), far exceeds by >5 years seniority mismatch downward (0.7 — overqualified risk)
- Use candidate's `resume_parse_results.structured_data.work_experience` total relevant years

**Dimension 3 — Education Match** (`education_score`) — Weight: 15%
Compare job's stated education requirement against candidate's education from parsed resume.
- If job states no education requirement: score = 1.0 (not penalized)
- If job states "degree preferred": candidate with degree = 1.0, without = 0.7
- If job states "degree required": candidate with degree = 1.0, without = 0.2
- Field relevance (CS degree for engineering role vs. unrelated) adds ±0.15

**Dimension 4 — Domain Relevance** (`domain_score`) — Weight: 15%
Cosine similarity between job embedding and candidate embedding (the existing pgvector score).
- Normalize the existing `match_score` from `ai_match_explanations` into this slot if it exists
- If no embedding: trigger embed job and candidate before scoring

**Dimension 5 — Career Trajectory** (`trajectory_score`) — Weight: 10%
Assess career progression quality from parsed resume work experience.
- Positive signals: increasing seniority across roles, tenure > 18 months per role, domain consistency
- Neutral: lateral moves, short contracts (flag but don't penalize)
- Negative signals: unexplained employment gaps > 12 months (flag for Hold, not auto-reject — EEOC risk)
- IMPORTANT: Gaps must be flagged as "clarification recommended" NOT as automatic disqualifiers — employment gaps can reflect protected leave (parental, medical, military). Never auto-reject on gaps alone.

### Composite Score Formula

```
composite = (skills_score × 0.35) + (experience_score × 0.25) +
            (education_score × 0.15) + (domain_score × 0.15) +
            (trajectory_score × 0.10)
```

---

## Section 5: Tier Classification Rules

```
SHORTLIST:  composite >= 0.72  AND  skills_score >= 0.60
            → Strong match. Proceed to interview.

HOLD:       composite >= 0.45  AND  (composite < 0.72 OR skills_score < 0.60)
            → Partial match or skills gap. One clarifying question recommended before decision.

REJECT:     composite < 0.45
            OR any mandatory skill (is_mandatory = true) is absent from resume
            → Clear mismatch on critical criteria.

INSUFFICIENT_DATA: resume not parsed, or parsed but <3 skills extracted, or no candidate embedding
            → Cannot score. Trigger P6-1 resume parse. Requeue after parse completes.
```

**Critical rule:** Tier is AI-recommended, not final. The UI must always show "AI Recommendation" label and allow recruiter override. Every override is logged to `audit_logs`.

---

## Section 6: Schema — Migration M0XX

Check the last migration number in `supabase/migrations/` and increment. Write this migration as `supabase/migrations/0XXXX_ai_shortlist_reports.sql`.

### New table: `ai_shortlist_reports`

```sql
CREATE TABLE ai_shortlist_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  job_opening_id        UUID NOT NULL REFERENCES job_openings(id),
  triggered_by          UUID NOT NULL REFERENCES user_profiles(id),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','complete','failed')),
  total_applications    INTEGER NOT NULL DEFAULT 0,
  shortlist_count       INTEGER NOT NULL DEFAULT 0,
  hold_count            INTEGER NOT NULL DEFAULT 0,
  reject_count          INTEGER NOT NULL DEFAULT 0,
  insufficient_data_count INTEGER NOT NULL DEFAULT 0,
  completed_at          TIMESTAMPTZ,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_shortlist_reports_job ON ai_shortlist_reports(job_opening_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_shortlist_reports_org ON ai_shortlist_reports(organization_id)
  WHERE deleted_at IS NULL;
```

### New table: `ai_shortlist_candidates`

```sql
CREATE TABLE ai_shortlist_candidates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  report_id             UUID NOT NULL REFERENCES ai_shortlist_reports(id),
  application_id        UUID NOT NULL REFERENCES applications(id),
  candidate_id          UUID NOT NULL REFERENCES candidates(id),

  -- Tier
  ai_tier               TEXT NOT NULL
                        CHECK (ai_tier IN ('shortlist','hold','reject','insufficient_data')),
  recruiter_tier        TEXT
                        CHECK (recruiter_tier IN ('shortlist','hold','reject','insufficient_data')),
  tier_overridden_at    TIMESTAMPTZ,
  tier_overridden_by    UUID REFERENCES user_profiles(id),

  -- Composite + dimension scores (0.0–1.0)
  composite_score       NUMERIC(4,3),
  skills_score          NUMERIC(4,3),
  experience_score      NUMERIC(4,3),
  education_score       NUMERIC(4,3),
  domain_score          NUMERIC(4,3),
  trajectory_score      NUMERIC(4,3),

  -- AI reasoning
  strengths             TEXT[],          -- 2–3 specific strengths from resume
  gaps                  TEXT[],          -- 2–3 specific gaps or questions
  clarifying_question   TEXT,            -- For Hold tier: one recommended question
  reject_reason         TEXT,            -- For Reject tier: primary disqualifying reason
  eeoc_flags            TEXT[],          -- Any criteria that may have adverse impact

  -- Metadata
  scored_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  resume_parse_version  INTEGER,         -- which parse run was used
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_shortlist_candidates_report ON ai_shortlist_candidates(report_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_shortlist_candidates_app ON ai_shortlist_candidates(application_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_shortlist_candidates_unique
  ON ai_shortlist_candidates(report_id, application_id)
  WHERE deleted_at IS NULL;
```

### RLS Policies (ADR mandatory — 4 ops × 2 tenants)

Both tables follow the standard org-scoped pattern:
```sql
-- ai_shortlist_reports
ALTER TABLE ai_shortlist_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can read own reports"
  ON ai_shortlist_reports FOR SELECT
  USING (organization_id = (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

CREATE POLICY "org members can insert reports"
  ON ai_shortlist_reports FOR INSERT
  WITH CHECK (organization_id = (SELECT org_id FROM org_members WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1));

-- Same pattern for UPDATE (tier override), no DELETE (soft delete only)
-- Repeat all 4 ops for ai_shortlist_candidates
```

### Audit triggers (ADR-007)

Apply `audit_trigger_func()` to both new tables — same pattern as all other tables.

---

## Section 7: AI Generate Functions

Add to `src/lib/ai/generate.ts`. Follow existing function patterns (Zod schema, structured output, gpt-4o for scoring, gpt-4o-mini for explanations).

### Function 1: `scoreResumeAgainstJob`

```typescript
export async function scoreResumeAgainstJob(params: {
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];          // from job_required_skills
  mandatorySkills: string[];         // skills where is_mandatory = true
  experienceMinYears: number | null; // extracted or inferred
  educationRequirement: string | null;
  parsedResume: {
    skills: string[];
    workExperience: Array<{ title: string; company: string; startDate: string; endDate: string | null; description: string }>;
    education: Array<{ degree: string; field: string; institution: string; year: number | null }>;
    totalYearsExperience: number | null;
  };
  existingDomainScore: number | null; // from ai_match_explanations if exists
}): Promise<{
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  domainScore: number;
  trajectoryScore: number;
  compositeScore: number;
  tier: 'shortlist' | 'hold' | 'reject' | 'insufficient_data';
  strengths: string[];
  gaps: string[];
  clarifyingQuestion: string | null;
  rejectReason: string | null;
  eeocFlags: string[];
  mandatorySkillMissing: boolean;
}>
```

Use GPT-4o with structured JSON output. System prompt must emphasize:
- Score objectively on evidence present in the resume only
- Never infer skills not mentioned
- Flag employment gaps as EEOC-sensitive — recommend Hold, never auto-reject on gaps alone
- Provide specific text evidence for each score (e.g., "Python mentioned 7 times across 3 roles")

### Function 2: `buildShortlistReportSummary`

```typescript
export async function buildShortlistReportSummary(params: {
  jobTitle: string;
  totalApplications: number;
  shortlistCount: number;
  holdCount: number;
  rejectCount: number;
  topCandidates: Array<{ name: string; compositeScore: number; topStrength: string }>;
  commonRejectionReasons: string[];
  eeocFlagsPresent: boolean;
}): Promise<{
  executiveSummary: string;  // 2-3 sentence plain English overview
  hiringManagerNote: string; // one recommendation for the hiring manager
}>
```

Use GPT-4o-mini (summary task, not scoring).

---

## Section 8: Inngest Function — `jobs/batch-shortlist`

**File:** `src/inngest/functions/jobs/batch-shortlist.ts`

**Registration:** Add to `src/inngest/functions/index.ts`. Update `docs/INNGEST-REGISTRY.md` (D29) — this becomes function #65, v1.0.

```typescript
export const batchShortlist = inngest.createFunction(
  {
    id: "jobs/batch-shortlist",
    name: "AI Batch Shortlist: Score All Applicants for Job",
    concurrency: { limit: 3 },        // max 3 jobs being shortlisted simultaneously per org
    retries: 2,
  },
  { event: "jobs/shortlist.requested" },
  async ({ event, step }) => {
    const { jobId, reportId, orgId, triggeredBy } = event.data;

    // Step 1: Fetch all active applications for the job
    const applications = await step.run("fetch-applications", async () => { ... });

    // Step 2: For each application, check if resume is parsed
    // If not parsed: trigger portal-resume-parse event and wait (fan-out pattern)
    // Use step.waitForEvent or process what's available + mark others as insufficient_data

    // Step 3: For each application with parsed resume data, call scoreResumeAgainstJob()
    // Process in batches of 10 (rate limit awareness)
    // Use step.run per batch

    // Step 4: Apply tier classification rules (Section 5 of this spec)

    // Step 5: Write all ai_shortlist_candidates rows (upsert — idempotent)

    // Step 6: Update ai_shortlist_reports with final counts + status = 'complete'

    // Step 7: buildShortlistReportSummary() for the executive summary

    // Step 8: Emit notification event so recruiter is notified when complete
    // "Your shortlisting report for [Job Title] is ready — 12 shortlisted, 19 hold, 16 rejected."
  }
);
```

**Event payload shape:**
```typescript
interface ShortlistRequestedEvent {
  name: "jobs/shortlist.requested";
  data: {
    jobId: string;
    reportId: string;  // pre-created report row with status = 'pending'
    orgId: string;
    triggeredBy: string;
  };
}
```

**Idempotency:** If a shortlist report already exists for this job in 'complete' status and was created < 24 hours ago, the API layer should return the existing report rather than triggering a new run. The UI shows "Last run X hours ago — Rerun?" button.

---

## Section 9: API Routes

### `POST /api/jobs/[id]/shortlist`
**File:** `src/app/api/jobs/[id]/shortlist/route.ts`

- Auth: `requireAuth()`, check `can(session.orgRole, 'jobs:edit')`
- Create `ai_shortlist_reports` row with status = 'pending'
- Send `jobs/shortlist.requested` Inngest event
- Return `{ reportId }` immediately (async — client polls or subscribes)
- Check 24-hour dedup: if existing complete report < 24h old, return existing `reportId` with `{ existing: true }`

### `GET /api/jobs/[id]/shortlist/latest`
**File:** `src/app/api/jobs/[id]/shortlist/latest/route.ts`

- Returns most recent report for this job (status, counts, completedAt)
- Used by job detail page to show "Last run X ago" badge

---

## Section 10: UI Surfaces

### 10.1 Job Detail Page — "AI Shortlist" Button

**File:** `src/app/(app)/jobs/[id]/page.tsx` (add button near "View Pipeline Board" link)

```tsx
<ShortlistTriggerButton
  jobId={job.id}
  hasApplications={applicationCount > 0}
  lastReportId={lastReport?.id ?? null}
  lastReportStatus={lastReport?.status ?? null}
  lastReportRunAt={lastReport?.completed_at ?? null}
  canEdit={can(session.orgRole, 'jobs:edit')}
/>
```

`ShortlistTriggerButton` is a client component (`jobs/[id]/shortlist-trigger.tsx`) that:
- Shows "✨ AI Shortlist All Applicants" when no report exists
- Shows "✨ Rerun AI Shortlist" + "Last run X ago · 12 shortlisted" when report exists
- On click: calls `POST /api/jobs/[id]/shortlist`, then navigates to `/jobs/[id]/shortlist-report/[reportId]`
- Shows spinner + "Analyzing resumes…" while Inngest processes (poll GET /api/jobs/[id]/shortlist/latest every 3s)
- Disabled when `applicationCount === 0` with tooltip "No applications yet"

### 10.2 Shortlist Report Page

**File:** `src/app/(app)/jobs/[id]/shortlist-report/[reportId]/page.tsx`

**Route:** `/jobs/[id]/shortlist-report/[reportId]`

Page structure (all server-rendered):

```
[Header]
  Job Title → ← Back to job
  "AI Shortlist Report" heading
  Generated: [date] · [total] applications analyzed
  [Export as PDF button]  [Rerun button]

[Executive Summary Card]
  AI-generated 2-3 sentence overview
  Hiring Manager Note (from buildShortlistReportSummary)

[EEOC Notice] (always shown when eeoc_flags present on any candidate)
  "⚠️ AI flags noted on X candidates — review before final decisions.
   Employment gaps, career breaks, and credential gaps may reflect protected leave or
   systemic barriers. AI tiers are recommendations only."

[Summary Stats Row]
  ✅ 12 Shortlisted   🟡 19 Hold   ❌ 16 Rejected   ⬜ 3 Insufficient Data

[Three-Column Tier View] (or tabs on mobile)
  [SHORTLIST column — green header]
    CandidateShortlistCard × 12
  [HOLD column — amber header]
    CandidateHoldCard × 19
  [REJECT column — red header]
    CandidateRejectCard × 16
```

### 10.3 Candidate Score Card Component

**File:** `src/app/(app)/jobs/[id]/shortlist-report/[reportId]/candidate-score-card.tsx`

Each card shows:
- Candidate name (link to profile) + current title
- **AI tier badge** (Shortlist / Hold / Reject) + override button for recruiter
- **Composite score** as large percentage (e.g., "84%")
- **5-dimension bar chart** (horizontal bars, labeled, color-coded green/amber/red)
  - Skills Coverage: ████████░░ 81%
  - Experience: ██████████ 95%
  - Education: ███████░░░ 70%
  - Domain: ████████░░ 80%
  - Trajectory: ████████░░ 85%
- **Strengths** (2–3 bullets, specific evidence: "5 years React, mentioned in 3 roles")
- **Gaps / Hold reason** (if Hold: clarifying question. if Reject: primary reason)
- **EEOC flag** (if present: amber icon "Employment gap noted — clarify before deciding")
- **Override control**: Recruiter can move tier via dropdown. Logged to audit_logs.

Use inline HTML/CSS for the dimension bars (no chart library needed — simple divs with percentage width).

### 10.4 Export as PDF

**File:** `src/app/api/jobs/[id]/shortlist-report/[reportId]/export/route.ts`

- Render report as HTML, convert to PDF using existing PDF generation approach (check D32 for PDF skill used in P6-1/P6-2)
- Include: date, job title, total counts, all candidate cards with dimension scores, EEOC notice, "AI Recommendation Only — Final Decision by Human Recruiter" footer
- PDF is the compliance audit trail — stored in `files` table per ADR-009

---

## Section 11: Command Bar Intent

**File:** `src/lib/ai/intent.ts`

Add new intent `shortlist_candidates` (intent #19 if counting from current 13 + 5 from H6-6):

```
Trigger phrases: "shortlist", "screen all", "AI screen", "rank applicants",
                 "who should I interview", "best candidates for", "score resumes"
Action: navigate to shortlist trigger (with jobId context if available)
```

**File:** `src/lib/actions/command-bar.ts`
- If job context available in command bar session: navigate to `/jobs/[jobId]/shortlist-report/latest` or trigger shortlist
- If no job context: return results list of open jobs → user selects → triggers shortlist

---

## Section 12: Test Plan (declare before writing any code)

### Tier 1 — Mandatory Day 1 (ADR-004)

**Unit tests** (`src/__tests__/shortlist/`)

| Test | Description |
|------|-------------|
| `tier-classification.test.ts` × 6 | One test per tier rule: shortlist (composite ≥0.72 + skills ≥0.60), hold (composite 0.45–0.72), reject (composite <0.45), reject (mandatory skill missing), insufficient_data (no parse), EEOC gap flag |
| `dimension-scoring.test.ts` × 5 | One per dimension: skills coverage %, experience year matching, education level matching, domain score passthrough, trajectory gap detection |
| `composite-formula.test.ts` × 3 | Correct weighted average, boundary cases (exactly 0.72, exactly 0.45), overqualified penalty |
| `generate-score.test.ts` × 2 | `scoreResumeAgainstJob()` returns correct schema shape; mandatory missing skill → reject tier |
| `generate-summary.test.ts` × 1 | `buildShortlistReportSummary()` returns executiveSummary + hiringManagerNote |

**Total unit: ~17 tests**

**RLS tests** (`src/__tests__/shortlist/*.rls.test.ts`)

| Table | 4 ops × 2 tenants |
|-------|-------------------|
| `ai_shortlist_reports` | SELECT, INSERT, UPDATE, soft-delete — TENANT_A can, TENANT_B cannot access TENANT_A rows |
| `ai_shortlist_candidates` | Same pattern |

**Total RLS: 16 tests**

**Integration tests** (`src/__tests__/shortlist/*.integration.test.ts`)

| Test | Description |
|------|-------------|
| API POST `/api/jobs/[id]/shortlist` | Creates report row, emits Inngest event, returns reportId |
| API POST dedup | Returns existing reportId when report < 24h old |
| API GET `/api/jobs/[id]/shortlist/latest` | Returns correct status + counts |
| Inngest function happy path | Processes 3 applications, writes shortlist_candidates rows |
| Inngest function insufficient_data | Applications without parsed resumes get correct tier |

**Total integration: ~5 tests**

**E2E tests** (`src/__tests__/e2e/shortlist.spec.ts`)

| Test | Description |
|------|-------------|
| Trigger shortlist from job detail | Click button → spinner → report page loads |
| Report displays correct tier counts | Summary stats match DB |
| Tier override | Recruiter moves candidate from Hold → Shortlist → audit log entry created |

**Total E2E: ~3 tests**

**Grand total: ~41 new tests**

---

## Section 13: D29 (Inngest Registry) Update

After writing the Inngest function, update `docs/INNGEST-REGISTRY.md` (D29):
- Add `jobs/batch-shortlist` as the next function number
- Trigger: `jobs/shortlist.requested`
- Status: v1.0
- Update total function count

---

## Section 14: CLAUDE.md State Update

After all code, tests, and D32 §17 are complete:
- Update `docs/DEVLOG.md` with new entry: "Wave P6-5: AI Batch Shortlisting Report"
- Update `CLAUDE.md` current state: add "Wave P6-5 (AI Batch Shortlisting)" to the Phase 6 build list
- Run §13 post-build audit (A1–A7 categories)
- State test counts: before → after

---

## Section 15: ADR-011 Compliance Checklist

Before marking Wave P6-5 complete, confirm all 7 ADR-011 rules:

- [ ] **No CRUD-only features** — The shortlist report page has zero manual CRUD. Every candidate classification is AI-generated.
- [ ] **Command bar is primary** — `⌘K` → "shortlist for [job]" achieves the trigger in one step. No 3+ click requirement.
- [ ] **No "coming soon" dead-ends** — PDF export ships with the wave. EEOC override ships with the wave. Nothing is stubbed.
- [ ] **No "v2.0" on AI features** — The full 5-dimension scoring ships now. Typesense-powered candidate ranking is v2.0 (acceptable per ADR-011).
- [ ] **AI env vars active** — `OPENAI_API_KEY` used by `scoreResumeAgainstJob()` (GPT-4o structured output). No fallback to keyword matching.
- [ ] **Every new page gets AI consideration** — The report page IS the AI output. The trigger button IS the AI entry point.
- [ ] **AI override is logged** — Every recruiter tier override is written to `audit_logs` via ADR-007 trigger. Compliance audit trail exists.

---

## Section 16: Key Constraints (do not violate)

- **ADR-001:** Supabase client everywhere. No raw SQL in application code (use `.rpc()` for any complex queries).
- **ADR-003:** HNSW only. If adding vector indexes: `WITH (m = 16, ef_construction = 64)`.
- **ADR-006:** `deleted_at` on BOTH new tables. No hard deletes.
- **ADR-007:** Audit trigger on both new tables — apply `audit_trigger_func()` in migration.
- **ADR-008:** All status CHECK constraints use string literals, not PG ENUMs.
- **ADR-009:** PDF export stored via `files` table + Supabase Storage, not as inline URL column.
- **ADR-011:** AI recommendation is clearly labeled "AI Recommendation" — never presented as a final decision. Recruiter override always available.
- **EEOC:** Employment gaps MUST NOT be auto-disqualifying criteria. The scoring model must flag gaps as Hold recommendation with clarifying question. The UI must show the EEOC notice when any flags are present. This is both legal compliance and ethical AI practice.
- **Wave P6-1 dependency:** `scoreResumeAgainstJob()` requires `resume_parse_results.structured_data` for the candidate. If no parse exists: tier = `insufficient_data`. The function must trigger the P6-1 parse pipeline and requeue, not fail silently.
- **Human-in-the-loop:** The tier classification is always labeled "AI Recommendation." The `recruiter_tier` column tracks any override. The final hiring decision is always human.

---

*This spec prompt is self-contained. Pass this file to a VS Code Claude Code session after Wave P6-1 (Resume PDF extraction, M030) is complete.*
*Prerequisite commit: Wave P6-1 must be merged. M030 migration must be applied.*
