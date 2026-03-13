# Phase 7 — Wave A2: DEI & Compliance Dashboard
## Spec & Build Prompt for VS Code Claude Code Session

**Phase:** 7 — Wave A2
**Target doc:** D34 (write §1–§10 before any code)
**Migration:** M034 — `candidate_eeo_profiles` + `ai_decision_audit`
**Prerequisite:** Wave A1 (Analytics Module, M033) complete. Phase 6 complete — particularly P6-4 (Conversational Screening) and P6-5 (AI Batch Shortlisting), as their AI decisions are audited here.
**Legal note:** This module involves employment law, EU AI Act, and EEOC compliance. Build defensively. When in doubt, show the human the data and let them decide. Never auto-decide on diversity signals.

---

## Section 0: Session Start Protocol (MANDATORY — in order)

1. `CLAUDE.md` — full file, confirm ADR table
2. `docs/DEVLOG.md` — latest entry only
3. `docs/INDEX.md` — register D34 before writing code
4. `docs/modules/ANALYTICS-MODULE.md` (D33) — Wave A2 builds on A1's patterns
5. `docs/modules/PHASE6-CANDIDATE-INTELLIGENCE.md` (D32) — AI decision sources (shortlisting, screening)
6. `docs/AI-RULES.md` §21 (G1–G6) and §13 (post-build audit)
7. `docs/TESTING-STRATEGY.md` (D24) — full document
8. `docs/ADRs/004-testing-strategy.md`
9. `src/__fixtures__/golden-tenant.ts` — verify UUIDs
10. `supabase/migrations/` — list files, confirm last number. DEI migration = M034.
11. `src/lib/ai/generate.ts` — existing AI functions
12. `src/app/(public)/careers/[slug]/` — career portal where EEO form will be added

---

## Section 1: Pre-Start Gate (§21 — state all 6 before any code)

- **G1:** Phase 7, Wave A2. Approved feature per this spec.
- **G2:** This document IS the spec. Write D34 §1–§10 before any code.
- **G3:** ADR compliance — all standard ADRs apply. Special note: `candidate_eeo_profiles` is an EXCEPTION to ADR-006 soft delete — EEO data deletion must be hard-deletable for GDPR erasure. Document this exception explicitly in migration comment. `ai_decision_audit` is append-only like `audit_logs` — no soft delete, no update.
- **G4:** Test plan declared in Section 10.
- **G5:** TENANT_A (pro, active data), TENANT_B (starter, RLS isolation).
- **G6:** One migration: M034. Two new tables.

---

## Section 2: The Problem This Solves

### Why this exists

Three independent forces are making DEI + compliance tooling table stakes, not optional:

**1. EU AI Act (in force 2025–2026):** Article 6 classifies AI systems used in recruitment and employment decisions as **high-risk AI**. Obligations include: transparency to candidates about AI use, human oversight of AI-assisted decisions, right to explanation, adverse impact monitoring, technical documentation, and annual risk assessments. Any EU customer or company with EU employees is subject to this regardless of where Eligeo is hosted.

**2. US EEOC guidance on AI in hiring:** The EEOC has published guidance that employers using AI tools for screening or selection must monitor those tools for adverse impact on protected classes (race, color, sex, national origin, religion, disability, age). This is Title VII + ADA obligation, not a new law. AI makes it newly enforceable.

**3. Enterprise procurement requirements:** Enterprise HR buyers increasingly require a DEI dashboard in ATS RFPs. Without one, Eligeo cannot close deals with companies that have a Head of DEI, an ESG report, or a public diversity commitment.

### What this is NOT

- Not a tool to make hiring decisions based on demographics
- Not a tool to set hiring quotas
- Not a tool to score or rank candidates on diversity
- Not a surveillance system for individual employees

This is a **transparency and monitoring** module. It shows: where in the funnel diversity signals change, which AI decisions warrant human review, and whether the organization's AI usage is documented and auditable.

---

## Section 3: Architecture Overview

Two independent pillars:

**Pillar 1 — EEO Self-Identification**
Candidates voluntarily disclose demographics on the career portal. Data is stored separately from the candidate hiring record. Recruiters see only aggregate counts — never individual demographic data. This is the OFCCP/EEOC standard pattern.

**Pillar 2 — AI Decision Audit**
Every AI-assisted hiring decision (shortlist tier, screening result, match score used in a decision) is logged in `ai_decision_audit` with a human review confirmation requirement. This is the EU AI Act Article 6 obligation.

---

## Section 4: Schema — Migration M034

**File:** `supabase/migrations/00034_dei_compliance.sql`

### Table 1: `candidate_eeo_profiles`

Voluntary EEO self-identification. Stored separately from `candidates` and `applications`. Recruiters NEVER see individual rows — only aggregate queries from the compliance dashboard (admin/owner only).

```sql
-- GDPR/EEOC note: this table is deliberately NOT soft-deleted.
-- Hard delete is required for GDPR Right to Erasure (Art. 17).
-- The erase_candidate() function must also delete rows from this table.
-- ADR-006 exception: documented here and in GAPS.md.
CREATE TABLE candidate_eeo_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  candidate_id        UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  -- Voluntary self-identification fields (all nullable — voluntary means optional)
  gender_identity     TEXT,     -- freeform, not an enum (ADR-008, tenant values)
  pronouns_public     TEXT,     -- separate from candidates.pronouns (that's for recruiter use)
  race_ethnicity      TEXT[],   -- multi-select, freeform array
  disability_status   TEXT      CHECK (disability_status IN ('yes','no','prefer_not_to_say')),
  veteran_status      TEXT      CHECK (veteran_status IN ('yes','no','prefer_not_to_say')),

  -- Consent
  consented_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  consent_version     TEXT NOT NULL DEFAULT '1.0',

  -- Metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO deleted_at: hard delete required for GDPR erasure
  -- NO updated_at: EEO profiles are immutable after submission; candidate re-submits to update
);

-- IMPORTANT: No UPDATE policy. Candidates must re-submit (insert new row) to change.
-- Old rows are kept for audit trail until GDPR erasure is invoked.
CREATE UNIQUE INDEX idx_eeo_profiles_candidate
  ON candidate_eeo_profiles(candidate_id, organization_id);

ALTER TABLE candidate_eeo_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_eeo_profiles FORCE ROW LEVEL SECURITY;

-- CRITICAL: Recruiters CANNOT read individual EEO profiles.
-- Only service role (Inngest) can read for aggregate computation.
-- This is intentional: individual demographic data is never exposed to recruiters.
CREATE POLICY "no_direct_recruiter_access"
  ON candidate_eeo_profiles FOR SELECT
  USING (false); -- blocks all direct queries from application layer

CREATE POLICY "service_role_read"
  ON candidate_eeo_profiles FOR SELECT
  USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

CREATE POLICY "candidate_self_insert"
  ON candidate_eeo_profiles FOR INSERT
  WITH CHECK (true); -- career portal (public route) inserts via service role

-- Hard delete via GDPR erasure only (service role)
CREATE POLICY "service_role_delete"
  ON candidate_eeo_profiles FOR DELETE
  USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');
```

**Update `erase_candidate()` RPC** (M001/M009 or wherever it's defined):
Add `DELETE FROM candidate_eeo_profiles WHERE candidate_id = p_candidate_id;` to the erasure function.

### Table 2: `ai_decision_audit`

Append-only log of every AI-assisted hiring decision. No soft delete (same pattern as `audit_logs`). This is the EU AI Act Article 13 transparency record.

```sql
-- Append-only AI decision audit log (EU AI Act Article 6, 13).
-- No soft delete (ADR-006 exception, same as audit_logs).
-- No updates. Service role insert only.
CREATE TABLE ai_decision_audit (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id),

  -- What AI system made the decision
  ai_system             TEXT NOT NULL
                        CHECK (ai_system IN (
                          'match_score',        -- embedding similarity scoring
                          'batch_shortlist',    -- P6-5 batch shortlisting
                          'screening_session',  -- P6-4 conversational screening
                          'resume_parse',       -- P6-1 resume extraction
                          'nba',                -- Next Best Action recommendation
                          'offer_comp_suggest'  -- offer compensation suggestion
                        )),

  -- The decision made
  decision_type         TEXT NOT NULL
                        CHECK (decision_type IN (
                          'tier_assigned',       -- shortlist/hold/reject tier
                          'score_computed',      -- match score generated
                          'screening_completed', -- screening session finished
                          'suggestion_shown',    -- AI suggestion shown to recruiter
                          'nba_fired'            -- NBA rule triggered
                        )),

  decision_value        TEXT,          -- the actual decision (e.g. 'shortlist', '0.84', 'high_match_no_interview')

  -- What it was applied to
  candidate_id          UUID REFERENCES candidates(id),
  application_id        UUID REFERENCES applications(id),
  job_opening_id        UUID REFERENCES job_openings(id),

  -- Human review
  human_reviewed        BOOLEAN NOT NULL DEFAULT false,
  reviewed_by           UUID REFERENCES user_profiles(id),
  reviewed_at           TIMESTAMPTZ,
  review_outcome        TEXT          -- 'confirmed', 'overridden', 'flagged'

  -- Explanation (for Right to Explanation requests)
  ai_explanation        TEXT,         -- human-readable explanation of the decision
  model_used            TEXT,         -- e.g. 'text-embedding-3-small', 'gpt-4o'
  model_version         TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_decision_audit_org ON ai_decision_audit(organization_id, created_at DESC);
CREATE INDEX idx_ai_decision_audit_candidate ON ai_decision_audit(candidate_id, created_at DESC);
CREATE INDEX idx_ai_decision_audit_application ON ai_decision_audit(application_id);
CREATE INDEX idx_ai_decision_audit_system ON ai_decision_audit(organization_id, ai_system);

ALTER TABLE ai_decision_audit ENABLE ROW LEVEL SECURITY;

-- Only admins/owners can read the audit log
CREATE POLICY "admin_read_ai_audit"
  ON ai_decision_audit FOR SELECT
  USING (
    is_org_member(organization_id)
    AND (SELECT role FROM org_members WHERE user_id = auth.uid() AND organization_id = ai_decision_audit.organization_id LIMIT 1)
    IN ('owner', 'admin')
  );

CREATE POLICY "service_insert_ai_audit"
  ON ai_decision_audit FOR INSERT
  WITH CHECK (true); -- service role only
```

---

## Section 5: EEO Self-Identification Form — Career Portal

**File:** `src/app/(public)/careers/[slug]/apply/eeo-disclosure.tsx`

Added as the final step of the application form (after resume upload), BEFORE the submit button. Entire section is optional and clearly labelled.

```tsx
// Rendered inside the public application form
<EeoDisclosureSection onComplete={(data) => setEeoData(data)} />
```

**UI design:**
- Section heading: "Voluntary Equal Employment Opportunity Disclosure"
- Subheading: "This information is voluntary and will not affect your application. It is used only in aggregate to help us improve the diversity of our hiring process."
- Legal note: "Providing this information is entirely optional. Your application will be evaluated the same way regardless of whether you complete this section."
- Fields: Gender Identity (text, freeform), Race/Ethnicity (multi-select checkboxes using EEOC standard categories), Disability Status (radio: Yes / No / Prefer not to say), Veteran Status (radio: Yes / No / Prefer not to say)
- "Decline to answer" option prominently available for all fields
- Consent checkbox: "I voluntarily provide this information and understand it will be stored securely and used only in aggregate form for diversity reporting."

**Data flow:**
On application submission, if EEO data provided AND consent checkbox checked:
- Insert into `candidate_eeo_profiles` via service role action (never exposes to recruiter session)
- Return `{ eeoCollected: true }` in application confirmation

---

## Section 6: AI Decision Audit Wiring

Every AI system that makes a hiring-relevant decision must write to `ai_decision_audit`. Update these files:

### 6.1 Batch Shortlisting (P6-5)
In `src/inngest/functions/jobs/batch-shortlist.ts`, after writing `ai_shortlist_candidates`:
```typescript
// Write audit record for each decision
await supabase.from('ai_decision_audit').insert({
  organization_id: orgId,
  ai_system: 'batch_shortlist',
  decision_type: 'tier_assigned',
  decision_value: candidate.ai_tier,
  candidate_id: candidate.candidate_id,
  application_id: candidate.application_id,
  job_opening_id: jobId,
  ai_explanation: candidate.reject_reason ?? candidate.gaps?.join('; '),
  model_used: 'gpt-4o',
  model_version: '2025-01-01'
});
```

### 6.2 Match Score (existing ai_match_explanations)
In the embedding scoring function (wherever `ai_match_explanations` is written):
```typescript
await supabase.from('ai_decision_audit').insert({
  ai_system: 'match_score',
  decision_type: 'score_computed',
  decision_value: matchScore.toString(),
  // ...
});
```

### 6.3 Next Best Action
In `next-best-action.tsx`, when an NBA rule fires, log via server action:
```typescript
// Log that an NBA recommendation was shown to the recruiter
await logAiDecision({
  aiSystem: 'nba',
  decisionType: 'nba_fired',
  decisionValue: action.type,
  candidateId,
  applicationId
});
```

### 6.4 Offer Comp Suggestion
In `src/lib/actions/offers.ts`, after `aiSuggestCompensation()` returns:
Log `ai_system: 'offer_comp_suggest'`, `decision_type: 'suggestion_shown'`.

### 6.5 Conversational Screening (P6-4)
In the screening session completion Inngest function:
Log `ai_system: 'screening_session'`, `decision_type: 'screening_completed'`, `decision_value: overall_recommendation`.

---

## Section 7: AI Functions

Add to `src/lib/ai/generate.ts`:

### `generateAdverseImpactAnalysis`

```typescript
export async function generateAdverseImpactAnalysis(params: {
  pipelineData: {
    stage: string;
    totalCount: number;
    progressedCount: number;
    demographicBreakdown?: Record<string, { count: number; progressedCount: number }>;
  }[];
  aiDecisionData: {
    aiSystem: string;
    totalDecisions: number;
    shortlistedCount: number;
    rejectedCount: number;
  }[];
}): Promise<{
  summary: string;
  flaggedPatterns: string[];
  recommendedActions: string[];
  complianceStatus: 'clear' | 'review_recommended' | 'action_required';
}>
```

Use GPT-4o. System prompt emphasizes: "Identify statistical patterns that may indicate systematic disadvantage. Use the 4/5ths rule (80% rule) as the standard adverse impact test. Flag any selection rate for a group that is less than 80% of the highest selection rate group. Always recommend human review for flagged patterns — never recommend automatic exclusion or inclusion based on demographics."

### `generateRightToExplanation`

```typescript
export async function generateRightToExplanation(params: {
  candidateName: string;
  jobTitle: string;
  aiDecisions: Array<{
    aiSystem: string;
    decisionValue: string;
    aiExplanation: string | null;
    createdAt: string;
  }>;
  applicationOutcome: string; // 'rejected', 'hold', 'shortlisted', 'hired'
}): Promise<{
  explanationLetter: string; // formal letter suitable for candidate-facing communication
  technicalSummary: string;  // internal audit summary
}>
```

This generates GDPR Article 22 + EU AI Act Article 13 compliant explanations. Used when a candidate requests an explanation of AI-assisted decisions.

---

## Section 8: UI — DEI & Compliance Dashboard

### Navigation
Add "Compliance" link to analytics sidebar (sub-nav under Analytics). Owner/admin only.

### Pages

**`/analytics/compliance`** — Compliance home with two sections:
1. AI Decision Audit summary
2. EEO Pipeline Report (if EEO data available)

**`/analytics/compliance/ai-audit`** — Full AI decision audit log
**`/analytics/compliance/eeo-pipeline`** — EEO funnel report (admin only)
**`/analytics/compliance/right-to-explanation/[candidateId]`** — Generate explanation letter

### 8.1 AI Decision Audit Page (`/analytics/compliance/ai-audit`)

**Access:** owner/admin only.

Summary cards:
- Total AI decisions (last 30 days)
- Human-reviewed rate (%)
- Override rate (% of reviewed decisions changed by human)
- Pending review count (AI decisions not yet human-reviewed) — amber if >20%

Audit table (paginated, 50 rows):
- Date · AI System · Decision Type · Decision Value · Candidate → profile link · Job → detail link · Human Reviewed (checkbox) · Reviewed By · Outcome

"Mark as Reviewed" bulk action: select rows, click "Mark Reviewed" — sets `human_reviewed = true`, `reviewed_by = current_user`, `reviewed_at = now()`, `review_outcome = 'confirmed'`.

Export to CSV button (for regulatory audit trail).

**ADR-011 note:** This page surfaces AI activity — it IS the AI transparency surface. The human review workflow makes every AI decision visible and confirmable.

### 8.2 EEO Pipeline Report (`/analytics/compliance/eeo-pipeline`)

**Access:** owner/admin only. Only renders if EEO data exists (count > 0). Shows "No EEO data collected yet. The voluntary disclosure form is active on your career portal." if empty.

**CRITICAL design constraint:** This page shows AGGREGATE data only. Individual candidate demographics are never displayed. Minimum group size: 5. If any group has fewer than 5 respondents, display "< 5" instead of the actual number (k-anonymity protection).

Funnel by stage showing pass-through rates. If demographic breakdown is available (EEO data collected), show as grouped bars per stage — but ONLY if each demographic group has ≥5 respondents at that stage.

AI-generated adverse impact narrative (from `generateAdverseImpactAnalysis()`). Same pattern as analytics narrative cards — shows before the charts.

Compliance status badge:
- 🟢 Clear — no patterns flagged
- 🟡 Review Recommended — one or more patterns warrant human investigation
- 🔴 Action Required — 4/5ths rule violation detected

**Important disclaimer (always visible):** "This report shows voluntary self-identification data. Demographic categories are self-reported and may not reflect EEOC standard categories. Use this data to identify patterns for investigation — not to make individual hiring decisions. Consult your legal team before taking any employment action based on this report."

### 8.3 Right to Explanation (`/analytics/compliance/right-to-explanation/[candidateId]`)

**Access:** owner/admin only.

Fetches all `ai_decision_audit` rows for the candidate. Passes to `generateRightToExplanation()`. Renders:
- Explanation Letter (formatted, downloadable as PDF)
- Technical Summary (internal use only)
- Button: "Email to Candidate" → opens email draft with letter content (uses EmailDraftPanel pattern)

This is the GDPR Article 22 response workflow. Log the generation itself to `audit_logs` (standard audit trigger).

---

## Section 9: Command Bar Intent

Add to `src/lib/ai/intent.ts`:

```
Intent: compliance_view
Trigger phrases: "compliance", "DEI report", "diversity", "EEOC", "AI audit",
                 "adverse impact", "right to explanation", "EU AI Act",
                 "who has AI decisions pending review"
Action: navigate to /analytics/compliance
```

---

## Section 10: Test Plan (declare before writing any code)

### Tier 1 Mandatory

**Unit tests** (`src/__tests__/dei-compliance/`)

| File | Tests | What |
|------|-------|------|
| `eeo-form.test.ts` | 4 | Form renders optional fields, consent required, decline-all still submits, correct data shape |
| `adverse-impact.test.ts` | 5 | 4/5ths rule calculation, k-anonymity threshold (<5 returns null), no data returns clear, flagged pattern detection, aggregate-only output |
| `ai-decision-audit.test.ts` | 4 | Insert shape validation, human review update, no delete possible, export row shape |
| `right-to-explanation.test.ts` | 2 | Generates letter with all AI systems listed, empty AI history returns graceful result |

**Total unit: ~15 tests**

**RLS tests** (`src/__tests__/dei-compliance/*.rls.test.ts`)

| Table | Tests |
|-------|-------|
| `candidate_eeo_profiles` | Recruiter cannot SELECT (policy = false), service role can INSERT, CASCADE delete on candidate delete |
| `ai_decision_audit` | Admin can SELECT own org, recruiter cannot SELECT, service role can INSERT, no UPDATE possible |

**Total RLS: 8 tests**

**Integration tests**

| Test | Description |
|------|-------------|
| EEO form submission | POST to career portal creates eeo_profile row |
| AI audit wiring | Batch shortlist function writes audit row after tier assignment |
| Human review workflow | PATCH marks row reviewed with correct user + timestamp |
| k-anonymity | GET /api/analytics/eeo returns null counts for groups < 5 |
| Right to explanation | API returns letter for candidate with AI decisions |

**Total integration: ~5 tests**

**E2E** (`src/__tests__/e2e/compliance.spec.ts`)

| Test | Description |
|------|-------------|
| EEO form visible on career portal | Apply page shows EEO section as optional |
| Compliance nav gate | Recruiter cannot access /analytics/compliance |
| AI audit log shows decisions | After shortlist run, decisions appear in audit log |

**Total E2E: ~3 tests**

**Grand total: ~31 new tests**

---

## Section 11: GDPR Erasure Update

**Critical — do not skip.** Update `erase_candidate()` function to include EEO deletion:

```sql
-- In erase_candidate() function (find in migrations where it was created):
-- Add before anonymize step:
DELETE FROM candidate_eeo_profiles WHERE candidate_id = p_candidate_id;
DELETE FROM ai_decision_audit WHERE candidate_id = p_candidate_id;
-- ai_decision_audit deletion is permitted for GDPR erasure (legal requirement
-- overrides audit retention — document this decision in migration comment)
```

Also update `docs/GAPS.md` to add two new ADR-006 exceptions:
- `candidate_eeo_profiles` — no soft delete, GDPR hard delete required
- `ai_decision_audit` — append-only, but hard-deleted on GDPR erasure request

---

## Section 12: D29 Inngest Registry Update

No new Inngest functions in this wave — DEI data is collected synchronously and aggregate reports are on-demand. The nightly analytics snapshot (Wave A1) already covers the EEO aggregate computation as a new snapshot_type: add `eeo_daily` to the `analytics_snapshots` CHECK constraint in M033 (or via ALTER in M034).

---

## Section 13: ADR-011 Compliance Checklist

- [ ] **No CRUD-only features** — Compliance dashboard has AI adverse impact narrative, right-to-explanation generation, and AI audit review workflow.
- [ ] **Command bar primary** — `⌘K` → "DEI report" or "AI audit" navigates directly.
- [ ] **No "coming soon"** — All three views (AI audit, EEO pipeline, right to explanation) ship together.
- [ ] **Human-in-the-loop** — Every AI decision has a human review step. The compliance dashboard makes unreviewed decisions visible and actionable.
- [ ] **GDPR compliance** — `erase_candidate()` updated. Right to explanation workflow built. Individual EEO data never exposed to recruiter layer.
- [ ] **EU AI Act Article 13** — `ai_decision_audit` provides the technical documentation log required for high-risk AI systems.

---

## Section 14: Key Constraints

- **Individual EEO data is NEVER exposed to recruiters.** The RLS policy on `candidate_eeo_profiles` returns false for all user-role queries. Only service role (Inngest aggregate computation) can read individual rows. Violating this is a legal liability.
- **Minimum group size of 5 (k-anonymity).** Any EEO aggregate that would reveal a group of fewer than 5 candidates must display "< 5" or be suppressed entirely. This prevents de-anonymization.
- **AI decisions are not grounds for rejection.** The UI must never show the AI tier or match score as a "decision" — always as a "recommendation" with human review required. The compliance dashboard enforces this narrative.
- **4/5ths rule is informational, not automatic.** When a 4/5ths rule violation is detected, the system flags it for human investigation. It does NOT automatically change any hiring decision.
- **M034 must update `erase_candidate()`.** Do not ship M034 without the GDPR erasure update. This is a legal requirement, not a feature.
- **Right to explanation is for served candidates only.** The `generateRightToExplanation()` function should only be accessible for candidates in the org's own pipeline. RLS and auth must prevent generating explanations for other orgs' candidates.

---

## Section 15: CLAUDE.md and DEVLOG Updates

After all code, tests, D34, and GDPR erasure update:
- Write D34 (`docs/modules/DEI-COMPLIANCE.md`) — new Phase 7 document
- Register in `docs/INDEX.md` under "Phase 7" section
- Update `docs/GAPS.md` — document ADR-006 exceptions for both new tables
- Update `docs/DEVLOG.md` with "Phase 7 Wave A2: DEI & Compliance Dashboard"
- Update `CLAUDE.md` current state: Phase 7 Wave A1 ✅ → Wave A2 ✅
- Run §13 post-build audit (A1–A7)
- State test counts before → after

---

*Pass this file to VS Code Claude Code after Phase 7 Wave A1 (Analytics Module, M033) is complete.*
*The `analytics_snapshots` table must exist before M034 runs (eeo_daily snapshot_type references it).*
