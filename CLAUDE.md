# itecbrains ATS — Claude Code Rules

## Session Handoff Protocol (MANDATORY)

Every new Claude Code session MUST follow this sequence before doing ANY work:

### Step 1: Read State (before anything else)
1. Read `docs/DEVLOG.md` — latest entry tells you what was done last
2. Read `docs/INDEX.md` — document statuses tell you what's done vs pending
3. Read `docs/PLAN.md` — gap analysis and architecture corrections
4. Read memory file at `~/.claude/projects/-Users-senthilbabu-Downloads-ATS/memory/MEMORY.md`

### Step 2: Confirm Context
Before proceeding with any task, state:
- What phase the project is in (pre-build docs / code / etc.)
- Which document(s) you'll be working on
- What the last completed work was (from DEVLOG)

### Step 3: Rules During Work
- **NO CODE** until documentation phase is complete (all 21 docs in INDEX.md marked Done)
- Log every documentation change in `docs/DEVLOG.md` (newest entry at top)
- Update `docs/INDEX.md` status when a document changes state
- Tag entries with `[PLAYBOOK]` if the lesson applies generically to SaaS building
- When writing ATS docs, simultaneously test the corresponding playbook prompt from `/Users/senthilbabu/Downloads/SaaS-Playbook/`

## Architecture Authority

- **Schema truth:** `supabase/prod_schema.sql` (when it exists) > markdown docs > S3 reference
- **Source docs:** S1 (Phase 1 Review), S2 (Phase 2 Blueprint), S3 (Principal Architect Pre-Plan) in `docs/`
- **Unresolved issues** are tracked in MEMORY.md — do not re-decide without user input

## Parallel Tracks

Two products are being built simultaneously:
1. **ATS** (`/Users/senthilbabu/Downloads/ATS/`) — the product being built
2. **SaaS Accelerator Playbook** (`/Users/senthilbabu/Downloads/SaaS-Playbook/`) — the product being sold

Lessons flow one-way: ATS → Playbook (abstracted, product details stripped).

## Task-Based Reading Tiers (save tokens)

Not every task needs every file. Read the minimum for your task type:

| Task | Mandatory Reads | Optional Reads |
|------|----------------|----------------|
| **Writing D01-D05** (foundational) | DEVLOG, INDEX, PLAN, MEMORY.md, S3 (full — read in chunks) | AI-RULES |
| **Writing D06-D21** (feature/module) | DEVLOG, INDEX, D01 (schema), relevant ADRs | S3 §relevant-section only |
| **Writing ADRs** | DEVLOG, PLAN §Architecture-Corrections, MEMORY §Unresolved, Decisions Registry in PLAN | S3 §relevant-section |
| **Updating playbook** | DEVLOG (latest `[PLAYBOOK]` entries), MEMORY §Playbook | Playbook JOURNEY-LOG |
| **Meta/tracking only** | DEVLOG, INDEX | — |

## S3 Errata (MUST READ before using S3 content)

S3 (`docs/Enterprise-Multi-Tenant-ATS-Princi.md`) has 6 known errors. Do NOT propagate these into new docs:

| ID | What's Wrong | Correct Approach |
|----|-------------|-----------------|
| AC-1 | Prisma used in Inngest functions — bypasses RLS | Use Supabase client everywhere (pending ADR) |
| AC-2 | Says Next.js 15, but project uses Next.js 16 | Lock to Next.js 16 |
| AC-3 | Shows `middleware.ts` — Next.js 16 uses `proxy.ts` | Use `proxy.ts` |
| AC-4 | `applications` table missing `deleted_at` + no `application_stage_history` table | Add both in D01 |
| AC-5 | Multi-org JWT switching unspecified | Must be designed in D01/D04 |
| AC-6 | IVFFlat index on empty tables — produces degenerate clusters | Use HNSW or defer index creation |

## Pre-Commit Protocol (MANDATORY before every git commit)

Every commit must leave the tracking system consistent. Run this checklist before committing:

### Always (every commit type)
- [ ] `docs/DEVLOG.md` — New entry at top with date, document ID, and summary
- [ ] `docs/INDEX.md` — Status updated for any document that changed state
- [ ] Commit message follows convention (see below)

### When writing/updating a document (D01-D21)
- [ ] Document has front matter (see AI-RULES §11)
- [ ] `docs/PLAN.md` Decisions Registry — updated if any architecture decision was made or resolved
- [ ] Cross-references use INDEX.md IDs (`[D01]`, `[S3]`, etc.)
- [ ] All `[VERIFY]` markers resolved or explicitly flagged as open
- [ ] If lesson is abstractable → tag DEVLOG entry with `[PLAYBOOK]`

### When resolving an architecture decision (ADR)
- [ ] ADR file created in `docs/ADRs/` using template
- [ ] `docs/PLAN.md` Decisions Registry — status changed from `Open` to `Resolved → ADR-NNN`
- [ ] `MEMORY.md` §Unresolved — remove the resolved item
- [ ] Any downstream docs that assumed the old answer → flagged for update in INDEX.md notes

### When battle-testing a playbook prompt
- [ ] Playbook `JOURNEY-LOG.md` — battle-test entry added (see §Battle-Test Log)
- [ ] Prompt file version noted
- [ ] Refinements (if any) applied to the prompt file in SaaS-Playbook

### Commit Message Convention
```
docs(<scope>): <imperative summary, max 72 chars>

<what changed and why — 1-3 lines>

Tracking: DEVLOG, INDEX [, PLAN, MEMORY, JOURNEY-LOG — list all updated]
Battle-tested: <prompt name> (if applicable)
Resolves: AC-<N> (if an architecture correction was addressed)
```

Scopes: `schema`, `api`, `billing`, `adr`, `design`, `module/<name>`, `compliance`, `observability`, `cicd`, `perf`, `analytics`, `runbook`, `onboarding`, `whitelabel`, `i18n`, `meta`

Example:
```
docs(schema): add complete DDL for all 16 tables with RLS

Full schema covering interviews, scorecards, offers, audit_logs,
and 10 other tables missing from S3. All 4 RLS operations per table.

Tracking: DEVLOG, INDEX, PLAN (AC-4, AC-6 resolved)
Battle-tested: database-schema-design.md v1
Resolves: AC-4, AC-6
```

## Anti-Drift Rules

- Do NOT invent new architecture decisions — check S3 and MEMORY.md first
- Do NOT change stack choices (Supabase Auth, Inngest, pgvector+Typesense) without explicit user approval
- Do NOT start coding or scaffolding — this is documentation phase
- Do NOT write playbook prompts that leak ATS-specific details (entities, company name, etc.)
- If unsure about a decision, surface it as an "Open Question" — do not assume
- Do NOT commit without completing the Pre-Commit Protocol checklist above
