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
