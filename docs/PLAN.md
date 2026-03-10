# itecbrains ATS — Pre-Build Planning Assessment

> **Purpose:** Gap analysis of existing documentation against what's needed to build the full SaaS product.
> **Status:** Approved
> **Last updated:** 2026-03-10
> **Based on:** Analysis of S1 (Phase 1 Review), S2 (Phase 2 Blueprint), S3 (Architect Pre-Plan)

---

## Executive Summary

The existing Architect's Pre-Plan [S3] covers approximately 60% of required documentation. 19 gaps were identified across 4 severity tiers. The critical path runs through **D01 (Complete Database Schema)** which unblocks 12 downstream documents.

---

## What S3 Covers Well

| Area | Coverage | Quality |
|------|----------|---------|
| Tenancy model tradeoffs | Full | Excellent — 4 options analyzed |
| Auth strategy | Full | Supabase Auth selected with rationale |
| Background jobs | Full | Inngest selected, Bull eliminated |
| Search architecture | Full | pgvector + Typesense dual-layer |
| Core schema (6 tables) | Partial | 6 of ~16 tables defined |
| RBAC matrix | Full | 5 roles × 18 permissions |
| JWT claims hook | Full | Working Postgres function |
| RLS policies | Partial | 4 tables covered, ~10 missing |
| Resume parsing pipeline | Full | 8-step Inngest flow with code |
| AI semantic matching | Full | pgvector function + TypeScript |
| Project structure | Full | Turborepo monorepo layout |
| STRIDE threat model | Full | 6 categories analyzed |
| Top 3 security risks | Full | IDOR, prompt injection, service key |
| Bug corrections from v1/v2 | Full | 12 issues tracked and resolved |

---

## Gap Analysis — 19 Missing Documents

### Tier 1: BLOCKING (Cannot start Sprint 1)

| ID | Gap | Impact | Effort |
|----|-----|--------|--------|
| **D01** | Complete Database Schema — 8+ tables missing (interviews, scorecards, offers, offer_approvals, stage_history, audit_logs, ai_usage_logs, api_keys, email_templates, notification_preferences). No triggers. No database functions beyond RLS. | Blocks ALL feature development | Large |
| **D02** | API Specification — No OpenAPI spec. No pagination contract. No error format. No rate limiting tiers. No webhook outbound. No idempotency spec. | Blocks frontend-backend contract | Large |
| **D03** | Billing Architecture — Stripe mentioned once. No plan matrix. No feature gating. No metering. No subscription lifecycle. | Blocks monetization and plan enforcement | Medium |
| **D04** | ADRs — 6 decisions made in S3 but not formally recorded | Blocks team alignment | Small |
| **D05** | Design System — No colors, typography, components, accessibility spec | Blocks frontend development | Medium |

### Tier 2: REQUIRED (Blocks specific feature areas)

| ID | Gap | Impact | Effort |
|----|-----|--------|--------|
| **D06** | Offer Workflow — No state machine. No approval chain. No e-sign integration detail. | Blocks offer module | Medium |
| **D07** | Interview Scheduling — No scheduling algorithm. No scorecard schema. No blind review. | Blocks interview module | Medium |
| **D08** | Notification System — No architecture. No event catalog. No preferences. | Blocks all user-facing notifications | Medium |
| **D09** | Candidate Portal — No auth flow. No form builder. No theming spec. | Blocks candidate-facing product | Medium |
| **D10** | Search Architecture — No Typesense schema. No sync pipeline. No faceted search spec. | Blocks candidate search UI | Small |
| **D11** | Real-Time Features — Supabase Realtime mentioned but not specified. | Blocks live updates | Small |
| **D12** | Workflow Engine — No state machine. No auto_triggers spec. No SLA enforcement. | Blocks pipeline automation | Medium |

### Tier 3: PRE-LAUNCH

| ID | Gap | Impact | Effort |
|----|-----|--------|--------|
| **D13** | GDPR & Compliance — GDPR fields exist but no process. No DSAR. No retention policy. | Blocks EU launch | Medium |
| **D14** | Observability — No logging. No metrics. No SLOs. No alerting. | Blocks production readiness | Medium |
| **D15** | CI/CD Pipeline — Workflows listed but not specified. No migration strategy. | Blocks reliable deployments | Small |
| **D16** | Performance & Caching — No caching strategy. No load targets. | Blocks scale readiness | Medium |
| **D17** | Analytics & Reporting — No metrics data model. No DEI reporting spec. | Blocks analytics dashboard | Medium |
| **D18** | Security Runbooks — Referenced but empty. | Blocks incident readiness | Small |

### Tier 4: POST-MVP

| ID | Gap | Impact | Effort |
|----|-----|--------|--------|
| **D19** | Data Migration & Onboarding — No import pipeline. No wizard flow. | Blocks customer acquisition | Medium |
| **D20** | White-Label — No DNS/SSL. No branding config spec. | Blocks enterprise sales | Small |
| **D21** | i18n — Locale field exists but no strategy. | Blocks non-English markets | Small |

---

## Architecture Corrections Required

These issues in S3 must be resolved during documentation (in D01 and D04):

| # | Issue | Location in S3 | Resolution Required |
|---|-------|----------------|---------------------|
| AC-1 | **Prisma vs Supabase client confusion** — S3 uses Prisma in Inngest functions but Supabase client in routes. Prisma bypasses RLS unless JWT context is passed manually. | §5.1, §4.3 | Decide in ADR: Supabase client everywhere (recommended) OR Prisma with service role + manual org scoping. Document in D04. |
| AC-2 | **Next.js version** — S3 says Next.js 15, CLAUDE.md says Next.js 16. | §1, title | Lock version. If 16, middleware is `proxy.ts` not `middleware.ts`. |
| AC-3 | **Middleware file naming** — S3 shows `middleware.ts`, CLAUDE.md says `proxy.ts` (Next.js 16 convention). | §4.2 | Align with chosen Next.js version. |
| AC-4 | **Missing `deleted_at` on applications** — Table has no soft delete but DELETE RLS is `USING (FALSE)`. Correct pattern but `application_stage_history` (the audit mechanism) doesn't exist yet. | §2.1 | Add `application_stage_history` table in D01. |
| AC-5 | **`current_user_org_id()` multi-org** — Returns `LIMIT 1` by `joined_at`. JWT hook also does `LIMIT 1`. Org-switcher flow (re-auth or JWT refresh) is unspecified. | §3.2, §4.1 | Specify org-switch mechanism in D01/D04. |
| AC-6 | **IVFFlat on empty table** — `CREATE INDEX USING ivfflat` requires ~1000+ rows for effective list building. Empty table index is useless. | §2.1 | Use HNSW (no training data needed) or defer IVFFlat creation to data migration in D01. |

---

## Decisions Registry

Single source of truth for all architecture decisions. Check here FIRST before assuming anything is unresolved.

| # | Decision | Status | Resolved In | Notes |
|---|----------|--------|-------------|-------|
| AC-1 | Prisma vs Supabase client — pick one ORM | `Resolved → ADR-001` | ADR-001 | **Supabase client everywhere.** Prisma bypasses RLS. Background jobs use service role + `SET LOCAL` for tenant context. |
| AC-2 | Next.js version (15 vs 16) | `Resolved → ADR-002` | ADR-002 | **Next.js 16.** CLAUDE.md is authority. S3 references are errata. |
| AC-3 | Middleware file naming (`proxy.ts` vs `middleware.ts`) | `Resolved → ADR-002` | ADR-002 | **`proxy.ts`** — Next.js 16 convention. |
| AC-4 | Missing `deleted_at` on applications + `application_stage_history` table | `Resolved → ADR-006` | ADR-006 | **All tables get `deleted_at`.** Only exception: `audit_logs` (append-only). `application_stage_history` defined in D01. |
| AC-5 | Multi-org JWT switching mechanism | `Resolved → ADR-005` | ADR-005 | **`last_active_org_id` on `organization_members` + JWT refresh on switch.** No re-auth needed. |
| AC-6 | IVFFlat vs HNSW for vector indexes on empty tables | `Resolved → ADR-003` | ADR-003 | **HNSW.** IVFFlat useless on empty tables. HNSW builds incrementally from row 0. |
| TEST-1 | Testing strategy: what's built when | `Resolved → ADR-004` | ADR-004 | Day 1: unit, RLS, API, job, E2E. Per-feature: smoke, contract, a11y. Pre-launch: perf, load, security. |
| SCHEMA-1 | Soft delete policy | `Resolved → ADR-006` | ADR-006 | All tables get `deleted_at`. Exception: `audit_logs` (append-only). |
| SCHEMA-2 | Audit log architecture | `Resolved → ADR-007` | ADR-007 | Trigger-based, append-only, partitioned by month. Trigger on every table except audit_logs. |
| SCHEMA-3 | Enum strategy | `Resolved → ADR-008` | ADR-008 | CHECK for system values, lookup tables for tenant-customizable, JSONB for config. No PG ENUMs. |
| SCHEMA-4 | File storage pattern | `Resolved → ADR-009` | ADR-009 | Supabase Storage + centralized `files` metadata table. Virus scan gate. |
| SCHEMA-5 | GDPR erasure architecture | `Resolved → ADR-010` | ADR-010 | Crypto-shredding for audit logs + selective anonymization for entity tables. |
| STACK-1 | Auth provider: Supabase Auth | `Decided (S3)` | S3 §3 | Supabase Auth exclusively — no Clerk, no Auth.js |
| STACK-2 | Background jobs: Inngest | `Decided (S3)` | S3 §5 | Inngest (serverless) — not Bull/Redis |
| STACK-3 | Search: pgvector + Typesense | `Decided (S3)` | S3 §6 | Dual-layer: pgvector for semantic, Typesense for faceted |
| STACK-4 | Primary keys: UUID v4 | `Decided (S3)` | S3 §2 | `gen_random_uuid()` everywhere — no CUID, no SERIAL |
| STACK-5 | API style: REST/OpenAPI | `Decided (S3)` | S3 §4 | Not tRPC |
| STACK-6 | Tenancy model: Shared Schema + RLS | `Decided (S3)` | S3 §1 | organization_id on every table, PostgreSQL RLS |

**Rules:**
- `Open` → needs ADR before any doc assumes a specific answer
- `Decided (S3)` → settled in source doc, but no formal ADR yet (create ADR when writing D04)
- `Resolved → ADR-NNN` → formally recorded, safe to reference in all docs
- Parallel documents (D01, D04, D05) MUST NOT assume answers to `Open` decisions — resolve them first as standalone ADRs

---

## Production Order & Parallelism

```
⚠️  PREREQUISITE — Resolve blocking decisions BEFORE D01:
  ADR-001: AC-1 (Prisma vs Supabase client) ──────► D01 schema uses one client pattern
  ADR-002: AC-2 + AC-3 (Next.js version + middleware naming) ──► D01/D04 alignment
  ADR-003: AC-6 (IVFFlat vs HNSW) ────────────────► D01 vector index strategy

  WHY: D01 depends on AC-1 (which ORM shapes how background jobs query tenant data),
  AC-2 (Next.js version affects middleware/proxy architecture referenced in schema design),
  and AC-6 (vector index type is DDL in D01). Writing D01 without these resolved means
  building on assumptions that may get overturned — causing rework across 12 downstream docs.

  AC-4 resolved in ADR-006 (soft delete policy). AC-5 resolved in ADR-005 (multi-org switching).
  ADR-006→010 resolve remaining schema strategy decisions (audit, enums, files, GDPR).

Week 1 (prerequisite ADRs + parallel independent work):
  Track A: ADR-001, ADR-002, ADR-003 ──────────────► unblocks D01
  Track B: D05 (Design System) ────────────────────► unblocks D09, D21 (no ADR dependency)

Week 1-2 (after ADRs resolved):
  Track A: D01 (Schema) ──────────────────────────► unblocks D02, D03, D06-D13, D16-D17, D19
  Track B: D04 (remaining ADRs: STACK-1→6) ───────► unblocks team alignment

Week 2-3 (after D01):
  Track A: D02 (API Spec) ─────────────────────────► unblocks D19
  Track B: D03 (Billing) ──────────────────────────► unblocks plan enforcement
  Track C: D06 (Offers) + D07 (Interviews) ────────► unblocks core ATS features

Week 3-4 (parallel):
  D08 (Notifications), D09 (Portal), D10 (Search), D11 (Realtime), D12 (Workflow)

Week 4-5 (pre-launch):
  D13-D18 (Compliance, Observability, CI/CD, Performance, Analytics, Runbooks)

Post-MVP:
  D19-D21 (Onboarding, White-label, i18n)
```

---

## Definition of "Documentation Complete"

A document is considered complete when:

- [ ] All sections from the template are filled (or explicitly marked N/A with reason)
- [ ] SQL is syntactically valid PostgreSQL 15+
- [ ] TypeScript compiles under strict mode
- [ ] All `[VERIFY]` markers resolved against official third-party docs
- [ ] Cross-references to other docs use INDEX.md IDs
- [ ] Entry added to DEVLOG.md
- [ ] INDEX.md status updated to `✅ Complete`
- [ ] At least one person has reviewed (human or AI with explicit review prompt)

---

*Created: 2026-03-10*
*This document tracks the documentation journey. It is itself tracked in INDEX.md as part of the Meta section.*
