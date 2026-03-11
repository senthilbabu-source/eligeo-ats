# itecbrains ATS — Documentation Index

> Master registry of all documentation. Every document has a status, owner, and dependency chain.
> **Last updated:** 2026-03-10

## How to use this index

- **Status key:** `✅ Complete` · `🟡 In Progress` · `⬜ Not Started` · `🔴 Blocked`
- **Priority:** `P0` = Blocks all development · `P1` = Blocks feature area · `P2` = Pre-launch · `P3` = Post-MVP
- Every document change MUST be logged in [DEVLOG.md](DEVLOG.md)
- Cross-document gaps tracked in [GAPS.md](GAPS.md) — check before starting any doc
- Writing standards are in [AI-RULES.md](AI-RULES.md)

---

## Source Documents (Input / Reference)

| # | Document | Path | Status | Notes |
|---|----------|------|--------|-------|
| S1 | Phase 1 Expert Review (118 issues) | `docs/itecbrains_ATS_Phase1_Expert_Review.docx` | ✅ Complete | Input document — 118 issues identified |
| S2 | Phase 2 Architecture Blueprint v2.0 | `docs/itecbrains_ATS_Phase2_Architecture_Blueprint.docx` | ✅ Complete | Input document — enhanced blueprint |
| S3 | Principal Architect's Pre-Plan | `docs/Enterprise-Multi-Tenant-ATS-Princi.md` | ✅ Complete | Consolidated architectural decisions, core schema, RBAC, RLS, modules |

---

## Phase 0 — Foundational (Blocks ALL development)

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D01 | **Complete Database Schema** | `docs/DATABASE-SCHEMA.md` | P0 | ✅ Complete (Review) | S3, ADR-001→010 | 39 tables across 8 clusters. Full DDL, RLS (all 4 ops), indexes, triggers, functions, JSONB interfaces, volume estimates. Post-build audit passed (6/6 fixes applied). Pending: `supabase db reset` validation. |
| D02 | **API Specification** | `docs/API-SPECIFICATION.md` | P0 | ✅ Complete (Review) | D01 | 13 sections: auth (JWT + API key), RBAC, URL conventions, cursor pagination, RFC 9457 errors, rate limiting (4 plan tiers), idempotency, webhook outbound/inbound, Zod→OpenAPI 3.1. 50+ endpoints in `docs/api/ENDPOINTS.md`. Post-build audit passed. |
| D03 | **Billing & Subscription Architecture** | `docs/modules/BILLING.md` | P0 | ✅ Complete (Review) | D01 | 4 plan tiers (starter/growth/pro/enterprise), feature matrix (16 features), Stripe Checkout + Customer Portal, subscription lifecycle (6 states), seat-based pricing with overage, AI credit metering + overage billing, 6 Inngest webhook handlers, dunning flow, downgrade rules. Post-build audit passed (3 FAILs fixed). |
| D04 | **Architecture Decision Records** | `docs/ADRs/` | P0 | 🟡 In Progress | S3 | ✅ ADR-001→010 complete (all blocking decisions resolved). Remaining: formal ADRs for STACK-1→6 (non-blocking, for team alignment). |
| D05 | **Design System** | `docs/DESIGN-SYSTEM.md` | P0 | ✅ Complete (Review) | D01 | Color palette (HSL tokens, light + dark), Inter + Geist Mono typography, spacing scale, shadcn/ui component specs (16 base + 10 ATS-specific), responsive breakpoints, WCAG 2.1 AA (all contrasts verified), animation tokens, career page theming, file organization. Post-build audit passed. |

---

## Phase 1 — Core Feature Specs (Blocks feature development)

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D06 | **Offer Management** | `docs/modules/OFFERS.md` | P1 | ✅ Complete (Review) | D01, D02, D03, D05 | 8-state machine (draft→withdrawn), sequential approval chain with auto-skip for departed approvers, Dropbox Sign e-sign integration with manual fallback, offer templates, expiry cron, compensation editor. Post-build audit: all 7 categories passed. |
| D07 | **Interview Scheduling** | `docs/modules/INTERVIEW-SCHEDULING.md` | P1 | ✅ Complete (Review) | D01, D02, D03, D05 | 5-state interview machine, manual + panel + self-scheduling, Nylas calendar two-way sync, scorecard templates with snapshot-on-assign versioning, blind review (auto-reveal after own submission), AI scorecard summarization (Pro+), weighted score aggregation, 18 API endpoints, 7 Inngest functions. Post-build audit: 7/7 PASS. |
| D08 | **Notification System** | `docs/modules/NOTIFICATIONS.md` | P1 | ✅ Complete (Review) | D01, D02, D03, D05 | Unified notification dispatch (in-app + email + webhook), 22 event types, Supabase Realtime for in-app, React Email + Resend for transactional email, Handlebars template variables, @mention via Inngest, webhook outbound with auto-disable, user preferences per event, digest mode, 17 API endpoints, 7 Inngest functions. Post-build audit: 7/7 PASS. |
| D09 | **Candidate Portal** | `docs/modules/CANDIDATE-PORTAL.md` | P1 | ✅ Complete (Review) | D01, D05, D07, D08, D10, D11 | Magic link auth (stateless signed JWT, 3 scopes), career page with org branding + fallback defaults (G-020), Typesense public job search with scoped API keys (G-029), application form with resume upload + GDPR consent, adaptive polling for status updates (G-030), self-scheduling UI (G-023), candidate email delivery (G-026), rate limiting (G-013), GDPR erasure with 48h cooling period, 12 API endpoints, 3 Inngest functions. Post-build audit: 7/7 PASS. |
| D10 | **Search Architecture** | `docs/modules/SEARCH.md` | P1 | ✅ Complete (Review) | D01, D02, D03 | Two-engine search (Typesense full-text + pgvector semantic), collection schemas, Postgres→Typesense sync via Inngest, AI matching with composite scoring, embedding lifecycle, differentiated AI credit weights, 6 API endpoints, 4 Inngest functions. Post-build audit: 7/7 PASS. |
| D11 | **Real-Time Features** | `docs/modules/REALTIME.md` | P1 | ✅ Complete (Review) | D01, D02, D08 | Supabase Realtime (Postgres Changes + Broadcast + Presence), channel naming convention, 7 subscribed tables, notification broadcast, page + team presence, optimistic UI with dedup, connection management, ChannelManager cleanup. Post-build audit: 7/7 PASS. |
| D12 | **Workflow & State Machine** | `docs/modules/WORKFLOW.md` | P1 | ✅ Complete (Review) | D01, D07, D08, D10 | Application lifecycle state machine (4 statuses, 7 stage types), `auto_actions` JSONB schema (6 action types), auto-advance on interview completion (G-025), talent pool automation (G-018), SLA enforcement with delayed Inngest events, bulk operations (50 limit), rejection flow with pool automation, 9 API endpoints, 6 Inngest functions. Post-build audit: 7/7 PASS. |

---

## Phase 2 — Pre-Launch Requirements

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D13 | **GDPR & Compliance** | `docs/COMPLIANCE.md` | P2 | ✅ Complete (Review) | D01, D09 | DSAR flow (access/portability/erasure/rectification/restriction), data retention policies with automated cron, consent management with versioning + withdrawal, DEI aggregation rules with cohort suppression (G-019), SOC 2 Type II control mapping, CCPA requirements, data region awareness, legal hold override, EEO-1 export, 10 API endpoints, 4 Inngest functions. Post-build audit: 7/7 PASS. |
| D14 | **Observability & Monitoring** | `docs/OBSERVABILITY.md` | P2 | ⬜ Not Started | — | Logging (Pino/structured). Sentry config. Metrics. Alerting. SLOs. Health endpoint. |
| D15 | **CI/CD Pipeline** | `docs/CI-CD.md` | P2 | ⬜ Not Started | — | GitHub Actions specs. DB migration strategy. Preview environments. Rollback procedure. |
| D16 | **Performance & Caching** | `docs/PERFORMANCE.md` | P2 | ⬜ Not Started | D01, D10 | Redis caching strategy. Cache invalidation. Query targets. ISR for portal. Load testing targets. |
| D17 | **Analytics & Reporting** | `docs/modules/ANALYTICS.md` | P2 | ⬜ Not Started | D01 | Key metrics data model. Materialized views vs. on-the-fly. DEI reporting. EEO compliance. |
| D18 | **Security Runbooks** | `docs/runbooks/` | P2 | ⬜ Not Started | D14 | Disaster recovery. DB restore. Security incident. Secret rotation. |

---

## Phase 3 — Post-MVP / Growth

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D19 | **Data Migration & Onboarding** | `docs/modules/ONBOARDING.md` | P3 | ⬜ Not Started | D01, D02 | CSV bulk import. ATS-to-ATS migration. Onboarding wizard. Demo data. |
| D20 | **White-Label / Custom Domain** | `docs/modules/WHITE-LABEL.md` | P3 | ⬜ Not Started | D09 | DNS/SSL setup. Email white-labeling. branding_config spec. |
| D21 | **Internationalization (i18n)** | `docs/modules/I18N.md` | P3 | ⬜ Not Started | D05 | Language support scope. next-intl setup. Locale-aware formatting. RTL. |

---

## Tracking Documents (Meta)

| Document | Path | Description |
|----------|------|-------------|
| This Index | `docs/INDEX.md` | Master registry — update on every doc change |
| Dev Log | `docs/DEVLOG.md` | Chronological log of all documentation work |
| AI Rules | `docs/AI-RULES.md` | Standards for AI-assisted doc generation |
| Doc Template | `docs/templates/MODULE-TEMPLATE.md` | Boilerplate for new module docs |
| ADR Template | `docs/templates/ADR-TEMPLATE.md` | Boilerplate for architecture decision records |

---

## Directory Structure

```
docs/
├── INDEX.md                          ← You are here
├── DEVLOG.md                         ← Chronological changelog
├── AI-RULES.md                       ← Documentation standards
├── PLAN.md                           ← Pre-build assessment & gap analysis
├── DESIGN-SYSTEM.md                  ← UI/UX specifications
├── DATABASE-SCHEMA.md                ← Complete DDL (all tables)
├── API-SPECIFICATION.md              ← OpenAPI 3.1 + contracts
├── COMPLIANCE.md                     ← GDPR, SOC 2, CCPA
├── OBSERVABILITY.md                  ← Monitoring, logging, SLOs
├── CI-CD.md                          ← Pipeline specifications
├── PERFORMANCE.md                    ← Caching, load targets
│
├── ADRs/                             ← Architecture Decision Records
│   ├── 001-supabase-client-only.md
│   ├── 002-nextjs-16-proxy-middleware.md
│   ├── 003-hnsw-vector-indexes.md
│   ├── 004-testing-strategy.md
│   ├── 005-multi-org-switching.md
│   ├── 006-soft-delete-policy.md
│   ├── 007-audit-log-architecture.md
│   ├── 008-enum-strategy.md
│   ├── 009-file-storage-pattern.md
│   └── 010-gdpr-erasure-crypto-shredding.md
│
├── modules/                          ← Feature module specifications
│   ├── BILLING.md
│   ├── OFFER-WORKFLOW.md
│   ├── INTERVIEW-SCHEDULING.md
│   ├── NOTIFICATIONS.md
│   ├── CANDIDATE-PORTAL.md
│   ├── SEARCH.md
│   ├── REALTIME.md
│   ├── WORKFLOW.md
│   ├── ANALYTICS.md
│   ├── ONBOARDING.md
│   ├── WHITE-LABEL.md
│   └── I18N.md
│
├── runbooks/                         ← Operational runbooks
│   ├── disaster-recovery.md
│   ├── database-restore.md
│   ├── security-incident.md
│   └── secret-rotation.md
│
├── templates/                        ← Document boilerplates
│   ├── MODULE-TEMPLATE.md
│   └── ADR-TEMPLATE.md
│
└── (source documents)
    ├── Enterprise-Multi-Tenant-ATS-Princi.md
    ├── itecbrains_ATS_Phase1_Expert_Review.docx
    └── itecbrains_ATS_Phase2_Architecture_Blueprint.docx
```

---

## Dependency Graph

```
S1 (Phase 1 Review) ──┐
S2 (Phase 2 Blueprint)─┤
                        ▼
                   S3 (Architect Pre-Plan)
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
     D01 (Schema)  D04 (ADRs)  D05 (Design System)
            │                       │
     ┌──────┼──────┬────────┐      │
     ▼      ▼      ▼        ▼      ▼
   D02    D03    D06-D12   D13    D09
  (API)  (Billing) (Modules) (Compliance) (Portal)
     │      │
     ▼      ▼
   D19    D16
(Onboarding)(Perf)
```
