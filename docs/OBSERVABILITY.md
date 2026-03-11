# Observability & Monitoring

> **ID:** D14
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-10
> **Depends on:** D02 (API — error format, rate limiting), D08 (Notifications — alert delivery)
> **Depended on by:** D18 (Security Runbooks — alerting integration, incident response)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-002 (Next.js 16)

---

## 1. Overview

Observability & Monitoring defines how the ATS collects, structures, and acts on operational data. This covers structured logging, error tracking (Sentry), application metrics, alerting, SLOs, health endpoints, and Inngest function monitoring. The system uses a three-pillar approach: logs (Pino), traces/errors (Sentry), metrics (Vercel Analytics + custom).

**Scope:**
- In scope: Structured logging, Sentry error tracking, health endpoints, SLO definitions, alerting rules, Inngest observability, Supabase monitoring, Vercel deployment monitoring, custom metrics.
- Out of scope: Infrastructure monitoring (Supabase/Vercel managed), APM tracing (future), log aggregation service selection (Datadog/Axiom — decided at deploy time).

## 2. Logging

### 2.1 Logger Setup (Pino)

```typescript
// lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: () => ({}), // Omit hostname/pid in serverless
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.api_key',
      'candidate.email',
      'candidate.phone',
    ],
    censor: '[REDACTED]',
  },
});

// Create child logger with request context
export function createRequestLogger(requestId: string, orgId?: string) {
  return logger.child({
    request_id: requestId,
    org_id: orgId,
    service: 'ats-api',
  });
}
```

### 2.2 Log Schema

Every log entry includes:

| Field | Type | Source | Example |
|-------|------|--------|---------|
| `level` | string | Pino | `"info"`, `"error"`, `"warn"` |
| `time` | ISO 8601 | Pino | `"2026-03-10T14:30:00.000Z"` |
| `request_id` | UUID | `x-request-id` header or generated | `"abc-123"` |
| `org_id` | UUID | JWT claims | `"org-456"` |
| `user_id` | UUID | JWT claims | `"user-789"` |
| `service` | string | Static | `"ats-api"` |
| `msg` | string | Application | `"Application stage moved"` |
| `err` | object | Error | `{ message, stack, code }` |
| `duration_ms` | number | Timing | `142` |

### 2.3 Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `fatal` | Process cannot continue | Database connection pool exhausted |
| `error` | Operation failed, needs attention | Inngest function permanently failed, Stripe webhook invalid |
| `warn` | Degraded but operational | Rate limit approaching, Nylas API slow response, SLA breach |
| `info` | Business events | Application created, stage moved, offer sent, user login |
| `debug` | Development diagnostics | SQL query details, cache hit/miss, Realtime channel events |
| `trace` | Verbose debugging | Request/response payloads (never in production) |

**Production default:** `info`. Debug via `LOG_LEVEL` env var (per-deployment override).

### 2.4 Structured Log Examples

```typescript
// Business event
log.info({
  event: 'application.stage_changed',
  application_id: app.id,
  from_stage: fromStage.name,
  to_stage: toStage.name,
  duration_ms: Date.now() - startTime,
}, 'Application stage moved');

// Error with context
log.error({
  err: error,
  event: 'nylas.sync_failed',
  grant_id: grant.id,
  retry_count: attempt,
}, 'Nylas calendar sync failed');

// Performance warning
log.warn({
  event: 'query.slow',
  table: 'candidates',
  duration_ms: 2500,
  query_type: 'search',
}, 'Slow query detected');
```

### 2.5 PII Redaction

All log output passes through Pino's `redact` configuration. Additionally:
- Candidate emails/phones are never logged (redact paths configured above)
- Resume content is never logged
- API keys are logged as `key_prefix` only (first 8 chars)
- JWT tokens are never logged

## 3. Error Tracking (Sentry)

### 3.1 Configuration

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,       // 10% of transactions
  replaysSessionSampleRate: 0,  // No session replay (PII risk)
  replaysOnErrorSampleRate: 0,  // No error replay (PII risk)

  beforeSend(event) {
    // Strip PII from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((b) => ({
        ...b,
        data: redactBreadcrumb(b.data),
      }));
    }
    return event;
  },

  ignoreErrors: [
    'AbortError',                    // Client navigation cancellation
    'ResizeObserver loop limit',     // Browser benign error
    /^Network request failed$/,      // Transient network
  ],
});
```

### 3.2 Server-Side Error Capture

```typescript
// In Server Actions and API routes
try {
  await moveApplicationStage(input);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      module: 'workflow',
      action: 'stage_move',
      org_id: orgId,
    },
    extra: {
      application_id: input.applicationId,
      to_stage_id: input.toStageId,
    },
  });
  throw error; // Re-throw for error boundary
}
```

### 3.3 Sentry Context

| Context | Source | Set Where |
|---------|--------|-----------|
| `user.id` | JWT | Middleware (`proxy.ts`) |
| `user.org_id` | JWT claims | Middleware |
| `user.role` | JWT claims | Middleware |
| `tags.plan` | JWT claims | Middleware |
| `tags.module` | Static per file | Error capture site |

**Never set:** `user.email`, `user.ip_address` (PII policy).

### 3.4 Inngest Error Tracking

```typescript
// Inngest middleware for Sentry integration
const sentryMiddleware = new InngestMiddleware({
  name: 'sentry',
  init() {
    return {
      onFunctionRun({ fn }) {
        return {
          transformOutput({ result }) {
            if (result.error) {
              Sentry.captureException(result.error, {
                tags: {
                  inngest_function: fn.id,
                  module: 'background',
                },
              });
            }
          },
        };
      },
    };
  },
});
```

## 4. Health Endpoints

### 4.1 Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | None | Shallow health check (returns 200) |
| GET | `/api/health/ready` | None | Deep readiness check (DB + Redis + Typesense) |
| GET | `/api/v1/system/status` | JWT (admin) | Detailed system status with component health |

### 4.2 Shallow Health (`/api/health`)

Returns immediately. Used by load balancers and uptime monitors.

```typescript
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

### 4.3 Deep Readiness (`/api/health/ready`)

Checks all critical dependencies. Returns 200 if all healthy, 503 if any degraded.

```typescript
export async function GET() {
  const checks = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkTypesense(),
  ]);

  const results = {
    database: checks[0].status === 'fulfilled' ? 'healthy' : 'degraded',
    redis: checks[1].status === 'fulfilled' ? 'healthy' : 'degraded',
    typesense: checks[2].status === 'fulfilled' ? 'healthy' : 'degraded',
  };

  const allHealthy = Object.values(results).every((v) => v === 'healthy');

  return Response.json(
    { status: allHealthy ? 'ok' : 'degraded', checks: results, timestamp: new Date().toISOString() },
    { status: allHealthy ? 200 : 503 }
  );
}

async function checkDatabase() {
  const supabase = createServiceClient();
  const { error } = await supabase.from('organizations').select('id').limit(1);
  if (error) throw error;
}

async function checkRedis() {
  const redis = Redis.fromEnv();
  await redis.ping();
}

async function checkTypesense() {
  const client = new Typesense.Client({ /* config */ });
  await client.health.retrieve();
}
```

### 4.4 System Status (`/api/v1/system/status`)

Admin-only endpoint with detailed component status, queue depth, and connection counts.

```typescript
interface SystemStatus {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime_seconds: number;
  components: {
    database: { status: string; connection_pool: number; latency_ms: number };
    redis: { status: string; memory_used_mb: number; latency_ms: number };
    typesense: { status: string; documents_count: number; latency_ms: number };
    inngest: { status: string; queued_functions: number; failed_24h: number };
    realtime: { status: string; active_connections: number };
  };
  timestamp: string;
}
```

## 5. SLO Definitions

### 5.1 Service Level Objectives

| SLO | Target | Measurement | Alert Threshold |
|-----|--------|-------------|-----------------|
| **Availability** | 99.9% (43 min/month downtime) | Health endpoint uptime | < 99.5% over 1h |
| **API latency (p50)** | < 100ms | Server Action/API response time | > 200ms sustained 5min |
| **API latency (p95)** | < 500ms | Server Action/API response time | > 1000ms sustained 5min |
| **API latency (p99)** | < 2000ms | Server Action/API response time | > 3000ms sustained 5min |
| **Error rate** | < 0.1% of requests | 5xx responses / total | > 1% over 5min |
| **Inngest function success** | > 99% | Completed / (completed + failed) | < 95% over 1h |
| **Search latency** | < 50ms (Typesense) | Search query response | > 200ms sustained 5min |
| **Realtime delivery** | < 500ms | Event → client receipt | > 2000ms sustained 5min |
| **Email delivery** | < 30s | Dispatch → Resend accepted | > 60s sustained 10min |

### 5.2 Error Budget

Monthly error budget at 99.9% = 43.8 minutes of downtime.
- **Budget burn rate alert:** If 50% of monthly budget consumed in 1 hour → P1 alert
- **Budget exhaustion:** If 100% consumed → all non-critical deploys frozen until next month

## 6. Alerting

### 6.1 Alert Channels

| Channel | Use Case | Tool |
|---------|----------|------|
| Sentry alerts | Application errors, new error types | Sentry → Slack |
| Uptime monitor | Health endpoint down | BetterUptime → Slack + PagerDuty |
| Vercel alerts | Deployment failures, edge function errors | Vercel → Slack |
| Custom alerts | SLO breaches, business anomalies | Inngest cron → Slack webhook |

### 6.2 Alert Severity

| Severity | Response Time | Examples | Notification |
|----------|---------------|----------|-------------|
| **P1 — Critical** | 15 min | Service down, data loss risk, auth broken | PagerDuty + Slack |
| **P2 — High** | 1 hour | Degraded performance, Inngest queue backlog, payment webhook failing | Slack |
| **P3 — Medium** | 4 hours | Elevated error rate, SLA breach approaching, Nylas sync delay | Slack |
| **P4 — Low** | Next business day | Deprecation warnings, non-critical feature degradation | Slack (low-priority channel) |

### 6.3 Alert Rules

```typescript
// Inngest cron: check SLO metrics every 5 minutes
export const observabilityAlertCheck = inngest.createFunction(
  { id: 'observability-alert-check' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const alerts: Alert[] = [];

    // Check error rate
    const errorRate = await step.run('check-error-rate', async () => {
      // Query Vercel Analytics or custom metrics store
      return getErrorRate({ window: '5m' });
    });

    if (errorRate > 0.01) { // > 1%
      alerts.push({
        severity: 'P2',
        title: 'Elevated error rate',
        message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds 1% threshold`,
      });
    }

    // Check Inngest failure rate
    const inngestHealth = await step.run('check-inngest', async () => {
      return getInngestMetrics({ window: '1h' });
    });

    if (inngestHealth.failureRate > 0.05) { // > 5%
      alerts.push({
        severity: 'P2',
        title: 'Inngest function failures elevated',
        message: `${inngestHealth.failed} failures in last hour (${(inngestHealth.failureRate * 100).toFixed(1)}%)`,
      });
    }

    // Send alerts to Slack
    for (const alert of alerts) {
      await step.run(`alert-${alert.severity}-${alert.title}`, async () => {
        await sendSlackAlert(alert);
      });
    }

    return { alerts_sent: alerts.length };
  }
);
```

## 7. Metrics

### 7.1 Application Metrics

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `api_request_duration_ms` | Histogram | `method`, `path`, `status` | Middleware |
| `api_request_total` | Counter | `method`, `path`, `status` | Middleware |
| `inngest_function_duration_ms` | Histogram | `function_id`, `status` | Inngest middleware |
| `inngest_function_total` | Counter | `function_id`, `status` | Inngest middleware |
| `db_query_duration_ms` | Histogram | `table`, `operation` | Supabase client wrapper |
| `search_query_duration_ms` | Histogram | `collection`, `type` | Search module |
| `realtime_connections` | Gauge | `org_id` | Supabase admin API |
| `email_sent_total` | Counter | `template`, `status` | Notification module |
| `ai_credits_consumed` | Counter | `action`, `org_id` | AI module |

### 7.2 Business Metrics

| Metric | Type | Source |
|--------|------|--------|
| `applications_created_total` | Counter | Workflow module |
| `stage_transitions_total` | Counter | Workflow module |
| `interviews_scheduled_total` | Counter | Interview module |
| `offers_sent_total` | Counter | Offer module |
| `candidates_hired_total` | Counter | Workflow module |
| `active_organizations` | Gauge | Daily cron count |
| `active_users_daily` | Gauge | Auth session count |

### 7.3 Collection Strategy

Metrics are collected via:
1. **Vercel Analytics:** Web vitals, page load times, edge function metrics (built-in).
2. **Custom counters:** Stored in Redis (`INCR` operations) with 24-hour TTL. Queried by alert check cron.
3. **Inngest metrics:** Available via Inngest dashboard (function runs, durations, failures).
4. **Supabase metrics:** Available via Supabase dashboard (DB connections, storage usage, Realtime connections).

No dedicated metrics service (Prometheus/Grafana) in MVP. Redis counters + Inngest cron provides sufficient observability.

## 8. Request Tracing

### 8.1 Request ID Propagation

Every request gets a unique ID that flows through all layers:

```typescript
// proxy.ts middleware
export function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const response = NextResponse.next();
  response.headers.set('x-request-id', requestId);

  // Available in Server Actions via headers()
  request.headers.set('x-request-id', requestId);

  return response;
}
```

### 8.2 Correlation

Request ID is attached to:
- All log entries (`request_id` field)
- Sentry breadcrumbs and events
- Inngest event data (`metadata.request_id`)
- API response headers (`x-request-id`)

This enables tracing a user action through API → Inngest function → notification → email delivery.

## 9. Inngest Observability

### 9.1 Function Monitoring

| Metric | Source | Alert |
|--------|--------|-------|
| Function run count | Inngest dashboard | N/A (informational) |
| Function failure rate | Inngest dashboard + cron check | > 5% failure rate |
| Function duration p95 | Inngest dashboard | > 30s for any function |
| Queue depth | Inngest API | > 1000 pending events |
| Retry rate | Inngest dashboard | > 10% of runs are retries |

### 9.2 Dead Letter Queue

Functions that exhaust all retries are logged:

```typescript
// Inngest onFailure handler
export const workflowStageChanged = inngest.createFunction(
  {
    id: 'workflow-stage-changed',
    retries: 3,
    onFailure: async ({ error, event }) => {
      logger.error({
        event: 'inngest.permanent_failure',
        function_id: 'workflow-stage-changed',
        err: error,
        event_data: event.data,
      }, 'Inngest function permanently failed');

      Sentry.captureException(error, {
        tags: { inngest_function: 'workflow-stage-changed', severity: 'P2' },
      });

      // Alert via Slack
      await sendSlackAlert({
        severity: 'P2',
        title: 'Inngest function permanently failed',
        message: `workflow-stage-changed failed after 3 retries: ${error.message}`,
      });
    },
  },
  { event: 'workflow/stage-changed' },
  async ({ event, step }) => { /* ... */ }
);
```

## 10. Dashboard

### 10.1 Admin System Dashboard

Available at `/admin/system` (owner/admin only). Displays:

| Widget | Data Source | Refresh |
|--------|-----------|---------|
| Service health | `/api/health/ready` | 30s polling |
| Error rate (24h) | Sentry API | 5 min |
| Active users | Redis gauge | 1 min |
| Inngest queue depth | Inngest API | 1 min |
| API latency p95 | Vercel Analytics | 5 min |
| Recent errors | Sentry API (last 10) | 1 min |
| Storage usage | Supabase admin API | 1 hour |
| Realtime connections | Supabase admin API | 1 min |

### 10.2 External Dashboards

| Service | URL | What It Shows |
|---------|-----|---------------|
| Sentry | `sentry.io/{org}/ats` | Errors, performance, releases |
| Inngest | `inngest.com/dashboard` | Function runs, failures, queue |
| Vercel | `vercel.com/{team}/ats` | Deployments, analytics, logs |
| Supabase | `supabase.com/dashboard` | DB metrics, storage, Realtime |
| BetterUptime | `betteruptime.com` | Uptime, incidents, status page |

## 11. Runbook Integration

When an alert fires, the Slack message includes:
- Alert severity and title
- Relevant metric values
- **Runbook link:** Direct link to the corresponding D18 runbook for the alert type
- Suggested first-response action

```typescript
interface Alert {
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  title: string;
  message: string;
  runbook_url?: string; // e.g., "/docs/runbooks/database-connection-pool.md"
  suggested_action?: string;
}
```

## 12. Security Considerations

- **PII in logs:** Pino redact configuration strips auth headers, tokens, candidate PII. Logs are safe for external log aggregation.
- **Sentry PII:** Session replay disabled. `beforeSend` hook scrubs breadcrumb data. User context limited to ID (no email).
- **Health endpoint exposure:** `/api/health` is public (needed by load balancers). `/api/health/ready` is public but reveals no sensitive data (only component names). `/api/v1/system/status` is admin-only.
- **Metrics data:** Redis counters contain no PII — only aggregate counts and durations.
- **Alert content:** Slack alerts include entity IDs but never PII. Error messages are truncated to 500 chars.
