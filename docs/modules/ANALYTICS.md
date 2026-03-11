# Analytics & Reporting

> **ID:** D17
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-10
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
| Pipeline funnel | `application_stage_history` aggregation | Append-only table, index on `(org, created_at)` |
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

## 5. Pipeline Funnel

### 5.1 Funnel Query

```typescript
// Server Action: get pipeline funnel for a job
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

  // Count unique candidates per stage
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

### 5.2 Funnel Visualization

Horizontal bar chart showing candidate volume at each stage with passthrough percentages between stages. D05 Design System colors: primary for bars, muted for labels.

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

| Function ID | Trigger | Purpose |
|-------------|---------|---------|
| `analytics-refresh-views` | `cron: 0 2 * * *` | Refresh materialized views daily |
| `analytics-export` | `analytics/export-requested` | Generate analytics CSV export |

## 9. Dashboard Widgets

| Widget | Data | Refresh |
|--------|------|---------|
| Open Requisitions | Count of open jobs | On page load |
| Applications This Week | Count with date filter | On page load |
| Time to Hire (avg) | From `mv_monthly_hiring_summary` | Daily (materialized) |
| Hires This Month | Count from `applications.hired_at` | On page load |
| Pipeline Funnel | Stage counts for selected job | On page load |
| Source Breakdown | Pie chart by `source_id` | On page load |
| Stage Velocity | Avg time-in-stage by stage type | Daily (materialized) |
| Offer Acceptance Rate | Signed / total offers | On page load |

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
