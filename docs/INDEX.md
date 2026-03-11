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
| S1 | Phase 1 Expert Review (118 issues) | `docs/source/itecbrains_ATS_Phase1_Expert_Review.docx` | ✅ Complete | Input document — 118 issues identified |
| S2 | Phase 2 Architecture Blueprint v2.0 | `docs/source/itecbrains_ATS_Phase2_Architecture_Blueprint.docx` | ✅ Complete | Input document — enhanced blueprint |
| S3 | Principal Architect's Pre-Plan | `docs/source/Enterprise-Multi-Tenant-ATS-Princi.md` | ✅ Complete | Consolidated architectural decisions, core schema, RBAC, RLS, modules |

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
| D14 | **Observability & Monitoring** | `docs/OBSERVABILITY.md` | P2 | ✅ Complete (Review) | D02, D08 | Three-pillar observability (Pino logging + Sentry errors + Vercel/custom metrics), PII redaction, 3 health endpoints (shallow/deep/admin), 9 SLOs with error budget, 4-severity alerting via Slack/PagerDuty, request ID tracing, Inngest dead-letter handling, admin system dashboard. Post-build audit: 7/7 PASS. |
| D15 | **CI/CD Pipeline** | `docs/CI-CD.md` | P2 | ✅ Complete (Review) | D04, D14 | 4-environment strategy (dev/preview/staging/prod), GitHub Actions (PR checks + staging + production deploys), Supabase migration strategy (backward-compatible only), preview environments, Dependabot, rollback procedures (Vercel instant + DB PITR), release management with semver, branch protection, security controls. Post-build audit: 7/7 PASS. |
| D16 | **Performance & Caching** | `docs/PERFORMANCE.md` | P2 | ✅ Complete (Review) | D01, D10, D11, D14 | Performance targets (9 operation types), Redis caching (cache-aside + invalidation), no-cache for PII, connection pooling (transaction mode), query optimization rules, ISR for career pages, Inngest concurrency limits, Realtime event batching, k6 load testing (6 scenarios), frontend performance budget, bundle analysis. Post-build audit: 7/7 PASS. |
| D17 | **Analytics & Reporting** | `docs/modules/ANALYTICS.md` | P2 | ✅ Complete (Review) | D01, D12, D13 | 7 pipeline metrics + 6 volume metrics + 4 source metrics, materialized views (daily pipeline + monthly hiring) with Inngest refresh, time-in-stage window functions, pipeline funnel aggregation, DEI reporting (consuming D13 rules), 7 API endpoints, 2 Inngest functions, 9 dashboard widgets, plan-gated features. Post-build audit: 7/7 PASS. |
| D18 | **Security Runbooks** | `docs/runbooks/SECURITY-RUNBOOKS.md` | P2 | ✅ Complete (Review) | D14, D15 | 6 runbooks (service outage, DB restoration, security incident, secret rotation, deployment rollback, third-party failure), degradation matrix, escalation path (L1-L4), post-incident review template. Post-build audit: 7/7 PASS. |

---

## Phase 3 — Post-MVP / Growth

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D19 | **Data Migration & Onboarding** | `docs/modules/ONBOARDING.md` | P3 | ✅ Complete (Review) | D01, D02, D09 | Signup flow, 5-step onboarding wizard, CSV import (candidates + jobs, 10K limit), ATS-to-ATS migration via Merge.dev with stage mapping, demo data seeding + cleanup, plan-gated migration limits, 8 API endpoints, 3 Inngest functions. Post-build audit: 7/7 PASS. |
| D20 | **White-Label / Custom Domain** | `docs/modules/WHITE-LABEL.md` | P3 | ✅ Complete (Review) | D05, D09 | Custom domain (DNS CNAME + TXT verification, Vercel SSL), custom email sender domain (SPF/DKIM/DMARC via Resend), extended branding_config (Enterprise), proxy.ts routing for custom domains, "Powered by" badge removal, 6 API endpoints, 2 Inngest functions. Post-build audit: 7/7 PASS. |
| D21 | **Internationalization (i18n)** | `docs/modules/I18N.md` | P3 | ✅ Complete (Review) | D05, D08, D09 | next-intl setup, translation file structure (9 namespaces), locale-aware date/currency/relative-time formatting, RTL support (CSS logical properties), career page + email localization, candidate locale detection, MVP: en-US/en-GB, post-MVP: 6 additional languages. Post-build audit: 7/7 PASS. |

---

## Phase 4 — Pre-Code Analysis (Blocks infrastructure setup)

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D00 | **Competitive Analysis & Market Positioning** | `docs/COMPETITIVE-ANALYSIS.md` | P0 | ⬜ Not Started | — | Major ATS products (modern + legacy), pain points from real user reviews, feature gap analysis, pricing validation, positioning strategy. Informs UX priorities and marketing. |
| D22 | **Security Threat Model** | `docs/SECURITY-THREAT-MODEL.md` | P1 | ⬜ Not Started | D01, D02, D13 | STRIDE threat analysis, attack-vector-to-control mapping, PII data flow diagram, penetration test plan. Validates our security architecture for enterprise sales. |
| D23 | **Data Migration & Import Strategy** | `docs/DATA-MIGRATION.md` | P1 | ⬜ Not Started | D01, D19 | Competitor-to-itecbrains migration paths (Greenhouse, Lever, Ashby, BambooHR), staging tables, field mapping, validation rules, error handling, rollback strategy. Day-one customer need. |
| D24 | **Consolidated Testing Strategy** | `docs/TESTING-STRATEGY.md` | P1 | ⬜ Not Started | D04 (ADR-004), D01 | Coverage targets, MSW mock registry, golden tenant fixture spec, test database reset strategy, E2E scenario registry, CI parallelization. Consolidates scattered test sections from D06–D12. |
| D25 | **User Personas & Journey Maps** | `docs/USER-PERSONAS.md` | P2 | ⬜ Not Started | D00, D06–D12 | 5 persona profiles (Admin, Recruiter, Hiring Manager, Interviewer, Candidate), end-to-end journey maps, friction points, notification priority by persona. Informs navigation and dashboard design. |
| D26 | **Error Taxonomy & Recovery Patterns** | `docs/ERROR-TAXONOMY.md` | P2 | ⬜ Not Started | D02, D14 | Application error code scheme (ATS-XXXX), consistent error response format, user-facing error messages, graceful degradation patterns, retry strategies by failure type. |

---

## Deferred Documents (not pre-code — trigger-based)

Documents intentionally excluded from pre-code phase. Each has a specific trigger condition. Do NOT start these until the trigger fires.

| Document | Trigger | Why Deferred | Depends On |
|----------|---------|-------------|------------|
| **Email Template Visual Design** | When building D08 notification UI (first email-sending feature) | Email HTML/branding design is UI implementation work, not architecture. D08 already defines event types and channels. | D05, D08 |
| **API SDK & Developer Portal** | When implementing Pro tier API access | Pro+ feature. No external API consumers exist until product launches. | D02 |
| **Accessibility Testing Plan** | Pre-launch QA phase (after all UI is built) | D05 WCAG 2.1 AA requirements are sufficient for building. Dedicated a11y audit needs real UI to test against. | D05 |
| **Environment Setup Guide** | During infrastructure setup (next task after docs) | This IS the setup — it's created as we do it, not before. | D15 |
| **Third-Party API Contract Validation** | When integrating each service (15 [VERIFY] markers track these) | Validated at integration time against live API docs. Training data may be stale. | D02 |
| **Pricing Validation & A/B Testing** | Pre-launch marketing phase | D03 defines the model. Market validation requires a live product or landing page. D00 competitive analysis will provide initial benchmarking. | D03, D00 |

> **Rule:** When a trigger fires, create the document, add it to the active phase above, and log it in DEVLOG. These are not forgotten — they are scheduled.

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
├── COMPETITIVE-ANALYSIS.md              ← D00: Market positioning
├── SECURITY-THREAT-MODEL.md             ← D22: STRIDE analysis
├── DATA-MIGRATION.md                    ← D23: Import strategy
├── TESTING-STRATEGY.md                  ← D24: Consolidated test plan
├── USER-PERSONAS.md                     ← D25: Personas & journeys
├── ERROR-TAXONOMY.md                    ← D26: Error code scheme
│
├── templates/                        ← Document boilerplates
│   ├── MODULE-TEMPLATE.md
│   └── ADR-TEMPLATE.md
│
└── source/                              ← Provenance (reference only, not for implementation)
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
            │      │    │       │
            ▼      ▼    ▼       ▼
    D00 ─→ D25   D22  D23    D24    D26
  (Comp.)  (Personas) (Security) (Migration) (Testing) (Errors)
     │      │
     ▼      ▼
   D19    D16
(Onboarding)(Perf)
```
