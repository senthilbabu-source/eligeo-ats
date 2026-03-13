# Eligeo — Pre-Phase 5 Hardening Plan

> **Purpose:** Resolve all confirmed regressions, data integrity risks, and AI quality gaps before entering Phase 5 (Billing).
> **Trigger:** Phase 4 regression audit (2026-03-12) + architect rebuttal review.
> **Status:** ✅ COMPLETE
> **Last updated:** 2026-03-12

---

## Context

A comprehensive regression audit was conducted after Phase 4 completion. The audit produced 20 findings. After code-level validation and architect rebuttal, the findings were triaged:

- **5 dismissed** (audit was wrong — code already handles the concern)
- **5 confirmed bugs/risks** (real code issues requiring fixes)
- **4 confirmed AI/UX gaps** (real quality gaps requiring enhancements)
- **3 rebutted dismissals** (our initial validation was incomplete — issues are real)
- **3 classified as Phase 5+ features** (not regressions, valid roadmap items)

This plan covers the 12 actionable items across 4 waves.

---

## Audit Triage Summary

### Dismissed (no action needed)

| ID | Claim | Why Dismissed |
|---|---|---|
| BUG-005 | Command bar RBAC bypass | Command bar is dispatcher-only (returns `href`/`confirmMove`). No direct mutations. `requireAuth()` enforced. |
| BUG-008 | Skipped AI ops not logged | All 11 AI functions log `status: "skipped"` with `credits_used: 0`. Verified in `generate.ts`. |
| BUG-005 (cmd bar) | Intent parser bypasses role checks | All reads are org-scoped via `session.orgId`. Mutations go through standard Server Actions with `assertCan()`. |
| Risk C (partial) | `aiMatchCandidates()` service role | `orgId` is JWT-derived (`session.orgId`). RPC enforces org isolation via explicit `WHERE`. Service client is correct — switching to authenticated client would introduce conflicting RLS double-filtering. |

### Confirmed — Addressed in this plan

| ID | Finding | Severity | Wave |
|---|---|---|---|
| **Risk A** | `moveStage()` dual write not atomic — split truth risk | HIGH | H1-1 |
| **BUG-003** | Offer approval race condition — no transaction/locking | HIGH | H1-2 |
| **BUG-001** | Cross-email same-person dedup not handled (same-email dedup exists) | MEDIUM | H1-3 |
| **BUG-007** | Public apply has no email verification — unverified emails in DB | MEDIUM | H1-4 |
| **BUG-004** | Match RPC ignores embedding staleness; no auto-refresh on skill change | MEDIUM | H2-1, H2-2 |
| **BUG-002** | Candidate timeline empty — AI actions create zero `candidate_notes` entries | HIGH | H3-1 |
| **GAP-AI-1** | No AI match explanation — scores are raw numbers with no reasoning | HIGH | H3-2 |
| **GAP-AI-3** | Scorecard summary is manual-only — no auto-trigger after all scorecards submitted | MEDIUM | H3-3 |
| **GAP-AI-4** | Next-best-action is hardcoded 14-day rule — limited signal coverage | LOW | H3-4 |
| **BUG-006** | `send` transition in state machine is dead code — no UI path, e-sign is stub | LOW | H4-2 |
| — | Match scores shown as raw 0–1 floats — no percentile or label | LOW | H4-1 |
| **GAP-COMP-1** | EU AI Act disclosure missing — enforceable since Aug 2025 | HIGH | H4-3 |

### Deferred to Phase 5+ (not regressions)

| Finding | Reason |
|---|---|
| Conversational AI screening | Major feature — Phase 5/6 product planning |
| Candidate status portal | New feature — Phase 5 scope |
| SMS/Twilio notification channel | Integration — Phase 5+ |
| EEOC/AEDT opt-out | US-specific, Phase 5+ given jurisdictional rollout |
| Nylas calendar activation | Phase 5 dependency, separate workstream |
| LinkedIn Easy Apply | Phase 6+ integration |

---

## Wave H1: Data Integrity (P0 — blocks Phase 5)

### H1-1: Atomic Stage Move

**Problem:** `moveStage()` in `candidates.ts:154-208` performs two sequential, non-transactional DB calls:
1. `UPDATE applications SET current_stage_id = $1`
2. `INSERT INTO application_stage_history (...)`

If the second call fails, `current_stage_id` is updated but no history record exists — permanent split truth. This is the exact "Frankenstack" bug documented in Greenhouse.

**Fix:**
- Create Supabase RPC `move_application_stage(p_application_id, p_to_stage_id, p_transitioned_by, p_reason)` that wraps both writes in a single PostgreSQL transaction.
- Replace the two sequential calls in `moveStage()` with a single RPC call.
- RPC returns the new `application_stage_history` row for downstream use.

**Migration:** Yes — `00029_hardening.sql`
**Tests:** Integration test confirming both writes succeed or both fail. Simulated failure test.

### H1-2: Offer Approval Locking

**Problem:** `approveOffer()` in `offers.ts:346-385` does three separate DB calls with no transaction or row lock:
1. Update `offer_approvals` row to `approved`
2. Check remaining pending approvals (client-side, stale data)
3. If none remaining, update `offers.status` to `approved`

Concurrent approvers can both see "no remaining pending" and double-advance the offer.

**Fix:**
- Create Supabase RPC `approve_offer_rpc(p_offer_id, p_approval_id, p_approver_id, p_org_id)` that:
  1. `SELECT ... FOR UPDATE` on the `offers` row (row-level lock)
  2. Marks the approval as approved
  3. Checks remaining pending approvals (inside transaction, fresh data)
  4. If chain complete, advances offer to `approved`
  5. Returns `{ advanced: boolean, remaining_count: number }`
- Replace the sequential calls in `approveOffer()` with a single RPC call.
- Inngest `approval-advanced` function retains its idempotency check (`.eq("status", "pending_approval")`) as a belt-and-suspenders defense.

**Migration:** Yes — `00029_hardening.sql`
**Tests:** Concurrent approval simulation test. Idempotency test (same approval approved twice).

### H1-3: Fuzzy Candidate Dedup Warning

**Problem:** `UNIQUE (organization_id, email)` prevents same-email duplicates. But the same person applying with different emails (personal → work, provider change) creates two separate candidate records with split history, split skills, and competing AI scores.

**What exists:** Same-email dedup is enforced at DB level. Public apply does explicit email lookup.
**What's missing:** Cross-email identity resolution.

**Fix:**
- In `createCandidate()`, after the main insert, run a fuzzy match query:
  ```sql
  SELECT id, full_name, email, phone, linkedin_url
  FROM candidates
  WHERE organization_id = $1
    AND deleted_at IS NULL
    AND id != $new_id
    AND (
      (lower(full_name) = lower($name) AND phone = $phone)
      OR (lower(full_name) = lower($name) AND linkedin_url = $linkedin)
      OR (phone = $phone AND phone IS NOT NULL)
      OR (linkedin_url = $linkedin AND linkedin_url IS NOT NULL)
    )
  LIMIT 5
  ```
- Return `{ success: true, possibleDuplicates: [...] }` to the UI.
- UI shows a "Possible duplicate" warning with merge/dismiss options (merge implementation is Phase 5 scope — the warning is the H1 deliverable).

**Migration:** No
**Tests:** Unit test for fuzzy match query. Test with matching name+phone, matching LinkedIn, no match.

### H1-4: Email Verification for Public Apply

**Problem:** Public apply flow writes unverified email addresses directly to the `candidates` table. An attacker can submit applications with fabricated emails. Recruiters may then email innocent third parties.

**What exists:** Rate limiting (5 POST/min per IP). Org-ID derived from validated job record.
**What's missing:** Email ownership verification.

**Fix:**
- Add `email_verified_at TIMESTAMPTZ` column to `candidates`.
- On public apply submission: commit candidate + application with `email_verified_at = NULL`.
- Send a confirmation email via Resend with a signed token (HMAC, 24h expiry).
- Candidate clicks confirmation link → Server Action sets `email_verified_at = NOW()`.
- Recruiter-facing UI shows "Unverified" badge on candidates where `email_verified_at IS NULL` and source is public apply.
- Recruiter can still view and process unverified applications — this is a signal, not a blocker.

**Migration:** Yes — `00029_hardening.sql` (add column)
**Tests:** Integration test for confirmation flow. Test for expired token rejection. Test that badge renders for unverified candidates.

---

## Wave H2: Embedding Freshness (P1)

### H2-1: Auto-Refresh Candidate Embedding on Skill Change

**Problem:** When a recruiter manually updates a candidate's skills (via `candidate_skills` table), the candidate's embedding is not refreshed. Match scores are based on stale embedding data. The `embedding_updated_at` column exists on candidates (migration 023) but no trigger updates `skills_updated_at` or fires a re-embedding event.

**Fix:**
- Add `skills_updated_at TIMESTAMPTZ` column to `candidates`.
- Create DB trigger on `candidate_skills` (INSERT/UPDATE/DELETE) that sets `candidates.skills_updated_at = NOW()`.
- New Inngest function `candidates/refresh-stale-embedding` triggered by `ats/candidate.skills_updated` event.
- Fire the event from `updateCandidateSkills()` Server Action.

**Migration:** Yes — `00029_hardening.sql`
**Tests:** Test that trigger fires on skill insert/update/delete. Test that Inngest function re-generates embedding.

### H2-2: Staleness Flag in Match RPC

**Problem:** `match_candidates_for_job()` RPC returns candidates by cosine similarity. It does not indicate whether a candidate's embedding is stale (skills changed after last embedding). UI already shows a staleness badge via `isEmbeddingStale()` (7-day check), but the RPC should return this data.

**Fix:**
- Modify `match_candidates_for_job()` RPC to return an additional column: `embedding_stale BOOLEAN` computed as `(c.skills_updated_at > c.embedding_updated_at)`.
- UI can use this for a more precise staleness indicator (skill-change-based, not time-based).

**Migration:** Yes — `00029_hardening.sql` (modify RPC)
**Tests:** Test with candidate whose skills were updated after embedding. Verify `embedding_stale = true` in RPC result.

---

## Wave H3: Candidate Context + AI Quality (P1)

### H3-1: `recordInteraction()` Utility

**Problem:** The candidate timeline (`candidate_notes`) is empty for all automated interactions. Only manually-typed recruiter notes appear. AI-driven actions (email send, resume parse, stage change, offer lifecycle, scorecard submission) create zero timeline entries. This is the "Broken Candidate Context" churn pattern.

**Verified empty write paths:**
| Action | Current Destination | Candidate Note? |
|---|---|---|
| Email sent | Resend API only | No |
| Resume parsed | candidate_skills, ai_usage_logs | No |
| Stage changed | application_stage_history | No |
| Offer created/approved/sent | offers, offer_approvals | No |
| Scorecard submitted | scorecard_submissions | No |

**Fix:**
- Create `recordInteraction()` utility in `src/lib/actions/candidates.ts`:
  ```typescript
  export async function recordInteraction(
    candidateId: string,
    orgId: string,
    interaction: {
      type: 'email_sent' | 'resume_parsed' | 'stage_changed' | 'offer_created' | 'offer_approved' |
            'offer_sent' | 'offer_signed' | 'offer_rejected' | 'offer_withdrawn' |
            'scorecard_submitted' | 'interview_scheduled' | 'ai_match_scored';
      summary: string;
      metadata?: Record<string, unknown>;
      actorId?: string;
    }
  )
  ```
- Wire into 6 call sites:
  1. `sendEmailNotification` Inngest function (after successful send)
  2. `generateCandidateEmbedding` Inngest function (after resume parse)
  3. `moveStage()` Server Action (after successful move)
  4. Offer Server Actions: `createOffer`, `approveOffer`, `markOfferSigned`, `withdrawOffer`
  5. `submitScorecard()` Server Action
  6. Interview scheduling (when interview is confirmed)

**Migration:** No (uses existing `candidate_notes` table)
**Tests:** Integration test per call site verifying note is created with correct type and summary.

### H3-2: AI Match Explanation

**Problem:** Match scores are raw cosine similarity values (0–1). No AI-generated reasoning explains why a candidate scored high or low. No explanation of which skills matched or what gaps exist. This is the #1 stated reason for ATS churn in 2026 — recruiters don't trust scores they can't explain.

**What exists:** `computeSkillGap()` in the match panel shows matched vs. missing required skills (rule-based). No AI-generated narrative.

**Fix:**
- New function `generateMatchExplanation()` in `src/lib/ai/generate.ts`:
  - Input: candidate skills, job required skills, similarity score, org ID
  - Output: `{ explanation: string, keyMatches: string[], keyGaps: string[] }`
  - Model: `gpt-4o-mini` (fast tier — this runs per-candidate)
  - Credit weight: `match_explanation` added to `CREDIT_WEIGHTS`
- New table `ai_match_explanations`:
  ```sql
  CREATE TABLE ai_match_explanations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    candidate_id UUID NOT NULL REFERENCES candidates(id),
    job_opening_id UUID NOT NULL REFERENCES job_openings(id),
    explanation TEXT NOT NULL,
    key_matches TEXT[] NOT NULL DEFAULT '{}',
    key_gaps TEXT[] NOT NULL DEFAULT '{}',
    similarity_score NUMERIC(4,3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, candidate_id, job_opening_id)
  );
  ```
- Called after `aiMatchCandidates()` for top-N results. Cached — only regenerated if embedding changes.
- Surfaced inline in `ai-match-panel.tsx` below each candidate's score.

**Migration:** Yes — `00029_hardening.sql`
**Tests:** Unit test for explanation generation. Integration test for storage and retrieval. Test for cache hit (no regeneration if score unchanged).

### H3-3: Scorecard Summary Auto-Trigger

**Problem:** `summarizeScorecards()` exists and works but is only triggered by a manual button click in `scorecard-panel.tsx`. Feature-flagged behind `ai_scorecard_summarize`. No automatic summarization after all scorecards are submitted for an interview.

**Fix:**
- New Inngest function `interviews/auto-summarize`:
  - Triggered by `ats/scorecard.submitted` event
  - Step 1: Check if all expected scorecards for the interview are submitted
  - Step 2: If yes, call `summarizeScorecards()` with the application ID
  - Step 3: Store summary (existing mechanism)
  - Step 4: Fire `ats/notification.requested` to notify the hiring manager
- Fire the `ats/scorecard.submitted` event from `submitScorecard()` Server Action.

**Migration:** No
**Tests:** Test auto-trigger fires when last scorecard submitted. Test it does NOT fire when scorecards are still pending. Test notification is sent to hiring manager.

### H3-4: NBA Enhancement

**Problem:** `computeNextBestAction()` uses a single signal: days in stage > 14 days = stalled. No consideration of match score, scorecard sentiment, pending tasks, or offer status.

**Fix:** Expand the rule set (still deterministic, not AI):
- **Stalled** (existing): days in stage > 14 → "Consider advancing or scheduling interview"
- **High match, no action**: match score > 0.75 + no interview scheduled → "Strong match — schedule interview"
- **Scorecard complete**: all scorecards submitted + no advancement → "All feedback received — make a decision"
- **Offer ready**: approved offer exists + not sent → "Offer approved — send to candidate"
- **At risk**: days in stage > 7 + match score < 0.5 → "Low fit — consider rejection or talent pool"

**Migration:** No
**Tests:** Unit test per new rule. Test priority ordering when multiple rules match.

---

## Wave H4: UX + Compliance (P2)

### H4-1: Match Score Percentile Labels

**Problem:** Match scores are displayed as raw 0–1 floats. Recruiters can't distinguish between 0.72 and 0.78 — both look like "around 75%." No relative ranking within the applicant pool.

**Fix:**
- Add `getMatchLabel()` utility:
  - >= 0.80: "Strong Match"
  - >= 0.65: "Good Match"
  - >= 0.50: "Partial Match"
  - < 0.50: "Low Fit"
- Add percentile rank computation in `aiMatchCandidates()` output (sort desc, compute position / total).
- Display in UI: "Top 12% · Strong Match" with color-coded badge.

**Migration:** No
**Tests:** Unit tests for label thresholds. Unit test for percentile computation.

### H4-2: E-Sign Transition Cleanup

**Problem:** The state machine defines a `send` transition (`approved → sent`) with a guard requiring `hasEsignProvider`. No UI button exists to trigger this transition. The Inngest `send-esign` function is a documented stub. This is dead code that could confuse future developers.

**Fix:**
- Remove the `send` transition from `state-machine.ts` (it will be re-added when e-sign is built in Phase 5).
- Remove the `send-esign` Inngest function registration (stub only — no real behavior).
- Update `validActions()` to not include `send` for approved offers.
- Add a comment: `// E-sign transition: Phase 5 — see D06 §4.3`

**Migration:** No
**Tests:** Update state machine tests to confirm `send` is not a valid action. Verify `validActions('approved')` does not include `send`.

### H4-3: EU AI Act Disclosure + Human Review Request

**Problem:** The EU AI Act (enforceable since August 2025) requires disclosure when AI is used in employment decisions, and a mechanism for candidates to request human-only review. Eligeo has no disclosure on the candidate portal and no `human_review_requested` flag.

**Fix:**
- Add disclosure text to the career portal application form (below submit button):
  > "This employer uses AI to assist in the recruitment process. A human recruiter reviews all AI-assisted recommendations. You may request human-only review of your application by emailing [org contact email]."
- Add `human_review_requested BOOLEAN NOT NULL DEFAULT FALSE` to `applications` table.
- Add Server Action `requestHumanReview(applicationId)` — sets the flag and fires `ats/notification.requested` to the recruiter.
- When `human_review_requested = true`: AI match scores are still computed but displayed to recruiters with a "Candidate requested human review" badge. No auto-advance rules apply to this application.

**Migration:** Yes — `00029_hardening.sql`
**Tests:** Test that flag can be set. Test that notification fires. Test that auto-advance skips flagged applications.

---

## Migration 029 Scope

Single migration file: `supabase/migrations/00029_hardening.sql`

**New RPCs:**
1. `move_application_stage(p_application_id, p_to_stage_id, p_transitioned_by, p_reason)` — atomic dual write
2. `approve_offer_rpc(p_offer_id, p_approval_id, p_approver_id, p_org_id)` — locked approval advancement

**New columns:**
3. `candidates.email_verified_at TIMESTAMPTZ`
4. `candidates.skills_updated_at TIMESTAMPTZ`
5. `applications.human_review_requested BOOLEAN NOT NULL DEFAULT FALSE`

**New triggers:**
6. `candidate_skills_updated_trigger` → sets `candidates.skills_updated_at = NOW()`

**New tables:**
7. `ai_match_explanations` (id, organization_id, candidate_id, job_opening_id, explanation, key_matches, key_gaps, similarity_score, created_at) + RLS + audit trigger

**Modified RPCs:**
8. `match_candidates_for_job()` — adds `embedding_stale` return column

---

## New Inngest Functions

| Function | Trigger | Wave |
|---|---|---|
| `candidates/refresh-stale-embedding` | `ats/candidate.skills_updated` | H2-1 |
| `interviews/auto-summarize` | `ats/scorecard.submitted` | H3-3 |

---

## Test Plan

| Wave | New Tests | Categories |
|---|---|---|
| H1 | ~20 | RPC transaction tests (2), concurrent approval simulation (2), fuzzy dedup (4), email verification flow (4), integration (8) |
| H2 | ~8 | Trigger fire tests (3), RPC staleness flag (2), Inngest embedding refresh (3) |
| H3 | ~24 | recordInteraction per call site (6), match explanation generation + storage (6), scorecard auto-trigger (4), NBA rules (8) |
| H4 | ~12 | Percentile labels (4), state machine cleanup (3), AI Act flag + notification (5) |
| **Total** | **~64** | Projected test count: 1103 + 64 = ~1167 |

---

## Build Order

```
H1-1 (atomic stage move) ──┐
H1-2 (approval locking) ───┤── Migration 029 ──→ H2-1, H2-2 (embedding freshness)
H1-4 (email verification) ─┤                          │
H4-3 (AI Act columns) ─────┘                          ▼
                                              H3-1 (recordInteraction)
H1-3 (fuzzy dedup) ─── no migration ─────┐   H3-2 (match explanation) ── needs M029 table
                                          │   H3-3 (scorecard auto-trigger)
H4-1 (percentile labels) ────────────────┤   H3-4 (NBA enhancement)
H4-2 (e-sign cleanup) ───────────────────┘
```

**Critical path:** Migration 029 → H1-1 + H1-2 → H3-1 (recordInteraction enables all downstream timeline entries)

---

## Exit Criteria

Before declaring hardening complete:

- [x] All H1–H4 items implemented and tested
- [x] Migration 029 applied cleanly to local Supabase
- [x] `npm test` — 1038 passing at hardening close. (12 pre-existing talent-pool-members RLS failures were subsequently fixed in Phase 5 pre-gate — junction table fixture collisions, not policy bugs. Post-gate: 1049 passing, zero failures.)
- [x] `npx tsc --noEmit` — clean
- [x] Lint clean
- [x] DEVLOG updated with hardening summary
- [x] D24 (Testing Strategy) updated with `ai_match_explanations` in RLS matrix (~348 cases)
- [x] D29 (Inngest Registry) updated — 58 functions, 12 shipped, `auto-summarize` + `refresh-stale-embedding` added, `send-esign` deregistered
- [x] D01 (Database Schema) updated — 44 tables, M029 columns
- [x] D06 (Offers) updated — state machine diagram/table, send transition deferred, edge cases
- [x] INDEX.md updated
- [x] MEMORY.md and SESSION-HANDOFF.md updated
- [x] Post-hardening audit: documentation cross-cut complete, all docs in sync

---

## Carry-Forward Items (not in this plan)

| Item | Target |
|---|---|
| H-04: `refresh-job-embedding` Inngest function | ✅ **CLOSED** — Phase 5 B5-6 |
| H-06: Extend NBA with `offer_ready` state | ✅ Addressed in H3-4 |
| Candidate merge UI (from H1-3 fuzzy dedup) | Phase 5 |
| Full conversational AI screening | Phase 5/6 |
| Candidate status portal | Phase 5 |
| SMS notification channel | Phase 5+ |
| Resume parse review panel | Phase 5+ |
