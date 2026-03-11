# itecbrains ATS — Claude Code Rules

## Resolved Architecture (ALL decisions final — do NOT re-debate)

These survive compaction. Every ADR is in `docs/ADRs/`.

| Decision | Answer | ADR |
|----------|--------|-----|
| ORM/client | Supabase client everywhere, NO Prisma. Background jobs: service role + `SET LOCAL`. | ADR-001 |
| Framework | Next.js 16. Middleware file is `proxy.ts` (not `middleware.ts`). | ADR-002 |
| Vector indexes | HNSW only, no IVFFlat. `WITH (m = 16, ef_construction = 64)`. | ADR-003 |
| Testing | 3-tier: Day 1 mandatory, per-feature, pre-launch. | ADR-004 |
| Multi-org | `last_active_org_id` on org_members + JWT refresh on switch. | ADR-005 |
| Soft delete | `deleted_at` on ALL tables. Exceptions: `audit_logs`, `gdpr_erasure_log`, `candidate_encryption_keys`. | ADR-006 |
| Audit logging | Trigger-based `audit_trigger_func()`, append-only, partitioned monthly. | ADR-007 |
| Enums | CHECK constraints for system values, lookup tables for tenant values. No PG ENUMs. | ADR-008 |
| File storage | `files` metadata table + Supabase Storage. No inline URL columns. | ADR-009 |
| GDPR erasure | Per-candidate encryption keys. `erase_candidate()` crypto-shreds + anonymizes. | ADR-010 |

**Stack (decided, from S3):** Supabase Auth · Inngest (jobs) · pgvector + Typesense (search) · UUID v4 everywhere · REST/OpenAPI · Merge.dev (HRIS) · Nylas (calendar) · Dropbox Sign (e-sign)

## Current State

- **Phase:** Pre-build documentation (NO CODE until all 21 docs done)
- **D01 (Schema):** ✅ Complete (Review) — 39 tables, 8 clusters, 10 ADRs
- **D04 (ADRs):** 🟡 In Progress — ADR-001→010 done, STACK ADRs remaining
- **D02-D03, D05-D21:** ⬜ Not Started
- **Rules:** 90 rules in `docs/AI-RULES.md` (§1-§21)
- **Governance:** Post-build audit (§13), pre-start gate (§21), downstream impact (§14)

## Session Start Protocol

1. Read `docs/DEVLOG.md` (latest entry = last work done)
2. Read `docs/INDEX.md` (document statuses)
3. Check MEMORY.md at `~/.claude/projects/-Users-senthilbabu-Downloads-ATS/memory/MEMORY.md`
4. Before any task: state phase, target doc, last completed work

## Context Management

- On `/compact`: preserve resolved architecture table above, current doc being worked on, and any in-progress audit fixes
- After compaction: re-read CLAUDE.md (automatic), then DEVLOG latest entry only
- For long sessions: `/compact` after completing each document

## Architecture Authority

- **Schema truth:** `supabase/prod_schema.sql` (when exists) > `docs/schema/*.md` > S3
- **Source docs:** S1 (Phase 1 Review), S2 (Phase 2 Blueprint), S3 (Architect Pre-Plan) in `docs/`
- **S3 has 6 known errors** (AC-1→AC-6) — all resolved via ADRs above. Never propagate S3 patterns that contradict the ADR table.

## SaaS Accelerator Playbook (separate product)

**Location:** `/Users/senthilbabu/Downloads/SaaS-Playbook/`
**Purpose:** A standalone prompt product for SaaS founders and technical teams. NOT a dependency of ATS.

ATS is the source of real-world lessons. Tag DEVLOG entries with `[PLAYBOOK]` when a pattern is universally applicable. The Playbook owns its own intake — ATS work is never blocked by Playbook extraction.

**ATS-side responsibility:** Tag `[PLAYBOOK]` in DEVLOG when warranted. That's it. No blocking, no extraction protocol. ATS stays focused on ATS.

## Task-Based Reading (save tokens)

| Task | Read | Optional |
|------|------|----------|
| Writing D02-D05 (foundational) | DEVLOG, INDEX, D01 schema, PLAN | AI-RULES |
| Writing D06-D21 (modules) | DEVLOG, INDEX, D01, relevant ADRs | S3 §relevant |
| Writing ADRs | DEVLOG, PLAN Decisions Registry | S3 §relevant |
| Meta/tracking | DEVLOG, INDEX | — |

## Pre-Commit Protocol

Every commit:
- [ ] DEVLOG.md — new entry at top
- [ ] INDEX.md — status updated if doc state changed
- [ ] Commit message: `docs(<scope>): <summary>` with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

When writing docs: front matter (AI-RULES §11), cross-refs use INDEX IDs, [VERIFY] markers resolved.
When resolving ADRs: PLAN.md Decisions Registry updated, downstream docs flagged.

Scopes: `schema`, `api`, `billing`, `adr`, `design`, `module/<name>`, `compliance`, `observability`, `cicd`, `perf`, `analytics`, `runbook`, `onboarding`, `whitelabel`, `i18n`, `meta`

## Anti-Drift Rules

- Do NOT re-debate resolved ADRs — table above is final
- Do NOT change stack choices without explicit user approval
- Do NOT start coding — documentation phase
- Do NOT commit without DEVLOG + INDEX updates
- Run pre-start gate (AI-RULES §21) before any new deliverable
- Run post-build audit (AI-RULES §13) after completing any document
