# Eligeo — Claude Code Rules

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
| Build pivot | AI-first horizontal pass. Command bar + AI core before vertical features. | ADR-011 |
| Domain architecture | `eligeo.io` (marketing) + `app.eligeo.io` (ATS app). Career portal bridges via API. | ADR-012 |

**Stack (decided, from S3):** Supabase Auth · Inngest (jobs) · pgvector + Typesense (search) · UUID v4 everywhere · REST/OpenAPI · Merge.dev (HRIS) · Nylas (calendar) · Dropbox Sign (e-sign) · **OpenAI API** (embeddings, structured output, NL intent)

## Current State

- **Phase:** Build — **Phase 6 ✅ COMPLETE → Phase 7 (seed-demo.sql + smoke test → Wave A1 Analytics ← NEXT).**
- **Build order:** Phase 0 ✅ → Phase 1 ✅ → Phase 2 ✅ → Phase 2.5 ✅ → Phase 2.6 ✅ → Phase 2.7 ✅ → Phase 3 ✅ → Wave F ✅ → Phase 4 ✅ → Hardening ✅ → **Phase 5 ✅** → **H6 AI Hardening ✅** → **Phase 6 ✅ (P6-1 ✅ P6-2a ✅ P6-2b ✅ P6-5 ✅ P6-3 ✅ P6-4 ✅)**
- **Documentation:** ALL 30 docs + D32 (Phase 6 Candidate Intelligence) ✅. Post-Phase 6 audit complete (2026-03-13).
- **Test count:** 1399 Vitest + 68 E2E = 1467 total. **All passing — zero failures.**
- **Migrations:** 33 total (000–032). Next migration = `00033_analytics_snapshots.sql` (Phase 7 Wave A1).
- **Key rule:** Every new feature ships with AI-assisted mode from Day 1. No more "AI deferred to v2.0."
- **Rules:** 90 rules in `docs/AI-RULES.md` (§1-§21)
- **Governance:** Post-build audit (§13), pre-start gate (§21), downstream impact (§14)

## Session Start Protocol

1. Read `docs/DEVLOG.md` (latest entry = last work done)
2. Read `docs/INDEX.md` (document statuses)
3. Check MEMORY.md at `~/.claude/projects/-Users-senthilbabu-Downloads-ATS/memory/MEMORY.md`
4. Before any task: state phase, target doc, last completed work

## Mandatory Pre-Task Gates (BLOCKING — do NOT skip)

These gates MUST be completed BEFORE writing any code. State each gate's result explicitly in your response. Skipping a gate is a rule violation — even under time pressure, even if "it's just a small change."

### Before writing ANY code (feature, fix, refactor)

1. **Read the relevant spec doc** — find it in `docs/INDEX.md`. Do not code from memory or assumptions.
2. **Run §21 pre-start gate** (AI-RULES) — state all 6 checks (G1–G6) and their pass/fail.
3. **Declare the ADR-004 test plan upfront** — before writing the feature, state what tests ship WITH it:
   - Which ADR-004 Tier 1 categories apply (unit, RLS, role boundary, API integration, background job, E2E)
   - Estimated test count per category
   - Which golden-tenant fixtures will be used
   - If any table is created or modified → RLS tests are mandatory (4 ops × 2 tenants). No exceptions.
4. **Check ADR table** — confirm no resolved ADR is being contradicted.

### Before writing ANY test

1. **Read `docs/TESTING-STRATEGY.md` (D24)** — the full document. This defines test infrastructure, RLS matrix (§6), E2E registry (§7), fixture helpers (§3.3), naming conventions (§12).
2. **Read `docs/ADRs/004-testing-strategy.md`** — know what's Tier 1 (Day 1 mandatory) vs Tier 2/3.
3. **Read `src/__fixtures__/golden-tenant.ts`** — verify fixture UUIDs. Cross-check against `supabase/seed.sql`.
4. **State coverage against D24 §5.1** — declare which module coverage targets you are addressing.
5. **Check D24 §6.2 RLS matrix** — if code touches any table, RLS tests are REQUIRED (4 ops × 2 tenants minimum). If RLS tests don't exist yet for that table, write them.
6. **Follow D24 §12.2 naming** — `*.test.ts` (unit), `*.integration.test.ts` (needs Supabase local), `*.rls.test.ts` (RLS isolation), `*.spec.ts` (Playwright E2E).
7. **Follow D24 §12.3 guidelines** — Arrange-Act-Assert, one assertion per unit test, no test interdependence, golden fixtures for deterministic tests, name tests as behaviors (`should reject when...` not `test rejection`).

### Before writing ANY migration

1. **Read D01 schema doc** + list existing `supabase/migrations/` files.
2. **Check ADR table** — especially ADR-006 (soft delete), ADR-007 (audit triggers), ADR-008 (CHECK enums, no PG ENUMs).
3. **Declare the RLS test plan** — every new table needs RLS tests BEFORE the migration is committed. State: table name, 4 ops, which roles can do what, 2-tenant isolation tests.

### Before ANY commit

1. **Run all checks** — `npm test`, `npx tsc --noEmit`, lint. All must pass.
2. **Run §13 post-build audit** if completing a phase or major feature.
3. **DEVLOG entry** for significant changes.
4. **State test counts** — before vs after. Test count must not decrease.

### Gate Violation Protocol

If you realize you skipped a gate or are about to:
- **STOP immediately.** Do not continue writing code.
- State which gate was skipped and why.
- Complete the gate before proceeding.
- If the gate reveals missing work (e.g., no RLS tests for an existing table), that missing work becomes the IMMEDIATE priority — it blocks everything else.

## Context Management

- On `/compact`: preserve resolved architecture table, **Mandatory Pre-Task Gates (full section)**, Anti-Drift Rules, current doc being worked on, and any in-progress audit fixes
- After compaction: re-read CLAUDE.md (automatic), then DEVLOG latest entry only
- For long sessions: `/compact` after completing each document

## Architecture Authority

- **Schema truth:** `supabase/prod_schema.sql` (when exists) > `docs/schema/*.md` > S3
- **Source docs:** S1 (Phase 1 Review), S2 (Phase 2 Blueprint), S3 (Architect Pre-Plan) in `docs/source/` (provenance only — D01–D21 is the authority)
- **S3 has 6 known errors** (AC-1→AC-6) — all resolved via ADRs above. Never propagate S3 patterns that contradict the ADR table.

## SaaS Accelerator Playbook (separate product)

**Location:** `/Users/senthilbabu/Downloads/SaaS-Playbook/`
**Purpose:** A standalone prompt product for SaaS founders and technical teams. NOT a dependency of ATS.

ATS is the source of real-world lessons. Tag DEVLOG entries with `[PLAYBOOK]` when a pattern is universally applicable. The Playbook owns its own intake — ATS work is never blocked by Playbook extraction.

**ATS-side responsibility:** Tag `[PLAYBOOK]` in DEVLOG when warranted. That's it. No blocking, no extraction protocol. ATS stays focused on ATS.

## Task-Based Reading (save tokens — but NEVER skip mandatory reads)

| Task | MUST Read (gate requirement) | Optional |
|------|------|----------|
| Building features | DEVLOG, relevant module doc, D01 schema, ADRs, **D24 §5.1 (test plan)** | AI-RULES |
| Database migrations | D01 schema, ADRs, `supabase/migrations/`, **D24 §6.2 (RLS matrix)** | Migration ordering (D01 §) |
| API endpoints | D02, relevant module doc, **D24 §5.1** | Error taxonomy (D26) |
| Writing tests | **D24 (full doc)**, **ADR-004**, `golden-tenant.ts`, `seed.sql`, relevant module | AI-RULES §4 |
| Meta/tracking | DEVLOG, INDEX | — |

**D24 and ADR-004 are not optional for ANY code task.** Every feature ships with tests. Reading the test strategy is part of reading the feature spec.

## Pre-Commit Protocol

Every commit:
- [ ] DEVLOG.md — new entry at top (for significant changes)
- [ ] Commit message format: `<type>(<scope>): <summary>` with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`
Scopes: `auth`, `jobs`, `candidates`, `pipeline`, `interviews`, `offers`, `billing`, `notifications`, `search`, `workflow`, `compliance`, `infra`, `meta`

## Anti-Drift Rules

- Do NOT re-debate resolved ADRs — table above is final
- Do NOT change stack choices without explicit user approval
- Do NOT commit without DEVLOG update for significant changes
- Do NOT commit code without the tests declared in the pre-task gate
- Do NOT write tests without first reading D24 and ADR-004 — shallow tests that check boxes are worse than no tests (they create false confidence)
- Run pre-start gate (AI-RULES §21) before any new deliverable
- Run post-build audit (AI-RULES §13) after completing any document
- **Test debt is a blocking defect.** If RLS tests are missing for existing tables, that is P0 — it blocks new feature work until resolved. Tenant isolation is the #1 security invariant (ADR-004 preamble).

### ADR-011 Legacy Prevention (mandatory)

These rules prevent drifting back to a traditional CRUD ATS. Enforced on every feature, PR, and code review.

1. **No CRUD-only features.** Every user-facing feature MUST have an AI-assisted path (command bar intent, smart defaults, or AI suggestion). A form without an AI alternative is a legacy pattern.
2. **Command bar is primary.** If a workflow requires 3+ clicks through traditional UI, it MUST also be achievable via ⌘K command bar. Navigation-heavy = legacy.
3. **No "coming soon" dead-ends.** Never ship a page that says "coming soon" or "placeholder" without a concrete phase target (e.g., "Phase 2.5"). Dead-ends signal abandoned features, not a living product.
4. **No "v2.0" on AI features.** OpenAI, pgvector, embeddings, NL intent, resume parsing, fit scoring — these are Phase 2.6 (v1.0), NOT v2.0. Only Typesense full-text and Nylas calendar are v2.0.
5. **AI env vars are active.** `OPENAI_API_KEY` is a required v1.0 env var, not commented out. Check `.env.example` when adding new integrations.
6. **Scan code artifacts on pivot.** When architecture changes (like ADR-011), audit not just docs but also: `.env*`, code comments, TODO markers, placeholder text, config files, and test fixtures for stale assumptions.
7. **Every new page gets AI consideration.** Before building any new page, answer: "How would the command bar handle this?" If the answer is "it can't," the page design is wrong.
