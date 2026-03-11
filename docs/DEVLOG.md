# Eligeo — Dev Log

> Chronological record of all work. Newest entries at top.

---

## 2026-03-11 — [Phase 2.7] J3 Wave 1 — Clone team fields + test coverage

**Phase:** Build — Phase 2.7 (UX Polish)
**Scope:** J3 Wave 1 — hiring_manager_id/recruiter_id cloned, embedding assertion, credit tooltip

### Changes
- **Fixed: `cloneJob()` now copies `hiring_manager_id` and `recruiter_id`** from source job. Both columns existed in schema (migration 008) but were silently omitted from the insert payload — every cloned job had NULL team assignments, breaking R4 source attribution and hiring manager workflows.
- **Fixed: credit cost tooltip** on AI Rewrite button — `"✦ AI Rewrite (3 credits)"` (was generic description)

### Tests
- Added `should clone hiring_manager_id and recruiter_id from the source job` — asserts both IDs in insert payload
- Added `should queue embedding generation for the cloned job` — asserts `generateAndStoreEmbedding` called with `entityId: "new-clone-id"` (test 16 was wired but never asserted)
- Added `hiring_manager_id` + `recruiter_id` to `sourceJob` fixture in `clone-job.test.ts`
- **Count: 553 → 555 Vitest. All passing. Typecheck clean.**

---

## 2026-03-11 — [Phase 2.7] R3/R4 Dashboard P1 Fixes

**Phase:** Build — Phase 2.7 (UX Polish)
**Scope:** User stories R3/R4 P1 — source attribution bar denominator, pipeline funnel template filter

### Changes
- **R4 P1-a: Source bar denominator** — was dividing by total org-wide active applications; leading bar never reached 100%. Now uses `topSources[0][1]` (max count) as denominator so leading bar fills to 100% and all others scale proportionally.
  - Added `calcSourcePct(count, maxCount)` pure function to `src/lib/utils/dashboard.ts`
- **R3 P1-b: Pipeline funnel template filter** — multi-template orgs saw duplicate same-named stage bars (e.g. three "Phone Screen" rows). Now queries `pipeline_templates` for `is_default=true` and filters funnel rows to stages belonging to that template only. Single-template orgs (defaultTemplateId=null) unaffected.
  - Added `aggregateFunnel(stageRows, defaultTemplateId)` pure function to `src/lib/utils/dashboard.ts`
  - Replaced inline aggregation loop in `dashboard/page.tsx` with the new function
  - Added 8th query to `Promise.all` for default template ID (no extra round-trip cost)
  - Added `pipeline_template_id` to funnel stage select

### Tests
- Added 7 new unit tests to `src/__tests__/dashboard.test.ts`: 3 for `calcSourcePct`, 4 for `aggregateFunnel`
- **Count: 546 → 553 Vitest. All passing. Typecheck clean.**

---

## 2026-03-11 — [Phase 2.7] R1/R4 Dashboard P0 Bug Fixes

**Phase:** Build — Phase 2.7 (UX Polish), strategic audit fix 2 of 2
**Scope:** User stories R1/R4 — Active Jobs always 0, source attribution using wrong column

### Changes
- **Fixed: `status="published"` → `status="open"`** — `published` is not a valid `job_openings.status` CHECK value; every recruiter saw 0 Active Jobs since R1 shipped
- **Fixed: source attribution** — query now joins `candidates!inner(source, candidate_sources(name))` via `source_id` FK; "linkedin"/"LinkedIn"/"Linked In" now aggregate as one canonical entry
- **New: `src/lib/utils/dashboard.ts`** — `aggregateSources()` pure function: canonical name via `candidate_sources.name` → freeform `source` TEXT fallback → "Unknown"
- Inline `sourceCounts` aggregation in `dashboard/page.tsx` replaced with `aggregateSources()` call

### Tests
- +3 Vitest unit (dashboard.test.ts): canonical name priority, TEXT fallback, null handling
- **Total: 543 → 546 Vitest + 42 E2E = 588**

### Files
- `src/app/(app)/dashboard/page.tsx`
- `src/lib/utils/dashboard.ts` (new)
- `src/__tests__/dashboard.test.ts` (new)

### Open (P1 — next session)
- **R4 P1-a:** Bar denominator uses total active apps — leading bar never hits 100%. Fix: use top-source max as denominator
- **R3 P1-b:** Funnel has no template filter — multi-template orgs see duplicate stage-name bars. Fix: filter to default/most-used template

### What's next
- Dashboard P1 fixes → C2/M3 mobile polish

---

## 2026-03-11 — [Phase 2.7] Strategic Audit: J3 + Dashboard P0/P1 Bug Fixes

**Phase:** Build — Phase 2.7 (UX Polish), strategic audit pass
**Scope:** User stories J3 (clone job), R1/R3/R4 (dashboard) — technically functional but strategically incomplete

### J3 P0 Bug Fixes (4 silent defects)

**Bug 1 — Required skills not cloned (AI matching broken)**
- `cloneJob()` now fetches `job_required_skills` from source and INSERTs copies with correct `job_id`, `skill_id`, `importance`. Before: every cloned job had zero skills → AI match panel failed silently on every clone.

**Bug 2 — `job_embedding` NULL after clone (AI matching dead)**
- After skills are copied, `generateAndStoreEmbedding()` called fire-and-forget (service client, no auth needed). Errors go to Sentry. TODO: move to Inngest when first function is wired.

**Bug 3 — AI Rewrite destructive overwrite (no undo)**
- Migration 00019: `ALTER TABLE job_openings ADD COLUMN description_previous TEXT`
- `rewriteJobDescription()` now writes `{ description: new, description_previous: original }` in a single UPDATE. Original always recoverable.

**Bug 4 — Slug contains timestamp + "(Copy)" (public URL broken)**
- New `findAvailableSlug()` helper: one DB query, picks `baseSlug` → `baseSlug-2` → `baseSlug-3` on collision. No timestamp, no "(Copy)" in title or slug.

### Dashboard P0/P1 Bugs Discovered (not yet fixed)

**P0 — Bug 1:** `status="published"` in Active Jobs query → always 0. Schema only allows `('draft','open','paused','closed','archived')`. Fix: `status="open"`.
**P0 — Bug 3:** Source attribution reads `candidates.source` (freeform TEXT) instead of `source_id → candidate_sources.name`. "linkedin" / "LinkedIn" / "Linked In" aggregate separately. Fix: join via `source_id`.
**P1 — Bug 2:** Source bars use `activeApplications` (total org count) as denominator. Top source bar never reaches 100% width, visually misleading. Fix: use max of top sources as denominator.
**P1 — Bug 4:** Pipeline funnel has no template filter — multiple templates produce duplicate stage-name bars. Fix: filter to default pipeline template.
**Bug 5 (NOT a bug):** `applicationsThisWeek` has no status filter. Correctly counts "new applications received this week". Label and data are consistent.

### Tests
- +6 Vitest unit (clone-job.test.ts): title no "(Copy)", clean slug, skills copied, cross-tenant isolation, description_previous stored, credits-exhausted no overwrite
- **Total: 543 Vitest + 42 E2E = 585**

### Files
- `supabase/migrations/00019_add_description_previous.sql` (new)
- `src/lib/actions/jobs.ts` (cloneJob + rewriteJobDescription fixed, findAvailableSlug added)
- `src/__tests__/clone-job.test.ts` (new, 6 unit tests)

### What's next
- Dashboard P0 fixes (Bug 1 + Bug 3) → Dashboard P1 fixes (Bug 2 + Bug 4) → C2/M3 mobile polish

---

## 2026-03-11 — [Phase 2.7] J3: Clone Job + AI Rewrite

**Phase:** Build — Phase 2.7 (UX Polish), deliverable 5 of 6
**Scope:** User story J3 — Clone a job posting; AI rewrite its description

### Changes
- **New: `cloneJob(jobId)`** — copies all job fields, appends " (Copy)", sets status=draft, unique slug via timestamp suffix
- **New: `rewriteJobDescription(jobId)`** — calls `generateJobDescription` with existing title/dept/description as context, saves result to DB, revalidates page
- **Updated: `job-actions.tsx`** — added Clone button (redirects to clone), AI Rewrite button (refreshes page with new description), loading states, `canEdit`/`canCreate` props
- **Updated: `jobs/[id]/page.tsx`** — passes both permission props to JobActions

### Tests
- +2 E2E (Playwright): clone button creates copy, AI Rewrite button visible
- **Total: 537 Vitest + 42 E2E = 579**

### Files
- `src/lib/actions/jobs.ts` (cloneJob + rewriteJobDescription added)
- `src/app/(app)/jobs/[id]/job-actions.tsx` (rewritten)
- `src/app/(app)/jobs/[id]/page.tsx` (updated props)
- `src/__tests__/e2e/jobs.spec.ts` (+2 tests)

### What's next
- J3 complete. Next: **C2/M3 — Mobile polish pass** (final Phase 2.7 deliverable)

---

## 2026-03-11 — [Phase 2.7] P5: Talent Pool UI + Filters

**Phase:** Build — Phase 2.7 (UX Polish), deliverable 4 of 6
**Scope:** User story P5 — Talent pool list, detail, create, add/remove members, search filter

### Changes
- **New: /talent-pools** — list with member counts, empty state, "New Pool" button
- **New: /talent-pools/new** — create form (name + description, redirects to detail on success)
- **New: /talent-pools/[id]** — detail with member list, URL-based search filter (q=), add candidate dropdown, remove member button, delete pool
- **New: server actions** — `src/lib/actions/talent-pools.ts`: createPool, deletePool, addMember, removeMember (all org-scoped, soft delete, assertCan)
- **Nav:** "Pools" added to app nav; `talent-pools` / `pools` added to command bar pageMap
- **Client component:** `pool-actions.tsx` — AddCandidateForm, RemoveMemberButton, DeletePoolButton

### Tests
- +5 E2E (Playwright): list loads, detail shows members, search filter, new pool form, nav link
- **Total: 537 Vitest + 40 E2E = 577**

### Files
- `src/lib/actions/talent-pools.ts` (new)
- `src/app/(app)/talent-pools/` (new — page, new/page, [id]/page, [id]/pool-actions)
- `src/app/(app)/app-nav.tsx` (Pools nav item added)
- `src/components/command-bar.tsx` (pools/talent-pools pageMap)
- `src/__tests__/e2e/talent-pools.spec.ts` (new)

### What's next
- P5 complete. Next: **J3 — Clone job + AI rewrite**

---

## 2026-03-11 — [Phase 2.7] R1/R3/R4: Dashboard with Metrics

**Phase:** Build — Phase 2.7 (UX Polish), deliverable 3 of 6
**Scope:** User stories R1 (dashboard), R3 (pipeline velocity), R4 (source attribution)

### Changes
- **Rewrite: /dashboard** — replaced placeholder with live metrics dashboard
- **4 metric cards:** Active Jobs, Candidates, Active Applications, This Week (new apps)
- **Pipeline Funnel** — horizontal bar chart of active applications per stage, sorted by stage_order
- **Source Attribution** — top 5 sources by application count with proportional bars
- **Recent Applications** — last 5 applications with candidate name + job title + date
- **Parallel queries** — 7 Supabase queries with `Promise.all` for fast load
- All queries: org-scoped + soft-delete filtered

### Tests
- +5 E2E (Playwright): metric cards render, funnel section, source section, recent apps, card navigation
- **Total: 537 Vitest + 35 E2E = 572**

### Files
- `src/app/(app)/dashboard/page.tsx` (rewritten)
- `src/__tests__/e2e/dashboard.spec.ts` (new)

### What's next
- R1/R3/R4 complete. Next: **P5 — Talent pool UI + filters**

---

## 2026-03-11 — [Phase 2.7] M1: Drag-Drop Kanban Board

**Phase:** Build — Phase 2.7 (UX Polish), deliverable 2 of 6
**Scope:** User story M1 — Drag-and-drop candidate cards on pipeline board

### Changes
- **Rewrite: Pipeline board** — replaced arrow-button-only Kanban with @dnd-kit cross-column drag-and-drop
- **DndContext + useDroppable/useDraggable** — stage columns are drop targets, candidate cards are draggable items
- **Optimistic UI** — card moves instantly on drop, server action persists in background, rollback on failure
- **DragOverlay** — floating card preview during drag with scale 1.02, shadow elevation, spring-eased drop (300ms)
- **Drop zone highlighting** — active column gets primary border + bg tint, empty columns show "Drop here" placeholder
- **Arrow buttons preserved** — mobile/accessibility fallback, same optimistic pattern
- **Error handling** — error banner on failed moves, pending indicator during server action

### Design Decisions
- Reused @dnd-kit from W1 (pipeline editor) instead of adding Framer Motion — keeps bundle lean, consistent DnD lib
- D05 §8.2 spring animation achieved via CSS `cubic-bezier(0.2, 0, 0, 1)` on DragOverlay dropAnimation
- Cards use `useDraggable` (not `useSortable`) since within-column reordering isn't needed — only cross-column moves

### Tests
- +4 E2E (Playwright): stage columns render, arrow button move, drag handles present, empty column placeholders
- **Total: 537 Vitest + 30 E2E = 567**

### Files
- `src/app/(app)/jobs/[id]/pipeline/pipeline-board.tsx` (rewritten — DndContext, DraggableCard, StageColumn, OverlayCard)
- `src/__tests__/e2e/kanban.spec.ts` (new)

### What's next
- M1 complete. Next: **R1/R3/R4 — Dashboard with metrics** (time-to-hire, pipeline velocity, source attribution)

---

## 2026-03-11 — [Phase 2.7] W1: Pipeline Builder (Settings Page + DnD Editor)

**Phase:** Build — Phase 2.7 (UX Polish), deliverable 1 of 6
**Scope:** User story W1 — No-code drag-and-drop pipeline builder

### Changes
- **New: Settings infrastructure** — `/settings` layout with sidebar nav, redirect to `/settings/pipelines`
- **New: Pipeline list page** — displays all templates with stage counts, default badge, create/edit/delete actions
- **New: Pipeline editor** — drag-and-drop stage reordering via @dnd-kit, inline edit (name/type/terminal), add/remove stages
- **New: Server actions** — `pipelines.ts`: createTemplate, updateTemplate, deleteTemplate, addStage, updateStage, removeStage, reorderStages
- **New: Delete guards** — prevents deleting templates with active jobs, prevents removing stages with active applications
- **New: Nav + command bar** — Settings link in app-nav, "pipelines" / "manage pipelines" quick pattern in command bar
- **Bug fix:** `sort_order` → `stage_order` column name mismatch in pipeline page + board (was causing empty stage lists)
- **Dependencies:** @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities

### Tests
- +11 pipeline action tests (validation, create, delete guard, add stage, remove guard, reorder)
- +6 intent pattern tests (pipeline navigation patterns)
- **Total: 537 Vitest + 26 E2E = 563**

### Files
- `src/lib/actions/pipelines.ts` (new)
- `src/app/(app)/settings/` (new — layout, page, pipelines/page, pipelines/[id]/page, pipelines/[id]/pipeline-editor, pipelines/new/page, delete-template-button)
- `src/app/(app)/app-nav.tsx` (modified — added Settings)
- `src/app/(app)/jobs/[id]/pipeline/page.tsx` (fixed sort_order → stage_order)
- `src/app/(app)/jobs/[id]/pipeline/pipeline-board.tsx` (fixed sort_order → stage_order)
- `src/lib/ai/intent.ts` (added pipeline navigation pattern)
- `src/components/command-bar.tsx` (added pipelines to page map)

[PLAYBOOK] Settings page pattern: sidebar layout with feature-specific sub-pages. Settings nav as const array for easy extension. Pipeline editor as reusable DnD pattern.

### What's next
- W1 complete. Next: **M1 — Drag-drop Kanban** (reuse dnd-kit for candidate cards on pipeline board)

---

## Format

```
### YYYY-MM-DD — [Document ID] Summary
- What changed
- Why
- What's next
```

---

## 2026-03-11 — Comprehensive Audit + 5-Wave Fix Plan (Waves 1–5)

**Phase:** Post-Phase 2.6 audit
**Scope:** Full codebase audit → 28 findings → 5-wave dependency-ordered fix plan

### Wave 1 (P0 Security + Code Quality) ✅
- **SEC-01:** Open redirect fix — `getSafeRedirectPath()` in auth callback
- **SEC-02:** Defense-in-depth org_id filters on ALL page queries (jobs, candidates, pipeline, command-bar, AI actions)
- **SEC-03:** SQL LIKE injection prevention — `escapeLikeQuery()` in command-bar search
- **SEC-04:** ADR-001 exception documentation for service role usage in public-apply
- **SEC-06:** Error message sanitization — 5 AI action catch blocks now log server-side, return generic messages
- **SEC-10:** Supabase minimum password length 6 → 8
- **CODE-01:** Soft-delete `deleted_at IS NULL` filters added to all missing queries (moveStage, rejectApplication, createApplication)
- **CODE-04:** Merged duplicate imports in AI actions
- **BUILD-01:** ESLint `_`-prefix rule for unused vars, removed unused TENANT_B import

### Wave 2 (Infrastructure Hardening) ✅
- **CODE-02:** Sentry SDK — `instrumentation.ts` + `instrumentation-client.ts` + `Sentry.captureException()` in all 5 AI catch blocks
- **SEC-05:** Upstash rate limiting in `proxy.ts` — public (60/min), form (5/min), health endpoint
- **SEC-07:** Content-Security-Policy header in `next.config.ts` (self, supabase, sentry, openai)
- **CODE-03:** Centralized `CONFIG` constants — replaced 11 magic numbers across AI modules + pagination

### Wave 3 (API Protection) ✅
- **SEC-08:** AI per-IP rate limiting (20/min) in `proxy.ts` for `/api/ai/*` endpoints
- **SEC-09:** CSRF origin/referer validation — `checkCsrf()` utility applied to AI streaming route

### Wave 4 (Test Coverage) ✅
- **TEST-01:** RLS tests for 4 missing tables — skills (26), candidate_skills (22), job_required_skills (22), talent_pool_members (26) = +96 tests
- **TEST-04:** AI utility tests — csrf (11), ai-generate (9), ai-resume-parser (4) = +24 tests
- **TEST-03:** API route tests — health (4), AI streaming (7) = +11 tests
- Seed data: deterministic UUIDs added for skills, candidate_skills, job_required_skills, talent_pool_members
- **Test count: 391 → 520** (+129 new tests)

### Wave 5 (E2E + Docs + Cleanup) ✅
- **TEST-05:** E2E test for public career portal application form (3 scenarios)
- **DOC-01:** DEVLOG updated, MEMORY.md updated
- **BUILD-02:** .docx binaries removed from git tracking, added to .gitignore

### Summary
- **28 findings resolved**, zero remaining debt
- **Security:** open redirect, org isolation, LIKE injection, error leaks, rate limiting, CSP, CSRF, password policy
- **Tests:** 391 → 523+ (RLS, AI, API, CSRF, E2E)
- **Infrastructure:** Sentry, Upstash rate limiting, centralized config, CSP headers

[PLAYBOOK] Comprehensive audit-then-fix pattern: 6-agent parallel audit → prioritized findings → dependency-ordered waves → verify after each wave. Prevents fix-introduces-bug cycles.

### 2026-03-11 — [INFRA] Migrate AI layer from raw OpenAI SDK to Vercel AI SDK

- **What:** Replaced `openai` package with `@ai-sdk/openai` + `ai` (Vercel AI SDK)
- **Files changed:** `client.ts`, `embeddings.ts`, `generate.ts`, `intent.ts`, `resume-parser.ts`
- **Key changes:**
  - `getOpenAIClient()` → `chatModel` / `embeddingModel` provider exports
  - `openai.chat.completions.create()` → `generateText()` / `generateObject()`
  - `openai.embeddings.create()` → `embed()`
  - Manual JSON schemas → Zod schemas with `generateObject()` (type-safe structured output)
  - `response_format: { type: "json_object" }` → Zod schema validation
  - `prompt_tokens/completion_tokens` → `inputTokens/outputTokens`
  - `maxTokens` → `maxOutputTokens`
- **Why:** AI SDK provides type-safe structured output, streaming support, and provider abstraction
- **`openai` package no longer imported** — can be removed from dependencies

### 2026-03-11 — [TEST] Complete MSW mock registry — all 9 services (D24 §4.1)

- **Was:** 3/9 external services mocked (Stripe, Resend, Inngest)
- **Now:** 9/9 services mocked per D24 §4.1:
  - Stripe (2 handlers: checkout sessions, billing portal)
  - Resend (1: email send)
  - Nylas (2: GET/POST calendar events)
  - Typesense (2: document search, document upsert)
  - OpenAI (2: embeddings, chat completions)
  - Merge.dev (1: GET candidates)
  - Dropbox Sign (1: signature request send)
  - Inngest (1: event ingestion)
  - Slack (1: webhook alerts)
- **Added `msw-handlers.test.ts`** — 10 tests verifying all 9 services + total handler count
- **Totals:** 391 Vitest (269 RLS + 122 unit/API) + 20 E2E = 411 total
- **P1 MSW debt: CLOSED**

### 2026-03-11 — [SECURITY] Fix members_insert RLS policy (M018)

- **Bug:** `members_insert` allowed `user_id = auth.uid()` — any authenticated user could self-add to any org
- **Root cause:** Policy intended for signup flow (first member of new org) was unconditionally permissive
- **Fix (migration 018):**
  - Created `org_has_members(org_id)` SECURITY DEFINER function — checks member existence bypassing RLS
  - Self-insert now requires `NOT org_has_members(organization_id)` — only works for empty orgs (signup)
  - Owner/admin invite path unchanged
  - SECURITY DEFINER needed because inline `NOT EXISTS` subquery was subject to RLS — the inserting user couldn't see the target org's members, defeating the check
- **Verified:** 3 scenarios pass — self-insert to existing org DENIED, owner invite ALLOWED, self-insert to empty org ALLOWED
- **Test:** Added explicit test for M018 fix in `organization-members.rls.test.ts`
- `[PLAYBOOK]` RLS subqueries in WITH CHECK are subject to RLS themselves. Use SECURITY DEFINER functions for cross-tenant existence checks in policies.

### 2026-03-11 — [TEST] Close remaining ADR-004 Day 1 gaps (380 total)

- **API integration tests (28 new):**
  - `health.test.ts` — 5 tests: response shape, timestamp format, git SHA parsing, 'local' fallback
  - `auth-callback.test.ts` — 6 tests: code exchange, redirect with next param, error redirect, missing code handling (mocks Supabase server client)
  - `problem.test.ts` — 7 tests: RFC 9457 structure, status codes, Content-Type header, optional detail, type URL lowercasing
  - `cn.test.ts` — 7 tests: class merging, Tailwind conflict resolution, conditional/object/array syntax, empty/falsy inputs
  - `logger.test.ts` — 3 tests: logger instance exports, PII redaction config, LOG_LEVEL default
- **E2E expansion (4 new):**
  - Auth: redirect-back from protected routes (/jobs, /candidates, /jobs/new), empty email rejection, empty password rejection
  - Jobs: form validation on empty submit stays on /jobs/new
- **Totals:** 269 RLS + 111 unit/API = 380 Vitest tests, 20 E2E (Playwright) = 400 total

### 2026-03-11 — [TEST] Expand RLS tests to full D24 §6.2 matrix (352 total)

- **Expanded all 10 RLS test files** to full 5 roles × 4 ops matrix:
  - organizations: 15 → 21 tests (5 roles SELECT, INSERT=TRUE signup, all DELETE denied)
  - user-profiles: 9 → 22 tests (5 roles SELECT co-org, 3 roles self-UPDATE, cross-tenant denied)
  - organization-members: 12 → 22 tests (5 roles SELECT, owner/admin/self UPDATE, DELETE owner-only)
  - applications + stage_history: 18 → 39 tests (INSERT for 4 roles, DELETE owner/admin, append-only)
  - ai-usage-logs: 6 → 9 tests (all 5 roles SELECT, service-only INSERT, append-only)
  - pipelines (generator): 12 → 46 tests (2 tables × 5 roles × 4 ops)
  - lookups (generator): 10 → 46 tests (2 tables × 5 roles × 4 ops)
  - talent-pools (generator): 10 → 23 tests (1 table × 5 roles × 4 ops)
  - job-openings, candidates: unchanged (already full matrix)
- **Fixed RLS test generator bugs:**
  - `randomizeUniqueFields()` — prevents 23505 unique constraint violations on repeated INSERT tests (name, email, slug, title)
  - DELETE tests now use randomized disposable records
- **Found RLS policy bug:** `members_insert` allows `user_id = auth.uid()` — any user can self-add to any org. Documented with TODO; will fix in future migration.
- **Test pollution fix:** Cross-tenant INSERT test was adding Tenant B to Tenant A's org during parallel runs. Changed to use random user_id (not auth.uid()) so INSERT is properly denied.
- **Totals:** 269 RLS + 83 unit = 352 tests, 0 failures, typecheck clean
- `[PLAYBOOK]` Test parallelism can cause cross-test pollution when one test modifies shared state (e.g., org membership). Use random/disposable data and avoid real cross-tenant mutations in tests.

### 2026-03-11 — [TEST] RLS integration test infrastructure + 140 tests

- **RLS test helpers** (`src/__tests__/helpers.ts`):
  - `createTestClient(email)` — authenticates as seed user via Supabase Auth, returns client with JWT claims
  - `createServiceClient()` — service role for setup/teardown (bypasses RLS)
  - `assertTenantIsolation()` — verifies cross-tenant SELECT invisibility
  - `assertCanSelect()`, `assertInsertDenied()`, `assertUpdateDenied()`, `assertDeleteDenied()`
  - Client caching to avoid re-auth per test, `clearClientCache()` in afterAll
- **RLS test generator** (`src/__tests__/rls/rls-test-generator.ts`):
  - Takes `RLSTestConfig` (table, record IDs, sample insert/update, role configs)
  - Generates tenant isolation tests (A↛B, B↛A, cross-tenant INSERT/UPDATE/DELETE)
  - Generates role enforcement tests (SELECT, INSERT, UPDATE, DELETE per role)
  - DELETE tests use disposable records (insert via service, delete via role)
- **140 RLS tests across 10 files** (all against local Supabase):
  - `organizations.rls.test.ts` — 15 tests: isolation, all-roles SELECT, owner/admin UPDATE, DELETE=FALSE
  - `user-profiles.rls.test.ts` — 9 tests: isolation, co-org visibility, self-only UPDATE, DELETE=FALSE
  - `organization-members.rls.test.ts` — 12 tests: isolation, 5-member count, owner/admin/self UPDATE, owner-only DELETE
  - `job-openings.rls.test.ts` — 26 tests (generator): isolation, 5 roles × 4 ops
  - `candidates.rls.test.ts` — 27 tests (generator): isolation, hiring_manager INSERT (M013 fix), 5 roles × 4 ops
  - `applications.rls.test.ts` — 18 tests: isolation, all-roles SELECT, HM UPDATE, append-only stage_history
  - `pipelines.rls.test.ts` — 12 tests: templates + stages isolation, interviewer denied
  - `lookups.rls.test.ts` — 10 tests: sources + reasons isolation, role-gated INSERT/UPDATE
  - `talent-pools.rls.test.ts` — 10 tests: pools + members isolation, interviewer denied
  - `ai-usage-logs.rls.test.ts` — 6 tests: SELECT by org member, INSERT=FALSE, UPDATE/DELETE=FALSE
- **Total: 223 Vitest tests (83 unit + 140 RLS)** — up from 83. All passing.
- **Bug fix:** `ai_usage_logs` column names `tokens_input`/`tokens_output` (not `input_tokens`/`output_tokens`)
- `[PLAYBOOK]` RLS test generator pattern — define a table config, auto-generate 4 ops × N roles × 2 tenants tests. Catches policy regressions on every migration.

### 2026-03-11 — [TEST] Test debt payoff (Phases 2, 2.5, 2.6)

- **Unit tests (72 total, up from 14):**
  - `pagination.test.ts` — 15 tests: parsePagination (defaults, clamping, edge cases), buildPaginationMeta (pages, boundaries)
  - `intent-patterns.test.ts` — 29 tests: command bar quick patterns (navigation, search, create intents, no-match), AI credit weights
  - `embeddings.test.ts` — 14 tests: buildCandidateEmbeddingText, buildJobEmbeddingText (null handling, field combinations)
  - `rbac.test.ts` — 11 tests (existing from Phase 1, covers Phase 2+ permissions)
  - `smoke.test.ts` — 3 tests (existing)
- **E2E tests (14 total, Playwright):**
  - `auth.spec.ts` — 5 tests: login/redirect/error/signup flows
  - `jobs.spec.ts` — 2 tests: list page + detail navigation (create tests deferred — see bug below)
  - `career-portal.spec.ts` — 3 tests: public listing, published jobs, detail view
  - `command-bar.spec.ts` — 4 tests: ⌘K open/close, type suggestion, navigate
- **Bug found by E2E:** `extractSession()` reads `app_metadata` from `getUser()` DB call, but custom_access_token_hook injects claims into JWT only. `orgRole` defaults to "interviewer", breaking permission-gated pages. Fix needed: decode JWT access_token in extractSession. Tracked for Phase 2.7.
- **Fixes:** Playwright config port 3000→3001, career-portal lint warning
- **ADR-004 compliance:** Day 1 testing debt from Phases 2/2.5/2.6 now paid. 72 unit + 14 E2E = 86 tests total.
- `[PLAYBOOK]` Testing debt accumulates silently — enforce test counts in CI gate, not just "tests pass"

### 2026-03-11 — [FEAT] Phase 2.6: Command Bar + AI Core

- **Migration 015** — pgvector extension, `candidate_embedding vector(1536)` + `job_embedding vector(1536)` columns with HNSW indexes (m=16, ef_construction=64), `ai_usage_logs` table (append-only), `consume_ai_credits()` atomic SQL function, `match_candidates_for_job()` similarity search RPC
- **OpenAI integration** — singleton client (`gpt-4o-mini` chat, `text-embedding-3-small` embeddings), AI credit metering with per-action weights (resume_parse=2, match=1, jd_generate=3, email=1, intent=1)
- **AI resume parser** — OpenAI structured output with strict JSON schema → `ParsedResume` (name, email, skills, experience, education). 2 credits per parse.
- **Embedding pipeline** — `buildCandidateEmbeddingText()` / `buildJobEmbeddingText()` → OpenAI embedding → store as JSON string in Supabase → log usage
- **Candidate-job fit scoring** — `match_candidates_for_job` pgvector cosine similarity RPC, `<AiMatchPanel>` on job detail page (generate embedding → find matches → ranked list with % scores)
- **AI generation** — `generateJobDescription()` (title+dept+keypoints → full JD, 3 credits), `generateEmailDraft()` (rejection/outreach/update/follow_up + tone, 1 credit)
- **NL intent parser** — Quick pattern matching (regex for nav/search/create) → LLM fallback (1 credit). 10 intent types: navigate, search_candidates, search_jobs, create_job, create_candidate, move_stage, generate_jd, draft_email, match_candidates, unknown.
- **Command bar (⌘K)** — Full palette UI: backdrop blur, search input, "Thinking..." animation, keyboard nav (↑↓ Enter Esc), auto-navigate for nav/create intents, result list with candidate/job links, footer hints. Wired into app layout.
- **Server actions** — 6 AI actions (aiParseResume, aiGenerateCandidateEmbedding, aiGenerateJobEmbedding, aiMatchCandidates, aiGenerateJobDescription, aiDraftEmail) + `executeCommand()` for command bar
- **All checks pass:** typecheck ✅ lint ✅ 14 tests ✅ build ✅ (17 routes) · Supabase 15 migrations ✅
- **What's next:** Phase 2.7 — UX polish (drag-drop Kanban, settings pages, dashboard metrics, role-aware views)

### 2026-03-11 — [INFRA] Phase 2.5: Foundation Fixes

- **Migration 014** — 6 performance indexes: org+date composites on jobs, candidates, applications; slug+status for career portal; status+published for listings
- **Pagination** — server-side `parsePagination()` + `buildPaginationMeta()` utilities, reusable `<Pagination>` component with page window (5 pages visible, prev/next)
- **Paginated /jobs and /candidates** — Supabase `.range()` with `{ count: "exact" }`, 25 per page default, total count in header
- **Career portal application form** — public `submitPublicApplication()` server action (service client, no auth), validates with Zod, upserts candidate, creates application at first pipeline stage, handles duplicate applications
- **Org-scoped career portal** — `/careers?org=itecbrains` filters to org's jobs, shows org name in header, preserves scope in detail links
- **Apply to Job (internal)** — `<ApplyToJobForm>` on candidate detail page, dropdown of open jobs (excludes already-applied), auto-selects first pipeline stage
- **ADR-011 legacy prevention rules** — 7 rules added to CLAUDE.md (no CRUD-only features, command bar primary, no dead-ends, no v2.0 on AI, AI env vars active, scan artifacts on pivot, every page gets AI consideration)
- **Env fix** — moved `OPENAI_API_KEY` from v2.0 to active v1.0 section in `.env.example`
- **All checks pass:** typecheck ✅ lint ✅ 14 tests ✅ build ✅ (17 routes) · Supabase 14 migrations ✅
- **What's next:** Phase 2.6 — command bar (⌘K) + AI core (resume parsing, fit scoring, NL search)

### 2026-03-11 — [META] ADR-011: AI-First Build Pivot

- **Legacy pitfall audit** — comprehensive review of UI, workflows, AI architecture, and performance
- **Findings (6 critical):**
  1. Dated UI — pages feel like database admin tools, zero role-aware views
  2. High click-count — 4–6 clicks per common action, no inline editing or keyboard shortcuts
  3. Zero customization UI — schema supports tenant config, no settings pages
  4. Dead-end career portal — no application form, "coming soon" placeholder
  5. No pagination — all list pages fetch all rows, breaks at 500+ records
  6. Bolt-on AI — zero AI code exists, "AI-first" claim is unsupported
- **Decision:** Abandon sequential phase order (Phase 3→4→5→6). Switch to horizontal pass:
  - Phase 2.5: Foundation fixes (pagination, application form, indexes, org-scoped career portal)
  - Phase 2.6: Command bar (⌘K) + AI core (resume parsing, fit scoring, NL search)
  - Phase 2.7: UX polish (drag-drop Kanban, settings pages, dashboard metrics, role-aware views)
  - Then resume vertical: Phase 3 (interviews) → Phase 4 (offers) → Phase 5 (billing)
- **Key rule change:** Every new feature ships with AI-assisted mode from Day 1. No deferring AI to v2.0.
- **What stays:** All 10 ADRs, 39-table schema, Supabase RLS, Inngest, audit logging, 30 spec docs
- **What changes:** Build ORDER only. Command bar becomes primary interaction model.
- **[PLAYBOOK]** Legacy pitfall audit as standard practice — evaluate against dated UI, click counts, customization, candidate experience, performance, and AI-first claims before shipping MVP. Catches "building yesterday's product" before it's too late.

### 2026-03-11 — [JOBS] Phase 2: Jobs + Career Portal (Complete)

- **Pipeline Kanban board** — `/jobs/[id]/pipeline`:
  - Stage columns with color-coded headers (sourced→hired→rejected)
  - Candidate cards with name, title, date, and arrow buttons for stage moves
  - Horizontal scrollable layout for many stages
  - Move buttons call `moveStage()` server action via `useActionState`
- **Creation forms**:
  - `/jobs/new` — full form: title, description, department, location type, employment type, salary range, pipeline selection
  - `/candidates/new` — contact info, title/company, LinkedIn, source dropdown, tag input for skills/tags
  - Both use `useActionState` with redirect on success
  - TagInput component: type + Enter to add, Backspace to remove, hidden JSON field for form submission
- **Career portal** (public, unauthenticated):
  - `/careers` — lists all open jobs across orgs with salary, location, employment type
  - `/careers/[slug]` — full job detail with description, pill-style metadata badges
  - Public layout with minimal header (Eligeo brand + "Sign in" link)
  - Uses `createServiceClient` (service role) with `force-dynamic` for SSR
- **Action signatures fixed**: `createJob` and `createCandidate` now accept `(_prev, formData)` for `useActionState` compatibility
- **16 routes total**: 7 app pages, 4 API routes, 2 career pages, 2 auth pages, 1 landing
- **Build verified**: typecheck ✅ lint ✅ 14 tests ✅ build ✅

### 2026-03-11 — [JOBS] Phase 2: Jobs + Career Portal (App Layer)

- **Server Actions** — 10 actions across 2 modules:
  - `src/lib/actions/jobs.ts`: createJob, updateJob, publishJob, closeJob, deleteJob (soft delete)
  - `src/lib/actions/candidates.ts`: createCandidate, updateCandidate, moveStage, rejectApplication, createApplication
  - All use Zod v4 validation, `requireAuth()` + `assertCan()`, camelCase→snake_case mapping
- **Pages** — 4 new server components + 1 client component:
  - `/jobs` — listing with status badges, count, "New Job" CTA (permission-gated)
  - `/jobs/[id]` — detail with stats (applications, headcount, status), publish/close actions
  - `/candidates` — data-dense table: name, title, location, source, skills preview
  - `/candidates/[id]` — profile card, skills/tags, applications list with stage badges
  - `job-actions.tsx` — client component for publish/close with `useActionState`
- **App layout** — `(app)/layout.tsx` + `app-nav.tsx`:
  - Top nav bar: Eligeo brand, Dashboard/Jobs/Candidates links, role badge, sign out
  - Auth protection at layout level via `requireAuth()`
  - Active link highlighting
- **Dashboard updated** — removed redundant auth/logout (now in layout)
- **Build verified**: typecheck ✅ lint ✅ 14 tests ✅ build ✅

### 2026-03-11 — [JOBS] Phase 2: Jobs + Career Portal (Database Layer)

- **Cross-cut analysis of Phase 1** — found and fixed 3 critical + 4 medium issues:
  - RLS: Added missing `WITH CHECK` on organizations, user_profiles, organization_members UPDATE policies
  - Audit: Rewrote `audit_trigger_func()` to support background jobs via `COALESCE(auth.uid(), current_setting('app.performed_by', TRUE)::UUID)` (ADR-001)
  - Audit: Unified INSERT into single statement using CASE expressions
  - Types: Fixed OfferCompensation (was severely incomplete — missing period, equity_type, vesting)
  - Types: Fixed BrandingConfig (added favicon_url, secondary_color, font_family, renamed to _html suffix)
  - Types: Fixed FeatureFlags (enumerated specific flags instead of generic Record)
  - Types: Fixed AutoAction (aligned type enum with spec: 7 types not 4)
  - Error: Created RFC 9457 `problemResponse()` helper (`src/lib/utils/problem.ts`), updated auth API to use it
- **7 new migrations** (006–012), 13 new tables:
  - `00006_lookup_tables.sql` — candidate_sources, rejection_reasons (ADR-008 tenant lookup tables)
  - `00007_pipeline_tables.sql` — pipeline_templates (one default per org), pipeline_stages (7 stage types, ordered)
  - `00008_job_openings.sql` — 25 columns, CHECK constraints (location_type, employment_type, status, salary range), vector column deferred to v2.0
  - `00009_candidates.sql` — fuzzy name search via pg_trgm, vector deferred, email dedup per org
  - `00010_skills.sql` — skills (global + org-scoped, case-insensitive dedup), candidate_skills (proficiency/source/years), job_required_skills (must_have/nice_to_have)
  - `00011_applications.sql` — applications (one per candidate per job), application_stage_history (append-only: UPDATE/DELETE = FALSE)
  - `00012_talent_pools.sql` — talent_pools, talent_pool_members
- **RLS on every table** — all 4 ops (SELECT/INSERT/UPDATE/DELETE), WITH CHECK on all UPDATEs, org isolation via `is_org_member()` + `has_org_role()` + `current_user_org_id()`
- **Ground-truth types** added: JobMetadata, ResumeParsed, SourceDetails, ApplicationMetadata
- **Seed data expanded**: 6 candidate sources, 7 rejection reasons, 1 pipeline (6 stages), 2 jobs (Senior Engineer + Product Manager), 3 candidates (Alice/Bob/Carol), 1 Globex candidate (cross-tenant), 2 applications, 3 stage transitions, 1 talent pool
- **[PLAYBOOK]** Cross-cut analysis as continuous practice — retroactive verification of prior phase catches real bugs before they compound. Do this at every phase boundary.
- **Verification:** 12 migrations apply cleanly | `npm run lint` ✅ | `npm run typecheck` ✅ | `npm run test` ✅ (14/14) | `npm run build` ✅
- **Database:** 17 tables total (4 Phase 1 + 13 Phase 2)
- **Next:** Phase 2 continued — Server Actions, pages (job board, candidate list, pipeline Kanban), career portal

### 2026-03-11 — [AUTH] Phase 1: Auth + Core Tenancy

- **4 database migrations** written (topological order per ADR/P-23):
  - `00001_extensions_and_functions.sql` — uuid-ossp, pgcrypto, pg_trgm + 5 functions: `set_updated_at()`, `current_user_org_id()` (ADR-005), `is_org_member()`, `has_org_role()`, `custom_access_token_hook()` (JWT claims injection)
  - `00002_core_tenancy_tables.sql` — organizations (18 cols, CHECK constraints for plan/status/slug), user_profiles (FK to auth.users), organization_members (5 roles, ADR-005 last_active_org_id, invite flow)
  - `00003_audit_logs.sql` — Append-only audit trail (ADR-007 exception: no deleted_at, no RLS)
  - `00004_rls_policies_and_triggers.sql` — Full RLS (SELECT/INSERT/UPDATE/DELETE × 3 tables), FORCE ROW LEVEL SECURITY, set_updated_at triggers, audit triggers, auto-profile creation on auth.users INSERT
- **RBAC constants** (`src/lib/constants/roles.ts`): 5 roles × 30 permissions matrix, `can()` + `assertCan()` helpers matching D01 permission matrix exactly
- **Auth helpers** (`src/lib/auth/`): `requireAuth()` + `getSession()` (Server Components/Actions, redirects), `requireAuthAPI()` + `requireRoleAPI()` (Route Handlers, error responses), Session type with JWT claims (orgId, orgRole, plan, featureFlags)
- **Server Actions** (`src/lib/auth/actions.ts`): signUp (org creation + owner membership), login, logout, switchOrg (ADR-005 JWT refresh), inviteMember (service role + invite token), acceptInvite
- **Auth pages:** Login (`/login`), Sign Up (`/signup`) with Zod v4 validation, Dashboard shell (`/dashboard`) with session display + logout
- **Ground-truth types** updated: BrandingConfig, FeatureFlags, UserPreferences, CustomPermissions
- **11 new RBAC tests** (14 total): full permission matrix coverage, role hierarchy validation, assertCan behavior
- **Verification:** `npm run lint` ✅ | `npm run typecheck` ✅ | `npm run test` ✅ (14/14) | `npm run build` ✅
- **[PLAYBOOK]** Two-layer RBAC enforcement (RLS + application can()) — the DB layer is unforgeable, the app layer is for UX. Both must agree.
- **Next:** Verify migrations against local Supabase, then Phase 2 — Jobs + Career Portal

### 2026-03-11 — [INFRA] Phase 0: Project Initialization

- **Next.js 16.1.6** scaffolded with React 19.2.3, TypeScript strict mode, Tailwind v4
- **20 production deps** installed: Supabase SSR, Stripe, Inngest, Resend, Sentry, Upstash, Pino, Zod, date-fns, jose, lucide-react, next-themes, clsx, tailwind-merge
- **8 dev deps** installed: Vitest 4.0, Playwright 1.58, MSW 2.12, Prettier, Husky
- **Config files:** vitest.config.ts, playwright.config.ts, proxy.ts (ADR-002), .env.example (D28), .prettierrc, globals.css (D05 design tokens)
- **Supabase** initialized (`supabase init`), migrations/ dir ready
- **Scaffold files:** Supabase browser + server + service-role clients (ADR-001), Inngest client, Pino logger with PII redaction, cn() utility, ground-truth types, auth callback route, health endpoint, Inngest serve route
- **Testing:** Golden tenant fixture (TENANT_A + TENANT_B), MSW mock handlers (Stripe, Resend, Inngest), 3 smoke tests passing
- **CI/CD:** GitHub Actions workflow (lint → typecheck → test → build)
- **Husky:** pre-commit hook runs lint + typecheck
- **Verification:** `npm run lint` ✅ | `npm run typecheck` ✅ | `npm run test` ✅ (3/3) | `npm run build` ✅
- **CLAUDE.md** updated for build phase (removed "no code" rule, updated task-based reading table)
- **Next:** Phase 1 — Auth + Core Tenancy (Supabase Auth, RLS policies, org creation)

### 2026-03-11 — [PLAYBOOK] Documentation audit lessons → SaaS Accelerator Playbook

- **2 new principles:** P-22 (pre-code documentation audit methodology) and P-23 (migration ordering via topological sort)
- **7 new JOURNEY-LOG entries:** pre-code audit, migration ordering, env variable manifest, background job registry, version gating, golden tenant fixture, RBAC endpoint matrix
- **1 battle-test entry:** documentation-system.md v1 validated against audit phase
- **Prompt impacts identified:** new `pre-code-audit.md` prompt, new `env-manifest.md` and `job-registry.md` templates, updates to database-schema-design, api-contract-design, and documentation-system prompts
- Total Playbook principles: 21 → 23. Total journey entries: 17 → 24.

### 2026-03-11 — [D02,D06,D10,D12,D26,D27,schema/07] Pre-code audit — MEDIUM+LOW gap remediation

- **D10 SEARCH.md:** Added version gating note — v1.0 uses PostgreSQL ILIKE, Typesense deferred to v2.0.
- **D06 OFFERS.md:** Added currency rules (10 supported currencies, validation, display via Intl.NumberFormat, no cross-currency comparison in v1.0). Updated state machine diagram to show `pending_approval → draft` rejection path.
- **schema/07-communications-files.md:** Added upload constraints table (MIME types, max sizes per file category), validation strategy (MIME + extension check), virus scanning flow, storage path convention.
- **D02 API-SPECIFICATION.md:** Added §2.3 Supabase Auth Configuration (JWT expiry, password policy, email templates, redirect URLs, session rules) and §2.4 API Key Permission Scoping (resource:action format, subset-of-creator rule, TTL, revocation).
- **D12 WORKFLOW.md:** Added version gating note — withdrawal flow is v1.1, auto-actions are Growth+ v1.1, SLA is Pro+ v1.1.
- **D27 PRODUCT-ROADMAP.md:** Clarified v1.0 notification events are 10 of 21 total (remaining 11 ship v1.1+).
- **D26 ERROR-TAXONOMY.md:** Added module cross-reference mapping error code categories to source documents.

### 2026-03-11 — [D02,D24,D27,D29] Pre-code audit — HIGH gap remediation

- **D02 API-SPECIFICATION.md:** Added §3.1 Endpoint-Level Permission Matrix (31 endpoints × 5 roles) and §3.2 Timezone Convention (storage, API, display, cron, DST rules).
- **D24 TESTING-STRATEGY.md:** Expanded golden fixture with interviews (2), scorecard submissions (1), offers (1), notes (2) — all v1.0 features now have test data.
- **D27 PRODUCT-ROADMAP.md:** Added legal pages (Privacy Policy, ToS, Cookie Policy, cookie consent banner) to v1.0 launch criteria.
- **D29 INNGEST-REGISTRY.md:** New document — consolidated registry of 54 Inngest functions across 10 modules with triggers, retries, concurrency, v1.0 scope. 9 cron schedules. Global defaults for retry/timeout/dead-letter. [PLAYBOOK]

### 2026-03-11 — [D01,D28,D03,D19] Pre-code audit — critical gap remediation

- **D01 DATABASE-SCHEMA.md:** Added §Migration Ordering — 29-batch topological sort for 39 tables, FK dependency chain, seed data order, Realtime publication order, audit trigger attachment order. No circular dependencies.
- **D28 ENVIRONMENT-VARIABLES.md:** New document — complete manifest of 30 env vars across 10 services. Organized by service, tagged public/secret, v1.0 vs v2.0+ required, includes `.env.example` template.
- **D03 BILLING.md:** Fixed Starter plan contradiction — was "Starter plan is free", now correctly states all plans are paid ($29/mo+) with 14-day trial as the only free period.
- **D19 ONBOARDING.md:** Fixed matching contradiction — signup flow now says `plan = 'starter', subscription_status = 'trialing'` instead of `(free tier)`.
- Audit identified 14 total gaps (3 critical, 5 high, 6 medium). This commit resolves all 3 critical items. [PLAYBOOK]

### 2026-03-11 — [META] Brand rename: itecbrains ATS → Eligeo

- Renamed all project references from "itecbrains ATS" to "Eligeo" (eligeo.io)
- Updated 19 files: CLAUDE.md, MEMORY.md, INDEX.md, DEVLOG.md, PLAN.md, AI-RULES.md, CI-CD.md, API-SPECIFICATION.md, PERFORMANCE.md, WHITE-LABEL.md, CANDIDATE-PORTAL.md, DATA-MIGRATION.md, USER-PERSONAS.md, SECURITY-THREAT-MODEL.md, ERROR-TAXONOMY.md, PRODUCT-ROADMAP.md, COMPETITIVE-ANALYSIS.md, SECURITY-RUNBOOKS.md, DESIGN-SYSTEM.md
- Domain mapping: ats.itecbrains.com → eligeo.io, staging/api/docs/careers subdomains updated
- Preserved: docs/source/ files (provenance), INDEX.md source file path references (actual filenames)
- Brand: Eligeo — from Latin "eligere" (to select/elect), domain: eligeo.io

### 2026-03-11 — [D27] Product Roadmap & Release Strategy — complete first draft

**The most important document in the project.** Translates 27 spec documents into a phased release plan. Determines what we build first and why.

**5 release versions:**
- **v1.0 "Launch"** (12 weeks): Complete hiring loop — 26 features across 6 build phases. Post job → receive applications → evaluate → interview → offer → hire. Targets BambooHR graduates and spreadsheet users at $29–$79/mo. 10 critical notification events. No AI, no Typesense, no Nylas, no e-signatures — those justify Pro tier in v2.0.
- **v1.1 "Velocity"** (4–6 weeks post-launch): Email templates, rejection flow, CSV import, bulk operations, basic dashboard, candidate status tracker. Features first 10 customers will ask for.
- **v2.0 "Intelligence"** (Quarter 2): AI matching, Typesense search, workflow automation, self-scheduling (Nylas), e-signatures (Dropbox Sign), advanced analytics, talent pools, custom fields. Justifies Pro tier pricing.
- **v2.1 "Scale"** (Quarter 3): ATS-to-ATS migration (Merge.dev), external API, webhooks, GDPR automation, Realtime, audit log export. Enterprise pipeline.
- **v3.0 "Enterprise"** (Quarter 4+): White-label, custom domains, i18n, SSO/SAML, DEI reporting, HRIS integration.

**Key decisions:** All 39 tables created in Phase 0 (future-proofing), but many unused until later versions. Email templates hardcoded in v1.0. Offer approval auto-approve (single step) in v1.0. No Typesense/Nylas/AI in v1.0. Revenue projections: $540 MRR at launch → $125K MRR at v3.0.

**Build order = revenue order, not document order.**

---

### 2026-03-11 — [D24] Consolidated Testing Strategy — complete first draft

Consolidates all test requirements from ADR-004 and D06-D12 into executable plan. Vitest + Playwright configurations. Golden tenant fixture: 2 tenants (Acme Corp Pro, Globex Inc Starter) with 5 roles, pipeline, jobs, candidates, applications, scorecard templates. MSW mock registry: 9 external services (Stripe, Resend, Nylas, Typesense, OpenAI, Merge.dev, Dropbox Sign, Inngest, Slack) with handler overrides per test.

RLS test matrix: ~238 cases generated via test generator pattern (4 ops × 5 roles × 2 tenants per table). E2E scenario registry: 15 positive scenarios (signup flow, hiring flow, GDPR erasure, billing upgrade, etc.) + 5 failure scenarios. CI parallelization: 3 unit shards + 1 RLS suite + 2 E2E shards = ~4 min wall time. Test database reset: full `supabase db reset` between suites, targeted `reset_test_data()` function between tests. Inngest function test patterns with mock step runner. State machine test generators for application lifecycle and offer workflow.

---

### 2026-03-11 — [D26] Error Taxonomy & Recovery Patterns — complete first draft

ATS-XXXX error code scheme: 12 module categories (AU, VL, WF, OF, IV, SR, BL, FL, NT, CP, MG, SY) with 60+ specific error codes. Each code has HTTP status, title, user-facing message, and developer detail. RFC 9457 response format extended with `code` field. Server Action error pattern using `ActionResult<T>` return type.

Graceful degradation matrix: 7 external services with fallback strategies (Typesense → PostgreSQL ILIKE, OpenAI → manual review, Resend → queue for retry, etc.). Circuit breaker implementation: 5-failure threshold, 60s reset timeout. Retry strategies by failure type: retryable (429, 5xx, network) vs non-retryable (400, 403, 422). Client-side retry utility with exponential backoff + jitter. Inngest retry configuration per function type.

React error boundary design: 4 placement levels (root, page, widget, form). Next.js error.tsx files at each route segment. User-facing error message guidelines with templates. Error logging standards (what to log vs never log).

---

### 2026-03-11 — [D22] Security Threat Model — complete first draft

STRIDE analysis across 6 threat categories with 30+ identified threats mapped to existing controls. Attack surface inventory (6 external, 5 internal surfaces). PII data flow diagram with classification (Restricted/Confidential/Internal/Public) and third-party service PII mapping (9 services). 35+ attack vector → control mappings across authentication, authorization, injection, data exposure, and supply chain categories.

7 gaps identified (GAP-01→07): magic link single-use enforcement, CSP headers, CORS policy, webhook SSRF prevention, per-key rate limiting, automated key rotation, WAF. All low-medium severity, addressed during implementation or post-MVP.

Penetration test plan: 40 test cases across 6 categories (AUTH, AUTHZ, INJ, BIZ, DATA, RATE). Test schedule: pre-launch internal + external, quarterly regression, annual full scope. Security headers specification for proxy.ts. PR security review checklist (12 items).

---

### 2026-03-11 — [D23] Data Migration & Import Strategy — complete first draft

Extends D19 with deep migration architecture: 7-stage pipeline (Extract → Stage → Transform → Validate → Load → Verify → Report). Staging table schema (6 tables: migration_jobs, staging_candidates/applications/jobs/interviews/offers).

Competitor-specific field mapping for 5 source systems via Merge.dev: Greenhouse (stage prefix stripping, scorecard mapping, EEOC handling), Lever (opportunities mapping, feedback→notes, archive reasons), Ashby (best scorecard mapping, signal ratings→numeric), BambooHR (employee filtering, simple structure), Workable (disqualification flattening, AI source tagging).

Validation pipeline with Zod schemas, dedup rules (4 entity types), referential integrity checks. Error handling with thresholds (warn at 10%, abort at 30%). Rollback strategy: metadata-tagged records, soft-delete cascade, file cleanup, search re-sync. Data quality assessment with pre-migration audit and post-migration verification. CSV enhancements: interview/note import, template downloads, column auto-detection. Migration test fixtures (5 data sets). 7 Inngest functions.

---

### 2026-03-11 — [D25] User Personas & Journey Maps — complete first draft

5 personas defined: Admin, Recruiter, Hiring Manager, Interviewer, Candidate. Each with goals, frequency, tech comfort, frustration thresholds, key screens, and competitor pains they escaped (mapped to D00).

4 journey maps: recruiter daily workflow, hiring manager notification-driven flow, candidate zero-account journey, admin onboarding (target: signup to first job in < 30 min). Notification priority matrix (5 personas × 15 event types). Dashboard widget specs by persona. Role-based navigation showing progressive disclosure per role.

**Key design insight:** Hiring managers and interviewers don't live in the ATS — the ATS must come to THEM via notifications. Candidates never enter the internal system — they get a separate portal with stateless auth.

---

### 2026-03-11 — [D00] Competitive Analysis & Market Positioning — complete first draft

**Scope:** 17 ATS products analyzed across 3 segments: modern (Ashby, Lever, Greenhouse, Teamtailor, Workable), legacy (Taleo, iCIMS, Workday, SAP SuccessFactors, BambooHR), mid-market/niche (JazzHR, Breezy HR, Recruitee, SmartRecruiters, Zoho Recruit, Bullhorn).

**Research method:** 5 parallel web research agents across G2, Capterra, TrustRadius, Trustpilot, Reddit, industry reports. Real user complaints, not marketing copy.

**Key findings:**
- 20 pain points mapped to our architecture (PA-01 through PA-20). Every major competitor weakness traces to a specific doc, ADR, or principle in our system.
- 7 gaps identified (G-01 through G-07): career site builder (Teamtailor's moat), sourcing database (Workable's 260M), AI notetaker (Ashby), hiring predictions (Greenhouse), AI job descriptions, video interviewing, fraud detection. All flagged as post-MVP.
- Pricing validated: our Starter ($29) undercuts all non-free competitors. Enterprise ($499/mo) is 1/10th the cost of Greenhouse/Ashby equivalent.
- 4 highest-value migration targets identified: BambooHR graduates, Greenhouse refugees, Workday supplementers, legacy escapees.
- Positioning statement, battlecards (vs Greenhouse, Ashby, Workday, BambooHR), and landing page messaging framework.

**What's next:** D25 (User Personas) → D22 (Security Threat Model) → D23 (Data Migration) → D24 (Testing Strategy) → D26 (Error Taxonomy).

---

### 2026-03-10 — [META] Documentation gap analysis — 6 new docs + deferred registry

**Gap analysis:** Audited all pre-code documentation needs for a best-in-class enterprise SaaS. Identified 6 missing documents and 6 intentionally deferred items.

**New documents (Phase 4 — blocks infrastructure setup):**
- D00: Competitive Analysis & Market Positioning (research-heavy)
- D22: Security Threat Model (STRIDE, PII data flows)
- D23: Data Migration & Import Strategy (competitor migration paths)
- D24: Consolidated Testing Strategy (coverage, fixtures, mocks)
- D25: User Personas & Journey Maps (5 personas, end-to-end flows)
- D26: Error Taxonomy & Recovery Patterns (consistent error codes)

**Deferred documents (trigger-based, not pre-code):**
Email Template Visual Design, API SDK/Developer Portal, Accessibility Testing Plan, Environment Setup Guide, Third-Party API Contract Validation, Pricing Validation. Each has a documented trigger in INDEX.md — none are forgotten, all are scheduled.

**Execution order:** D00 + D25 (Phase A) → D22 + D23 (Phase B) → D24 + D26 (Phase C).

---

### 2026-03-10 — [AUDIT] Minor audit items resolved (m-1, m-2, m-3)

Closed the 3 minor items originally deferred from the pre-code audit:

- **m-1:** Documented `is_active` vs `deleted_at` semantic distinction on `organization_members` (01-core-tenancy.md). `is_active = FALSE` = suspended (reversible toggle, history preserved). `deleted_at` = soft-deleted (full removal per ADR-006).
- **m-2:** Added `CustomFieldRenderer` component spec to D05 (DESIGN-SYSTEM.md §6.2). Maps all 7 field types to display/edit components with validation strategy.
- **m-3:** Documented candidate dedup strategy in 03-candidates-crm.md. MVP: exact email match within org (unique index). Post-MVP: fuzzy matching (name similarity, phone, LinkedIn) with manual merge UI.

**All audit findings (critical + major + minor) now resolved. Zero open items.**

---

### 2026-03-10 — [AUDIT] Pre-code cross-document consistency audit — all findings resolved

**Audit scope:** All 21 documentation specs (D01–D21) audited for cross-document consistency, security gaps, and implementation ambiguities before code phase begins.

**Initial findings:** 3 critical, 8 major, 3 minor. After deep verification, 5 were false positives (already addressed in docs). 5 real issues fixed:

**Critical (fixed):**
- **C-1:** AI metrics conflict between D02 (operations/day) and D03 (credits/month) — clarified as two-layer enforcement: rate limit (daily burst cap) vs billing quota (monthly credits). Added clarifying notes to both D02 §6 and D03 §2.
- **C-2/C-3:** 8 RLS INSERT policies missing `organization_id = current_user_org_id()` check — fixed in D01 schema files `05-interviews-scorecards.md` (interviews, scorecard_templates, scorecard_categories, scorecard_attributes, scorecard_submissions) and `06-offers.md` (offer_templates, offers, offer_approvals). Multi-org scenario (ADR-005) could allow cross-org inserts without this check.

**Major (fixed):**
- **M-1:** Offer-to-pipeline mapping unclear — added design note to `06-offers.md`: offer creation is manual, not auto-triggered on pipeline stage entry.
- **M-3:** Inngest function ID naming inconsistent (hyphens vs slashes) — standardized all 20+ function IDs to `module/action` format across WORKFLOW.md, INTERVIEW-SCHEDULING.md, NOTIFICATIONS.md. Added global naming convention to D12 §11.
- **M-4:** Missing `workflow/application-withdrawn` event — added §8.3 withdrawal handler to WORKFLOW.md (voids pending offers, notifies team, syncs search). Updated CANDIDATE-PORTAL.md to route through workflow engine instead of direct notification dispatch.

**False positives (already in docs):**
- M-2: Event ordering documented in WORKFLOW.md
- M-5: Offer lifecycle events in NOTIFICATIONS.md + OFFERS.md
- M-6: Webhook re-enablement in NOTIFICATIONS.md
- M-7: Cron timezone specified as UTC
- M-8: Realtime channel registry in REALTIME.md

**Minor (deferred to code phase):**
- `is_active` vs `deleted_at` on org_members — document at implementation
- Custom field rendering component — D05 gap, non-blocking
- Candidate dedup fuzzy matching — already flagged post-MVP

**Verdict:** All critical and major findings resolved. Documentation is audit-clean for code phase.

---

### 2026-03-10 — [D05] Amend Design System: light theme primary, dark mode post-MVP

**Changed:** Design principle #5 from "Dark mode from day one" to "Light theme is primary."

**Rationale:** Corporate enterprise product used by recruiters during business hours in lit offices. Light theme is the expected experience. Dark mode adds design surface area (every component × 2 color sets) and testing scope without MVP value. Aligns with SaaS UI conventions (blue primaries, light backgrounds #fcfcfc–#fefefe).

**What changed in D05:**
- Principle #5 rewritten
- §2.3 Dark Mode tokens preserved as `<details>` collapsed reference (post-MVP)
- §7.1 dark contrast rows marked "(post-MVP)"
- `next-themes` infrastructure still included (2KB, enables future addition)

**Impact on downstream docs:**
- D09 (Candidate Portal): career page branding already light-based — no change needed
- D21 (i18n): RTL support unaffected by theme — no change needed
- Playbook JOURNEY-LOG: "dark mode from day one" pattern should be amended to "light-first, dark when demanded"

---

### 2026-03-10 — [PLAYBOOK] Bulk extraction: 12 ATS patterns → SaaS Accelerator Playbook

**Extracted to:** `/Users/senthilbabu/Downloads/SaaS-Playbook/`

**12 JOURNEY-LOG entries added** (abstracted from D01-D13 [PLAYBOOK] markers):
- D01: Soft-delete everything (P-17), crypto-shredding, audit triggers
- D02: Dual API layer (Server Actions + Route Handlers), idempotency keys
- D03: Billing truth in payment provider (P-16), plan-tier feature gating
- D05: HSL tokens, warm-white backgrounds, data-dense 14px dashboards
- D06: Approval chains with auto-skip, state machines with terminal states
- D07: Blind review, snapshot-on-assign, weighted scoring
- D08: Notification routing with smart defaults, webhook health (P-20), digest batching
- D09: External user auth via stateless tokens (P-19), adaptive polling
- D10: Two-engine search (full-text + semantic), composite scoring
- D11: Multi-tenant real-time channel naming, optimistic UI dedup, connection hygiene
- D12: Automation loop prevention (P-18), SLA via delayed events
- D13: Consent versioning (P-21), DSAR automation, DEI cohort suppression

**6 new principles added** (P-16 through P-21):
- P-16: Billing truth lives in payment provider
- P-17: Soft-delete everything, hard-delete nothing
- P-18: Automation loops are serverless fork bombs
- P-19: External users need separate auth
- P-20: Every webhook needs a health circuit breaker
- P-21: Consent is versioned

**6 battle-test entries added** for 01-architect prompts validated against ATS:
- database-schema-design.md — Passed with refinements
- auth-strategy.md — Passed with refinements
- api-contract-design.md — Passed with refinements
- multi-tenancy-design.md — Passed
- background-jobs-design.md — Passed with refinements
- documentation-system.md — Passed

**Next:** Playbook prompt refinements based on battle-test findings. Create new prompts for phases 02-04.

---

### 2026-03-10 — [D19, D20, D21] Phase 3 complete — Onboarding, White-Label, i18n

**Files created:**
- `docs/modules/ONBOARDING.md` (D19) — 9 sections: signup flow, 5-step onboarding wizard with skip/resume, CSV import (candidates + jobs, batched processing via Inngest), ATS-to-ATS migration via Merge.dev with admin stage mapping UI, demo data seeding (50 candidates, 5 jobs, 100 applications) with cleanup, 8 API endpoints, 3 Inngest functions.
- `docs/modules/WHITE-LABEL.md` (D20) — 8 sections: custom domain (DNS CNAME + TXT verification, Vercel auto-SSL), custom email sender domain (SPF/DKIM/DMARC via Resend API), extended branding_config for Enterprise (hide badge, custom footer, email logo), proxy.ts routing for custom domains, 6 API endpoints, 2 Inngest functions.
- `docs/modules/I18N.md` (D21) — 9 sections: next-intl configuration, translation file structure (9 namespaces), locale-aware formatting (dates, currencies, relative time via Intl API), RTL support (CSS logical properties), career page localization, email localization (Handlebars variables + locale strings), candidate locale detection (browser → org default → en-US), plan gating (Pro+ for additional languages, Enterprise for RTL).

**Files updated:**
- `docs/INDEX.md` — D19, D20, D21 status: `⬜ Not Started` → `✅ Complete (Review)`.

**All 21 documents complete. Pre-build documentation phase finished.**

**Status:** All Review.

**Next:** `supabase init` + `supabase db reset` validation for D01. Then code phase begins.

---

### 2026-03-10 — [D16] Performance & Caching — complete first draft

**Files created:**
- `docs/PERFORMANCE.md` — 10 sections: performance targets (9 operation types), Redis caching strategy (cache-aside with invalidation, PII never cached), database connection pooling (transaction mode), query optimization rules, ISR for career pages with on-demand revalidation, Inngest concurrency limits (6 functions), Realtime event batching, k6 load testing (6 scenarios), frontend performance budget (LCP < 2.5s, JS < 200KB), bundle analysis.

**Status:** Review.

---

### 2026-03-10 — [D17] Analytics & Reporting — complete first draft

**Files created:**
- `docs/modules/ANALYTICS.md` — 11 sections: 17 key metrics (pipeline + volume + source), materialized views (daily pipeline stats + monthly hiring summary) with daily Inngest refresh, time-in-stage window functions, pipeline funnel aggregation, DEI reporting consuming D13 cohort suppression rules, 7 API endpoints, 2 Inngest functions, 9 dashboard widgets, plan gating.

**Status:** Review.

---

### 2026-03-10 — [D18] Security Runbooks — complete first draft

**Files created:**
- `docs/runbooks/SECURITY-RUNBOOKS.md` — 6 runbooks: R-01 (service outage), R-02 (database restoration with PITR), R-03 (security incident with GDPR notification), R-04 (secret rotation for 7 services), R-05 (deployment rollback), R-06 (third-party failure degradation matrix). Escalation path (L1-L4). Post-incident review template.

**Files updated:**
- `docs/INDEX.md` — D16, D17, D18 status: `⬜ Not Started` → `✅ Complete (Review)`. D18 path corrected from `docs/runbooks/` to `docs/runbooks/SECURITY-RUNBOOKS.md`.

**Phase 2 complete.**

**Status:** Review.

**Next:** Phase 3 (D19 Onboarding, D20 White-Label, D21 i18n) — post-MVP docs.

---

### 2026-03-10 — [D14] Observability & Monitoring — complete first draft

**Files created:**
- `docs/OBSERVABILITY.md` — 12 sections: Pino structured logging with PII redaction, Sentry error tracking (client + server + Inngest), 3 health endpoints, 9 SLOs with error budget, 4-severity alerting, application + business metrics, request ID tracing, Inngest dead-letter handling, admin system dashboard.

**Files updated:**
- `docs/INDEX.md` — D14 status: `⬜ Not Started` → `✅ Complete (Review)`.

**Key decisions:**
- Three-pillar approach: logs (Pino), errors (Sentry), metrics (Vercel + Redis counters). No Prometheus/Grafana in MVP.
- PII never in logs: Pino `redact` strips auth headers, tokens, candidate email/phone. Sentry session replay disabled.
- SLOs: 99.9% availability, p95 < 500ms, error rate < 0.1%, Inngest success > 99%.
- Alerting via Inngest cron (5-min checks) → Slack webhook. P1 alerts also go to PagerDuty.
- Health endpoints: `/api/health` (shallow, public), `/api/health/ready` (deep, public), `/api/v1/system/status` (admin-only).

**Status:** Review.

---

### 2026-03-10 — [D15] CI/CD Pipeline — complete first draft

**Files created:**
- `docs/CI-CD.md` — 8 sections: 4-environment strategy, GitHub Actions workflows (3: PR checks, staging deploy, production deploy), Supabase migration strategy, preview environments, Dependabot config, release management, rollback procedures, CI security.

**Files updated:**
- `docs/INDEX.md` — D15 status: `⬜ Not Started` → `✅ Complete (Review)`.

**Key decisions:**
- Migrations must be backward-compatible (zero-downtime deploys). Breaking changes use 3-step protocol.
- Production deploys require GitHub Environment approval.
- Rollback: Vercel instant rollback (< 30s) for app, reverse migration for DB, PITR for data corruption.
- No Docker in CI — Vercel builds natively. Supabase CLI Docker for local only.
- Dependabot weekly with grouped PRs (production vs dev dependencies).

**Status:** Review.

**Next:** D16 (Performance) → D17 (Analytics) → D18 (Runbooks).

---

### 2026-03-10 — [D13] GDPR & Compliance — complete first draft

**Files created:**
- `docs/COMPLIANCE.md` — 13 sections (450+ lines): regulatory landscape (GDPR/CCPA/PIPEDA/EEO), DSAR flow (5 request types with automated data assembly), data retention policies (24mo rejected, 12mo withdrawn) with weekly Inngest cron, consent management with versioning + jurisdiction-aware text + withdrawal flow, DEI data aggregation with cohort suppression rules (G-019), audit log compliance queries + export, SOC 2 Type II control mapping (14 controls), data region awareness, legal hold override, EEO-1 reporting, 10 API endpoints, 4 Inngest functions.

**Files updated:**
- `docs/INDEX.md` — D13 status: `⬜ Not Started` → `✅ Complete (Review)`.
- `docs/GAPS.md` — G-019 resolved (DEI aggregation rules). Re-tagged from D17 to D13 (compliance owns aggregation rules, analytics just consumes them).

**Key decisions:**
- GDPR as baseline: most restrictive regulation applied globally, jurisdiction variations via config.
- DSAR export assembles data from all 11 candidate-related tables into JSON. Async via Inngest, signed URL delivery.
- Retention cron runs weekly (Sunday 3am UTC). Rejected=24mo, withdrawn=12mo. Enterprise can customize.
- DEI cohort suppression: minimum 5 candidates per group, max 2 cross-tab dimensions, cascade suppression.
- Consent versioning via `consent_version` date string matching privacy policy version. No re-consent on policy update unless purposes change.
- Legal hold: admin flag on application prevents erasure execution. Candidate notified of delay.
- Data region is informational in MVP (single Supabase project). Field enables future multi-region.
- G-019 re-tagged from D17 to D13: aggregation rules are a compliance concern, not analytics.

**Post-build audit:** 7/7 categories PASS.

**Contracts exported:**
- D17 (Analytics): DEI aggregation rules defined here, D17 consumes them for reporting dashboards.
- D18 (Security Runbooks): SOC 2 control mapping provides framework for incident response procedures.

**[PLAYBOOK]** Extractable patterns: DSAR automation flow, retention cron with SQL helper, DEI cohort suppression algorithm, consent versioning, SOC 2 control mapping template, jurisdiction-aware consent text.

**Status:** Review.

**Next:** D14 (Observability) → D15 (CI/CD) → D16 (Performance) → D17 (Analytics) → D18 (Runbooks).

---

### 2026-03-10 — [D09] Candidate Portal — complete first draft

**Files created:**
- `docs/modules/CANDIDATE-PORTAL.md` — 16 sections (530+ lines): magic link authentication (stateless signed JWT with 3 scopes: status/schedule/offer), career page with org branding + system defaults, Typesense-powered public job search with scoped API keys, application form with resume upload + candidate dedup + GDPR consent, status tracker with adaptive polling (30s→60s backoff), interview self-scheduling UI (TimeSlotPicker, Nylas free/busy, 30-min slots), candidate email delivery (5 templates with scoped magic links), rate limiting (7 endpoint-specific limits), GDPR erasure with 48-hour cooling period, 12 API endpoints, 3 Inngest functions.

**Files updated:**
- `docs/INDEX.md` — D09 status: `⬜ Not Started` → `✅ Complete (Review)`.
- `docs/GAPS.md` — G-013 resolved (rate limiting). G-020 resolved (branding defaults). G-023 resolved (self-scheduling UI). G-026 resolved (candidate email delivery). G-029 resolved (Typesense scoped keys). G-030 resolved (polling strategy).

**Key decisions:**
- Magic links use separate JWT secret from Supabase Auth — candidates never get Supabase user accounts. Stateless verification per request.
- Token scopes: `status` (30d), `schedule` (7d), `offer` (30d). Scope limits what the token can access.
- Branding defaults: system foreground color, Inter font, default logo. `resolveTheme()` merges org config with defaults.
- Typesense scoped API keys: 90-day expiry, daily Inngest cron for rotation, stored in `organizations.metadata`.
- Polling: adaptive 30s→60s (exponential backoff on no change, reset on change). No WebSocket for candidates.
- Application submit rate: 5 per hour per IP+email. Job listing: 60/min per IP. Search: 120/min per IP.
- GDPR erasure: 48-hour cooling period via Inngest delayed event. Candidate can cancel during window.
- Self-scheduling: Growth+ plans only. First-come-first-served slot conflicts with auto-refresh.

**Post-build audit:** 7/7 categories PASS. 6 gaps resolved (G-013, G-020, G-023, G-026, G-029, G-030).

**Contracts exported:**
- D20 (White-Label): custom domain routing, email sender identity, branding_config extension.

**[PLAYBOOK]** Extractable patterns: stateless magic link auth for external users, adaptive polling with backoff, branding theming with fallback defaults, Typesense scoped API key rotation, GDPR erasure with cooling period.

**Status:** Review.

**Next:** Phase 1 complete. Phase 2 starts with D13 (GDPR & Compliance).

---

### 2026-03-10 — [D12] Workflow & State Machine — complete first draft

**Files created:**
- `docs/modules/WORKFLOW.md` — 15 sections (470+ lines): application status state machine (active/hired/rejected/withdrawn), stage transition validation (forward/backward/skip), `auto_actions` JSONB schema (6 action types: send_email, add_to_pool, notify_team, set_sla, webhook, auto_advance), Zod validation, auto-advance on interview completion (G-025), talent pool automation via conditional pool membership (G-018), SLA enforcement with delayed Inngest events, workflow execution engine (stage-changed + rejection handlers), bulk operations (50 limit), rejection flow with pool automation, plan gating (auto-advance Pro+, webhook Enterprise only).

**Files updated:**
- `docs/INDEX.md` — D12 status: `⬜ Not Started` → `✅ Complete (Review)`. Path corrected from `WORKFLOW-ENGINE.md` to `WORKFLOW.md`.
- `docs/GAPS.md` — G-018 resolved (talent pool auto-membership via `add_to_pool` action). G-025 resolved (auto-advance via Inngest function with loop prevention).

**Key decisions:**
- `auto_actions` is an array of typed actions (discriminated union), not a flat config object. Max 10 actions per stage. Validated at save time via Zod, not at runtime.
- Auto-advance uses `interview/scorecard-submitted` event as trigger, checks all interviews + scorecards, then moves candidate. Infinite loop prevention: auto-advance events don't trigger subsequent auto-advance actions.
- Talent pool automation lives in `auto_actions` — no separate "pool rules" table. Keeps all workflow config in one place.
- SLA timers use Inngest delayed events. No explicit cancellation — idempotent check at execution time (re-read current stage).
- Bulk operations cap at 50 per request. Sequential processing (not parallel) to maintain audit trail ordering.
- System user UUID (`00000000-...`) for auto-advance `transitioned_by` — sentinel value, not a real user.

**Post-build audit:** 7/7 categories PASS. No fixes needed.

**Contracts exported:**
- D09 (Candidate Portal): application status changes trigger notification events; candidate sees status via polling.
- D16 (Performance): bulk operations may spike DB writes; connection pooling must handle 50 sequential updates.
- D17 (Analytics): pipeline throughput metrics derive from `application_stage_history`; SLA breach counts from `notification/dispatch` events.

**[PLAYBOOK]** Extractable patterns: `auto_actions` JSONB schema for configurable workflow automation, auto-advance with loop prevention, SLA via delayed events (no timer table), talent pool automation as stage action.

**Status:** Review.

**Next:** D09 (Candidate Portal) — last Phase 1 doc. 6 gaps to resolve (G-013, G-020, G-023, G-026, G-029, G-030).

---

### 2026-03-10 — [D11] Real-Time Features — complete first draft

**Files created:**
- `docs/modules/REALTIME.md` — 13 sections (394 lines): Supabase Realtime architecture using 3 primitives (Postgres Changes, Broadcast, Presence), channel naming convention (`{scope}:{org_id}:{resource}[:{id}]`), 7 subscribed tables with event filters, notification broadcast (D08 integration), page-level + team presence, optimistic UI with dedup, connection management + reconnection, last-write-wins conflict resolution, ChannelManager cleanup utility.

**Files updated:**
- `docs/INDEX.md` — D11 status: `⬜ Not Started` → `✅ Complete (Review)`.
- `docs/GAPS.md` — G-027 resolved. G-030 added. G-018 re-tagged from "D11 (Talent Pools)" → "D12 (Workflow)". G-019 re-tagged from "D12 (Analytics)" → "D17 (Analytics)".

**Key decisions:**
- Channel naming: `{scope}:{org_id}:{resource}[:{id}]`. org_id always present for tenant isolation. Derived from JWT, never client input.
- 7 tables subscribed (applications, stage_history, interviews, scorecards, offers, notes, candidates). 30+ tables intentionally excluded — low frequency or derived from parent events.
- No `notifications` table: broadcast-only delivery aligns with D08's ephemeral notification design.
- Last-write-wins conflict resolution. No CRDTs or OT — overkill for ATS where concurrent edits on same entity are rare.
- Presence limits: 100 users/channel (Supabase limit), fallback to polling for large orgs.
- High-volume batching: `requestAnimationFrame` + 100ms accumulation window for bulk operations.

**Post-build audit:** 7/7 categories PASS. No fixes needed. No [VERIFY] markers (Supabase Realtime is core platform).

**Contracts exported:**
- D09 (Candidate Portal): candidates use polling, not Realtime (no persistent WebSocket). D09 must define polling interval.
- D16 (Performance): Realtime connection pooling targets, max 10 channels per client.

**[PLAYBOOK]** Extractable patterns: channel naming convention for multi-tenant Realtime, optimistic UI with Realtime dedup, presence with graceful degradation, ChannelManager for SPA route cleanup.

**Status:** Review.

**Next:** D12 (Workflow) then D09 (Candidate Portal) — completes Phase 1.

---

### 2026-03-10 — [D10] Search Architecture — complete first draft

**Files created:**
- `docs/modules/SEARCH.md` — 12 sections (495 lines): two-engine design (Typesense full-text + pgvector semantic), Typesense collection schemas (candidates + jobs), Postgres→Typesense sync pipeline via Inngest, AI matching with composite scoring (semantic + skill overlap), embedding lifecycle (generate/invalidate/re-embed on content change), differentiated AI credit weights per action, full-reindex, sync health monitoring, 6 API endpoints with Zod schemas, 4 Inngest functions, 6 UI components.

**Files updated:**
- `docs/INDEX.md` — D10 status: `⬜ Not Started` → `✅ Complete (Review)`.
- `docs/GAPS.md` — G-016 and G-017 resolved. G-028, G-029 added. V-014, V-015 added.

**Key decisions:**
- Stale embeddings: re-embed on content change (resume_text, skills, title, company). No TTL-based expiry. If no credits, keep old embedding (stale but functional).
- AI credit weights: differentiated per action — `resume_parse`=2, `candidate_match`=1, `job_description_generate`=3, `email_draft`=1, `feedback_summarize`=1. New `consume_ai_credits(p_org_id, p_amount)` SQL function.
- Composite matching score: 60% semantic (cosine) + 40% skill overlap.
- Typesense tenant isolation: `organization_id` filter applied server-side on every query.
- Typesense fallback: if down, degrade to PostgreSQL `pg_trgm`. Inngest events queue + replay.

**Post-build audit:** 7/7 categories PASS. No fixes needed. 2 strategic [VERIFY] markers (V-014, V-015).

**Contracts exported:**
- D09 (Candidate Portal): public job search via Typesense scoped API key per organization.
- D16 (Performance): Typesense search caching + pgvector query optimization targets.
- D17 (Analytics): search usage metrics (queries/day, AI match requests, credit consumption by action).
- D03 (Billing): `consume_ai_credits()` function with variable weights — adopt at code time (G-028).

**[PLAYBOOK]** Extractable patterns: two-engine search (full-text + vector), event-driven sync pipeline, composite scoring (semantic + structured), embedding lifecycle with credit-gated re-generation, tenant isolation at search layer.

**Status:** Review.

**Next:** D09, D11, D12 — remaining Phase 1.

---

### 2026-03-10 — [D08] Notification System — complete first draft

**Files created:**
- `docs/modules/NOTIFICATIONS.md` — 11 sections (417 lines): unified notification dispatch (in-app + email + webhook), event catalog (22 event types), Supabase Realtime for in-app, React Email + Resend for transactional email, Handlebars-style template variables, @mention notification via Inngest, webhook outbound with HMAC signing + health management + auto-disable, notification preferences per user per event, digest mode, 17 API endpoints with Zod schemas, 7 Inngest functions, 7 UI components.

**Files updated:**
- `docs/INDEX.md` — D08 status: `⬜ Not Started` → `✅ Complete (Review)`.
- `docs/GAPS.md` — G-014, G-015, G-021, G-024 resolved. G-026, G-027 added. V-013 added. Fixed D08/D09 mislabeling (GAPS had Notifications as D09 and Candidate Portal as D08 — corrected to match INDEX.md).
- `docs/modules/INTERVIEW-SCHEDULING.md` — Fixed D08/D09 references in "Depended on by" front matter.
- `docs/DEVLOG.md` — Fixed D07 contracts exported section (D08/D09 swap) and "Next" line.

**Key decisions:**
- No dedicated `notifications` table — in-app notifications via Supabase Realtime broadcast (ephemeral), persistent history derived from source tables (audit_logs, notes, scorecards). Avoids data duplication.
- @Mention notifications via Inngest event (not Realtime, not direct insert). Reason: mentions need email delivery for offline users; Inngest handles retries + preference routing.
- Email template syntax: Handlebars-style `{{variable.path}}` with strict allowlist from `merge_fields` column. No Liquid/custom. Consistent for future D20 i18n.
- Webhook re-enablement: manual only. Warning at 5 failures, auto-disable at 10, admin notification both times. No auto-retry — failed endpoints need human investigation.
- Self-notification suppression: users never notified of their own actions (`actor_id !== recipient_id`).
- Digest mode: daily batched email at 8 AM UTC for users who opt in. In-app stays immediate.

**Post-build audit:** 7/7 categories PASS. No fixes needed. 1 strategic [VERIFY] marker for Resend API (V-013).

**Contracts exported:**
- D09 (Candidate Portal): candidate-facing email delivery (5 event types) defined in D08 §4.3 but delivery via D09 candidate auth context.
- D11 (Real-Time): Supabase Realtime channel naming convention for org-scoped + user-filtered notification broadcast.
- D12 (Workflow): `application.stage_changed` event available for notification + webhook dispatch on stage transitions.
- D20 (i18n): template variable syntax is `{{variable.path}}` — i18n must use same syntax for translated templates.

**[PLAYBOOK]** Extractable patterns: preference-aware notification routing (in-app/email/both/none), webhook outbound with health tracking + auto-disable, ephemeral in-app via Realtime (no notification table), Handlebars merge fields with allowlist, digest batching via cron.

**Status:** Review.

**Next:** D10 (Search Architecture) or D09 (Candidate Portal) — per user direction.

---

### 2026-03-10 — [META] Fix D08/D09 doc number mislabeling in GAPS.md

**Files updated:**
- `docs/GAPS.md` — GAPS.md had Notifications labeled as D09 and Candidate Portal as D08, opposite to INDEX.md. Corrected: D08 = Notifications, D09 = Candidate Portal. Affected gaps: G-013, G-014, G-015, G-020, G-021, G-023, G-024.
- `docs/modules/INTERVIEW-SCHEDULING.md` — "Depended on by" front matter corrected.
- `docs/DEVLOG.md` — D07 "Contracts exported" and "Next" corrected.

---

### 2026-03-10 — [D07] Interview Scheduling & Scorecards — complete first draft

**Files created:**
- `docs/modules/INTERVIEW-SCHEDULING.md` — 11 sections (461 lines): 5-state interview machine (scheduled → confirmed → completed, plus cancelled/no_show), manual + panel + self-scheduling, Nylas calendar two-way sync, scorecard templates with snapshot-on-assign versioning, blind review (auto-reveal after own submission), AI scorecard summarization (Pro+), weighted score aggregation, feedback deadline reminders, 18 API endpoints with Zod schemas, 7 Inngest functions, 8 UI components.

**Files updated:**
- `docs/INDEX.md` — D07 status: `⬜ Not Started` → `✅ Complete (Review)`.
- `docs/GAPS.md` — G-011 and G-012 resolved. G-023, G-024, G-025 added. V-011, V-012 added.

**Key decisions:**
- Blind review reveal: auto-reveal after own submission (no manual button, no wait-for-all). Prevents bias while enabling collaboration. RLS-enforced at DB.
- Template versioning: snapshot-on-assign via D01 append-only design. No versioning table. Old attributes soft-deleted, new ones created. Existing submissions always reference valid (soft-deleted) attributes.
- Panel interviews: modeled as N individual `interviews` rows with matching `scheduled_at` + `interview_type = 'panel'`. No separate panel table.
- Self-scheduling: candidate selects from Nylas free/busy slots, interview created as `confirmed` (skips `scheduled`). 3 reschedule limit, 7-day link expiry.
- Feedback deadlines: advisory, not hard-enforced. Late submissions always accepted. Rationale: better late feedback than none.
- Candidate signs after expiry of self-scheduling link: slot no longer available, must request new link.

**Post-build audit:** 7/7 categories PASS. No fixes needed. 2 strategic [VERIFY] markers for Nylas API (V-011, V-012).

**Contracts exported:**
- D09 (Candidate Portal): self-scheduling UI — time slot picker, confirmation flow, 3-reschedule limit, link expiry display.
- D08 (Notifications): 4 interview email triggers — scheduled, cancelled, feedback reminder, scorecard submitted.
- D12 (Workflow): optional auto-advance when all interviews completed + all scorecards submitted.
- D17 (Analytics): scorecard aggregation data (weighted scores, recommendation distribution, time-to-feedback).
- D10 (Search & AI): AI scorecard summarization consumes 1 credit with `action = 'feedback_summarize'`.

**[PLAYBOOK]** Extractable patterns: blind review with auto-reveal RLS, snapshot-on-assign versioning (no version table), panel-as-individual-rows modeling, self-scheduling with calendar free/busy, weighted multi-criteria scoring aggregation.

**Status:** Review.

**Next:** D08 (Notification System) — per production order.

---

### 2026-03-10 — [D06] Offer Management — complete first draft

**Files created:**
- `docs/modules/OFFERS.md` — 11 sections (302 lines): 8-state machine (draft → pending_approval → approved → sent → signed/declined/expired/withdrawn), sequential approval chain with auto-skip for departed approvers, Dropbox Sign e-sign integration with Inngest retry + manual PDF fallback, offer templates with compensation editor, hourly expiry cron, 14 API endpoints with Zod schemas, 6 Inngest functions, 7 UI components.

**Files updated:**
- `docs/INDEX.md` — D06 status: `⬜ Not Started` → `✅ Complete (Review)`. Path corrected from `OFFER-WORKFLOW.md` to `OFFERS.md`.
- `docs/GAPS.md` — G-010 and G-022 resolved.

**Key decisions:**
- Approver removed mid-chain → auto-skip (not block). Logged in audit. Rationale: blocking offers on departed employees is worse than auto-advancing.
- E-sign unavailability → Inngest retries, offer stays `approved` (not stuck in `sent`). Manual PDF fallback available.
- Candidate signs after expiry → accept signature. `signed` trumps `expired`. Expiry cron only targets `status = 'sent'`.
- Two offers per application allowed but UI warns. Only one can be in `sent`/`signed` state.
- Rejection resets entire chain to `draft` — recruiter edits and resubmits.

**Post-build audit:** 7/7 categories PASS. No fixes needed. 2 strategic [VERIFY] markers for Dropbox Sign API (expected).

**Contracts exported:**
- D08 (Candidate Portal): offer acceptance is via Dropbox Sign signing link, not ATS UI. Candidate never sees compensation in ATS.
- D09 (Communications): 4 email triggers — approval request, offer sent to candidate, signed notification, declined notification.
- D07 (Interviews): no direct dependency, but interviews must be `completed` before offer stage (pipeline stage ordering).
- D19 (Migration): offer import format matches `OfferCompensation` interface + 8 status values.

**[PLAYBOOK]** Extractable patterns: multi-step approval chain with auto-skip, e-sign integration with retry + manual fallback, state machine with terminal states, cron-based expiry detection.

**Status:** Review.

**Next:** D07 (Interview & Scorecard Module).

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
- D19 (Migration): new organizations default to `starter` plan; `ai_credits_limit = 0` (plan setup sets real value)

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
- Rate limit tiers match D01 plan_tier CHECK constraint: starter (500/min), growth (2,000/min), pro (5,000/min), enterprise (10,000/min)
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
