# Cross-Document Gap Tracker

> **Purpose:** Running backlog of gaps, enhancements, and forward-looking notes discovered while writing specs.
> **Last updated:** 2026-03-10
> **Rule:** Every gap gets recorded at the moment of discovery. Resolved when the target doc is written or upstream is fixed.

---

## How to Use

1. **During spec writing:** When you spot something another doc needs, add it here immediately.
2. **Before starting a doc:** Check this file for gaps tagged to your doc — they're pre-validated requirements.
3. **After resolving:** Move the entry to the Resolved section with date and commit hash.

## Status Legend

- `OPEN` — Not yet addressed
- `IN-PROGRESS` — Being worked on in the current doc
- `RESOLVED` — Fixed, with date and commit reference

---

## Open Gaps

### Upstream Fixes (existing docs need changes)

| # | Source | Target | Gap | Severity | Status |
|---|--------|--------|-----|----------|--------|
| *(none — all upstream gaps resolved)* | | | | | |

### Forward Gaps (future docs need these)

| # | Discovered In | Target Doc | What's Needed | Severity | Status |
|---|---------------|-----------|---------------|----------|--------|
| G-010 | D01 | D06 (Offers) | Define what happens when e-sign provider (Dropbox Sign) is unavailable — retry via Inngest? Manual fallback? Offer stuck in `sent` state? | P1 | RESOLVED |
| G-011 | D01 | D07 (Interviews) | Blind review RLS on `scorecard_submissions` is defined in D01 but the exact UX flow (when does the "reveal" happen? after all interviewers submit? after panel lead clicks?) needs to be specified in D07 | P1 | OPEN |
| G-012 | D01 | D07 (Interviews) | `scorecard_templates` has `categories` and `attributes` as child tables, but no spec on template versioning — what happens to existing scorecards when a template is updated mid-hiring? | P1 | OPEN |
| G-013 | D03 | D08 (Candidate Portal) | Candidate portal is explicitly billing-free (no plan gating). But should there be rate limiting on public job listing/application endpoints to prevent scraping? D02 mentions public endpoints but no specific limits. | P2 | OPEN |
| G-014 | D01 | D09 (Communications) | `notes.mentions` is `UUID[]` for @mentions, but no spec on how mention notifications are triggered — Supabase Realtime? Inngest event? Direct insert to notification queue? | P1 | OPEN |
| G-015 | D01 | D09 (Communications) | `email_templates` has a `body` TEXT column but no spec on template variable syntax — Handlebars `{{candidate.name}}`? Liquid? Custom? Must be consistent with D20 (i18n). | P2 | OPEN |
| G-016 | D01 | D10 (Search & AI) | `match_candidates_for_job()` returns top 50 by cosine similarity, but no spec on how stale embeddings are handled — what triggers re-embedding when a candidate updates their profile? | P1 | OPEN |
| G-017 | D03 | D10 (Search & AI) | AI credit costs vary by action (resume parse vs. matching vs. summarization). D03 uses flat "1 credit per action" but doesn't define per-action costs. D10 should specify credit weights. | P2 | OPEN |
| G-018 | D01 | D11 (Talent Pools) | `talent_pool_members` links candidates to pools, but no spec on automatic pool membership rules (e.g., "all silver medalists auto-added to 'Strong Rejects' pool"). D11 must decide. | P2 | OPEN |
| G-019 | D01 | D12 (Analytics) | `candidate_dei_data` has restricted RLS (only owner/admin), but D12 needs to define aggregation rules — minimum cohort size for statistical reporting to prevent de-identification. | P1 | OPEN |
| G-020 | D05 | D08 (Candidate Portal) | Design System specifies `branding_config` drives career page theming, but doesn't define fallback behavior when `branding_config` fields are null/empty. D08 must specify defaults. | P2 | OPEN |
| G-021 | D02 | D09 (Communications) | Webhook outbound auto-disables after 10 consecutive failures (D02 §8). But no spec on re-enablement — manual only? Auto-retry after 24h? Admin notification before disable? | P2 | OPEN |
| G-022 | D01 | D06 (Offers) | `offer_approvals.sequence_order` defines approval chain, but no spec on what happens when an approver is removed from the organization mid-approval flow. Skip? Reassign? Block? | P1 | RESOLVED |

### [VERIFY] Markers (third-party claims needing validation)

| # | Doc | Claim | Status |
|---|-----|-------|--------|
| V-001 | D03 | `stripe.checkout.sessions.create()` — subscription mode with metadata on subscription_data | OPEN |
| V-002 | D03 | `stripe.billingPortal.sessions.create()` — Customer Portal session creation API | OPEN |
| V-003 | D03 | `stripe.subscriptionItems.createUsageRecord()` — metered billing usage reporting | OPEN |
| V-004 | D03 | `stripe.subscriptionItems.update()` — quantity update with proration_behavior | OPEN |
| V-005 | D02 | `@upstash/ratelimit` — sliding window algorithm with plan-tier configuration | OPEN |
| V-006 | D02 | `@asteasolutions/zod-to-openapi` — Zod schema to OpenAPI 3.1 generation | OPEN |
| V-007 | D02 | Merge.dev webhook signature verification method | OPEN |
| V-008 | D02 | Nylas webhook signature verification (HMAC) | OPEN |
| V-009 | D05 | `next-themes` v0.4+ cookie strategy (no white flash) | OPEN |
| V-010 | D05 | Motion (Framer Motion) v11+ — drag-and-drop API for kanban | OPEN |

---

## Resolved Gaps

| # | Resolved Date | Commit | Resolution |
|---|--------------|--------|------------|
| G-001 | 2026-03-10 | (this commit) | Added `ai_scorecard_summarize` to D01 FeatureFlags + D03 feature matrix |
| G-002 | 2026-03-10 | (this commit) | Changed `ai_credits_limit` default from 10 to 0 in D01 schema — plan setup now always sets the real value explicitly |
| G-003 | 2026-03-10 | (this commit) | DEVLOG D02 entry had stale rate limit values (100/300/600/1200) — corrected to match D02 spec (500/2000/5000/10000) |
| G-010 | 2026-03-10 | (this commit) | D06 §4.2: Inngest retry (5 attempts), then manual PDF fallback. Offer stays `approved` (not stuck in `sent`). |
| G-022 | 2026-03-10 | (this commit) | D06 §4.1: Auto-skip departed approver with system note in audit log. Chain continues. |

---

*This file is checked by the pre-start gate (AI-RULES §21 G3 extension). Gaps tagged to your target doc are mandatory reading before writing.*
