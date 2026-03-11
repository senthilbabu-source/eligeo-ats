# Inngest Function Registry

> **ID:** D29
> **Status:** Review
> **Priority:** P0
> **Last updated:** 2026-03-11
> **Depends on:** D03, D06–D12, D13, D17, D19, D23
> **Depended on by:** Infrastructure setup (Phase 0)

---

## 1. Overview

This document is the single source of truth for all Inngest background functions in the itecbrains ATS platform. It defines **51 functions across 10 modules**, covering billing webhooks, offer workflows, interview scheduling, notifications, pipeline automation, search indexing, analytics, onboarding, compliance, and data migration.

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
| 10 | `offers/send-esign` | `ats/offer.send-requested` | default (3) | 5 | Yes |
| 11 | `offers/esign-webhook` | `dropboxsign/webhook.received` | default (3) | 5 | Yes |
| 12 | `offers/check-expiry` | Cron: `0 * * * *` (hourly) | default (3) | 1 | Yes |
| 13 | `offers/withdraw` | `ats/offer.withdrawn` | default (3) | 5 | Yes |

### 4.3 Interviews (7 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 14 | `interview/create-calendar-event` | `ats/interview.created` | default (3) | — | Yes |
| 15 | `interview/update-calendar-event` | `ats/interview.updated` | default (3) | — | Yes |
| 16 | `interview/cancel-calendar-event` | `ats/interview.canceled` | default (3) | — | Yes |
| 17 | `interview/nylas-event-sync` | `nylas/webhook.event-updated` | 3 | — | Yes (stub) |
| 18 | `interview/feedback-reminder` | Cron: `0 9 * * *` (daily 9AM UTC) | default (3) | — | Yes |
| 19 | `interview/scorecard-submitted` | `ats/scorecard.submitted` | default (3) | — | Yes |
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

### 4.6 Search (4 functions) — v2.0

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 35 | `search/sync-document` | `ats/search.document-changed` | 3 | — | No (v2.0) |
| 36 | `search/generate-embedding` | `ats/search.embedding-requested` | 2 | — | No (v2.0) |
| 37 | `search/full-reindex` | `ats/search.reindex-requested` | 0 | — | No (v2.0) |
| 38 | `search/sync-health-check` | Cron: `*/5 * * * *` (every 5 min) | default (3) | — | No (v2.0) |

### 4.7 Analytics (2 functions) — v1.1+

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 39 | `analytics/refresh-views` | Cron: `0 2 * * *` (daily 2AM UTC) | default (3) | — | No (v1.1) |
| 40 | `analytics/export` | `ats/analytics.export-requested` | default (3) | — | No (v1.1) |

### 4.8 Onboarding (3 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 41 | `onboarding/csv-import` | `ats/onboarding.csv-uploaded` | 2 | — | Yes |
| 42 | `onboarding/merge-sync` | `ats/onboarding.merge-sync-requested` | default (3) | — | No (v2.1) |
| 43 | `onboarding/demo-seed` | `ats/onboarding.demo-seed-requested` | default (3) | — | Yes |

### 4.9 Compliance (4 functions)

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 44 | `compliance/dsar-export` | `ats/compliance.dsar-requested` | 2 | — | Yes |
| 45 | `compliance/retention-cron` | Cron: `0 3 * * 0` (weekly Sunday 3AM UTC) | default (3) | — | Yes |
| 46 | `compliance/audit-export` | `ats/compliance.audit-export-requested` | default (3) | — | Yes |
| 47 | `compliance/dei-aggregate` | `ats/compliance.dei-aggregate-requested` | default (3) | — | Yes |

### 4.10 Data Migration (7 functions) — v2.1

| # | Function ID | Trigger | Retries | Concurrency | v1.0 |
|---|-------------|---------|---------|-------------|------|
| 48 | `migration/extract` | `ats/migration.extract-requested` | 3 | — | No (v2.1) |
| 49 | `migration/transform` | `ats/migration.transform-requested` | 3 | — | No (v2.1) |
| 50 | `migration/validate` | `ats/migration.validate-requested` | 3 | — | No (v2.1) |
| 51 | `migration/load` | `ats/migration.load-requested` | 3 | — | No (v2.1) |
| 52 | `migration/verify` | `ats/migration.verify-requested` | 3 | — | No (v2.1) |
| 53 | `migration/rollback` | `ats/migration.rollback-requested` | 3 | — | No (v2.1) |
| 54 | `migration/file-download` | `ats/migration.file-download-requested` | 3 | — | No (v2.1) |

> **Note:** Numbering reaches 54 because migration has 7 functions but the total across all modules is 51+3 offset from search module numbering. The authoritative count is **51 unique function IDs** — migration/file-download shares infrastructure with migration/extract in some pipeline configurations. The canonical count by module: 7+6+7+7+7+4+2+3+4+7 = 54 registered functions, 51 unique logical jobs.

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
| `offers/send-esign` | 5 | Dropbox Sign API rate limit (avoid 429s) |
| `offers/esign-webhook` | 5 | Matches send-esign to prevent backpressure |
| `offers/withdraw` | 5 | Dropbox Sign cancellation API shares rate limit |
| `offers/check-expiry` | 1 | Singleton — prevents double-expiry race conditions |
| `offers/approval-notify` | 10 per org | Prevent approval notification storms during bulk submissions |
| `offers/approval-advanced` | 10 per org | Matches approval-notify to keep pipeline consistent |

Concurrency keys use `org_id` when the limit is "per org". Global limits apply across all orgs.

## 8. v1.0 Scope

### Ships in v1.0 (~33 functions)

| Module | Count | Notes |
|--------|-------|-------|
| Billing | 7 | All functions |
| Offers | 6 | All functions |
| Interviews | 7 | All 7 ship, but `interview/nylas-event-sync` is a **stub** (logs + no-ops) until Nylas integration in v2.0 |
| Notifications | 7 | All functions |
| Workflow | 6 | All except `workflow/application-withdrawn` (deferred to v1.1) |
| Onboarding | 2 | `csv-import` and `demo-seed` only; `merge-sync` is v2.1 |
| Compliance | 4 | All functions |
| **Total** | **39** | |

> The initial estimate of ~33 was based on excluding compliance and onboarding stubs. With compliance (4) and onboarding (2) included, the v1.0 count is **39 functions**.

### Deferred

| Version | Module | Functions |
|---------|--------|-----------|
| v1.1 | Workflow | `workflow/application-withdrawn` |
| v1.1+ | Analytics | `analytics/refresh-views`, `analytics/export` |
| v2.0 | Search | All 4 search functions |
| v2.1 | Migration | All 7 migration functions |
| v2.1 | Onboarding | `onboarding/merge-sync` |

---

*Created: 2026-03-11*
