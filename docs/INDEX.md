# itecbrains ATS — Documentation Index

> Master registry of all documentation. Every document has a status, owner, and dependency chain.
> **Last updated:** 2026-03-10

## How to use this index

- **Status key:** `✅ Complete` · `🟡 In Progress` · `⬜ Not Started` · `🔴 Blocked`
- **Priority:** `P0` = Blocks all development · `P1` = Blocks feature area · `P2` = Pre-launch · `P3` = Post-MVP
- Every document change MUST be logged in [DEVLOG.md](DEVLOG.md)
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
| D01 | **Complete Database Schema** | `docs/DATABASE-SCHEMA.md` | P0 | ⬜ Not Started | S3, ADR-001→010 | ✅ **Fully unblocked** — all 10 prerequisite ADRs resolved (AC-1→6, soft delete, audit, enums, files, GDPR). Full DDL for ALL tables. All RLS policies, indexes, triggers, functions. |
| D02 | **API Specification** | `docs/API-SPECIFICATION.md` | P0 | ⬜ Not Started | D01 | OpenAPI 3.1 draft. Pagination contract (cursor-based). Error format (RFC 7807). Rate limiting tiers. Auth (JWT + API key). Idempotency. Webhook outbound. |
| D03 | **Billing & Subscription Architecture** | `docs/modules/BILLING.md` | P0 | ⬜ Not Started | D01 | Plan tier feature matrix. Stripe integration flow. Feature flag enforcement. Metered billing (AI credits). Seat-based pricing. Webhook handling. |
| D04 | **Architecture Decision Records** | `docs/ADRs/` | P0 | 🟡 In Progress | S3 | ✅ ADR-001→010 complete (all blocking decisions resolved). Remaining: formal ADRs for STACK-1→6 (non-blocking, for team alignment). |
| D05 | **Design System** | `docs/DESIGN-SYSTEM.md` | P0 | ⬜ Not Started | — | Color palette, typography, spacing, component specs (shadcn/ui customization), responsive breakpoints, accessibility targets (WCAG 2.1 AA), kanban board UX. |

---

## Phase 1 — Core Feature Specs (Blocks feature development)

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D06 | **Offer Workflow** | `docs/modules/OFFER-WORKFLOW.md` | P1 | ⬜ Not Started | D01 | State machine (draft→approved→sent→signed). Approval chain engine. Dropbox Sign integration. Compensation bands. Template system. |
| D07 | **Interview Scheduling** | `docs/modules/INTERVIEW-SCHEDULING.md` | P1 | ⬜ Not Started | D01 | Scheduling algorithm. Panel/sequential/loop types. Self-scheduling flow. Scorecard schema. Blind review RLS. Nylas deep integration. |
| D08 | **Notification System** | `docs/modules/NOTIFICATIONS.md` | P1 | ⬜ Not Started | D01 | In-app (Supabase Realtime). Email triggers. Preferences per user. React Email templates. Digest mode. Candidate vs recruiter events. |
| D09 | **Candidate Portal** | `docs/modules/CANDIDATE-PORTAL.md` | P1 | ⬜ Not Started | D01, D05 | Candidate auth (magic link). Career page theming. Application form builder. Status tracking. GDPR consent. File upload flow. |
| D10 | **Search Architecture** | `docs/modules/SEARCH.md` | P1 | ⬜ Not Started | D01 | Typesense collection schema. Sync pipeline (Postgres→Typesense). Faceted search spec. pgvector + Typesense composition. |
| D11 | **Real-Time Features** | `docs/modules/REALTIME.md` | P1 | ⬜ Not Started | D01 | Which tables subscribe. Tenant-scoped channels. Optimistic UI. Presence. |
| D12 | **Workflow & State Machine** | `docs/modules/WORKFLOW-ENGINE.md` | P1 | ⬜ Not Started | D01 | Application lifecycle state machine. Valid transitions. auto_triggers spec. SLA enforcement. |

---

## Phase 2 — Pre-Launch Requirements

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D13 | **GDPR & Compliance** | `docs/COMPLIANCE.md` | P2 | ⬜ Not Started | D01 | DSAR flow. Right to erasure. Data retention policy. Consent management. SOC 2 prep. CCPA. |
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
│   ├── WORKFLOW-ENGINE.md
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
