# itecbrains ATS — Documentation Dev Log

> Chronological record of all documentation work. Newest entries at top.
> Every change to any document in `docs/` gets an entry here.

---

## Format

```
### YYYY-MM-DD — [Document ID] Summary
- What changed
- Why
- What's next
```

---

### 2026-03-10 — [D03] Billing & Subscription Architecture — complete first draft

**Files created:**
- `docs/modules/BILLING.md` — 13 sections (500 lines): 4 plan tiers with 16-feature matrix, Stripe Checkout + Customer Portal integration, subscription lifecycle (trialing → active → canceling → canceled, plus past_due → unpaid dunning path), seat-based pricing with overage proration, AI credit metering with atomic consumption + monthly overage reporting, 6 Inngest functions for webhook processing, downgrade graceful degradation rules, 5 billing API endpoints with Zod schemas.

**Files updated:**
- `docs/DATABASE-SCHEMA.md` — Added `webhook_outbound` and `sso_saml` to `FeatureFlags` interface (audit fix F2: D03 feature matrix referenced flags not in D01).
- `docs/INDEX.md` — D03 status: `⬜ Not Started` → `✅ Complete (Review)`.

**Key decisions:**
- Stripe is source of truth for subscriptions/invoices. ATS stores minimal billing state (`plan`, `stripe_customer_id`, `ai_credits_*` on organizations table).
- No separate billing/subscription tables — Stripe API queried on demand for portal/invoice views.
- Seat sync via Stripe API lookup (not a stored `stripe_subscription_item_id` column) to avoid schema bloat.
- Plan config in code (`lib/billing/plans.ts`) not database — changes deploy, not migrate.
- Starter plan is free, no Stripe Customer required until upgrade.
- Enterprise plan is custom pricing, manual Stripe Dashboard setup.

**Post-build audit:** 8 PASS, 3 FAIL, 2 WARNINGS — all fixes applied:
- F1: Removed non-existent `stripe_subscription_item_id` column reference → Stripe API lookup
- F2: Added `webhook_outbound` and `sso_saml` to D01 FeatureFlags interface
- F3: Added [VERIFY] markers to Stripe API calls per §18

**Status:** Review.

**Contracts exported:**
- D06-D12: `hasFeature(org, flag)` gate before any plan-gated operation
- D06 (Offers): offer creation gated by active subscription (not starter unless free trial)
- D07 (Interviews): AI scorecard summarization gated by `ai_matching` feature flag
- D08 (Candidate Portal): no billing-gated features on candidate-facing pages
- D09 (Communications): `webhook_outbound` flag gates outbound webhook delivery; email templates available on all plans
- D10 (Search & AI): `ai_matching` + `ai_resume_parsing` flags gate AI operations; `consumeAiCredits()` called before every AI action; 402 on exhaustion
- D11 (Talent Pools): `nurture_sequences` flag gates CRM automation features
- D12 (Analytics): `advanced_analytics` flag gates advanced reports; basic metrics on all plans
- D13 (Observability): billing metrics from `ai_usage_logs` + `organizations.plan`; Stripe webhook success rate
- D19 (Migration): new organizations default to `starter` plan; `ai_credits_limit = 10`

**[PLAYBOOK]** Extractable patterns: plan-tier feature matrix, Stripe-as-truth architecture, seat-based pricing with overage, AI credit metering, dunning flow, downgrade graceful degradation.

**Next:** D04 remaining STACK ADRs (non-blocking) or begin Batch 2 feature modules (D06-D12).

---

### 2026-03-10 — [D02] API Specification — complete first draft

**Files created:**
- `docs/API-SPECIFICATION.md` — 13 sections (486 lines): auth model (JWT + API key), RBAC enforcement (`can(role, permission)` helper + RLS), URL conventions (`/api/v1/`, kebab-case plural), cursor pagination (base64-encoded `{sort_value, id}`, 25 default / 100 max), RFC 9457 error responses, rate limiting (4 plan tiers via @upstash/ratelimit), idempotency (Redis-backed, 24h TTL), webhook outbound (HMAC-SHA256 signing, Inngest retry with exponential backoff, auto-disable after 10 failures), webhook inbound (Merge.dev, Nylas, Stripe, Dropbox Sign), Zod→OpenAPI 3.1 via @asteasolutions/zod-to-openapi.
- `docs/api/ENDPOINTS.md` — 50+ endpoints across 4 categories: Core CRUD (auth, organizations, jobs, candidates, applications, pipeline, notes, files), Module-Specific (interviews, scorecards, offers, talent pools, skills, custom fields), Search & AI (Typesense search, AI matching), Settings & Admin (webhooks, API keys, notification preferences, audit logs, DEI reports).

**Files updated:**
- `docs/AI-RULES.md` — Rule 33: updated RFC 7807 reference to RFC 9457 (Problem Details) for consistency with D02.
- `docs/INDEX.md` — D02 status: `⬜ Not Started` → `✅ Complete (Review)`.

**Key decisions:**
- Server Actions for UI mutations (form submissions, state changes), Route Handlers for external/M2M integrations
- API keys stored as SHA-256 hash in `api_keys` table, raw key shown once at creation
- Rate limit tiers match D01 plan_tier CHECK constraint: starter (100/min), growth (300/min), pro (600/min), enterprise (1200/min)
- Webhook signing uses `secret` column (not `signing_secret`) — matches D01 DDL
- Cursor pagination chosen over offset for stable performance on large datasets
- Idempotency keys required for all POST mutations, optional for PUT/PATCH

**Post-build audit:** 8 PASS, 5 FAIL, 4 WARNINGS — all fixes applied:
- F2: Removed non-existent `api_keys.is_active` (RLS handles via `deleted_at`)
- F3: Fixed `api_keys.scopes` → `permissions`, `rate_limit_tier` → derived from org plan
- F4: Corrected plan tier values (free/starter/professional/enterprise → starter/growth/pro/enterprise) to match D01 DDL CHECK
- F5: Updated AI-RULES.md rule 33 from RFC 7807 to RFC 9457
- W3: Added missing ADR-006/007/008 to front matter
- W4: Standardized `signing_secret` → `secret` throughout

**Contracts exported:**
- D06-D12: all module endpoints follow `/api/v1/{resource}` pattern, cursor pagination, RFC 9457 errors
- D06 (Offers): `POST /api/v1/offers` + approval chain endpoints; idempotency key required
- D07 (Interviews): `POST /api/v1/interviews`, `POST /api/v1/scorecard-submissions`; blind review enforced at API layer
- D08 (Candidate Portal): public endpoints at `/api/v1/careers/` — no JWT, rate limited
- D09 (Communications): webhook outbound delivery via `POST /api/v1/webhook-endpoints`; HMAC-SHA256 signing with `secret` column
- D10 (Search & AI): `GET /api/v1/search` delegates to Typesense; `POST /api/v1/ai/match` consumes credits
- D03 (Billing): rate limit tiers (starter 500/min → enterprise 10,000/min); Stripe webhook at `/api/webhooks/stripe`
- D13 (Observability): all endpoints emit structured logs; rate limit headers in every response
- D19 (Migration): API versioning via URL prefix `/api/v1/`; no breaking changes within version

**[PLAYBOOK]** Extractable patterns: dual API layer (Server Actions + Route Handlers), cursor pagination, RFC 9457 errors, rate limiting by plan tier, idempotency keys, webhook HMAC signing, Zod→OpenAPI generation.

**Status:** Review.

**Next:** D03 (Billing & Subscription Architecture).

---

### 2026-03-10 — [D05] Design System — complete first draft

**File created:**
- `docs/DESIGN-SYSTEM.md` — 11 sections covering: design principles (7), color system (brand palette + semantic status + dark mode in HSL/CSS variables), typography (Inter + Geist Mono, 8-point type scale with 14px dashboard base), spacing scale, layout grid (sidebar + topnav + content), responsive breakpoints (5 tiers, desktop-first), shadcn/ui component customizations (16 base components + 10 ATS-specific), WCAG 2.1 AA accessibility (contrast ratios verified, keyboard nav, screen reader, reduced motion), animation tokens (4 durations, 8 interaction patterns using Motion/Framer Motion v11+), Lucide React iconography, career page tenant theming (maps to D01 branding_config), component file organization.

**Competitive research conducted:** Analyzed Ashby (analytics-first design, clean aesthetic), Greenhouse (brand guidelines, left sidebar redesign, stage colors), Lever (UI praise), shadcn/ui theming conventions, WCAG 2.1 AA requirements, 2025-2026 SaaS design trends.

**Key decisions:**
- 14px body base for dashboard (data-dense), 16px for candidate portal
- Inter as primary font (highest x-height, used by Linear/Vercel)
- Warm white background (#FEFDFB) not pure white (reduces eye strain)
- Primary blue (#145FD9) at 5.3:1 contrast ratio (safely above 4.5:1 WCAG AA)
- Dark mode from day one via next-themes cookie strategy
- Motion library for drag-and-drop (kanban), CSS transitions for simple states
- Tenant branding limited to career pages only (internal UI stays consistent)

**Post-build audit:** 7 FAILs identified, all resolved (2 were false positives from wrong CLAUDE.md scope). Fixes: added D01 dependency, fixed STACK-1 mislabel, bumped primary contrast, pinned library versions, fixed spring syntax.

**Contracts exported:**
- D06-D12: all UI uses shadcn/ui components with HSL color tokens; no custom color values
- D06 (Offers): offer status badges use semantic status colors (success/warning/destructive)
- D07 (Interviews): `KanbanBoard` + `KanbanCard` components for pipeline view; `ScoreRubric` for scorecard UI; `InterviewScheduler` for calendar
- D08 (Candidate Portal): `branding_config` drives career page theming (maps to D01); 16px body text; accessible contrast
- D09 (Communications): `TimelineActivity` component for candidate activity feed; toast notifications via sonner
- D10 (Search & AI): `FilterBar` component for faceted search UI
- D11 (Talent Pools): `CandidateDrawer` for quick-view; `StageIndicator` for pipeline position
- D12 (Analytics): `MetricCard` for dashboard KPIs; chart colors from semantic palette
- D13 (Observability): dark mode via `next-themes` cookie strategy; `OrgSwitcher` component

**[PLAYBOOK]** Extractable patterns: HSL token system, warm-white backgrounds, data-dense 14px dashboard, dark mode from day one, shadcn/ui customization approach, ATS-specific component library.

**Status:** Review.

**Next:** D02 (API Specification).

---

### 2026-03-10 — [D01] Post-build audit fixes applied (6/6)

**Files updated:**
- `docs/schema/00-functions.md` — Fix 1: erase_candidate() expanded with 4 missing soft-delete steps (scorecard_ratings, interviews, application_stage_history, candidate_dei_data). Fix 5: Added `pg_trgm` extension.
- `docs/ADRs/006-soft-delete-policy.md` — Fix 2: Added `candidate_encryption_keys` to append-only exceptions list.
- `docs/DATABASE-SCHEMA.md` — Fix 3: Renamed `RequiredActions`/`AutoTriggers` interfaces to `AutoActions` matching DDL column `auto_actions`. Fix 6: Removed orphaned `JobLocation`/`SalaryRange`/`ExternalIds` interfaces (DDL uses scalar columns), replaced with `JobMetadata` for the actual `metadata JSONB` column. Updated extensions list and soft-delete exceptions.
- `docs/ADRs/009-file-storage-pattern.md` — Fix 4: Changed `uploaded_by` FK from `user_profiles(id)` to `auth.users(id) ON DELETE SET NULL`.

**Status:** All 6 audit FAIL items resolved. D01 ready for Review status.

---

### 2026-03-10 — [D01] Complete Database Schema — first draft (39 tables)

**Files created:**
- `docs/DATABASE-SCHEMA.md` — Main document: design principles, table inventory with volume estimates (1yr/3yr per tenant + total at 500 tenants), ER diagram, RBAC matrix, JSONB TypeScript interfaces, Supabase Realtime publications, partitioning strategy.
- `docs/schema/00-functions.md` — Extensions (uuid-ossp, pgcrypto, vector), RLS helpers (current_user_org_id updated for ADR-005 multi-org), JWT hook, set_updated_at trigger, audit_trigger_func, match_candidates_for_job, erase_candidate.
- `docs/schema/01-core-tenancy.md` — organizations, user_profiles, organization_members (with last_active_org_id per ADR-005).
- `docs/schema/02-jobs-pipeline.md` — pipeline_templates, pipeline_stages, job_openings (HNSW vector index per ADR-003).
- `docs/schema/03-candidates-crm.md` — candidates, applications, application_stage_history, talent_pools, talent_pool_members, candidate_sources, rejection_reasons.
- `docs/schema/04-skills-matching.md` — skills (hierarchical taxonomy), candidate_skills, job_required_skills.
- `docs/schema/05-interviews-scorecards.md` — interviews, scorecard_templates, scorecard_categories, scorecard_attributes, scorecard_submissions (blind review RLS), scorecard_ratings.
- `docs/schema/06-offers.md` — offer_templates, offers (8-state lifecycle), offer_approvals (sequential chain).
- `docs/schema/07-communications-files.md` — notes (@mentions, threaded), email_templates, notification_preferences, files (ADR-009), custom_field_definitions, custom_field_values.
- `docs/schema/08-system-compliance.md` — audit_logs (partitioned monthly, append-only), ai_usage_logs, api_keys, webhook_endpoints, nylas_grants, candidate_dei_data (restricted RLS), candidate_encryption_keys (ADR-010), gdpr_erasure_log (append-only).

**39 tables total across 8 clusters.** All S3 errata corrected (HNSW not IVFFlat, deleted_at on all tables, full RLS on all tables, proxy.ts not middleware.ts references removed).

**New tables not in S3 (26):** application_stage_history, talent_pools, talent_pool_members, candidate_sources, rejection_reasons, skills, candidate_skills, job_required_skills, interviews, scorecard_templates, scorecard_categories, scorecard_attributes, scorecard_submissions, scorecard_ratings, offer_templates, offers, offer_approvals, email_templates, notification_preferences, files, custom_field_definitions, custom_field_values, audit_logs, ai_usage_logs, api_keys, webhook_endpoints, candidate_dei_data, candidate_encryption_keys, gdpr_erasure_log.

**Contracts exported (master list — all downstream docs depend on D01):**
- **Tables (39):** exact names, column types, constraints. All module specs MUST use these names verbatim.
- **CHECK constraints:** `organizations.plan` (starter/growth/pro/enterprise), `organization_members.role` (owner/admin/recruiter/hiring_manager/interviewer), `job_openings.status` (draft/open/paused/closed/archived), `applications.status` (active/hired/rejected/withdrawn), `interviews.status` (scheduled/confirmed/completed/cancelled/no_show), `offers.status` (8 states: draft→withdrawn), `scorecard_submissions.overall_recommendation` (strong_no/no/yes/strong_yes)
- **JSONB interfaces (11):** BrandingConfig, FeatureFlags, UserPreferences, CustomPermissions, JobMetadata, CandidateLocation, ResumeParsed, SourceDetails, AutoActions, OfferCompensation, DeiData — ground-truth types for all modules
- **RLS helpers:** `current_user_org_id()`, `is_org_member()`, `has_org_role()` — every module's RLS policies use these
- **Functions:** `match_candidates_for_job()` → D10; `erase_candidate()` → D19/GDPR; `custom_access_token_hook()` → JWT claims for auth
- **Patterns:** soft delete (`deleted_at IS NULL` in all SELECTs), audit trigger on every table, HNSW vector indexes (m=16, ef_construction=64)
- **Realtime channels:** `org:{id}:applications`, `org:{id}:notes`, `org:{id}:interviews`, `org:{id}:scorecard_submissions`, `org:{id}:offers`, `org:{id}:notification_preferences`
- **D06 (Offers):** `offers.status` 8-state machine, `offer_approvals.sequence_order`, `OfferCompensation` interface, `offers.esign_provider` CHECK
- **D07 (Interviews):** `interviews.*`, `scorecard_templates/categories/attributes/submissions/ratings.*`, blind review RLS on scorecard_submissions
- **D08 (Candidate Portal):** `candidates.*`, `applications.*`, `job_openings.*` (public-facing subset)
- **D09 (Communications):** `notes.*` (polymorphic via entity_type/entity_id), `email_templates.*`, `files.*` (ADR-009), `notification_preferences.*`, `webhook_endpoints.*`
- **D10 (Search & AI):** `candidate_embedding`/`job_embedding` vector(1536), `match_candidates_for_job()`, `ai_usage_logs.*`
- **D11 (Talent Pools):** `talent_pools.*`, `talent_pool_members.*`, `candidate_sources.*`
- **D12 (Analytics):** `candidate_dei_data.*` (restricted RLS), `audit_logs.*` (partitioned), `custom_field_definitions/values.*`

**[PLAYBOOK]** Extractable patterns: multi-tenant RLS with JWT claims hook, soft-delete-everywhere policy, polymorphic entity pattern, HNSW vector indexes for AI matching, crypto-shredding for GDPR, audit trigger architecture.

**Status:** Draft. Pending post-build audit (AI-RULES §13) before marking as Review.

**Next:** Run post-build audit, fix any issues, then mark D01 as Review.

---

### 2026-03-10 — [META] AI-RULES expanded: audit protocol, security gates, schema evolution, and 8 new best-practice sections

**Files updated:**
- `docs/AI-RULES.md` — Added §13-§20 (rules 59-87):
  - §13 Post-Build Audit Protocol (rules 59-63): mandatory audit triggers, 7-category checklist (A1-A7), structured report format, dependency-ordered fixes
  - §14 Downstream Impact Protocol (rules 64-66): mandatory impact check when any document changes, special rules for D01 schema changes
  - §15 Breaking Change Protocol (rules 67-68): definition, requirements, mandatory post-fix audit
  - §16 Security Review Gates (rules 69-71): RLS completeness, auth flow, data exposure checklists
  - §17 Schema Evolution Rules (rules 72-76): migration strategy, idempotency, 2-step deprecation
  - §18 Third-Party Integration Verification (rules 77-80): [VERIFY] lifecycle, version-pinned claims
  - §19 Performance and Scalability Considerations (rules 81-84): row volume estimates, query budgets, partitioning
  - §20 Dependency and Ordering Discipline (rules 85-87): upstream-first fix ordering, priority/blast-radius classification

**Why:** The manual audit before D01 revealed the need for a repeatable, documented audit process. Additionally, security review gates, schema evolution rules, and performance considerations were missing best practices that would cause rework if not established now.

**Total rules:** 87 (up from 58).

**Next:** D01 (Complete Database Schema).

---

### 2026-03-10 — [D04] ADR-005→010 — All blocking decisions resolved, D01 fully unblocked

**Files created:**
- `docs/ADRs/005-multi-org-switching.md` — AC-5 resolved: `last_active_org_id` + JWT refresh. No re-auth.
- `docs/ADRs/006-soft-delete-policy.md` — AC-4 resolved: all tables get `deleted_at`. Exception: `audit_logs` (append-only).
- `docs/ADRs/007-audit-log-architecture.md` — Trigger-based, append-only, partitioned by month. Generic `audit_trigger_func()` on every table.
- `docs/ADRs/008-enum-strategy.md` — CHECK for system values, lookup tables for tenant-customizable, JSONB for config. No PG ENUMs.
- `docs/ADRs/009-file-storage-pattern.md` — Supabase Storage + centralized `files` metadata table. Virus scan gate via Inngest.
- `docs/ADRs/010-gdpr-erasure-crypto-shredding.md` — Per-candidate encryption keys for audit log crypto-shredding + selective anonymization.

**Files updated:**
- `docs/PLAN.md` — Decisions Registry: AC-4, AC-5 resolved. Added SCHEMA-1→5 entries.
- `docs/INDEX.md` — D01 notes updated: "Fully unblocked — all 10 prerequisite ADRs resolved."

**Competitive research conducted:** Analyzed Ashby, Lever, Greenhouse, Teamtailor, Workable. Identified 5 missing table clusters for D01: structured scorecards, CRM/talent pools, custom fields, skills taxonomy, DEI data isolation.

**Why:** Final pre-D01 check. Every implicit decision that would cause rework during schema writing is now an explicit, recorded ADR.

**All open decisions: ZERO.** AC-1→6 resolved. All schema strategy decisions resolved. D01 can proceed with full confidence.

**Next:** Write D01 (Complete Database Schema) — ~30+ tables including the 5 new table clusters identified from competitive analysis.

---

### 2026-03-10 — [D04] ADR-004 Testing Strategy — what's built when

**Files created:**
- `docs/ADRs/004-testing-strategy.md` — 3-tier testing strategy: Day 1 (unit, RLS, API, jobs, E2E), per-feature (smoke, contract, a11y, search relevance), pre-launch (perf, load, security, DR). 5 "never retrofit" items identified.

**Files updated:**
- `docs/PLAN.md` — Decisions Registry: added TEST-1 entry

**Why:** Testing strategy must be decided before D01 because golden tenant fixtures are defined alongside the schema, and RLS integration tests are mandatory from the first table.

**Next:** D01 (Complete Database Schema) with golden tenant fixtures defined inline.

---

### 2026-03-10 — [D04] ADR-001, ADR-002, ADR-003 written — D01 unblocked

**Files created:**
- `docs/ADRs/001-supabase-client-only.md` — AC-1 resolved: Supabase client everywhere, no Prisma. RLS enforced on every query including background jobs.
- `docs/ADRs/002-nextjs-16-proxy-middleware.md` — AC-2 + AC-3 resolved: Next.js 16 with `proxy.ts`. CLAUDE.md is authority, S3 references are errata.
- `docs/ADRs/003-hnsw-vector-indexes.md` — AC-6 resolved: HNSW indexes (not IVFFlat). Works from row 0, no rebuild needed.

**Files updated:**
- `docs/PLAN.md` — Decisions Registry: AC-1, AC-2, AC-3, AC-6 status changed from `Open` to `Resolved → ADR-NNN`
- `docs/INDEX.md` — D01 status: `🔴 Blocked` → `⬜ Not Started` (unblocked). D04 status: `⬜ Not Started` → `🟡 In Progress`

**Also:**
- `.gitignore` created
- Git repository initialized

**Why:** D01 (Complete Database Schema) was blocked by 3 open architecture decisions. These ADRs resolve the blockers so D01 can proceed.

**Next:** Write D01 (Complete Database Schema) — the critical path item that unblocks 12 downstream documents.

---

### 2026-03-10 — [META] Pre-commit protocol and governance rules established

**Files updated:**
- `CLAUDE.md` (ATS) — Added: task-based reading tiers (5 task types), S3 errata table (6 known errors), pre-commit protocol (4 commit types with checklists), commit message convention with scopes
- `CLAUDE.md` (Playbook) — Added: pre-commit protocol (3 commit types), commit message convention for playbook scopes
- `docs/PLAN.md` — Added: Decisions Registry (6 open + 6 decided), parallel work coordination rule
- `docs/AI-RULES.md` — Added: §11 Document Front Matter standard (rules 51-53), §12 Definition of Done by document type (rules 54-58)
- `SaaS-Playbook/JOURNEY-LOG.md` — Added: Battle-Test Log section

**Why:** Seven governance gaps closed: decision re-opening, premature doc completion, S3 error propagation, token waste, downstream staleness, parallel work conflicts, untested prompt shipping.

**Key rule:** Parallel docs (D01, D04, D05) must NOT assume `Open` decisions — resolve as ADRs first.

**Next:** Begin D01, but first resolve AC-1 and AC-2 as standalone ADRs since D01 depends on both.

---

### 2026-03-10 — [META] Session handoff protocol created

**Files created:**
- `CLAUDE.md` (ATS root) — 3-step handoff: read state → confirm context → follow rules
- `CLAUDE.md` (SaaS-Playbook root) — Same pattern, product-specific rules

**Why:** Prevent drift and hallucination when moving between Claude Code sessions.

---

### 2026-03-10 — [PLAYBOOK] SaaS Accelerator Playbook elevated to marketable product

**New files created in `/Users/senthilbabu/Downloads/SaaS-Playbook/product/`:**
- `PRODUCT-SPEC.md` — Full product specification: what customers buy, value chain, pricing tiers (Starter $49 / Professional $149 / Team $299 / Enterprise $499+), technical architecture (static site + Stripe), content pipeline, legal/IP
- `WIZARD-IA.md` — Complete wizard: 9 steps, 51 questions, branching logic, cross-step validation, pre-population rules by product category, placeholder mapping for every question
- `OUTPUT-MAP.md` — Template engine spec: 35 placeholder resolutions, conditional file inclusion rules, section-level toggles, output package structure, zero-hallucination validation pass

**Key product decision:** The product is a deterministic template engine, NOT an AI wrapper. No LLM runs in our product. Wizard collects context → placeholders filled via string substitution → customized prompts delivered. The AI runs downstream in the customer's Claude Code session. This gives us: zero hallucination risk, predictable output, platform agnosticism.

**Two parallel tracks confirmed:**
1. ATS (product being built) — battle-tests the prompts
2. SaaS Accelerator Playbook (product being sold) — packages the prompts

---

### 2026-03-10 — [PLAYBOOK] SaaS Accelerator Playbook created

**Location:** `/Users/senthilbabu/Downloads/SaaS-Playbook/` (separate from ATS repo)

**Purpose:** Generic, product-agnostic playbook of executable Claude Code prompts for building any SaaS product. Lessons from the ATS build feed into this playbook (abstracted, product details stripped).

**Created:**
- 4 core files: README, PRINCIPLES (15 principles seeded), JOURNEY-LOG, GLOSSARY
- 7 phase skeletons (00-validate through 06-scale) with entry/exit criteria
- 7 deep prompts for Phase 01-Architect (multi-tenancy, auth, schema, API, background-jobs, documentation-system, ADR generator, tech-stack-evaluator)
- 9 role entry-points (architect, backend, frontend, security, SDET, devops, PM, marketing, sales)
- 5 cross-cutting concerns (multi-tenancy, billing, data-isolation, GDPR, observability)
- 4 output templates (ADR, module spec, API endpoint, runbook)

**Bridge mechanism:** ATS DEVLOG entries tagged `[PLAYBOOK]` get abstracted and added to `SaaS-Playbook/JOURNEY-LOG.md`. Lessons flow one-way: ATS → Playbook.

**Next:** When we write ATS docs (D01, D02, etc.), we'll simultaneously use and refine the corresponding playbook prompts. The prompts become battle-tested.

---

### 2026-03-10 — [META] Documentation tracking system created

**Documents created:**
- `docs/INDEX.md` — Master documentation registry with 21 planned documents across 4 phases
- `docs/DEVLOG.md` — This changelog
- `docs/AI-RULES.md` — 50 rules for documentation standards
- `docs/PLAN.md` — Pre-build assessment and gap analysis (19 identified gaps)
- `docs/templates/MODULE-TEMPLATE.md` — Boilerplate for feature module specs
- `docs/templates/ADR-TEMPLATE.md` — Boilerplate for architecture decision records

**Directories created:**
- `docs/ADRs/` — Architecture Decision Records
- `docs/modules/` — Feature module specifications
- `docs/runbooks/` — Operational runbooks
- `docs/templates/` — Document boilerplates

**Source documents inventoried:**
- `S1` — Phase 1 Expert Review (48KB docx, 118 issues) — reference input
- `S2` — Phase 2 Architecture Blueprint (49KB docx) — reference input
- `S3` — Principal Architect's Pre-Plan (86KB md, 1813 lines) — active reference

**Assessment completed:**
- 19 documentation gaps identified across 4 severity tiers
- 6 architectural corrections flagged in existing S3 document
- Dependency graph mapped: D01 (Schema) is the critical path blocker
- Recommended production order: Phase 0 → Phase 1 → Phase 2 → Phase 3

**Architecture concerns logged (to resolve in D01/D04):**
1. Prisma vs Supabase client — pick one ORM strategy
2. Next.js version — lock 15 or 16
3. Middleware file naming — `proxy.ts` vs `middleware.ts`
4. Missing `deleted_at` on applications table
5. `current_user_org_id()` multi-org sync with JWT hook
6. IVFFlat index on empty table — consider HNSW or deferred creation

**Next steps:**
- Begin D01 (Complete Database Schema) — highest priority, unblocks 12 other documents
- Begin D04 (ADRs) — can run in parallel with D01
- Begin D05 (Design System) — independent, can run in parallel
