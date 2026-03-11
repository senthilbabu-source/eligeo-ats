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

- **Phase:** Build — Phase 2 complete. **PIVOTED** per ADR-011: horizontal pass (2.5 → 2.6 → 2.7) before vertical features.
- **Build order:** Phase 0 ✅ → Phase 1 ✅ → Phase 2 ✅ → **Phase 2.5 (foundations)** → **Phase 2.6 (command bar + AI)** → **Phase 2.7 (UX polish)** → Phase 3 (interviews) → Phase 4 (offers) → Phase 5 (billing)
- **Documentation:** ALL 30 docs complete. Spec docs describe WHAT; build order changed per ADR-011.
- **Key rule:** Every new feature ships with AI-assisted mode from Day 1. No more "AI deferred to v2.0."
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
- **Source docs:** S1 (Phase 1 Review), S2 (Phase 2 Blueprint), S3 (Architect Pre-Plan) in `docs/source/` (provenance only — D01–D21 is the authority)
- **S3 has 6 known errors** (AC-1→AC-6) — all resolved via ADRs above. Never propagate S3 patterns that contradict the ADR table.

## SaaS Accelerator Playbook (separate product)

**Location:** `/Users/senthilbabu/Downloads/SaaS-Playbook/`
**Purpose:** A standalone prompt product for SaaS founders and technical teams. NOT a dependency of ATS.

ATS is the source of real-world lessons. Tag DEVLOG entries with `[PLAYBOOK]` when a pattern is universally applicable. The Playbook owns its own intake — ATS work is never blocked by Playbook extraction.

**ATS-side responsibility:** Tag `[PLAYBOOK]` in DEVLOG when warranted. That's it. No blocking, no extraction protocol. ATS stays focused on ATS.

## Task-Based Reading (save tokens)

| Task | Read | Optional |
|------|------|----------|
| Building features | DEVLOG, relevant module doc, D01 schema, ADRs | AI-RULES |
| Database migrations | D01 schema, ADRs, `supabase/migrations/` | Migration ordering (D01 §) |
| API endpoints | D02, relevant module doc | Error taxonomy (D26) |
| Testing | D24, golden-tenant fixture, relevant module | AI-RULES §4 |
| Meta/tracking | DEVLOG, INDEX | — |

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
- Run pre-start gate (AI-RULES §21) before any new deliverable
- Run post-build audit (AI-RULES §13) after completing any document

### ADR-011 Legacy Prevention (mandatory)

These rules prevent drifting back to a traditional CRUD ATS. Enforced on every feature, PR, and code review.

1. **No CRUD-only features.** Every user-facing feature MUST have an AI-assisted path (command bar intent, smart defaults, or AI suggestion). A form without an AI alternative is a legacy pattern.
2. **Command bar is primary.** If a workflow requires 3+ clicks through traditional UI, it MUST also be achievable via ⌘K command bar. Navigation-heavy = legacy.
3. **No "coming soon" dead-ends.** Never ship a page that says "coming soon" or "placeholder" without a concrete phase target (e.g., "Phase 2.5"). Dead-ends signal abandoned features, not a living product.
4. **No "v2.0" on AI features.** OpenAI, pgvector, embeddings, NL intent, resume parsing, fit scoring — these are Phase 2.6 (v1.0), NOT v2.0. Only Typesense full-text and Nylas calendar are v2.0.
5. **AI env vars are active.** `OPENAI_API_KEY` is a required v1.0 env var, not commented out. Check `.env.example` when adding new integrations.
6. **Scan code artifacts on pivot.** When architecture changes (like ADR-011), audit not just docs but also: `.env*`, code comments, TODO markers, placeholder text, config files, and test fixtures for stale assumptions.
7. **Every new page gets AI consideration.** Before building any new page, answer: "How would the command bar handle this?" If the answer is "it can't," the page design is wrong.
