# D33 — Recruiting Analytics Module

> **ID:** D33
> **Status:** In Progress
> **Priority:** P1
> **Phase:** 7 — Wave A1
> **Last updated:** 2026-03-13
> **Depends on:** D01 (schema), D12 (Workflow — stage transitions), D13 (Compliance — DEI suppression rules), D17 (Analytics spec — metrics definitions)
> **Architecture decisions:** ADR-001 (Supabase client), ADR-006 (soft delete), ADR-007 (audit trigger), ADR-008 (CHECK constraints), ADR-011 (AI-first)

---

## 1. Overview

A dedicated `/analytics` module that gives recruiting teams data visibility paired with AI-generated narratives. Every analytics view answers "so what?" automatically — charts without AI narrative are a legacy BI pattern (ADR-011).

**Five analytics views:**
1. **Funnel** — stage conversion rates, drop-off analysis, pass-through benchmarks
2. **Velocity** — time-in-stage, time-to-hire, time-to-fill per job and org-wide
3. **Sources** — volume, hire rate, time-to-hire, quality score by source
4. **Team** — recruiter pipeline velocity, interviewer feedback timeliness (owner/admin only)
5. **Jobs** — per-job performance vs. org benchmarks, health score, predicted fill date

---

## 2. Schema — Migration M033

**File:** `supabase/migrations/00033_analytics_snapshots.sql`

### New table: `analytics_snapshots`

Pre-computed daily snapshots. Recomputed by Inngest nightly. Avoids expensive full-table scans on every page load.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | `gen_random_uuid()` |
| `organization_id` | UUID FK → organizations | Tenant scoping |
| `snapshot_date` | DATE | The date this snapshot covers |
| `snapshot_type` | TEXT CHECK | `funnel_daily`, `velocity_daily`, `source_daily`, `team_daily`, `job_daily` |
| `data` | JSONB | Snapshot payload (schema per type — see §2.1) |
| `computed_at` | TIMESTAMPTZ | When this snapshot was computed |
| `deleted_at` | TIMESTAMPTZ | Soft delete (ADR-006) |

**Indexes:**
- Unique partial: `(organization_id, snapshot_date, snapshot_type) WHERE deleted_at IS NULL`
- Lookup: `(organization_id, snapshot_date DESC) WHERE deleted_at IS NULL`

**RLS:** org members can SELECT own org. INSERT/UPDATE via service role only (Inngest).

**Audit trigger:** `audit_trigger_func()` (ADR-007).

### 2.1 JSONB Schemas

**`funnel_daily`** — stages array with count, enteredCount, exitedCount, conversionRate, avgDaysInStage. Plus totalApplications, activeApplications, overallConversionRate, hiredCount.

**`velocity_daily`** — avgTimeToHireDays, medianTimeToHireDays, avgTimeToFillDays, stageVelocity array (avgDays, p75Days, p90Days per stage), bottleneckStage, openJobsAtRisk.

**`source_daily`** — sources array with applicationCount, shortlistRate, hireRate, avgTimeToHireDays, qualityScore.

**`team_daily`** — recruiters array (openJobCount, activePipelineCount, avgStageVelocityDays, hiredThisMonth, feedbackComplianceRate). Interviewers array (scheduledCount, completedCount, overdueCount, avgFeedbackTurnaroundHours).

**`job_daily`** — jobs array with daysOpen, applicationCount, activeCount, shortlistCount, interviewCount, offerCount, conversionRate, healthScore, predictedFillDays.

---

## 3. Compute Library

**File:** `src/lib/analytics/compute.ts`

Pure functions — no side effects, no Supabase calls. Same functions used by both Inngest nightly job and on-demand API routes.

- `computeFunnelAnalytics()` — conversion rates from `application_stage_history`
- `computeVelocityAnalytics()` — time-in-stage via window function logic, time-to-hire, bottleneck detection
- `computeSourceAnalytics()` — quality score = `(hire_rate × 0.5) + (shortlist_rate × 0.3) + (speed_index × 0.2)`
- `computeTeamAnalytics()` — recruiter pipeline + interviewer feedback metrics
- `computeJobAnalytics()` — per-job health score + predicted fill date
- `computeJobHealthScore()` — 0–1 score from daysOpen, applicationCount, activeCount, stageVelocity
- `predictTimeToFill()` — prediction from current pipeline velocity + historical fill rate

---

## 4. AI Functions

Added to `src/lib/ai/generate.ts`:

### `generateAnalyticsNarrative`
- Input: view type, current period data, previous period data, org context
- Output: headline (1 sentence), narrative (2–3 sentences), topAction (1 recommendation), anomalies (0–3 flags for >20% WoW changes)
- Model: gpt-4o-mini (narrative, not complex reasoning)

### `generatePipelineHealthNarrative`
- Input: job title, health score, days open, application count, bottleneck stage, predicted fill days
- Output: summary (1 sentence), primaryRisk, recommendation

---

## 5. Inngest Function

**File:** `src/inngest/functions/analytics/compute-snapshots.ts`

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `analytics-compute-snapshots` | `cron: 0 1 * * *` + `ats/analytics.snapshots-requested` | Compute all 5 snapshot types for each org. Batch orgs in groups of 10. Idempotent upsert by unique index. |

---

## 6. API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/analytics/funnel` | JWT + `analytics:view` | Funnel snapshot or live compute for date range |
| GET | `/api/analytics/velocity` | JWT + `analytics:view` | Velocity metrics |
| GET | `/api/analytics/sources` | JWT + `analytics:view` | Source quality metrics |
| GET | `/api/analytics/team` | JWT + `reports:view` | Team performance (owner/admin only) |
| GET | `/api/analytics/jobs` | JWT + `analytics:view` | Per-job health scores |
| POST | `/api/analytics/narrative` | JWT + `analytics:view` | AI narrative generation (rate limited: 10/min/org) |

---

## 7. UI

### Navigation
"Analytics" link in app sidebar nav, between "Pools" and "Settings".

### Pages
- `/analytics` — summary home with quick links to each view
- `/analytics/funnel` — stage conversion bars + data table
- `/analytics/velocity` — time-to-hire cards + stage velocity bars + 12-week trend
- `/analytics/sources` — source table with inline bars + quality scores
- `/analytics/team` — recruiter + interviewer tables (owner/admin only)
- `/analytics/jobs` — per-job health score dashboard

### AI Narrative Card
Every view renders an `AiNarrativeCard` BEFORE charts (ADR-011). Client component, async fetch from narrative API. Shows skeleton during loading. Never blocks page render.

### No chart library
CSS/div bars + percentage widths — same pattern as existing JD quality bars and source attribution.

---

## 8. Plan Gating (D17 §10)

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| Basic dashboard (counts) | ✅ | ✅ | ✅ | ✅ |
| Analytics module | ❌ | ✅ | ✅ | ✅ |
| Time-in-stage analytics | ❌ | ❌ | ✅ | ✅ |
| Team performance | ❌ | ❌ | ✅ | ✅ |
| AI narratives | ❌ | ❌ | ✅ | ✅ |
| Custom date ranges | ❌ | 90 days | 1 year | Unlimited |

---

## 9. Command Bar Intent

```
Intent: analytics_view
Trigger: "analytics", "funnel", "conversion rate", "time to hire",
         "pipeline report", "source quality", "team performance",
         "show me the numbers", "how are we doing", "hiring velocity"
Action: navigate to /analytics (or specific sub-view if mentioned)
```

---

## 10. Security

- All queries org-scoped via RLS
- Team view restricted to owner/admin (`reports:view` permission)
- DEI data follows D13 suppression rules (min cohort 5)
- CSV exports (future) admin-only, aggregate data only
- AI narrative rate limited (10 calls/min/org)

---

## 11. Test Plan

| Category | Count | Details |
|----------|-------|---------|
| Unit (compute functions) | ~24 | Funnel (5), velocity (5), source (4), team (4), job health (4), narrative (2) |
| RLS (analytics_snapshots) | 4 | SELECT own ✓, SELECT other ✗, INSERT service ✓, INSERT user ✗ |
| Integration (API) | ~5 | Funnel endpoint, team 403/200, Inngest upsert, narrative cache |
| E2E | ~3 | Analytics nav, narrative renders, team view gate |
| **Total** | **~36** | |

---

## 12. ADR-011 Compliance

- [x] No CRUD-only features — every view has AI narrative before charts
- [x] Command bar primary — `⌘K` → "show funnel analytics" navigates directly
- [x] No "coming soon" dead-ends — all 5 views ship with the wave
- [x] No "v2.0" on AI — narratives ship with the module
- [x] Anomaly detection active — flags >20% WoW changes
- [x] Human context preserved — AI recommends, human acts
