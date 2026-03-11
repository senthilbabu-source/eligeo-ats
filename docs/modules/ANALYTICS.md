# Analytics & Reporting

> **ID:** D17
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-11
> **Depends on:** D01 (schema — applications, application_stage_history, interviews, offers), D12 (Workflow — stage transitions, SLA events), D13 (Compliance — DEI aggregation rules)
> **Depended on by:** — (terminal document)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-007 (audit logging)

---

## 1. Overview

Analytics & Reporting defines the metrics, data model, and reporting capabilities for the ATS. This covers recruiting pipeline metrics, time-based analytics, source attribution, DEI reporting (consuming D13 aggregation rules), and dashboard design. The system uses on-the-fly queries with strategic materialized views for expensive aggregations.

**Scope:**
- In scope: Key recruiting metrics, pipeline funnel analytics, time-in-stage calculations, source attribution, DEI reporting (D13 rules), offer analytics, dashboard widgets, report exports.
- Out of scope: Real-time analytics dashboards (use D11 Realtime for live updates), custom report builder (post-MVP), predictive analytics (post-MVP).

## 2. Key Metrics

### 2.1 Pipeline Metrics

| Metric | Definition | Query Source |
|--------|-----------|-------------|
| **Time to Hire** | Days from `applications.applied_at` to `applications.hired_at` | `applications` |
| **Time to Fill** | Days from `job_openings.published_at` to first hire | `job_openings` + `applications` |
| **Time in Stage** | Days between consecutive `application_stage_history` entries | `application_stage_history` |
| **Passthrough Rate** | % of candidates advancing from stage N to stage N+1 | `application_stage_history` |
| **Offer Acceptance Rate** | Signed offers / total offers sent | `offers` |
| **Application-to-Interview Rate** | Applications reaching interview stage / total | `application_stage_history` |
| **Interview-to-Offer Rate** | Applications reaching offer stage / interviewed | `application_stage_history` |

### 2.2 Volume Metrics

| Metric | Definition | Query Source |
|--------|-----------|-------------|
| **Open Requisitions** | Count of `job_openings` with `status = 'open'` | `job_openings` |
| **Applications Received** | Count of new applications in period | `applications.applied_at` |
| **Active Candidates** | Count of `applications` with `status = 'active'` | `applications` |
| **Hires** | Count of `applications` with `status = 'hired'` in period | `applications.hired_at` |
| **Rejections** | Count of rejections in period | `applications.rejected_at` |
| **Withdrawals** | Count of withdrawals in period | `applications.withdrawn_at` |

### 2.3 Source Attribution

| Metric | Definition | Query Source |
|--------|-----------|-------------|
| **Source Volume** | Applications by `candidates.source_id` | `candidates` + `applications` |
| **Source Quality** | Hire rate by source | `candidates` + `applications` (hired) |
| **Source Cost per Hire** | (Calculated externally) / hires by source | Manual input + source volume |
| **Referral Rate** | Applications with `referrer_id` / total | `applications` |

## 3. Data Model

### 3.1 Query Strategy

| Query Type | Approach | Rationale |
|-----------|----------|-----------|
| Dashboard widgets (counts) | Direct SQL with date range | Fast with indexes, sub-100ms |
| Current stage distribution | `applications.current_stage_id` aggregation | **Current implementation (Phase 2.7).** Snapshot of where candidates are now — not passthrough rates. Fast, no history table needed. |
| Pipeline funnel (flow-through) | `application_stage_history` aggregation | **Phase 3 upgrade path.** Counts unique `application_id` per `to_stage_id` — shows cumulative passthrough, not just current occupancy. Blocked until Phase 3 populates the table. |
| Time-in-stage | Window function on `application_stage_history` | Calculated on-the-fly per request |
| DEI reporting | Aggregation with D13 suppression rules | Small data volume, no materialization needed |
| Historical trends | Materialized view, refreshed daily | Expensive cross-table joins |

### 3.2 Materialized Views

```sql
-- Daily pipeline snapshot (refreshed by Inngest cron at 2am UTC)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_pipeline_stats AS
SELECT
  a.organization_id,
  date_trunc('day', ash.created_at) AS stat_date,
  ps.stage_type,
  ps.name AS stage_name,
  COUNT(*) AS transition_count,
  COUNT(DISTINCT a.candidate_id) AS unique_candidates
FROM application_stage_history ash
JOIN applications a ON a.id = ash.application_id
JOIN pipeline_stages ps ON ps.id = ash.to_stage_id
WHERE ash.deleted_at IS NULL AND a.deleted_at IS NULL
GROUP BY a.organization_id, stat_date, ps.stage_type, ps.name;

CREATE UNIQUE INDEX idx_mv_pipeline_stats
  ON mv_daily_pipeline_stats(organization_id, stat_date, stage_type, stage_name);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_pipeline_stats()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_pipeline_stats;
END;
$$;
```

```sql
-- Monthly hiring summary
-- NOTE: This materialized view is a Phase 3 target. Until application_stage_history has
-- sufficient data, Time-to-Hire is computed on-the-fly via direct query on applications
-- (WHERE status = 'hired' AND hired_at IS NOT NULL). The direct query uses:
-- AVG(EXTRACT(EPOCH FROM (hired_at - applied_at)) / 86400) to return days as a float,
-- not a Postgres interval type. Switch to this materialized view once Phase 3 data is rich.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_hiring_summary AS
SELECT
  organization_id,
  date_trunc('month', hired_at) AS hire_month,
  COUNT(*) AS total_hires,
  AVG(EXTRACT(EPOCH FROM (hired_at - applied_at)) / 86400)::NUMERIC(5,1) AS avg_time_to_hire_days,
  job_opening_id
FROM applications
WHERE status = 'hired' AND hired_at IS NOT NULL AND deleted_at IS NULL
GROUP BY organization_id, hire_month, job_opening_id;

CREATE UNIQUE INDEX idx_mv_hiring_summary
  ON mv_monthly_hiring_summary(organization_id, hire_month, job_opening_id);
```

### 3.3 Materialized View Refresh

```typescript
export const analyticsRefreshViews = inngest.createFunction(
  { id: 'analytics-refresh-views' },
  { cron: '0 2 * * *' }, // Daily at 2am UTC
  async ({ step }) => {
    const supabase = createServiceClient();

    await step.run('refresh-pipeline-stats', async () => {
      await supabase.rpc('refresh_pipeline_stats');
    });

    await step.run('refresh-hiring-summary', async () => {
      await supabase.rpc('refresh_materialized_view', {
        view_name: 'mv_monthly_hiring_summary',
      });
    });
  }
);
```

## 4. Time-in-Stage Calculation

```sql
-- Calculate time in each stage for an application
SELECT
  ash.to_stage_id,
  ps.name AS stage_name,
  ps.stage_type,
  ash.created_at AS entered_at,
  LEAD(ash.created_at) OVER (
    PARTITION BY ash.application_id ORDER BY ash.created_at
  ) AS exited_at,
  EXTRACT(EPOCH FROM (
    COALESCE(
      LEAD(ash.created_at) OVER (PARTITION BY ash.application_id ORDER BY ash.created_at),
      NOW()
    ) - ash.created_at
  )) / 3600 AS hours_in_stage
FROM application_stage_history ash
JOIN pipeline_stages ps ON ps.id = ash.to_stage_id
WHERE ash.application_id = $1
  AND ash.deleted_at IS NULL
ORDER BY ash.created_at;
```

## 5. Pipeline Stage Distribution & Funnel

### 5.1 Current Implementation — Stage Distribution (Phase 2.7)

The dashboard widget is labelled **"Current Stage Distribution"** (not "Pipeline Funnel"). It shows a snapshot of where active candidates are right now — how many applications have `current_stage_id = X` at query time. This is a pipeline depth view, not a passthrough funnel.

**Why this distinction matters:** If 40 candidates entered Phone Screen and 38 were rejected there, the snapshot shows Phone Screen = 2 (currently sitting there). A real funnel would show Phone Screen = 40 (cumulative entrants). The snapshot is useful for workload distribution; the funnel is useful for diagnosing drop-off. Both are valid but different.

```typescript
// dashboard/page.tsx — current stage distribution (Phase 2.7 implementation)
// Groups active applications by current_stage_id, filters to default template (R3)
const { data: stageRows } = await supabase
  .from('applications')
  .select(`
    current_stage_id,
    pipeline_stages!inner(name, stage_order, stage_type, pipeline_template_id)
  `)
  .eq('organization_id', orgId)
  .eq('status', 'active')
  .is('deleted_at', null);

// aggregateFunnel() in lib/utils/dashboard.ts:
// Groups by current_stage_id, filters to defaultTemplateId, sorts by stage_order
```

Each bar links to `/candidates?stage=<stage_id>` — the candidates list supports a `stage` filter param that pre-fetches candidate IDs from `applications WHERE current_stage_id = stage`.

### 5.2 Phase 3 Upgrade — True Passthrough Funnel

When `application_stage_history` has sufficient data (Phase 3), switch the query source from `applications.current_stage_id` to `application_stage_history.to_stage_id`, counting unique `application_id` per stage. This shows cumulative entrants, not current occupancy.

```typescript
// Phase 3 target: get pipeline funnel for a job using stage history
async function getPipelineFunnel(jobId: string, dateRange: DateRange) {
  const supabase = await createClient();

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name, stage_type, stage_order')
    .eq('pipeline_template_id', job.pipeline_template_id)
    .is('deleted_at', null)
    .order('stage_order');

  const { data: transitions } = await supabase
    .from('application_stage_history')
    .select('to_stage_id, application_id')
    .eq('organization_id', orgId)
    .in('application_id', applicationIds)
    .gte('created_at', dateRange.from)
    .lte('created_at', dateRange.to)
    .is('deleted_at', null);

  // Count unique candidates per stage (cumulative entrants)
  const stageCounts = stages.map((stage) => {
    const uniqueApps = new Set(
      transitions
        .filter((t) => t.to_stage_id === stage.id)
        .map((t) => t.application_id)
    );
    return {
      stage_id: stage.id,
      stage_name: stage.name,
      stage_type: stage.stage_type,
      count: uniqueApps.size,
    };
  });

  // Calculate passthrough rates
  return stageCounts.map((stage, i) => ({
    ...stage,
    passthrough_rate: i > 0 && stageCounts[i - 1].count > 0
      ? ((stage.count / stageCounts[i - 1].count) * 100).toFixed(1)
      : null,
  }));
}
```

### 5.3 Visualization

Current Stage Distribution: horizontal bar chart, bars link to `/candidates?stage=<id>`. D05 Design System colors: primary for bars, muted for labels.

Phase 3 funnel: same layout, adds passthrough rate percentages between bars.

## 6. DEI Reporting

DEI reporting consumes D13 §6 aggregation rules:
- Minimum cohort size: 5 candidates
- Max 2 cross-tabulation dimensions
- Suppression cascade for complementary rows
- 3-month minimum rolling window

### 6.1 Available Reports

| Report | Dimensions | Plan | Format |
|--------|-----------|------|--------|
| Applicant demographics | Gender, ethnicity (single) | Growth+ | Dashboard chart |
| Hiring demographics | Gender, ethnicity (single) | Pro+ | Dashboard chart |
| Pipeline equity | Stage passthrough by gender | Pro+ | Dashboard chart |
| EEO-1 Component 1 | Job category × race × gender | Pro+ | CSV export |

### 6.2 Report Generation

```typescript
async function getDEIReport(orgId: string, dimension: string, dateRange: DateRange) {
  const supabase = createServiceClient();

  const { data: deiRecords } = await supabase
    .from('candidate_dei_data')
    .select('data')
    .eq('organization_id', orgId)
    .gte('collected_at', dateRange.from)
    .lte('collected_at', dateRange.to)
    .is('deleted_at', null);

  // Apply D13 aggregation rules
  return aggregateDEI(deiRecords.map((r) => r.data), dimension);
}
```

## 7. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/analytics/dashboard` | JWT | Dashboard widget data (counts, trends) |
| GET | `/api/v1/analytics/funnel/:jobId` | JWT | Pipeline funnel for a job |
| GET | `/api/v1/analytics/time-in-stage/:jobId` | JWT | Average time in each stage |
| GET | `/api/v1/analytics/sources` | JWT | Source attribution metrics |
| GET | `/api/v1/analytics/time-to-hire` | JWT | Time-to-hire trends |
| GET | `/api/v1/analytics/dei` | JWT (owner/admin) | Aggregated DEI report |
| GET | `/api/v1/analytics/export` | JWT (admin) | Export analytics as CSV |

## 8. Inngest Functions

| Function ID | Trigger | Purpose | Phase |
|-------------|---------|---------|-------|
| `analytics/refresh-views` | `cron: 0 2 * * *` | Refresh materialized views daily | v1.1 |
| `analytics/export` | `ats/analytics.export-requested` | Generate analytics CSV export | v1.1 |
| `analytics/generate-briefing` | `ats/analytics.briefing-requested` (on-demand) or piggybacked on `analytics/refresh-views` | Generate and cache daily AI briefing per org. Reads pipeline snapshot, calls OpenAI structured output, upserts `org_daily_briefings(org_id, date)`. Cache-first: skips OpenAI if today's row exists. Logs to `ai_usage_logs` with `action = 'daily_briefing'`. | v1.0 (Wave 3) |

## 9. Dashboard Widgets

> Phase column: ✅ = built (Phase 2.7) · Wave N = upcoming enhancement · P3/P4 = phase-gated

| Widget | Data Source | Refresh | Phase |
|--------|------------|---------|-------|
| Active Jobs | `job_openings WHERE status='open'` | On page load | ✅ |
| Hires This Month + avg Time to Hire | `applications WHERE status='hired' AND hired_at >= start_of_month`; avg via `EXTRACT(EPOCH FROM (hired_at - applied_at))/86400` | On page load | Wave 1 |
| Active Applications | `applications WHERE status='active'` | On page load | ✅ |
| Received (this week) | `applications WHERE applied_at >= 7 days ago` | On page load | ✅ |
| Current Stage Distribution | `applications.current_stage_id` grouped by stage, filtered to default template. Bars link to `/candidates?stage=<id>` | On page load | Wave 1 (renamed + interactive) |
| Source Volume + Quality | Active apps by source (volume); hired apps by source (hire rate, min cohort 5 per D13) | On page load | Wave 2 |
| At-Risk Jobs | Open jobs ≥21 days AND <3 active apps AND no app in last 7 days. Always renders (green empty state when all jobs healthy) | On page load | Wave 2 |
| Recent Applications | Latest 5 apps with candidate name, job title, stage, status. Each row links to `/candidates/<id>` | On page load | Wave 1 (enhanced) |
| Daily AI Briefing | Cached `org_daily_briefings` (today). Cache miss → OpenAI structured output (win, blocker, action). Regenerate button (admin only). Suspense boundary. | Cached daily; on-demand for admin regen | Wave 3 |
| Data Freshness | Server render timestamp ("as of HH:MM") | On page load | Wave 1 |
| Stage Velocity | Avg days per stage from `application_stage_history` window function | Daily (materialized) | Phase 3 |
| Offer Acceptance Rate | Signed / total offers from `offers` table | On page load | Phase 4 |

## 10. Plan Gating

| Feature | Starter | Growth | Pro | Enterprise |
|---------|---------|--------|-----|------------|
| Basic dashboard (counts) | ✅ | ✅ | ✅ | ✅ |
| Pipeline funnel | ❌ | ✅ | ✅ | ✅ |
| Source attribution | ❌ | ✅ | ✅ | ✅ |
| Time-in-stage analytics | ❌ | ❌ | ✅ | ✅ |
| DEI reporting | ❌ | ❌ | ✅ | ✅ |
| CSV export | ❌ | ❌ | ✅ | ✅ |
| Custom date ranges | ❌ | 90 days | 1 year | Unlimited |

## 11. Security Considerations

- **DEI data isolation:** Individual DEI records never exposed. Only aggregated data with D13 suppression rules.
- **Org-scoped queries:** All analytics queries include `organization_id` filter via RLS.
- **Export access control:** CSV exports require admin role. Exports contain aggregate data only, no PII.
- **Materialized view access:** Views are refreshed by service role. RLS applies to the underlying tables, not the views — query functions enforce org scoping.
