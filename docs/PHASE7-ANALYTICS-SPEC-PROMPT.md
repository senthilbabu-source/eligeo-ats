# Phase 7 — Wave A1: Recruiting Analytics Module
## Spec & Build Prompt for VS Code Claude Code Session

**Phase:** 7 — Wave A1
**Target doc:** D33 (write §1–§12 before any code)
**Migration:** M033 — `analytics_snapshots` table
**Prerequisite:** Phase 6 complete. All 6 waves shipped. `application_stage_history`, `ai_match_explanations`, `ai_shortlist_candidates`, `scorecard_submissions`, `offers` must all have live data.

---

## Section 0: Session Start Protocol (MANDATORY — in order)

1. `CLAUDE.md` — full file, confirm ADR table
2. `docs/DEVLOG.md` — latest entry only
3. `docs/INDEX.md` — register D33 before writing code
4. `docs/modules/PHASE6-CANDIDATE-INTELLIGENCE.md` (D32) — understand what Phase 6 shipped
5. `docs/AI-RULES.md` §21 (G1–G6) and §13 (post-build audit)
6. `docs/TESTING-STRATEGY.md` (D24) — full document
7. `docs/ADRs/004-testing-strategy.md`
8. `src/__fixtures__/golden-tenant.ts` — verify UUIDs
9. `supabase/migrations/` — list files, confirm last number. Analytics migration = M033.
10. `src/lib/ai/generate.ts` — know all existing AI functions
11. `src/lib/utils/dashboard.ts` — understand existing metrics helpers before writing new ones
12. `src/app/(app)/dashboard/page.tsx` — analytics lives alongside, not instead of, the operations dashboard

---

## Section 1: Pre-Start Gate (§21 — state all 6 before any code)

- **G1:** Phase 7, Wave A1 — analytics module. Approved feature per this spec.
- **G2:** This document IS the spec. Write D33 §1–§12 before any code.
- **G3:** ADR compliance — no new stack choices. Supabase client only (ADR-001). New table uses `deleted_at` (ADR-006), audit trigger (ADR-007), CHECK constraints (ADR-008). Analytics snapshots stored in table, not inline URL columns (ADR-009 principle).
- **G4:** Test plan declared in Section 10.
- **G5:** TENANT_A (pro, active pipeline data), TENANT_B (starter, for RLS isolation).
- **G6:** One migration: M033. Adds `analytics_snapshots`. All analytics data computed from existing tables — no schema changes to existing tables.

---

## Section 2: What This Delivers

A dedicated `/analytics` module that gives recruiting teams the data visibility that Ashby uses to win enterprise deals over Greenhouse. Every analytics view is paired with an AI-generated narrative that tells the recruiter what the data means and what to do — not just charts.

**The key ADR-011 principle here:** Charts without AI narrative are a legacy BI pattern. Every analytics surface must answer "so what?" automatically.

**Five analytics views:**

1. **Funnel** — stage conversion rates, where candidates drop off, pass-through benchmarks
2. **Velocity** — time-in-stage, time-to-hire, time-to-fill per job and org-wide
3. **Sources** — volume, hire rate, time-to-hire, cost-per-hire proxy by source
4. **Team** — recruiter pipeline velocity, interviewer feedback timeliness, HM decision speed
5. **Jobs** — per-job performance vs. org benchmarks, health score

---

## Section 3: Schema — Migration M033

**File:** `supabase/migrations/00033_analytics_snapshots.sql`

### New table: `analytics_snapshots`

Pre-computed daily snapshots. Recomputed by Inngest nightly. Avoids expensive full-table scans on every page load. On-demand date-range queries compute live with `unstable_cache`.

```sql
CREATE TABLE analytics_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  snapshot_date     DATE NOT NULL,
  snapshot_type     TEXT NOT NULL
                    CHECK (snapshot_type IN (
                      'funnel_daily',
                      'velocity_daily',
                      'source_daily',
                      'team_daily',
                      'job_daily'
                    )),
  data              JSONB NOT NULL DEFAULT '{}',
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_analytics_snapshots_unique
  ON analytics_snapshots(organization_id, snapshot_date, snapshot_type)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_analytics_snapshots_org_date
  ON analytics_snapshots(organization_id, snapshot_date DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_snapshots"
  ON analytics_snapshots FOR SELECT
  USING (is_org_member(organization_id) AND deleted_at IS NULL);
CREATE POLICY "service_insert_snapshots"
  ON analytics_snapshots FOR INSERT
  WITH CHECK (true); -- service role only via Inngest
CREATE POLICY "service_update_snapshots"
  ON analytics_snapshots FOR UPDATE
  USING (true); -- service role only

CREATE TRIGGER audit_analytics_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON analytics_snapshots
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### JSONB schemas per snapshot_type

**`funnel_daily`**
```json
{
  "period": "2026-03-12",
  "totalApplications": 142,
  "activeApplications": 89,
  "stages": [
    {
      "stageId": "uuid",
      "stageName": "Screening",
      "stageType": "screening",
      "count": 34,
      "enteredCount": 41,
      "exitedCount": 12,
      "conversionRate": 0.71,
      "avgDaysInStage": 3.2
    }
  ],
  "overallConversionRate": 0.08,
  "hiredCount": 4
}
```

**`velocity_daily`**
```json
{
  "period": "2026-03-12",
  "avgTimeToHireDays": 34.2,
  "medianTimeToHireDays": 28.0,
  "avgTimeToFillDays": 41.5,
  "stageVelocity": [
    { "stageName": "Screening", "avgDays": 3.2, "p75Days": 5.1, "p90Days": 8.3 }
  ],
  "bottleneckStage": "Technical Interview",
  "openJobsAtRisk": 3
}
```

**`source_daily`**
```json
{
  "period": "2026-03-12",
  "sources": [
    {
      "sourceName": "LinkedIn",
      "applicationCount": 58,
      "shortlistRate": 0.34,
      "hireRate": 0.12,
      "avgTimeToHireDays": 31.4,
      "qualityScore": 0.78
    }
  ]
}
```

**`team_daily`**
```json
{
  "period": "2026-03-12",
  "recruiters": [
    {
      "userId": "uuid",
      "name": "Sarah Chen",
      "openJobCount": 4,
      "activePipelineCount": 23,
      "avgStageVelocityDays": 4.1,
      "hiredThisMonth": 2,
      "feedbackComplianceRate": 0.91
    }
  ],
  "interviewers": [
    {
      "userId": "uuid",
      "name": "Alex Kim",
      "scheduledCount": 12,
      "completedCount": 11,
      "overdueCount": 1,
      "avgFeedbackTurnaroundHours": 18.3
    }
  ]
}
```

**`job_daily`**
```json
{
  "period": "2026-03-12",
  "jobs": [
    {
      "jobId": "uuid",
      "title": "Senior Engineer",
      "department": "Engineering",
      "daysOpen": 18,
      "applicationCount": 24,
      "activeCount": 14,
      "shortlistCount": 8,
      "interviewCount": 5,
      "offerCount": 1,
      "conversionRate": 0.041,
      "healthScore": 0.72,
      "predictedFillDays": 22
    }
  ]
}
```

---

## Section 4: Analytics Computation Library

**File:** `src/lib/analytics/compute.ts`

Pure functions that compute each snapshot type from raw Supabase data. These are the same functions used by both the Inngest nightly job and the on-demand live API route.

### Key functions to implement:

```typescript
// Funnel conversion rates
export function computeFunnelAnalytics(params: {
  applications: RawApplication[];
  stageHistory: RawStageHistoryRow[];
  stages: RawStage[];
  dateRange: { from: Date; to: Date };
}): FunnelSnapshot

// Time-in-stage + time-to-hire
export function computeVelocityAnalytics(params: {
  applications: RawApplication[];
  stageHistory: RawStageHistoryRow[];
  stages: RawStage[];
  jobs: RawJob[];
  dateRange: { from: Date; to: Date };
}): VelocitySnapshot

// Source quality + hire rate
export function computeSourceAnalytics(params: {
  applications: RawApplication[];
  candidates: RawCandidate[];
  sources: RawCandidateSource[];
  dateRange: { from: Date; to: Date };
}): SourceSnapshot

// Team performance (recruiters + interviewers)
export function computeTeamAnalytics(params: {
  jobs: RawJob[];
  applications: RawApplication[];
  interviews: RawInterview[];
  scorecards: RawScorecardSubmission[];
  profiles: RawUserProfile[];
  dateRange: { from: Date; to: Date };
}): TeamSnapshot

// Per-job health score + prediction
export function computeJobAnalytics(params: {
  jobs: RawJob[];
  applications: RawApplication[];
  stageHistory: RawStageHistoryRow[];
  offers: RawOffer[];
  dateRange: { from: Date; to: Date };
}): JobSnapshot

// Pipeline health score (0–1) per job
export function computeJobHealthScore(params: {
  daysOpen: number;
  applicationCount: number;
  activeCount: number;
  stageVelocityDays: number;
  industryBenchmarkDays: number; // configurable, default 35
}): number

// Predicted days to fill from current pipeline velocity
export function predictTimeToFill(params: {
  currentActiveCount: number;
  avgStageVelocityDays: number;
  stagesRemaining: number;
  historicalFillRate: number; // org's own historical data
}): number | null
```

All functions must be **pure** (no side effects, no Supabase calls) and **exported for unit testing**.

---

## Section 5: AI Analytics Functions

Add to `src/lib/ai/generate.ts`:

### Function: `generateAnalyticsNarrative`

```typescript
export async function generateAnalyticsNarrative(params: {
  view: 'funnel' | 'velocity' | 'source' | 'team' | 'jobs';
  currentPeriod: object;     // snapshot data for current period
  previousPeriod: object;    // snapshot data for prior period (WoW or MoM)
  orgContext: {
    totalOpenJobs: number;
    teamSize: number;
    avgTimeToHire: number;
  };
}): Promise<{
  headline: string;          // one sentence: the most important insight
  narrative: string;         // 2-3 sentences: what the data shows and why it matters
  topAction: string;         // one specific recommended action
  anomalies: string[];       // 0-3 flagged anomalies (statistically unusual patterns)
}>
```

Use GPT-4o-mini (narrative task, not complex reasoning). System prompt: "You are a recruiting analytics expert. Analyze this hiring data and provide clear, actionable insights. Focus on what changed and what the recruiter should do. Be specific, not generic. Avoid hollow phrases like 'it is important to...' or 'you should consider...'. Give direct recommendations."

### Function: `generatePipelineHealthNarrative`

```typescript
export async function generatePipelineHealthNarrative(params: {
  jobTitle: string;
  healthScore: number;
  daysOpen: number;
  applicationCount: number;
  bottleneckStage: string | null;
  predictedFillDays: number | null;
}): Promise<{
  summary: string;           // one sentence health assessment
  primaryRisk: string | null;
  recommendation: string;
}>
```

---

## Section 6: Inngest Function — Nightly Analytics Snapshot

**File:** `src/inngest/functions/analytics/compute-snapshots.ts`

**Pattern:** Same as `generate-briefing.ts` (nightly Inngest cron).

```typescript
export const computeAnalyticsSnapshots = inngest.createFunction(
  {
    id: "analytics-compute-snapshots",
    name: "Analytics: Compute Nightly Snapshots",
    concurrency: { limit: 1 },
  },
  { cron: "0 1 * * *" }, // 1 AM daily — after daily briefing at midnight
  async ({ step }) => {
    // Step 1: Fetch all organizations
    // Step 2: For each org, compute all 5 snapshot types for yesterday
    // Step 3: Upsert into analytics_snapshots (idempotent)
    // Process orgs in batches of 10 to avoid memory pressure
  }
);
```

Also register a manual trigger: `analytics/snapshots.requested` event — so admins can force-recompute from the UI.

**Update D29 (INNGEST-REGISTRY.md)** after writing: add both functions, update total count.

---

## Section 7: API Routes

**On-demand live analytics (for date range queries not covered by snapshots):**

### `GET /api/analytics/funnel`
Query params: `?from=2026-01-01&to=2026-03-12&jobId=optional`
Returns: `FunnelSnapshot` computed live from `application_stage_history` for the range.
Auth: `requireAuth()` + `can(session.orgRole, 'jobs:view')`

### `GET /api/analytics/velocity`
Query params: `?from=...&to=...&recruiterId=optional&department=optional`
Returns: `VelocitySnapshot`

### `GET /api/analytics/sources`
Query params: `?from=...&to=...`
Returns: `SourceSnapshot`

### `GET /api/analytics/team`
Query params: `?from=...&to=...`
Returns: `TeamSnapshot`
Auth: owner/admin only (`can(session.orgRole, 'reports:view')`)

### `GET /api/analytics/jobs`
Returns: `JobSnapshot` for all currently open jobs
Auth: standard recruiter access

### `POST /api/analytics/narrative`
Body: `{ view, currentPeriod, previousPeriod, orgContext }`
Returns: `AnalyticsNarrative`
Rate limited: 10 calls/minute per org (AI cost control)

---

## Section 8: UI — Analytics Module

### Navigation

Add "Analytics" link to the app sidebar nav. Icon: bar chart. Visible to all roles; Team view restricted to owner/admin.

### Page structure

**`/analytics`** — Analytics home (summary + quick links to each view)
**`/analytics/funnel`** — Funnel conversion view
**`/analytics/velocity`** — Velocity + time-to-fill view
**`/analytics/sources`** — Source ROI view
**`/analytics/team`** — Team performance (owner/admin only)
**`/analytics/jobs`** — Per-job health scores

### Layout pattern (same for all views)

```
[Date Range Picker] [Department filter] [Refresh]

[AI Narrative Card]                        ← always first
  Headline: one sentence
  Narrative: 2-3 sentences
  Recommended Action: one clear CTA
  [Anomalies: 0-3 amber badges if present]

[Primary Chart]                            ← view-specific

[Data Table]                               ← sortable, linked to source records
```

**Critical ADR-011 rule:** The AI Narrative Card renders BEFORE the charts. Every analytics view must answer "so what?" before showing the numbers. If the narrative hasn't loaded yet, show a skeleton. Never show charts without the narrative context.

### AI Narrative Card Component

**File:** `src/components/analytics/ai-narrative-card.tsx`

Client component. On mount, fetches narrative from `POST /api/analytics/narrative`. Shows loading skeleton during generation (typically 1-2 seconds). Narrative is cached per org+view+date-range in Upstash Redis (15-minute TTL).

```tsx
<AiNarrativeCard
  view="funnel"
  currentPeriod={funnelData}
  previousPeriod={previousFunnelData}
  orgContext={orgContext}
/>
```

### Funnel View (`/analytics/funnel`)

**File:** `src/app/(app)/analytics/funnel/page.tsx`

Primary chart: Horizontal bar chart showing each stage with:
- Application count (absolute)
- Conversion rate from previous stage (%)
- Color coding: green (>60% conversion), amber (40–60%), red (<40%)
- Click-through: clicking a stage filters candidates list to that stage

No external chart library. Implement as pure CSS/div bars — same pattern as existing JD quality bars in the codebase.

Data table: One row per stage — Name, Count, Entered, Exited, Conversion Rate, Avg Days in Stage.

### Velocity View (`/analytics/velocity`)

Primary content: Three metric cards — Avg Time to Hire, Median Time to Hire, Avg Time to Fill.

Stage velocity chart: Horizontal bars showing avg days per stage. Highlight the bottleneck stage (longest avg) in amber.

Trend chart: 12-week rolling time-to-hire line (use snapshots for historical data).

### Source View (`/analytics/sources`)

Primary chart: Bubble chart alternative — table with inline bar visualizations per source:
- Source name
- Applications (bar)
- Shortlist rate (%)
- Hire rate (%)
- Avg time to hire (days)
- Quality score (composite 0–100)

Quality score = weighted: `(hire_rate × 0.5) + (shortlist_rate × 0.3) + (speed_index × 0.2)`
where `speed_index = 1 - (avg_time_to_hire / org_max_time_to_hire)`

### Team View (`/analytics/team`)

**Access:** owner/admin only. Gate with `can(session.orgRole, 'reports:view')`. Return 403 for recruiters.

Two sections:
1. **Recruiters** — open jobs, pipeline count, avg velocity, hires this month
2. **Interviewers** — assigned interviews, completed, overdue, avg feedback turnaround hours

Note at bottom: "Team performance data is for coaching purposes. Share insights constructively."

### Jobs View (`/analytics/jobs`)

Per-job health score dashboard. Each job row shows:
- Title + department
- Health score (0–100, color coded) with tooltip explaining score components
- Days open
- Application count → Active count funnel inline
- Predicted fill date (AI-generated or rule-based)
- Link to full pipeline

Health score visual: a small circular indicator (CSS, not chart library) — 0–100 with green/amber/red zones.

---

## Section 9: Command Bar Intent

Add to `src/lib/ai/intent.ts`:

```
Intent: analytics_view
Trigger phrases: "analytics", "funnel", "conversion rate", "time to hire",
                 "pipeline report", "source quality", "team performance",
                 "show me the numbers", "how are we doing", "hiring velocity"
Action: navigate to /analytics (or specific sub-view if mentioned)
```

---

## Section 10: Test Plan (declare before writing any code)

### Tier 1 Mandatory

**Unit tests** (`src/__tests__/analytics/`)

| File | Tests | What |
|------|-------|------|
| `compute-funnel.test.ts` | 5 | Conversion rate calculation, zero-entry stage, 100% conversion, empty pipeline, date range filter |
| `compute-velocity.test.ts` | 5 | Time-to-hire calculation, null hired_at handling, median vs avg, bottleneck detection, empty range |
| `compute-source.test.ts` | 4 | Quality score formula, unknown source handling, tie-breaking, zero hire rate |
| `compute-team.test.ts` | 4 | Recruiter pipeline count, interviewer feedback rate, overdue detection, feedback turnaround |
| `compute-job-health.test.ts` | 4 | Health score at boundary values (0, 0.5, 1.0), prediction formula |
| `generate-narrative.test.ts` | 2 | Correct schema shape returned, anomaly detection when conversion drops >20% |

**Total unit: ~24 tests**

**RLS tests** (`src/__tests__/analytics/*.rls.test.ts`)

| Table | Tests |
|-------|-------|
| `analytics_snapshots` | SELECT own org ✓, SELECT other org ✗, INSERT service role ✓, INSERT user ✗ |

**Total RLS: 4 tests**

**Integration tests**

| Test | Description |
|------|-------------|
| `GET /api/analytics/funnel` | Returns correct shape, respects date range |
| `GET /api/analytics/team` | Returns 403 for recruiter role, 200 for admin |
| Inngest snapshot | Runs compute functions, upserts snapshots |
| Narrative cache | Second call within 15min returns cached response |

**Total integration: ~5 tests**

**E2E** (`src/__tests__/e2e/analytics.spec.ts`)

| Test | Description |
|------|-------------|
| Analytics navigation | /analytics loads, all 5 view links work |
| AI narrative renders | Funnel view shows narrative card before charts |
| Team view gate | Recruiter redirected, admin sees full team table |

**Total E2E: ~3 tests**

**Grand total: ~36 new tests**

---

## Section 11: D29 Inngest Registry Update

After writing `compute-snapshots.ts`:
- Add `analytics/compute-snapshots` as next function number
- Trigger: `{ cron: "0 1 * * *" }` + `analytics/snapshots.requested` event
- Status: v1.0
- Update total function count

---

## Section 12: ADR-011 Compliance Checklist

- [ ] **No CRUD-only features** — Every analytics view has AI narrative before charts. No view is purely numbers.
- [ ] **Command bar primary** — `⌘K` → "show funnel analytics" navigates directly. Achievable in one step.
- [ ] **No "coming soon" dead-ends** — All 5 views ship with the wave. No placeholder pages.
- [ ] **No "v2.0" on AI** — AI narrative ships with the module. Not deferred.
- [ ] **Anomaly detection active** — `generateAnalyticsNarrative()` flags statistically unusual patterns (>20% change WoW) as anomalies in the narrative.
- [ ] **Human context preserved** — Analytics is insight, not automation. The AI says "here's what to do" — it doesn't do it. Recruiter acts on the recommendation.

---

## Section 13: Key Constraints

- **No chart library.** Use CSS/div bars and percentage widths — same pattern as existing JD quality bars, source attribution bars in the codebase. Adding recharts/chart.js adds bundle weight and a new dependency for something CSS can handle.
- **Snapshots are append-only.** Never update a snapshot row — always upsert by (org_id, date, type) unique index. Treat historical snapshots as immutable once computed.
- **Team view is owner/admin only.** Individual performance data is sensitive. Gate strictly with `can(session.orgRole, 'reports:view')`. If that permission doesn't exist yet, add it to `src/lib/constants/roles.ts`.
- **AI narrative is non-blocking.** The page renders with charts immediately. The narrative card shows a skeleton and loads async. Never block the analytics page on AI generation.
- **Date range default.** Default to last 30 days. Offer: 7 days, 30 days, 90 days, this quarter, this year, custom range.
- **ADR-001.** All queries via Supabase client. Compute in application layer (TypeScript pure functions), not in PG stored procedures.

---

## Section 14: CLAUDE.md and DEVLOG Updates

After all code, tests, and D33 §1–§12 are written:
- Write D33 (`docs/modules/ANALYTICS-MODULE.md`) — new Phase 7 document
- Register in `docs/INDEX.md` under new "Phase 7" section
- Update `docs/DEVLOG.md` with "Phase 7 Wave A1: Analytics Module"
- Update `CLAUDE.md` current state: Phase 6 ✅ → Phase 7 Wave A1 ✅
- Run §13 post-build audit (A1–A7)
- State test counts before → after

---

*Pass this file to VS Code Claude Code after Phase 6 is fully complete.*
*All 6 Phase 6 waves must be committed and M030–M032 applied before starting this session.*
