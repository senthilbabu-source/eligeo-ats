# Eligeo — Documentation Index

> Master registry of all documentation. Every document has a status, owner, and dependency chain.
> **Last updated:** 2026-03-13

## How to use this index

### Status vocabulary (precise — not interchangeable)

| Status | Meaning |
|--------|---------|
| `✅ Complete (Audit)` | Post-build audit run and passed (AI-RULES §13). Test count verified actuals on record. No open FAILs. |
| `✅ Complete (Review)` | Document written and internally reviewed. Feature built and tests passing. Audit not yet formally run. |
| `✅ Complete` | Foundational/governance doc — not a feature spec, no build audit required. |
| `🟡 In Progress` | Actively being built. A VS Code session or Cowork session owns this. |
| `⬜ Spec` | Spec written, build not started. Ready for build gate. |
| `⬜ Not Started` | No spec, no build. |
| `🔴 Blocked` | Depends on unresolved upstream item. Cannot proceed. |

- **Priority:** `P0` = Blocks all development · `P1` = Blocks feature area · `P2` = Pre-launch · `P3` = Post-MVP
- Every document change MUST be logged in [DEVLOG.md](DEVLOG.md)
- Cross-document gaps tracked in [GAPS.md](GAPS.md) — check before starting any doc
- Writing standards are in [AI-RULES.md](AI-RULES.md)

### Governance rules (anti-drift, anti-debt, anti-hallucination)

**R1 — New ADR → update Depends On immediately.** When a new ADR is created, every in-flight phase spec's `Depends On` column must be updated in the same session. No ADR may be cited as "governing" a phase if it isn't in that phase's dependency chain.

**R2 — Numeric claims are time-stamped, not timeless.** Any count in a description (tests, endpoints, tables, Inngest functions) must note the phase/wave it was verified at, e.g. `38 tests (verified Phase 7 A1)`. Unqualified numbers in descriptions older than one phase boundary are treated as estimates, not facts.

**R3 — `✅ Complete` does not mean current.** A document marked Complete was accurate when audited. If a migration has been added, a table changed, or an endpoint modified since the last verification date, the document is stale until explicitly re-audited. Before citing a Complete doc in a pre-task gate, check its last-verified context against current migration count.

**R4 — Phase gate stubs are mandatory.** Every phase must have a Pre-Start Gate row and a Post-Build Audit row in the Phase Gate Documents table before build starts. A phase with no gate stub can silently skip §21 and §13. Gate rows must be created as `⬜ Not Created` at phase kickoff — not left absent.

**R5 — Migration register is the authoritative assignment ledger.** Before writing any migration file, check the Migration Register below and claim the next number. Never assume the next number — always verify. Parallel sessions (VS Code + Cowork) must coordinate via this register.

**R6 — Estimates vs actuals must be visually distinct.** Planned test counts in specs use `~` prefix (e.g., `~197 new tests`). Once a phase ships, the Description must be updated with the verified actual count, and the `~` removed. A `~` in a shipped phase's description is a debt marker.

**R7 — Downstream impact awareness.** Before closing a session that modifies any foundational document (D01, D02, D03, D24, D29), check the Downstream Impact Map below and flag any secondary documents that have become stale. Log them in GAPS.md if not immediately resolved.

---

## Live Build Health

> Single-glance project state. Update this block at every phase boundary and whenever a session changes any of these numbers.

| Metric | Value | Last Updated |
|--------|-------|-------------|
| **Total tests** | 1437 Vitest + 71 E2E = **1508** | Phase 7 Wave A1 |
| **All tests passing** | ✅ Yes | Phase 7 Wave A1 |
| **Migrations applied** | **33** (000–033). Next = `00034` | Phase 7 Wave A1 |
| **Active Inngest functions** | **28 shipped** / 69 registered in D29 | Phase 7 Wave A1 |
| **RLS coverage** | **33 tables** verified in D24 matrix (Phase 6). Δ: `analytics_snapshots` added M033 — tests written (5 RLS). **Target: all 57 tables.** | Phase 7 Wave A1 |
| **Open gaps** | See [GAPS.md](GAPS.md) | — |
| **ADRs** | 013 active | 2026-03-13 |
| **Current phase** | **Phase 7** (Wave A1 ✅, Wave T1 ✅, Wave A2 ⬜ next) | 2026-03-13 |
| **Next phase** | **Phase 8** (⬜ Spec ready — start gate: Wave A2 or Phase 7 completion) | 2026-03-13 |

> **Rule:** If any value in this table was set more than one phase ago and the codebase has changed in that area, treat it as stale and re-verify before using it in a pre-task gate.

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
| D01 | **Complete Database Schema** | `docs/DATABASE-SCHEMA.md` | P0 | ✅ Complete (Review) | S3, ADR-001→010 | 49 tables across 9 clusters (39 base + `org_daily_briefings` M021 + `ai_score_feedback` M022 + `offer_templates`/`offers`/`offer_approvals` M028 + `ai_match_explanations` M029 + `candidate_merges`/`resume_parsed_data` M030 + `ai_shortlist_reports`/`ai_shortlist_candidates` M031 + `screening_configs`/`screening_sessions` M032). Full DDL, RLS (all 4 ops), indexes, triggers, functions, JSONB interfaces, volume estimates. |
| D02 | **API Specification** | `docs/API-SPECIFICATION.md` | P0 | ✅ Complete (Review) | D01 | 13 sections: auth (JWT + API key), RBAC, URL conventions, cursor pagination, RFC 9457 errors, rate limiting (4 plan tiers), idempotency, webhook outbound/inbound, Zod→OpenAPI 3.1. 50+ endpoints in `docs/api/ENDPOINTS.md`. Post-build audit passed. |
| D03 | **Billing & Subscription Architecture** | `docs/modules/BILLING.md` | P0 | ✅ Complete (Review) | D01 | 4 plan tiers (starter/growth/pro/enterprise), feature matrix (16 features), Stripe Checkout + Customer Portal, subscription lifecycle (6 states), seat-based pricing with overage, AI credit metering + overage billing, 6 Inngest webhook handlers, dunning flow, downgrade rules. Post-build audit passed (3 FAILs fixed). |
| D04 | **Architecture Decision Records** | `docs/ADRs/` | P0 | ✅ Complete | S3 | ✅ ADR-001→013 complete. ADR-011: AI-first build pivot. ADR-012 (2026-03-11): Domain architecture — `eligeo.io` (marketing) + `app.eligeo.io` (app), career portal bridge pattern, CMS for blog/content. **ADR-013 (2026-03-13):** Contractor Hiring Architecture Boundary — Side A (ATS intake, ends at hire event) permanently in scope; Side B (SOW, PO, timesheets, invoices, VMS) permanently out of scope. Formalises Phase 8 scope boundary. Remaining: formal ADRs for STACK-1→6 (non-blocking). |
| D05 | **Design System** | `docs/DESIGN-SYSTEM.md` | P0 | ✅ Complete (Review) | D01 | Color palette (HSL tokens, light + dark), Inter + Geist Mono typography, spacing scale, shadcn/ui component specs (16 base + 10 ATS-specific), responsive breakpoints, WCAG 2.1 AA (all contrasts verified), animation tokens, career page theming, file organization. Post-build audit passed. |

---

## Phase 1 — Core Feature Specs (Blocks feature development)

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D06 | **Offer Management** | `docs/modules/OFFERS.md` | P1 | ✅ Complete (Review) | D01, D02, D03, D05 | 8-state machine (draft→withdrawn, `send` transition active), sequential approval chain with auto-skip (G-022), **Dropbox Sign fully integrated (P6-3):** real envelope creation/cancellation, HMAC webhook, AI offer letter preview (Pro+), `send_offer` command bar intent. Offer templates, expiry cron, compensation editor, AI comp suggestion + salary band check + offer letter draft. **Phase 4 + Phase 5 + P6-3: 123 offer tests (47 state machine + 14 AI + 16 intent + 34 SA + 17 Inngest + 16 e-sign) + 44 RLS tests.** |
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
| D17 | **Analytics & Reporting** | `docs/modules/ANALYTICS.md` | P2 | ✅ Complete (Review) — expanded 2026-03-13 | D01, D02, D03, D08, D12, D13, D24 | **Full industry-standard scope.** 10 analytics views (V01 Pipeline Funnel, V02 Stage Velocity, V03 Source Attribution, V04 Team Performance, V05 Job Health, V06 Offer Analytics, V07 Rejection Analysis, V08 Hiring Plan vs Actual, V09 Interviewer Performance, V10 Candidate Experience). 3 new tables (`hiring_plans`, `analytics_saved_views`, `analytics_report_schedules`). 5 new materialized views (`mv_rejection_analysis`, `mv_source_quality`, `mv_interviewer_performance`, `mv_offer_analytics`, `mv_job_health`). Period-over-period comparison, dimension filters, drill-down, CSV/Excel export, scheduled report delivery. AI anomaly detection (z-score, 2σ threshold), AI recommendations engine, predictive fill forecast. 8 new Inngest functions total. 19 new API endpoints. Migration 00037. Wave A1 ✅ built (D33). Wave A2 spec complete — ready to build (~140 new tests). Wave A3 deferred (custom report builder, DEI full activation, candidate experience). |
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
| D00 | **Competitive Analysis & Market Positioning** | `docs/COMPETITIVE-ANALYSIS.md` | P0 | ✅ Complete (Review) | — | 17 products analyzed (5 modern, 5 legacy, 7 mid-market/niche). 20 pain points mapped to architecture. Pricing validated against market. 7 gaps identified (2 post-MVP flags). Positioning strategy with battlecards. |
| D22 | **Security Threat Model** | `docs/SECURITY-THREAT-MODEL.md` | P1 | ✅ Complete (Review) | D01, D02, D13 | STRIDE analysis (30+ threats, 6 categories), attack surface inventory (11 surfaces), PII data flow diagram with classification, 35+ attack-vector-to-control mappings, 7 gaps identified (all low-medium), 40-case penetration test plan, security headers spec, PR security checklist. |
| D23 | **Data Migration & Import Strategy** | `docs/DATA-MIGRATION.md` | P1 | ✅ Complete (Review) | D01, D19 | 7-stage migration pipeline, staging table schema (6 tables), competitor field mapping (Greenhouse, Lever, Ashby, BambooHR, Workable), Zod validation pipeline, dedup rules, error thresholds (warn 10%/abort 30%), metadata-tagged rollback, data quality assessment, CSV enhancements, 5 test fixtures, 7 Inngest functions. |
| D24 | **Consolidated Testing Strategy** | `docs/TESTING-STRATEGY.md` | P1 | ✅ Complete (Review) | D04 (ADR-004), D01 | Vitest + Playwright config, golden tenant fixture (2 tenants, 5 roles, full entity graph), MSW mock registry (11 services, 15 handlers), ~362-case RLS test matrix (adds screening_configs/screening_sessions from P6-4, ai_shortlist_reports/candidates from P6-5, offer_templates/offers/offer_approvals from P4, ai_match_explanations from M029), 20 E2E scenarios + 5 failure scenarios, CI parallelization. §5.1 adds Offers module row (P4). |
| D25 | **User Personas & Journey Maps** | `docs/USER-PERSONAS.md` | P2 | ✅ Complete (Review) | D00, D06–D12 | 5 persona profiles with goals/frequency/frustration thresholds. 4 journey maps (recruiter daily, hiring manager, candidate, admin setup). Notification priority matrix (5 personas × 15 events). Dashboard widgets by persona. Role-based navigation spec. |
| D26 | **Error Taxonomy & Recovery Patterns** | `docs/ERROR-TAXONOMY.md` | P2 | ✅ Complete (Review) | D02, D14 | ATS-XXXX error code scheme (12 categories, 60+ codes), RFC 9457 response format with `code` extension, Server Action error pattern, graceful degradation matrix (7 services), circuit breaker pattern, retry strategies (6 failure types), React error boundary design (4 placement levels), user-facing message guidelines. |
| D27 | **Product Roadmap & Release Strategy** | `docs/PRODUCT-ROADMAP.md` | P0 | ✅ Complete (Review) | D00, D03, D25, all modules | 5 release versions (v1.0–v3.0). v1.0: 26 features, 6 build phases over 12 weeks, 10 notification events, launch criteria checklist. Feature-to-plan mapping. Revenue projections ($540 MRR launch → $125K MRR at v3.0). Risk mitigation. Decision log (12 scope decisions). Determines ALL build order. |
| D28 | **Environment Variables** | `docs/ENVIRONMENT-VARIABLES.md` | P0 | ✅ Complete (Review) | D01, D02, D03, D14, D15 | 33 env vars across 11 services. Public/secret classification, v1.0 vs v2.0+ required, `.env.example` template, security rules. P6-3: +3 Dropbox Sign vars. |
| D29 | **Inngest Function Registry** | `docs/INNGEST-REGISTRY.md` | P0 | ✅ Complete (Review) | D03, D06–D12, D13, D17, D19, D23 | 69 Inngest functions across 15 modules. v1.0 scope: 49 functions. **28 shipped** (all active). Phase 7: +1 analytics/compute-snapshots. P6-1: +1 portal/resume-parse. P6-4: +3 screening. P6-3: 3 stub→real. P6-5: +1 batchShortlist. 9 cron schedules. |
| D30 | **User Story Map** | `docs/USER-STORY-MAP.md` | P1 | ✅ Complete | D27, ADR-011 | 184 user stories across 28 sections. Phase 2.7 all ✅ BUILT. Dashboard Waves 1–3 ✅. AI-Proof A/B/C ✅. Wave F ✅. **Phase 4 offers: O1, O2, O5, O6 ✅ BUILT. O3 ✅ BUILT (P6-3 real Dropbox Sign). O4 partial (signed/declined tracked, opened/viewed v2.0).** |
| D31 | **Brand Guide** | `docs/BRAND.md` | P3 | ✅ Complete | ADR-012 | Logo narrative (3-candidate selection metaphor), brand voice guidelines, marketing copy for `/about` page, technical logo specs, animated variant plan. |
| MKT-01 | **Marketing Intelligence** | `docs/MARKETING-INTELLIGENCE.md` | P1 | ✅ Complete (Living) | D00, D27, D31 | Competitive differentiators, taglines, feature copy, segment messaging, objection handling, proof points, comparison tables. **Must be updated at every phase boundary** — see `docs/MARKETING-UPDATE-CHECKLIST.md`. Last updated: Phase 6 (2026-03-13). |
| MKT-02 | **Marketing Update Checklist** | `docs/MARKETING-UPDATE-CHECKLIST.md` | P1 | ✅ Complete (Protocol) | MKT-01 | 6-section checklist for keeping MKT-01 current. Enforced in CLAUDE.md Pre-Commit Protocol. Run at every phase boundary and whenever a new AI feature ships. |

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

## Pre-Phase 5 Hardening

| # | Document | Path | Priority | Status | Description |
|---|----------|------|----------|--------|-------------|
| H00 | **Hardening Plan** | `docs/HARDENING.md` | P0 | ✅ Complete | 4-wave plan (H1–H4): 12 items implemented. Atomic stage move + approval locking RPCs, fuzzy dedup, email verification, embedding freshness, candidate timeline (recordInteraction), AI match explanations, scorecard auto-trigger, NBA enhancement (6 rules), percentile labels, e-sign cleanup, AI Act compliance. Migration 029. Tests: 1038 Vitest (+3 net). |

---

## Pre-Phase 6 AI Hardening ✅ COMPLETE

| # | Document | Path | Priority | Status | Description |
|---|----------|------|----------|--------|-------------|
| H6 | **AI Hardening Plan** | `docs/PRE-PHASE6-AI-HARDENING.md` | P0 | ✅ Complete | ADR-011 compliance audit + 6 hardening items (H6-1→H6-6). Pipeline board match scores, candidates list AI Fit column, NBA all 6 rules wired, candidate profile match card + embedding freshness + duplicate warning, offers form AI buttons (suggest/band check/generate terms), command bar 5 new intents. Tests: 1242 Vitest (+39 net). |

---

## Phase 5 — Billing ✅ COMPLETE

| Wave | Deliverable | Tests | Status |
|------|-------------|-------|--------|
| B5-1 | Plan config, feature gating, credits, seats, Stripe client, errors | 54 | ✅ Complete |
| B5-2 | Stripe webhook handler + 7 Inngest billing functions | 22 | ✅ Complete |
| B5-3 | 4 billing API endpoints (checkout, portal, usage, plan) | 13 | ✅ Complete |
| B5-4 | Enforcement wired into Server Actions (seats, jobs, features) | 20 | ✅ Complete |
| B5-5 | Billing settings UI + 3 global banners | 37 | ✅ Complete |
| B5-6 | Offer send re-activation + refresh-job-embedding (H-04 closed) | 8 | ✅ Complete |
| **Total** | | **154** | **All passing** |

Tests: 1049 → 1203 Vitest (Phase 5) → 1242 Vitest (H6 hardening) → 1339 Vitest (P6-2a/P6-2b/P6-5/P6-3) → 1399 Vitest (P6-4) → 1437 Vitest (Phase 7 A1). 68 → 71 E2E (+3 analytics). **1508 total.** Migrations: 033 (Phase 7 analytics_snapshots). 28 Inngest functions active.

---

## Phase 6 — Candidate Intelligence

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D32 | **Phase 6: Candidate Intelligence Layer** | `docs/modules/PHASE6-CANDIDATE-INTELLIGENCE.md` | P0 | ✅ Complete (Review) | D01, D03, D06, D08, D09, D10, D24, D29 | 6 waves — all complete: **P6-1 ✅ Resume Extraction** (hybrid pdf-parse + GPT-4o, Inngest portal/resume-parse), P6-2a ✅ Candidate status portal, P6-2b ✅ Merge UI, P6-3 ✅ Dropbox Sign full integration, P6-5 ✅ AI Batch Shortlisting, **P6-4 ✅ Conversational AI Screening** (4 AI funcs, 3 Inngest, 6 API, recruiter config + candidate portal + results UI). 5 new tables (`candidate_merges`, `ai_shortlist_reports`, `ai_shortlist_candidates`, `screening_configs`, `screening_sessions`), 8 new Inngest functions + 3 stub replacements, 19+ API endpoints. Migrations 030–032. |

---

## Phase 7 — Analytics & Reporting

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D33 | **Analytics Module** | `docs/modules/ANALYTICS-MODULE.md` | P1 | ✅ Complete (Review) | D01, D17, D24, D29 | 5 analytics views (funnel, velocity, sources, team, jobs) with AI-generated narratives (ADR-011). Pure compute library, Inngest nightly cron, 6 API routes, CSS-only charts, command bar `analytics_view` intent. Migration 033 (`analytics_snapshots`). `reports:view` permission for team analytics (owner/admin only). 38 tests (33 unit + 5 RLS) + 3 E2E. |
| — | **Phase 7 Wave T1: Timezone Support** | `docs/modules/PHASE7-WAVE-T1-TIMEZONE.md` | P1 | ✅ Complete | D01, D07, D08, D21 | Retrofits all 26+ UI date display locations to honour org/user timezone preference. `src/lib/datetime.ts` (client-safe) + `src/lib/datetime-server.ts` (server fetch). `formatInTz`, `formatForEmail`, `localInputToUtc`, `resolveTimezone`, `getUserTimezone`. Uses `@date-fns/tz` v1.4.1. 20+ files patched (zero `toLocaleDateString` remaining). Interview scheduling: timezone indicator + UTC conversion via `localInputToUtc`. No new migrations. 19 unit tests. Timezone selector UI deferred (DB columns ready). |

---

## Phase 8 — Contingent Hiring Pipeline

| # | Document | Path | Priority | Status | Depends On | Description |
|---|----------|------|----------|--------|------------|-------------|
| D34 | **Phase 8: Contingent Hiring Pipeline** | `docs/modules/PHASE8-CONTINGENT-HIRING.md` | P1 | ⬜ Spec (Ready for Build) | D01, D02, D03, D05, D06, D08, D09, D10, D12, D17, D24, D25, D27, D29, ADR-001→013 | 5 waves — Contractor/contingent role type (Side A ATS intake only, no VMS). 3 new tables (`vendors`, `vendor_submissions`, `candidate_contract_profiles`), rate intelligence cache, `role_type` CHECK on `job_openings`, 7 Inngest functions, 12 new API endpoints, contractor fit score (availability + rate + skills + contract type + clearance), AI rate band suggestion, AI vendor submission ranking, AI rate check assist, AI engagement summary PDF, 8 command bar intents. Migrations 00034–00036. ~197 new tests. Plan gate: Growth+. |

---

## Phase Gate Documents

Mandatory governance artifacts produced at phase boundaries per AI-RULES §13 and §21.

> **R4 enforcement:** Every phase MUST have a Pre-Start Gate row and a Post-Build Audit row in this table. Rows are created as `⬜ Not Created` at phase kickoff — not left absent. A missing row means the gate was silently skipped, which is a rule violation (CLAUDE.md Gate Violation Protocol).

| Document | Path | Gate | Status | Summary |
|----------|------|------|--------|---------|
| Phase 5 Pre-Start Gate | `docs/PHASE5-PRE-GATE.md` | §21 G1–G6 | ✅ PASSED 2026-03-12 | All 6 gates passed. Critical finding: V-3 `createUsageRecord()` deprecated → resolved to `stripe.billing.meterEvents.create()`. ~193 tests planned across 5 categories. |
| Post-Phase-5 Audit | `docs/POST-PHASE5-AUDIT.md` | §13 A1–A7 | ✅ PASSED 2026-03-12 | 0 critical failures, 9 warnings. W-03 resolved (subscription_status column confirmed in M002). D01/D03 synced. GAPS.md updated. Phase 6 unblocked. |
| Phase 7 Pre-Start Gate | `docs/PHASE7-PRE-GATE.md` | §21 G1–G6 | ⬜ Not Created | Required before Phase 7 Wave A2 build starts. Wave A1 shipped without formal gate (Wave A1 was small and self-contained). Wave A2 scope (~140 new tests, 3 new tables, 5 materialized views, 8 Inngest functions) requires a gate. |
| Post-Phase-7 Audit | `docs/POST-PHASE7-AUDIT.md` | §13 A1–A7 | ⬜ Not Created | Required before Phase 8 build start gate. Must verify: D17 Wave A2 actuals vs estimates, RLS coverage for `hiring_plans`/`analytics_saved_views`/`analytics_report_schedules`, Inngest registry updated (D29), migration 00037 documented. |
| Phase 8 Pre-Start Gate | `docs/PHASE8-PRE-GATE.md` | §21 G1–G6 | ⬜ Not Created | Blocked until: (1) Phase 7 Wave T1 ships, (2) Post-Phase-7 Audit passes. Gate must verify ADR-013 enforced, Side A/B boundary understood, migration 00034 claimed, D34 dependency chain complete (ADR-001→013). |
| Post-Phase-8 Audit | `docs/POST-PHASE8-AUDIT.md` | §13 A1–A7 | ⬜ Not Created | Created at Phase 8 completion. Must verify: ~197 test estimate vs actuals, all 3 new tables have RLS tests (4 ops × 2 tenants), ADR-013 not violated by any shipped code, contractor analytics feeds correctly into Wave A2 infrastructure. |

---

## Migration Register

> **Authoritative assignment ledger.** Before writing any `.sql` migration file, claim the next number here. Parallel sessions (VS Code + Cowork) must coordinate via this table. Never assume the next number — always verify.
>
> **Rule (R5):** If a session adds a migration, this register must be updated in the same commit. A migration file without a register entry is undocumented debt.

| # | File | Phase / Wave | Tables / Changes | Status |
|---|------|-------------|-----------------|--------|
| 000 | `00001_extensions_and_functions.sql` | Bootstrap | `uuid-ossp`, `pgcrypto`, `vector` extensions. `update_updated_at()` trigger func | ✅ Applied |
| 001 | `00001_extensions_and_functions.sql` | Bootstrap | Extensions + generic functions | ✅ Applied |
| 002 | `00002_core_tenancy_tables.sql` | Phase 0 | `orgs`, `org_members`, `roles`, `role_permissions` | ✅ Applied |
| 003 | `00003_rls_helper_functions.sql` | Phase 0 | `get_my_org_id()`, `get_my_role()`, JWT hook | ✅ Applied |
| 004 | `00004_audit_logs.sql` | Phase 0 | `audit_logs` (append-only, partitioned monthly) | ✅ Applied |
| 005 | `00005_rls_policies_and_triggers.sql` | Phase 0 | RLS on `orgs`, `org_members`. `audit_trigger_func()` | ✅ Applied |
| 006 | `00006_lookup_tables.sql` | Phase 0 | `candidate_sources`, `rejection_reasons` | ✅ Applied |
| 007 | `00007_pipeline_tables.sql` | Phase 0 | `pipeline_templates`, `pipeline_stages` | ✅ Applied |
| 008 | `00008_job_openings.sql` | Phase 0 | `job_openings` | ✅ Applied |
| 009 | `00009_candidates.sql` | Phase 0 | `candidates` | ✅ Applied |
| 010 | `00010_skills.sql` | Phase 0 | `skills`, `candidate_skills`, `job_required_skills` | ✅ Applied |
| 011 | `00011_applications.sql` | Phase 0 | `applications`, `stage_history` | ✅ Applied |
| 012 | `00012_talent_pools.sql` | Phase 0 | `talent_pools`, `talent_pool_members` | ✅ Applied |
| 013 | `00013_phase2_crosscut_fixes.sql` | Phase 2 | Cross-cut analysis fixes (118-issue audit) | ✅ Applied |
| 014 | `00014_performance_indexes.sql` | Phase 2 | Pagination + filtered query indexes | ✅ Applied |
| 015 | `00015_ai_infrastructure.sql` | Phase 2.5 | `candidate_embeddings`, `job_embeddings`, pgvector HNSW indexes | ✅ Applied |
| 016 | `00016_fix_applications_candidate_index.sql` | Hotfix | Fix `idx_applications_candidate` index collision | ✅ Applied |
| 017 | `00017_fix_jwt_hook_search_path.sql` | Hotfix | Fix JWT hook `search_path` for GoTrue compatibility | ✅ Applied |
| 018 | `00018_fix_members_insert_policy.sql` | Hotfix | Fix overly permissive `members_insert` RLS policy | ✅ Applied |
| 019 | `00019_add_description_previous.sql` | Phase 2.6 | `description_previous` on `job_openings` (non-destructive AI rewrites) | ✅ Applied |
| 020 | `00020_add_pronouns_to_candidates.sql` | Phase 2.7 | `pronouns` column on `candidates` | ✅ Applied |
| 021 | `00021_org_daily_briefings.sql` | Phase 2.7 | `org_daily_briefings` — daily AI briefing cache per org | ✅ Applied |
| 022 | `00022_ai_proof_wave_a.sql` | AI-Proof Wave A | `ai_score_feedback`. Embedding staleness tracking columns | ✅ Applied |
| 023 | `00023_candidate_embedding_updated_at.sql` | AI-Proof Wave A | `embedding_updated_at` on `candidates` | ✅ Applied |
| 024 | `00024_reorder_stages_rpc.sql` | Phase 3 | `reorder_pipeline_stages()` atomic RPC | ✅ Applied |
| 025 | `00025_candidate_notes.sql` | Phase 3 | `candidate_notes` | ✅ Applied |
| 026 | `00026_interviews.sql` | Phase 3 | `interviews`, `interview_scorecard_templates`, `interview_scorecards` | ✅ Applied |
| 027 | `00027_email_templates_notifications.sql` | Wave F | `email_templates`, `notification_preferences` | ✅ Applied |
| 028 | `00028_offers.sql` | Phase 4 | `offer_templates`, `offers`, `offer_approvals` | ✅ Applied |
| 029 | `00029_hardening.sql` | Pre-Phase 5 Hardening | `ai_match_explanations`, `candidate_merges`, `resume_parsed_data`. Atomic stage move RPC, fuzzy dedup, approval locking | ✅ Applied |
| 030 | `00030_phase6_foundation.sql` | Phase 6 (P6-1, P6-2) | `candidate_merges` (ext), `resume_parsed_data` (ext). Resume parse infra, candidate merge UI | ✅ Applied |
| 031 | `00031_ai_shortlist_reports.sql` | Phase 6 (P6-5) | `ai_shortlist_reports`, `ai_shortlist_candidates` | ✅ Applied |
| 032 | `00032_phase6_screening.sql` | Phase 6 (P6-4) | `screening_configs`, `screening_sessions` | ✅ Applied |
| 033 | `00033_analytics_snapshots.sql` | Phase 7 Wave A1 | `analytics_snapshots` — pre-computed daily analytics | ✅ Applied |
| **034** | `00034_*.sql` | **Phase 8 P8-1** | `vendors`, RLS, audit trigger | ⬜ Planned (Phase 8 start gate: Wave T1 must ship) |
| **035** | `00035_*.sql` | **Phase 8 P8-1** | `vendor_submissions`, `candidate_contract_profiles` | ⬜ Planned |
| **036** | `00036_*.sql` | **Phase 8 P8-1** | `contract_rate_intelligence_cache`, `job_openings.role_type` CHECK + `contract_details` JSONB | ⬜ Planned |
| **037** | `00037_*.sql` | **Phase 7 Wave A2** | `hiring_plans`, `analytics_saved_views`, `analytics_report_schedules`. 5 new materialized views | ⬜ Planned |

> **Total applied:** 33 (000–033). **Next available:** `00034`. **Claimed:** 034–037 (see above).

---

## Downstream Impact Map

> When you modify a foundational document, every document in its downstream row must be checked for staleness. If stale, log in GAPS.md immediately (R7).

| If you change... | Must re-check these documents |
|-----------------|-------------------------------|
| **D01** (Database Schema) — table added, column changed, RLS policy changed | D02 (API spec), D24 (RLS matrix + test fixtures), D29 (Inngest registry if table triggers change), relevant module spec for that table |
| **D02** (API Specification) — endpoint added, contract changed | D26 (error taxonomy if new error codes), D24 (API integration tests), D29 (if Inngest jobs call affected endpoints) |
| **D03** (Billing) — plan tier changed, feature gate added/removed | D06 (Offers), D07 (Interviews), D09 (Candidate Portal), D10 (Search), D17 (Analytics), D28 (env vars if new Stripe vars), D34 (Phase 8 plan gates) |
| **D24** (Testing Strategy) — RLS matrix updated, fixture changed | All active phase specs that declare test plans (D32, D33, D34) — their declared test counts may be wrong |
| **D29** (Inngest Registry) — function added, cron changed | D14 (Observability — dead-letter handling), D15 (CI/CD if new env vars), D28 (env vars) |
| **Any ADR** | Every in-flight phase spec `Depends On` column (R1). CLAUDE.md ADR table if it's a resolved architecture decision |
| **Migration Register** (row added or number claimed) | Notify the other active session (VS Code or Cowork). Check for number conflicts before committing any `.sql` file |
| **MKT-01** (Marketing Intelligence) | MKT-02 checklist — run the checklist. Required at every phase boundary (CLAUDE.md Pre-Commit Protocol) |

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
│   ├── 010-gdpr-erasure-crypto-shredding.md
│   ├── 011-ai-first-build-pivot.md
│   ├── 012-domain-architecture.md
│   └── 013-contractor-hiring-boundary.md  ← ADR-013 (2026-03-13)
│
├── modules/                          ← Feature module specifications
│   ├── BILLING.md
│   ├── OFFERS.md
│   ├── INTERVIEW-SCHEDULING.md
│   ├── NOTIFICATIONS.md
│   ├── CANDIDATE-PORTAL.md
│   ├── SEARCH.md
│   ├── REALTIME.md
│   ├── WORKFLOW.md
│   ├── ANALYTICS.md                  ← D17 (expanded 2026-03-13)
│   ├── ANALYTICS-MODULE.md           ← D33: Phase 7 Wave A1 implementation
│   ├── PHASE7-WAVE-T1-TIMEZONE.md    ← Phase 7 Wave T1: timezone support (✅ complete)
│   ├── ONBOARDING.md
│   ├── WHITE-LABEL.md
│   ├── I18N.md
│   ├── PHASE6-CANDIDATE-INTELLIGENCE.md
│   └── PHASE8-CONTINGENT-HIRING.md   ← D34: Phase 8 spec
│
├── archive/                          ← Superseded drafts + spec prompts (history preserved, not active)
│   ├── PHASE6-SPEC-PROMPT.md
│   ├── PHASE6b-CANDIDATE-INTELLIGENCE.md
│   ├── PHASE7-ANALYTICS-SPEC-PROMPT.md
│   ├── PHASE7-DEI-COMPLIANCE-SPEC-PROMPT.md
│   ├── PHASE8-CONTINGENT-HIRING.md   ← duplicate of D34, superseded
│   ├── WAVE-P6-3-ESIGN-SPEC-PROMPT.md
│   └── WAVE-P6-5-SHORTLIST-SPEC-PROMPT.md
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
├── PRODUCT-ROADMAP.md                   ← D27: Release strategy & build order
├── ENVIRONMENT-VARIABLES.md             ← D28: Env var manifest
├── INNGEST-REGISTRY.md                  ← D29: Function registry
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
