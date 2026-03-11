# Performance & Caching

> **ID:** D16
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema — indexes, query patterns), D10 (Search — Typesense + pgvector), D11 (Real-Time — connection limits), D14 (Observability — SLOs)
> **Depended on by:** D18 (Security Runbooks — performance incident response)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-003 (HNSW indexes)

---

## 1. Overview

Performance & Caching defines the caching strategy, query performance targets, connection pooling, and load testing approach for the ATS. The system uses Redis (Upstash) for application caching, ISR for public pages, Supabase connection pooling for database access, and targets specific latency SLOs defined in D14.

**Scope:**
- In scope: Redis caching strategy, cache invalidation, database query targets, connection pooling, ISR for career pages, Inngest concurrency, bulk operation optimization, load testing targets.
- Out of scope: CDN configuration (Vercel-managed), database index design (D01), Typesense performance tuning (managed service).

## 2. Performance Targets

| Operation | Target (p50) | Target (p95) | Ceiling | Source |
|-----------|-------------|-------------|---------|--------|
| API endpoint response | < 100ms | < 500ms | 2000ms | D14 SLO |
| Database query (simple) | < 10ms | < 50ms | 200ms | Index-backed |
| Database query (join) | < 30ms | < 100ms | 500ms | Max 3-table join |
| Typesense search | < 10ms | < 50ms | 200ms | Managed service |
| pgvector similarity | < 50ms | < 200ms | 1000ms | HNSW index |
| Redis cache read | < 2ms | < 10ms | 50ms | Upstash |
| Career page load (ISR) | < 200ms | < 500ms | 1500ms | Edge-cached |
| Kanban board initial load | < 300ms | < 800ms | 2000ms | Cached query |
| File upload (10MB) | < 2s | < 5s | 10s | Supabase Storage |

## 3. Caching Strategy

### 3.1 Cache Layers

```
Request → Vercel Edge Cache (ISR) → Redis (Upstash) → Supabase (PostgreSQL)
                                                         ↓
                                                    Typesense (search)
```

| Layer | Technology | TTL | Use Case |
|-------|-----------|-----|----------|
| **Edge** | Vercel ISR | 60s | Career pages, public job listings |
| **Application** | Upstash Redis | Varies | Session data, org config, rate limit state |
| **Database** | PostgreSQL buffer cache | Managed | Hot tables, index scans |

### 3.2 Redis Cache Patterns

```typescript
// lib/cache.ts
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Cache-aside pattern
async function cached<T>(
  key: string,
  ttl: number, // seconds
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get<T>(key);
  if (hit !== null) return hit;

  const data = await fetcher();
  await redis.set(key, data, { ex: ttl });
  return data;
}

// Invalidation
async function invalidate(pattern: string) {
  // Upstash doesn't support SCAN — use explicit key deletion
  await redis.del(pattern);
}
```

### 3.3 What to Cache

| Data | Cache Key | TTL | Invalidation |
|------|-----------|-----|-------------|
| Organization config | `org:{org_id}:config` | 5 min | On org update |
| Pipeline stages | `org:{org_id}:pipeline:{template_id}` | 5 min | On stage CRUD |
| Job listing (public) | `org:{org_id}:jobs:public` | 60s | ISR revalidation |
| User profile | `user:{user_id}:profile` | 5 min | On profile update |
| Feature flags | `org:{org_id}:flags` | 5 min | On org update |
| Typesense search key | `org:{org_id}:search_key` | 1 hour | On key rotation |
| Rate limit counters | `ratelimit:*` | Sliding window | Automatic (Upstash) |

### 3.4 What NOT to Cache

| Data | Reason |
|------|--------|
| Candidate data | PII — cache adds exposure surface |
| Application status | Real-time updates via Realtime/polling |
| Scorecard submissions | Low-frequency, high-write |
| Audit logs | Append-only, never re-read hot |
| Files/resumes | Served via Supabase Storage signed URLs |

### 3.5 Cache Invalidation

```typescript
// Invalidation on organization update
async function onOrganizationUpdated(orgId: string) {
  await Promise.all([
    redis.del(`org:${orgId}:config`),
    redis.del(`org:${orgId}:flags`),
  ]);
}

// Invalidation on pipeline stage change
async function onPipelineStageChanged(orgId: string, templateId: string) {
  await redis.del(`org:${orgId}:pipeline:${templateId}`);
}

// Hook into audit trigger events or Server Action post-mutation
```

## 4. Database Performance

### 4.1 Connection Pooling

Supabase provides PgBouncer connection pooling. Configuration:

| Setting | Value | Rationale |
|---------|-------|-----------|
| Pool mode | Transaction | Serverless-friendly (connection released after each query) |
| Pool size | 15 (Supabase Pro default) | Sufficient for Vercel serverless functions |
| Statement timeout | 30s | Prevent runaway queries |
| Idle timeout | 60s | Free connections quickly in serverless |

```typescript
// Supabase client uses pooled connection string automatically
// For Inngest (long-running): use direct connection
const supabaseService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: 'public' } }
);
```

### 4.2 Query Optimization Rules

| Rule | Implementation |
|------|---------------|
| Always use indexed columns in WHERE | D01 indexes cover all common query patterns |
| Limit SELECT columns | Never `SELECT *` in production — specify columns |
| Paginate with cursors | D02 cursor pagination (not OFFSET) |
| Avoid N+1 queries | Use Supabase `select('*, relation(*)')` for joins |
| Limit JOIN depth | Max 3 tables per query |
| Use `count: 'exact'` sparingly | Only for pagination metadata, not every list query |

### 4.3 Heavy Query Strategy

| Query | Optimization | Target |
|-------|-------------|--------|
| Kanban board (all applications for a job) | Single query with stage join, cached 30s | < 200ms |
| Candidate search (Typesense) | Client-side via scoped API key | < 50ms |
| AI matching (pgvector) | HNSW index, limit 50 results | < 200ms |
| Pipeline analytics (time-in-stage) | Materialized view or query with date range index | < 500ms |
| Audit log query | Partition pruning via `performed_at` range | < 300ms |
| Bulk stage move (50 items) | Sequential, not parallel (audit trail order) | < 5s total |

### 4.4 Slow Query Detection

```typescript
// Supabase client wrapper with timing
async function timedQuery<T>(
  query: SupabaseQuery<T>,
  context: { table: string; operation: string }
): Promise<T> {
  const start = performance.now();
  const result = await query;
  const duration = performance.now() - start;

  if (duration > 500) {
    logger.warn({
      event: 'query.slow',
      table: context.table,
      operation: context.operation,
      duration_ms: Math.round(duration),
    }, 'Slow query detected');
  }

  return result;
}
```

## 5. ISR (Incremental Static Regeneration)

### 5.1 ISR Configuration

| Page | Revalidate | Strategy |
|------|-----------|----------|
| `/careers/{slug}` (job listing) | 60s | ISR with on-demand revalidation |
| `/careers/{slug}/jobs/{slug}` (job detail) | 60s | ISR with on-demand revalidation |
| `/careers/{slug}/jobs/{slug}/apply` | No cache | Server-rendered (CSRF token) |
| `/careers/{slug}/portal` | No cache | Dynamic (token-authenticated) |

### 5.2 On-Demand Revalidation

When a job is published, updated, or closed:

```typescript
// In Server Action after job update
import { revalidatePath } from 'next/cache';

async function onJobUpdated(orgSlug: string, jobSlug: string) {
  revalidatePath(`/careers/${orgSlug}`);           // Job listing
  revalidatePath(`/careers/${orgSlug}/jobs/${jobSlug}`); // Job detail
}
```

## 6. Inngest Concurrency

### 6.1 Concurrency Limits

| Function | Concurrency | Rationale |
|----------|------------|-----------|
| `workflow-stage-changed` | 10 | Prevents DB connection exhaustion during bulk moves |
| `workflow-auto-advance` | 5 | Cascading advances need throttling |
| `search-sync-candidate` | 20 | Typesense handles high write throughput |
| `notification-email-send` | 10 | Resend rate limits (100/s on Pro) |
| `compliance-retention-cron` | 1 | Single-threaded to avoid race conditions |
| `portal-resume-parse` | 5 | OpenAI API rate limits |

### 6.2 Configuration

```typescript
export const workflowStageChanged = inngest.createFunction(
  {
    id: 'workflow-stage-changed',
    retries: 3,
    concurrency: { limit: 10 },
    rateLimit: { limit: 100, period: '1m' }, // 100 per minute max
  },
  { event: 'workflow/stage-changed' },
  async ({ event, step }) => { /* ... */ }
);
```

## 7. Real-Time Performance

### 7.1 Connection Limits

Per D11:
- Max 10 Realtime channels per browser tab
- Max 100 users per presence channel
- Fallback to polling for orgs with 100+ active users

### 7.2 Event Batching

For bulk operations (e.g., 50 kanban moves), client-side batches UI updates:

```typescript
// requestAnimationFrame batching (D11 §12.4)
const pendingUpdates = new Map<string, Update>();

function handleRealtimeEvent(update: Update) {
  pendingUpdates.set(update.id, update);

  if (pendingUpdates.size === 1) {
    requestAnimationFrame(() => {
      applyBatchedUpdates(pendingUpdates);
      pendingUpdates.clear();
    });
  }
}
```

## 8. Load Testing

### 8.1 Test Scenarios

| Scenario | Concurrent Users | Duration | Target |
|----------|-----------------|----------|--------|
| Career page browsing | 500 | 10 min | p95 < 500ms, 0% errors |
| Application submission | 100 | 5 min | p95 < 2s, 0% errors |
| Kanban board (10 jobs × 50 candidates) | 50 | 10 min | p95 < 800ms |
| Search (Typesense) | 200 | 5 min | p95 < 100ms |
| AI matching | 20 | 5 min | p95 < 1s |
| Bulk stage move (50 candidates) | 10 | 5 min | Complete < 10s |

### 8.2 Tool

k6 for load testing. Scripts in `tests/load/`.

```javascript
// tests/load/career-page.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 500 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://staging.eligeo.io/careers/demo-org');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

### 8.3 Testing Schedule

- **Pre-launch:** Full load test suite against staging
- **Monthly:** Regression load test (career page + API endpoints)
- **Pre-release:** If release includes query changes, search changes, or new endpoints

## 9. Performance Budget

### 9.1 Frontend Budget

| Metric | Budget | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | < 1.5s | Vercel Analytics |
| Largest Contentful Paint (LCP) | < 2.5s | Vercel Analytics |
| Cumulative Layout Shift (CLS) | < 0.1 | Vercel Analytics |
| Total JS bundle (gzipped) | < 200KB | `next build` output |
| Initial page JS | < 100KB | Route-specific bundle |

### 9.2 Bundle Analysis

```bash
# Analyze bundle size
ANALYZE=true npm run build
# Opens webpack-bundle-analyzer on localhost:8888
```

Check bundle size in CI:

```yaml
# In ci.yml
- name: Check bundle size
  run: |
    npm run build
    npx @next/bundle-analyzer
```

## 10. Security Considerations

- **Cache poisoning:** Redis keys are org-scoped. No user-controlled input in cache keys.
- **Cache timing attacks:** Cached responses return same headers as fresh responses. No cache-status headers exposed.
- **PII in cache:** Candidate data is never cached in Redis (§3.4). Only org config and aggregate data.
- **Rate limit bypass:** Rate limit counters are in Redis — if Redis is down, rate limiting fails open (allows requests). This is acceptable for availability; abuse is mitigated by Vercel's built-in DDoS protection.
- **Connection pool exhaustion:** Statement timeout (30s) prevents long-running queries from holding connections. Inngest concurrency limits prevent function pile-up.
