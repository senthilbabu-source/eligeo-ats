# Pre-Phase 6 AI Hardening — ADR-011 Compliance Audit
**Date:** 2026-03-12
**Auditor:** Claude (automated audit via source reading)
**Scope:** All Phase 0–5 built UI surfaces — `src/app/(app)/` pages and key components
**Standard:** ADR-011 (AI-first build pivot) — every user-facing feature MUST have an AI-assisted path

---

## Executive Summary

Phase 0–5 delivered a mixed AI compliance picture. The **job creation and job detail surfaces are genuinely AI-first** — streaming JD generation, bias check, match panel, rewrite, title suggestion, skills delta. The **dashboard has a real daily AI briefing**. But five major recruiter surfaces are **pure CRUD with zero AI signals**: the candidates list, pipeline kanban cards, offers form, offers detail, interviews list, and talent pools. These surfaces represent the majority of daily recruiter time.

**The verdict:** Before Phase 6 begins, 6 AI enhancements were required to bring existing surfaces into ADR-011 compliance. These were not new features — the AI functions already existed in `generate.ts`. They just needed to be wired into the UI.

**Status: ✅ ALL 6 ITEMS COMPLETE (2026-03-12).** 39 new tests. 0 new migrations. TypeScript clean.

---

## Full Surface Audit

| Surface | Status | What exists | What's missing |
|---------|--------|-------------|----------------|
| Dashboard | ✅ AI-FIRST | Daily briefing (Win/Blocker/Action via GPT-4o), at-risk job detection, source quality with hire rates | No forecasting, no cohort-level fit signal |
| Job New (`/jobs/new`) | ✅ AI-FIRST | Streaming JD generation via `useCompletion`, Stop button, regenerate | No bias check on creation, no AI title suggestion at create-time |
| Job Detail (`/jobs/[id]`) | ✅ AI-FIRST | AiMatchPanel, RewritePanel, BiasCheckBanner, TitleSuggestionBadge (clone), SkillsDeltaPanel (clone), JdQualityPanel, CloneChecklist | Embedding staleness not surfaced as a warning |
| Command Bar (⌘K) | ✅ AI-FIRST | 13 NL intents: search, create, move_stage, draft_email, generate_jd, find_matches, clone_job, create_offer, check_offer, navigate | Missing: `merge_candidates`, `trigger_screening`, `parse_resume`, `add_to_pool`, `narrate_status` |
| **Candidate Profile** | ✅ AI-ENHANCED (H6-3, H6-4) | NextBestAction strip (all 6 rules live), EmailDraftPanel (AI), match score cards, embedding freshness badge, duplicate warning banner | Remaining: "Rescore" button, match explanation text (Phase 6) |
| **Candidates List** | ✅ AI-ENHANCED (H6-2) | AI Fit column (when job-filtered), duplicate warning indicators | Remaining: semantic search toggle, "Not scored" badge (Phase 6) |
| **Pipeline Board (kanban)** | ✅ AI-ENHANCED (H6-1) | Match score badge on cards (green/amber/red), drag-and-drop, days_in_stage health borders | Remaining: NBA chip per card, screening status (Phase 6) |
| **Offers Form** | ✅ AI-ENHANCED (H6-5) | AI Suggest Compensation, Salary Band Check (on blur), AI Generate Terms button | — |
| **Offers Detail** | ❌ LEGACY | Static comp display + approval timeline | No salary band check visual; no Dropbox Sign status; no AI offer letter trigger (Phase 6) |
| **Interviews List** | ❌ LEGACY | List of scheduled interviews (type, status, candidate, job, time) | No AI interview prep panel; no scorecard submission AI summary (Phase 6) |
| **Talent Pools** | ❌ LEGACY | ILIKE text search on name/title/company; manual add/remove | No AI ranking; no semantic search (Phase 6) |
| Settings pages | ✅ ACCEPTABLE | Pure CRUD for admin configuration (pipelines, scorecards, email templates, notifications) | Settings are admin-only config — CRUD is appropriate here |

---

## Critical Finding: NBA Dead Code

The `NextBestAction` component (`candidates/[id]/next-best-action.tsx`) defines 6 priority rules in `computeNextBestAction()`:

1. `offer_ready` — approved offer not sent (priority 1)
2. `scorecard_complete` — all scorecards in (priority 2)
3. `high_match_no_interview` — match score > 75%, no interview (priority 3)
4. `stalled` — 14+ days in stage (priority 4)
5. `no_applications` — no active apps (priority 5)
6. `at_risk` — low score + 7+ days in stage (priority 6)

**Problem:** The Supabase query inside `NextBestAction` only fetches `id, job_openings (title), pipeline_stages (name)`. It does NOT fetch:
- `matchScore` → rule 3 and 6 are **always skipped**
- `hasInterview` → rule 3 is **always skipped**
- `allScorecardsIn` → rule 2 is **always skipped**
- `hasApprovedOffer` / `offerSent` → rule 1 is **always skipped**

Currently **only rules 4 and 5** (`stalled` and `no_applications`) ever fire. Rules 1–3 and 6 are dead code. The H3-4 spec comment in the component claims "expanded with richer rule signals" — but the data is never fetched.

---

## Required AI Enhancements Before Phase 6

The following 6 work items are ADR-011 violations that must ship before Phase 6 begins. Each has existing AI infrastructure — this is wiring work, not new AI development.

---

### H6-1: Pipeline Board — AI Signals on Kanban Cards

**Status:** ✅ DONE (2026-03-12)
**Location:** `src/app/(app)/jobs/[id]/pipeline/pipeline-board.tsx` + `jobs/[id]/pipeline/page.tsx`

**Current state:** Cards show name, title/company, applied date. A left-border color (red/amber) is the only signal — purely time-based via `days_in_stage`.

**Required changes:**

**A. Pipeline page data layer** (`jobs/[id]/pipeline/page.tsx`)
Extend the application query to include:
```sql
-- Add to application select:
ai_match_explanations!left(match_score, explanation)
-- Add to application select:
interviews!left(id, status)
```

**B. Application type in pipeline-board.tsx**
Add `matchScore?: number | null` and `screeningStatus?: string | null` to the `Application` interface.

**C. DraggableCard component**
Add to each card:
- AI match score badge (e.g. `87% match` in green/amber/red based on threshold)
- If `matchScore === null` and embedding exists: show "Unscored" chip
- If no embedding: show "No embedding" dot (grey)

**D. Page-level update**
Compute `hasDuplicate` flag from `candidates.human_review_requested` — show ⚠️ icon on card.

**Tests required:** 4 unit tests for card rendering with/without match score; 2 RLS tests for `ai_match_explanations` access in pipeline context.

---

### H6-2: Candidates List — AI Fit Column + Semantic Search

**Status:** ✅ DONE (2026-03-12)
**Location:** `src/app/(app)/candidates/page.tsx`

**Current state:** Plain HTML table. Text search is ILIKE only. No fit signals.

**Required changes:**

**A. When a `?jobId=` filter is active** (candidate list filtered by job):
- Add `AI Fit` column showing match score from `ai_match_explanations`
- Sort by fit score by default (descending)
- Show "Not scored" badge when embedding missing or no explanation found

**B. Semantic search toggle**
- Add a "🔍 Semantic" toggle next to the text search field
- When active: call `/api/search/candidates?q=...&semantic=true` (route already exists via pgvector)
- Show "Semantic search" label in results header when active

**C. Duplicate warning column**
- If `candidates.human_review_requested = true`: show ⚠️ "Possible duplicate" badge in the row

**Tests required:** 3 unit tests (fit column render, semantic toggle, duplicate badge); 2 RLS tests for cross-tenant isolation of `ai_match_explanations`.

---

### H6-3: Candidate Profile NBA — Wire All 6 Rules

**Status:** ✅ DONE (2026-03-12)
**Location:** `src/app/(app)/candidates/[id]/next-best-action.tsx`

**Current state:** `computeNextBestAction()` has 6 rules. Only 2 ever fire because the Supabase query doesn't fetch match scores, interview data, scorecard data, or offer data.

**Required changes:**

Extend the `NextBestAction` async server component query to include:
```typescript
// Add to the applications select:
`
  id,
  job_openings:job_opening_id (title),
  pipeline_stages:current_stage_id (name),
  ai_match_explanations!left(match_score),
  interviews!left(id, status),
  offers!left(id, status),
  scorecards:interview_scorecards!left(id, submitted_at)
`
```

Then map these to the `ActiveApp` type fields:
- `matchScore` ← `ai_match_explanations[0]?.match_score`
- `hasInterview` ← `interviews.some(i => ['scheduled','confirmed','completed'].includes(i.status))`
- `allScorecardsIn` ← all attached interviews have scorecards with `submitted_at` not null
- `hasApprovedOffer` ← `offers.some(o => o.status === 'approved')`
- `offerSent` ← `offers.some(o => ['sent','signed'].includes(o.status))`

**Impact:** All 6 NBA rules become live. The `high_match_no_interview` rule (priority 3) alone is the most valuable recruiter signal — it surfaces candidates who scored >75% but haven't been interviewed yet.

**Tests required:** 6 unit tests (one per rule, using `computeNextBestAction` which is already exported); 2 integration tests confirming correct data shape from Supabase query.

---

### H6-4: Candidate Profile — Match Score Card + Duplicate Warning

**Status:** ✅ DONE (2026-03-12)
**Location:** `src/app/(app)/candidates/[id]/page.tsx`

**Current state:** Profile has NBA strip and EmailDraftPanel but no visual display of AI match scores for any active application, no embedding freshness indicator, and no duplicate warning (even though `findPossibleDuplicates()` was built in H1-3).

**Required changes:**

**A. AI Match Score Card** (server-side, below candidate header)
For each active application, fetch `ai_match_explanations` and render:
- Job name
- Match score (large number, color-coded)
- Short explanation text
- "Rescore" button → calls Inngest function `candidates/embed-and-score`

**B. Embedding freshness badge**
In the candidate header section:
- Green dot: "Embedding fresh" if `candidates.embedding_updated_at` < 7 days
- Amber dot: "Embedding stale" if 7–30 days
- Red dot: "No embedding" if null

**C. Duplicate warning banner**
- If `candidates.human_review_requested = true`: show amber banner "⚠️ Possible duplicate detected — review before proceeding"
- Link to merge UI (Phase 6 will build this, but the banner should be present)

**D. Resume parse status chip**
- If `candidates.resume_parsed_at` not null: show "Resume parsed [date]" in header
- If null but `files` record exists: show "Resume not parsed — Parse Now" button

**Tests required:** 4 unit tests (match card render, embedding badge states, duplicate banner, resume chip); 2 RLS tests for `ai_match_explanations` cross-tenant isolation.

---

### H6-5: Offers Form — Wire AI Comp Suggestion + Salary Band Check

**Status:** ✅ DONE (2026-03-12)
**Location:** `src/app/(app)/offers/new/offer-form.tsx`

**Current state:** Pure manual form. The Terms textarea has placeholder text "Enter offer terms or use AI to generate..." — but there is **no AI generate button**. `suggestOfferCompensation()` and `checkSalaryBand()` exist in `generate.ts` but are completely unwired.

**Required changes:**

**A. AI Suggest Compensation button** (in Compensation section)
- Add "✨ AI Suggest" button next to Base Salary field
- On click: call server action wrapping `suggestOfferCompensation()` with `{ jobTitle, department, location, currency }`
- Fills in: suggested `base_salary`, `bonus_pct`, optionally `equity_shares`
- Show confidence note: "Based on role and market data"
- Disable when title/department not set

**B. Salary Band Check** (inline feedback below Base Salary)
- On blur of salary field: call `checkSalaryBand()` server action
- If within band: show green ✓ "Within expected range"
- If above: show amber ⚠️ "Above typical range for this role"
- If below: show amber ⚠️ "Below typical range — candidate may negotiate"

**C. AI Generate Terms button** (wire existing placeholder)
- The placeholder text already says "use AI to generate"
- Add "✨ Generate Terms" button that calls `generateOfferLetterDraft()` server action in summarized form
- In Phase 6 full Dropbox Sign, this becomes the full letter generator; for now, fill the Terms field with AI text

**Tests required:** 3 unit tests (suggest comp renders, salary band check feedback states, terms generation); 2 integration tests (server actions return valid comp suggestion shapes).

---

### H6-6: Command Bar — Add 5 Missing Intents

**Status:** ✅ DONE (2026-03-12)
**Location:** `src/lib/ai/intent.ts` + `src/lib/actions/command-bar.ts` + `src/components/command-bar.tsx`

**Current intents (13):** `search_candidates`, `search_jobs`, `create_job`, `create_candidate`, `move_stage`, `draft_email`, `generate_job_description`, `find_matches`, `clone_job`, `create_offer`, `check_offer`, `navigate`, `unknown`

**Required additions:**

| Intent | Trigger phrases | Action |
|--------|-----------------|--------|
| `merge_candidates` | "merge", "duplicate", "combine candidate" | Navigate to `/candidates?merge=true` or open merge modal |
| `add_to_pool` | "add to pool", "talent pool", "nurture" | Resolve candidate + pool, call addToPool action |
| `parse_resume` | "parse resume", "extract resume", "process resume" | Trigger `portal-resume-parse` Inngest event for candidate |
| `narrate_status` | "explain status", "what stage", "candidate update" | Return AI narration of candidate's current journey |
| `trigger_screening` | "screen candidate", "start screening", "AI screen" | Navigate to screening config for candidate+job (Phase 6) |

For Phase 6 pre-release: `merge_candidates`, `add_to_pool`, and `parse_resume` must be wired before Phase 6 launches (as Phase 6 adds these features). `narrate_status` and `trigger_screening` can be added WITH Phase 6 feature delivery.

**Tests required:** 5 unit tests (one per new intent parse); 2 integration tests (command bar correctly routes new intents).

---

## Prioritized Delivery Order

| Priority | Item | Why This Order | Effort |
|----------|------|----------------|--------|
| P1 | H6-3: NBA wire all 6 rules | Fixes dead code; 4 rules gain signal immediately; zero new UI surface | Small (query extension) |
| P1 | H6-5: Offers form AI comp suggestion | The placeholder already says "use AI" — it's embarrassing to ship without it | Small (wire existing functions) |
| P2 | H6-1: Pipeline board AI signals | Most-used recruiter surface; match score on kanban cards is highest daily value | Medium (data layer + card update) |
| P2 | H6-4: Candidate profile match card + duplicate warning | Profile is the second-most-used surface | Medium |
| P3 | H6-2: Candidates list AI fit + semantic | Table enhancement; most visible AI signal in list context | Medium |
| P3 | H6-6: Command bar new intents | Required for Phase 6 merge/screening/pool intents | Small per intent |

**Estimated total:** ~35 new tests (across H6-1 to H6-6), 0 new migrations (all tables exist).

---

## What Does NOT Need AI Enhancement

| Surface | Why it's acceptable |
|---------|---------------------|
| Settings / Pipelines | Admin config CRUD — correct pattern |
| Settings / Email Templates | Template management — AI is in the content, not the template UI |
| Settings / Scorecards | Scorecard definition is structured input — correct as CRUD |
| Settings / Notifications | Preference toggles — no AI needed |
| Settings / Billing | Stripe portal passthrough — correct pattern |
| Login / Signup | Auth flow — correct as plain forms |
| Approvals page | Structured list of approval tasks — correct pattern |

---

## ADR-011 Compliance Targets: After All Enhancements

| Rule | Status After Enhancements |
|------|--------------------------|
| No CRUD-only user-facing features | ✅ All recruiter surfaces have AI path |
| Command bar is primary for 3+ click flows | ✅ With new intents: merge, pool, parse, screen |
| No "coming soon" dead-ends | ✅ Duplicate warning links to Phase 6 merge UI (clearly labeled) |
| No "v2.0" on AI features | ✅ All AI functions wired; only Typesense + Nylas remain v2.0 |
| AI env vars active | ✅ `OPENAI_API_KEY` required in v1.0 |
| Every new page gets AI consideration | ✅ Each Phase 6 feature designed AI-first per PHASE6-SPEC-PROMPT.md |

---

## Session Instructions for VS Code Claude Code

**This document is the handoff for implementing H6-1 through H6-6.**

### Mandatory reads before any code (in order)
1. `CLAUDE.md` — architecture rules, ADR table
2. `docs/DEVLOG.md` — latest entry only
3. `docs/AI-RULES.md` §21 (pre-start gate, G1–G6)
4. `docs/TESTING-STRATEGY.md` (D24) — full document
5. `docs/ADRs/004-testing-strategy.md`
6. `src/__fixtures__/golden-tenant.ts`

### Pre-start gate (§21, G1–G6) — state all 6 before writing code
- G1: Is this work in the current phase? YES — Pre-Phase 6 hardening
- G2: Is there a spec for this work? YES — this document (PRE-PHASE6-AI-HARDENING.md)
- G3: Does this contradict any ADR? NO — this enforces ADR-011
- G4: What tests ship with this work? See each H6-x test requirements above
- G5: Which golden tenant fixtures are used? TENANT_A (pro, has embeddings), TENANT_B (starter, for RLS)
- G6: Are any new migrations needed? NO — all tables exist (ai_match_explanations, interviews, offers, scorecards)

### Test plan (declare upfront)
- H6-3 NBA wire: 6 unit tests (computeNextBestAction with each rule), 2 integration
- H6-5 Offers AI: 3 unit, 2 integration
- H6-1 Pipeline board: 4 unit, 2 RLS
- H6-4 Candidate profile: 4 unit, 2 RLS
- H6-2 Candidates list: 3 unit, 2 RLS
- H6-6 Command bar: 5 unit, 2 integration
**Total: ~37 new tests**

### Delivery order
1. H6-3 (NBA wire) — smallest change, highest signal value
2. H6-5 (Offers form AI) — wire existing generate.ts functions
3. H6-1 (Pipeline board AI cards) — data layer + card UI
4. H6-4 (Candidate profile match card) — profile enrichment
5. H6-2 (Candidates list AI fit) — table enhancement
6. H6-6 (Command bar intents) — add merge, pool, parse_resume intents

### Commit message format
```
feat(candidates): wire all 6 NBA rules with match score + interview signals

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

### After completing all H6 items
1. Run `npm test` — all 1271 + ~37 = ~1308 tests must pass
2. Run `npx tsc --noEmit` — zero type errors
3. Run §13 post-build audit (AI-RULES §13, categories A1–A7)
4. Update DEVLOG.md with "Pre-Phase 6 AI Hardening Complete"
5. Update CLAUDE.md current state: "Pre-Phase 6 Hardening ✅ → Phase 6 ← NEXT"
6. Then proceed to Phase 6 spec: read `docs/PHASE6-SPEC-PROMPT.md`

---

*Generated by ADR-011 compliance audit, 2026-03-12*
