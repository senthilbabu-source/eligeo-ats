# Inngest Function Registry

> **ID:** D29
> **Status:** Review
> **Priority:** P0
> **Last updated:** 2026-03-13
> **Depends on:** D03, D06–D12, D13, D17, D19, D23
> **Depended on by:** Infrastructure setup (Phase 0)

---

## 1. Overview

This document is the single source of truth for all Inngest background functions in the Eligeo ATS platform. It defines **65 functions across 14 modules**, covering billing webhooks, offer workflows, interview scheduling, candidate embedding, notifications, pipeline automation, search indexing, analytics, onboarding, compliance, and data migration.

Every background job in the system runs through Inngest. There are no Supabase Edge Functions (ADR-002). Cron jobs are Inngest cron triggers, not Next.js Route Handlers — Inngest manages scheduling, retries, and observability.

## 2. Naming Convention

All function IDs follow **`module/action`** in kebab-case:

```
billing/checkout-completed
offers/send-esign
interview/feedback-reminder
workflow/stage-changed
```

Modules map 1:1 to source directories under `src/inngest/functions/<module>/`.

## 3. Global Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| **Retries** | 3 | Exponential backoff (base 2s, max 60s) |
| **Timeout** | 5 minutes | Per-step timeout; long-running jobs override explicitly |
| **Idempotency** | Event ID dedup | Inngest deduplicates by `event.id`; callers must supply stable IDs |
| **Dead letter handling** | Log to `audit_logs` | `action = 'inngest_dead_letter'`, includes function ID, event payload hash, error message. Alert dispatched via Slack webhook to `#ats-alerts` channel. |

Functions only override these defaults when documented in the registry table below.

## 4. Master Registry

### 4.1 Billing (7 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 1 | `billing/checkout-completed` | `stripe/webhook.checkout-completed` | default (3) | — | Yes |
| 2 | `billing/subscription-updated` | `stripe/webhook.subscription-updated` | default (3) | — | Yes |
| 3 | `billing/subscription-canceled` | `stripe/webhook.subscription-canceled` | default (3) | — | Yes |
| 4 | `billing/invoice-paid` | `stripe/webhook.invoice-paid` | default (3) | — | Yes |
| 5 | `billing/payment-failed` | `stripe/webhook.payment-failed` | default (3) | — | Yes |
| 6 | `billing/trial-ending` | `stripe/webhook.trial-ending` | default (3) | — | Yes |
| 7 | `billing/report-overage` | Cron: `55 23 * * *` (daily 23:55 UTC) | default (3) | — | Yes |

### 4.2 Offers (6 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 8 | `offers/approval-notify` | `ats/offer.submitted` | default (3) | 10 per org | Yes |
| 9 | `offers/approval-advanced` | `ats/offer.approval-decided` | default (3) | 10 per org | Yes |
| 10 | `offers/send-esign` | `ats/offer.send-requested` | 5 | 5 per org | Yes (**✅ Shipped** — re-registered Phase 5 B5-6, upgraded to real Dropbox Sign P6-3) |
| 11 | `offers/esign-webhook` | `dropboxsign/webhook.received` | default (3) | 5 | Yes (**✅ Shipped** — P6-3 `processEsignWebhook`, real Dropbox Sign webhook) |
| 12 | `offers/check-expiry` | Cron: `0 * * * *` (hourly) | default (3) | 1 | Yes |
| 13 | `offers/withdraw` | `ats/offer.withdrawn` | default (3) | 5 per org | Yes |

### 4.3 Interviews (7 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 14 | `interview/create-calendar-event` | `ats/interview.created` | default (3) | — | Yes |
| 15 | `interview/update-calendar-event` | `ats/interview.updated` | default (3) | — | Yes |
| 16 | `interview/cancel-calendar-event` | `ats/interview.canceled` | default (3) | — | Yes |
| 17 | `interview/nylas-event-sync` | `nylas/webhook.event-updated` | 3 | — | Yes (stub) |
| 18 | `interview/feedback-reminder` | Cron: `0 9 * * *` (daily 9AM UTC) | default (3) | — | Yes |
| 19 | `interview/scorecard-submitted` | `ats/scorecard.submitted` | default (3) | — | Yes |
| 19b | `interviews/auto-summarize` | `ats/scorecard.submitted` | 2 | 3 per org | Yes (**✅ Shipped** — H3-3 hardening) |
| 20 | `interview/self-schedule-expire` | Cron: `0 * * * *` (hourly) | default (3) | — | Yes |

### 4.4 Notifications (7 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 21 | `notification/dispatch` | `ats/notification.requested` | default (3) | — | Yes |
| 22 | `notification/send-email` | `ats/notification.email` | default (3) | — | Yes |
| 23 | `notification/send-in-app` | `ats/notification.in-app` | default (3) | — | Yes |
| 24 | `notification/mention-dispatch` | `ats/mention.created` | default (3) | — | Yes |
| 25 | `notification/webhook-deliver` | `ats/webhook.deliver` | 5 | — | Yes |
| 26 | `notification/webhook-fanout` | `ats/webhook.fanout` | default (3) | — | Yes |
| 27 | `notification/digest` | Cron: `0 8 * * *` (daily 8AM UTC) | default (3) | — | Yes |

### 4.5 Workflow (7 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 28 | `workflow/stage-changed` | `ats/application.stage-changed` | 3 | — | Yes |
| 29 | `workflow/auto-advance` | `ats/application.auto-advance` | 3 | — | Yes |
| 30 | `workflow/rejection` | `ats/application.rejected` | 3 | — | Yes |
| 31 | `workflow/application-withdrawn` | `ats/application.withdrawn` | 3 | — | No (v1.1) |
| 32 | `workflow/sla-check` | `ats/workflow.sla-check` (delayed) | 2 | — | Yes |
| 33 | `workflow/send-email` | `ats/workflow.send-email` | default (3) | — | Yes |
| 34 | `workflow/bulk-stage-move` | `ats/workflow.bulk-stage-move` | default (3) | — | Yes |

### 4.6 Candidates (1 function)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 56b | `candidates/refresh-stale-embedding` | `ats/candidate.skills_updated` | 2 | 1 per candidate | Yes (**✅ Shipped** — H2-1 hardening) |

### 4.7 Search (4 functions) — v2.0

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 35 | `search/sync-document` | `ats/search.document-changed` | 3 | — | No (v2.0) |
| 36 | `search/generate-embedding` | `ats/search.embedding-requested` | 2 | — | No (v2.0) |
| 37 | `search/full-reindex` | `ats/search.reindex-requested` | 0 | — | No (v2.0) |
| 38 | `search/sync-health-check` | Cron: `*/5 * * * *` (every 5 min) | default (3) | — | No (v2.0) |

### 4.8 Analytics (4 functions) — v1.0 (briefing + job embedding) + v1.1+ (views/export)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 39 | `analytics/refresh-views` | Cron: `0 2 * * *` (daily 2AM UTC) | default (3) | — | No (v1.1) |
| 40 | `analytics/export` | `ats/analytics.export-requested` | default (3) | — | No (v1.1) |
| 41 | `analytics/generate-briefing` | `ats/analytics.briefing-requested` (on-demand per org) | 2 | 1 per org | Yes (Wave 3) |
| 42 | `analytics/refresh-job-embedding` | `ats/analytics.job-skills-changed` (fired when `job_required_skills` INSERT/UPDATE/DELETE or JD updated) | 3 | 1 per job | Yes (**✅ Shipped** — Phase 5 B5-6, H-04 carry-forward) |

**`analytics/generate-briefing` details:**
- **Cache-first:** checks `org_daily_briefings WHERE org_id = $1 AND date = CURRENT_DATE`. If row exists, returns cached content — no OpenAI call.
- **On miss:** reads pipeline snapshot (open jobs, active apps, hires this week, zero-app jobs 7+ days), calls OpenAI structured output → `{ win: string, blocker: string, action: string }`, upserts `org_daily_briefings` on `(org_id, date)` conflict.
- **Logging:** logs to `ai_usage_logs` with `action = 'daily_briefing'` (requires Migration 021 to add this value to the CHECK constraint).
- **Admin regen:** Server Action sends `ats/analytics.briefing-requested` with `force: true` — bypasses cache check and upserts a fresh row (does NOT delete the existing row; ON CONFLICT DO UPDATE overwrites content).
- **Concurrency:** `1 per org` — prevents duplicate OpenAI calls if admin hits regen quickly.

**`analytics/refresh-job-embedding` details (✅ shipped — Phase 5 B5-6):**
- **Trigger:** `ats/analytics.job-skills-changed` — dispatched by the `job_required_skills` mutation server actions and `updateJobDescription()` whenever JD or skills change.
- **Logic:** Re-generates `job_openings.job_embedding` via OpenAI embeddings API → updates `job_embedding` + sets `embedding_updated_at = NOW()`.
- **Staleness flag:** Before re-embed runs, the calling SA sets `embedding_updated_at = NULL` (stale signal). UI checks `embedding_updated_at` vs `updated_at` to surface "Scores may be outdated" nudge.
- **Concurrency:** `1 per job` — prevents duplicate embedding calls on rapid skills edits.
- **Downstream:** after re-embed, any cached match scores for this job are effectively invalidated. Applications will show refreshed scores on next load.

### 4.9 Onboarding (3 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 43 | `onboarding/csv-import` | `ats/onboarding.csv-uploaded` | 2 | — | Yes |
| 44 | `onboarding/merge-sync` | `ats/onboarding.merge-sync-requested` | default (3) | — | No (v2.1) |
| 45 | `onboarding/demo-seed` | `ats/onboarding.demo-seed-requested` | default (3) | — | Yes |

### 4.10 Compliance (4 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 46 | `compliance/dsar-export` | `ats/compliance.dsar-requested` | 2 | — | Yes |
| 47 | `compliance/retention-cron` | Cron: `0 3 * * 0` (weekly Sunday 3AM UTC) | default (3) | — | Yes |
| 48 | `compliance/audit-export` | `ats/compliance.audit-export-requested` | default (3) | — | Yes |
| 49 | `compliance/dei-aggregate` | `ats/compliance.dei-aggregate-requested` | default (3) | — | Yes |

### 4.11 Data Migration (7 functions) — v2.1

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 50 | `migration/extract` | `ats/migration.extract-requested` | 3 | — | No (v2.1) |
| 51 | `migration/transform` | `ats/migration.transform-requested` | 3 | — | No (v2.1) |
| 52 | `migration/validate` | `ats/migration.validate-requested` | 3 | — | No (v2.1) |
| 53 | `migration/load` | `ats/migration.load-requested` | 3 | — | No (v2.1) |
| 54 | `migration/verify` | `ats/migration.verify-requested` | 3 | — | No (v2.1) |
| 55 | `migration/rollback` | `ats/migration.rollback-requested` | 3 | — | No (v2.1) |
| 56 | `migration/file-download` | `ats/migration.file-download-requested` | 3 | — | No (v2.1) |

### 4.12 Jobs (1 function) — Phase 6

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 62 | `jobs/batch-shortlist` | `ats/job.shortlist-requested` | 3 | 2 per org | Yes (**✅ Shipped** — P6-5) |

### 4.13 Screening (4 functions) — Phase 6

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 57 | `screening/invite-candidate` | `ats/application.stage-entered` (where stage has screening config) | default (3) | 5 per org | Yes |
| 58 | `screening/process-response` | `ats/screening.response-submitted` | default (3) | — | Yes |
| 59 | `screening/generate-summary` | `ats/screening.all-answered` | 2 | 3 per org | Yes |
| 60 | `screening/send-reminder` | Delayed: 48h after invite | default (3) | — | Yes |

### 4.14 Portal (1 function) — Phase 6

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 61 | `portal/resume-parse` | `portal/application-submitted` | 3 | 1 per candidate | Yes |

> **Note:** 65 registered function IDs across 14 modules. Phase 6 adds 5 new functions (4 screening + 1 portal) + 1 new `jobs/batch-shortlist` (P6-5) + upgrades 3 existing stubs to real implementations (P6-3: offers/send-esign → real Dropbox Sign, offers/esign-webhook → `processEsignWebhook` real event processing, offers/withdraw → real Dropbox Sign cancel). (`interviews/auto-summarize` added H3-3, `candidates/refresh-stale-embedding` added H2-1, `analytics/refresh-job-embedding` added Phase 5.)

## 5. Cron Schedule Summary

| Schedule | Function ID | Purpose |
|----------|-------------|---------|
| `55 23 * * *` (daily 23:55 UTC) | `billing/report-overage` | Calculate and report seat/usage overages to Stripe |
| `0 * * * *` (hourly) | `offers/check-expiry` | Expire offers past their `expires_at` timestamp |
| `0 * * * *` (hourly) | `interview/self-schedule-expire` | Expire unbooked self-schedule links |
| `0 9 * * *` (daily 9AM UTC) | `interview/feedback-reminder` | Nudge interviewers who have not submitted scorecards |
| `0 8 * * *` (daily 8AM UTC) | `notification/digest` | Send daily digest emails to users who opted in |
| `*/5 * * * *` (every 5 min) | `search/sync-health-check` | Verify Typesense sync lag stays under threshold (v2.0) |
| `0 2 * * *` (daily 2AM UTC) | `analytics/refresh-views` | Refresh materialized views for dashboard metrics (v1.1) |
| `0 3 * * 0` (weekly Sunday 3AM UTC) | `compliance/retention-cron` | Soft-delete candidates past retention period |

> 8 cron entries for 9 logical schedules — `offers/check-expiry` and `interview/self-schedule-expire` share the hourly slot but run as independent Inngest functions.

## 6. Event Naming Convention

| Pattern | Usage | Examples |
|---------|-------|----------|
| `ats/{entity}.{action}` | Business events originating from the ATS | `ats/offer.submitted`, `ats/application.stage-changed`, `ats/scorecard.submitted` |
| `{service}/webhook.{event-type}` | Inbound webhooks from external services | `stripe/webhook.checkout-completed`, `dropboxsign/webhook.received`, `nylas/webhook.event-updated` |
| `ats/{module}.{action}-requested` | Explicit user-initiated async operations | `ats/search.reindex-requested`, `ats/compliance.dsar-requested` |

Rules:
- Entity names are **singular** (`offer`, not `offers`).
- Actions are **past tense** for things that happened (`submitted`, `canceled`) and **present tense** for requests (`send-requested`, `deliver`).
- All event payloads include `org_id`, `actor_id` (user who triggered), and `timestamp`.

## 7. Concurrency Rules

| Scope | Limit | Reason |
|-------|-------|--------|
| **Default** | No limit | Inngest manages worker concurrency internally |
| `offers/send-esign` | 5 | Dropbox Sign API rate limit (re-registered Phase 5 B5-6, real P6-3) |
| `offers/esign-webhook` | 5 | Matches send-esign to prevent backpressure (real P6-3) |
| `interviews/auto-summarize` | 3 per org | Prevent duplicate summarization per org (H3-3) |
| `candidates/refresh-stale-embedding` | 1 per candidate | One embedding regeneration at a time (H2-1) |
| `analytics/refresh-job-embedding` | 1 per job | One job embedding regeneration at a time (Phase 5 B5-6, H-04) |
| `offers/withdraw` | 5 | Dropbox Sign cancellation API shares rate limit |
| `offers/check-expiry` | 1 | Singleton — prevents double-expiry race conditions |
| `offers/approval-notify` | 10 per org | Prevent approval notification storms during bulk submissions |
| `offers/approval-advanced` | 10 per org | Matches approval-notify to keep pipeline consistent |

Concurrency keys use `org_id` when the limit is "per org". Global limits apply across all orgs.

## 8. v1.0 Scope

### Ships in v1.0 (43 functions)

| Module | Count | Shipped | Notes |
|--------|-------|---------|-------|
| Billing | 7 | 7 | All shipped (Phase 5 B5-2). 7 webhook/cron handlers. |
| Offers | 6 | 6 | All 6 shipped. `send-esign` real Dropbox Sign (P6-3). `esign-webhook` → `processEsignWebhook` real (P6-3). `withdraw` real cancel (P6-3). |
| Interviews | 8 | 2 | `interview-reminder` + `auto-summarize` (H3-3) shipped. `nylas-event-sync` is a stub. Rest are Phase 3+. |
| Notifications | 7 | 2 | `dispatch`, `send-email` shipped (Wave F). Rest pending. |
| Workflow | 6 | 0 | All pending. `application-withdrawn` deferred to v1.1. |
| Candidates | 1 | 1 | `refresh-stale-embedding` (H2-1) shipped. |
| Onboarding | 2 | 0 | `csv-import` and `demo-seed` pending. `merge-sync` is v2.1. |
| Compliance | 4 | 0 | All pending. |
| Analytics | 2 | 3 | `generate-briefing` (Wave 3) + `generate-candidate-embedding` (AI-Proof) + `refresh-job-embedding` (Phase 5 B5-6, H-04). All shipped. |
| Jobs | 1 | 1 | `batchShortlist` (P6-5). |
| Screening | 4 | 0 | All Phase 6 (P6-4). |
| Portal | 1 | 0 | `portal/resume-parse` Phase 6 (P6-1). |
| **Total** | **49** | **23** | **23 shipped and actively registered** in `/api/inngest/route.ts`. |

> Total registry: 65 functions across 14 modules. v1.0 scope: 49 functions. 23 shipped and active. P6-3: +1 (offers/esign-webhook real), +2 upgrades (send-esign real, withdraw real). P6-5: +1 (jobs/batch-shortlist). Remaining 26 ship in Phases 6+.

### Deferred

| Version | Module | Functions |
|---------|--------|-----------|
| v1.1 | Workflow | `workflow/application-withdrawn` |
| v1.1+ | Analytics | `analytics/refresh-views`, `analytics/export` |
| v2.0 | Search | All 4 search functions |
| v2.1 | Migration | All 7 migration functions |
| v2.1 | Onboarding | `onboarding/merge-sync` |

---

*Created: 2026-03-11. Updated: 2026-03-13 — P6-3 build: 3 stub upgrades now real (send-esign, esign-webhook/processEsignWebhook, withdraw → real Dropbox Sign). P6-5 build: +1 new `jobs/batch-shortlist`. Registry: 64→65 functions, v1.0: 48→49, shipped: 20→23. Phase 5: all 7 billing functions shipped, `send-esign` re-registered, `refresh-job-embedding` shipped (H-04 closed). Phase 4 shipped 5 offer functions. Hardening: `interviews/auto-summarize` (H3-3), `candidates/refresh-stale-embedding` (H2-1).*
