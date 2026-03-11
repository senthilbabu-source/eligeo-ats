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
| G-011 | D01 | D07 (Interviews) | Blind review RLS on `scorecard_submissions` is defined in D01 but the exact UX flow (when does the "reveal" happen? after all interviewers submit? after panel lead clicks?) needs to be specified in D07 | P1 | RESOLVED |
| G-012 | D01 | D07 (Interviews) | `scorecard_templates` has `categories` and `attributes` as child tables, but no spec on template versioning — what happens to existing scorecards when a template is updated mid-hiring? | P1 | RESOLVED |
| G-013 | D03 | D09 (Candidate Portal) | Candidate portal is explicitly billing-free (no plan gating). But should there be rate limiting on public job listing/application endpoints to prevent scraping? D02 mentions public endpoints but no specific limits. | P2 | RESOLVED |
| G-014 | D01 | D08 (Notifications) | `notes.mentions` is JSONB (array of UUIDs) for @mentions, but no spec on how mention notifications are triggered — Supabase Realtime? Inngest event? Direct insert to notification queue? | P1 | RESOLVED |
| G-015 | D01 | D08 (Notifications) | `email_templates` has `body_html`/`body_text` columns but no spec on template variable syntax — Handlebars `{{candidate.name}}`? Liquid? Custom? Must be consistent with D20 (i18n). | P2 | RESOLVED |
| G-016 | D01 | D10 (Search & AI) | `match_candidates_for_job()` returns top 50 by cosine similarity, but no spec on how stale embeddings are handled — what triggers re-embedding when a candidate updates their profile? | P1 | RESOLVED |
| G-017 | D03 | D10 (Search & AI) | AI credit costs vary by action (resume parse vs. matching vs. summarization). D03 uses flat "1 credit per action" but doesn't define per-action costs. D10 should specify credit weights. | P2 | RESOLVED |
| G-018 | D01 | D12 (Workflow) | `talent_pool_members` links candidates to pools, but no spec on automatic pool membership rules (e.g., "all silver medalists auto-added to 'Strong Rejects' pool"). D12 must decide — this is workflow automation, not real-time. | P2 | RESOLVED |
| G-019 | D01 | D17 (Analytics) | `candidate_dei_data` has restricted RLS (only owner/admin), but D17 needs to define aggregation rules — minimum cohort size for statistical reporting to prevent de-identification. | P1 | OPEN |
| G-020 | D05 | D09 (Candidate Portal) | Design System specifies `branding_config` drives career page theming, but doesn't define fallback behavior when `branding_config` fields are null/empty. D09 must specify defaults. | P2 | RESOLVED |
| G-021 | D02 | D08 (Notifications) | Webhook outbound auto-disables after 10 consecutive failures (D02 §8). But no spec on re-enablement — manual only? Auto-retry after 24h? Admin notification before disable? | P2 | RESOLVED |
| G-022 | D01 | D06 (Offers) | `offer_approvals.sequence_order` defines approval chain, but no spec on what happens when an approver is removed from the organization mid-approval flow. Skip? Reassign? Block? | P1 | RESOLVED |
| G-023 | D07 | D09 (Candidate Portal) | Self-scheduling UI: candidate time slot picker, confirmation flow, 3-reschedule limit, 7-day link expiry. D09 must implement the candidate-facing side of D07 §4.3. | P1 | RESOLVED |
| G-024 | D07 | D08 (Notifications) | Interview notification emails: scheduled confirmation, cancellation, feedback reminder (overdue), scorecard submitted (to recruiter). 4 email triggers from D07. | P1 | RESOLVED |
| G-025 | D07 | D12 (Workflow) | Auto-advance from interview stage: when all scheduled interviews for an application reach `completed` and all scorecards are submitted, workflow engine should optionally auto-advance to next pipeline stage. | P2 | RESOLVED |
| G-026 | D08 | D09 (Candidate Portal) | Candidate-facing email delivery (application_received, interview_scheduled/cancelled, offer_sent, rejection) — defined in D08 §4.3 but delivery must be implemented in D09's candidate auth context (magic link, no ATS login). | P1 | RESOLVED |
| G-027 | D08 | D11 (Real-Time) | Supabase Realtime channel naming convention for notification broadcast: org-scoped + user-filtered channels. D11 must define the channel schema and subscription pattern. | P2 | RESOLVED |
| G-028 | D10 | D03 (Billing) | D03 uses inline `ai_credits_used + 1` SQL. D10 introduces `consume_ai_credits(p_org_id, p_amount)` function with variable weights. D03 should adopt function at code time. Non-blocking. | P3 | OPEN |
| G-029 | D10 | D09 (Candidate Portal) | Public career page job search requires Typesense scoped API key per organization. D09 must define key generation, rotation, and client-side embedding. | P2 | RESOLVED |
| G-030 | D11 | D09 (Candidate Portal) | Candidate-side real-time: candidates don't have persistent WebSocket connections. Application status updates should use polling (not Realtime). D09 must define polling interval + endpoints. | P2 | RESOLVED |

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
| V-011 | D07 | Nylas `events.create()` — event creation with participants, conferencing, and when.startTime/endTime shape | OPEN |
| V-012 | D07 | Nylas `calendars.getFreeBusy()` — free/busy query with email-based lookup and time range | OPEN |
| V-013 | D08 | Resend `resend.emails.send()` — transactional email delivery API with React Email template support | OPEN |
| V-014 | D10 | OpenAI `text-embedding-3-small` — 1536-dimension embedding model, `openai.embeddings.create()` API shape | OPEN |
| V-015 | D10 | Typesense collection schema API — `CollectionSchema`, `documents().upsert()`, `documents().search()` | OPEN |

---

## Resolved Gaps

| # | Resolved Date | Commit | Resolution |
|---|--------------|--------|------------|
| G-001 | 2026-03-10 | (this commit) | Added `ai_scorecard_summarize` to D01 FeatureFlags + D03 feature matrix |
| G-002 | 2026-03-10 | (this commit) | Changed `ai_credits_limit` default from 10 to 0 in D01 schema — plan setup now always sets the real value explicitly |
| G-003 | 2026-03-10 | (this commit) | DEVLOG D02 entry had stale rate limit values (100/300/600/1200) — corrected to match D02 spec (500/2000/5000/10000) |
| G-010 | 2026-03-10 | (this commit) | D06 §4.2: Inngest retry (5 attempts), then manual PDF fallback. Offer stays `approved` (not stuck in `sent`). |
| G-022 | 2026-03-10 | (this commit) | D06 §4.1: Auto-skip departed approver with system note in audit log. Chain continues. |
| G-011 | 2026-03-10 | (this commit) | D07 §3.4: Auto-reveal after own submission. No manual reveal button. RLS-enforced at DB level. |
| G-012 | 2026-03-10 | (this commit) | D07 §3.3: Snapshot-on-assign. Append-only attributes mean old submissions always valid. No versioning table needed. |
| G-014 | 2026-03-10 | (this commit) | D08 §3.4: Inngest event on note creation → extract mentions → per-user dispatch. Not Realtime (need email for offline users). |
| G-015 | 2026-03-10 | (this commit) | D08 §3.3: Handlebars-style `{{variable.path}}` syntax. Strict allowlist via `merge_fields` column. Consistent for D20 i18n. |
| G-021 | 2026-03-10 | (this commit) | D08 §5.2: Manual re-enablement only. Warning at 5 failures, auto-disable at 10, admin notification both times. No auto-retry. |
| G-024 | 2026-03-10 | (this commit) | D08 §4.1: All 4 interview email triggers in event catalog — scheduled, cancelled, feedback_overdue, scorecard.submitted. |
| G-016 | 2026-03-10 | (this commit) | D10 §6.3: Re-embed on content change (resume_text, skills, title, company). No TTL. Stale if no credits — keeps old embedding. |
| G-017 | 2026-03-10 | (this commit) | D10 §6.4: Differentiated weights — resume_parse=2, candidate_match=1, job_desc_generate=3, email_draft=1, feedback_summarize=1. `consume_ai_credits()` function. |
| G-027 | 2026-03-10 | (this commit) | D11 §4: Channel naming `{scope}:{org_id}:{resource}[:{id}]`. 7 channel patterns defined. Tenant isolation via RLS + JWT-derived org_id. |
| G-018 | 2026-03-10 | (this commit) | D12 §6: Talent pool auto-membership via `add_to_pool` auto-action on pipeline stages. Condition-based (`always` or `if_rejected`). Idempotent insert. |
| G-025 | 2026-03-10 | (this commit) | D12 §5: Auto-advance via `auto_advance` auto-action + Inngest `workflow-auto-advance` function. Triggered on `interview/scorecard-submitted`. Loop prevention: auto-advance doesn't cascade. |
| G-013 | 2026-03-10 | (this commit) | D09 §10: Rate limiting per endpoint — 60 req/min for listings, 5 req/hr for apply (IP+email), 30 req/min for polling, 120 req/min for search. @upstash/ratelimit. |
| G-020 | 2026-03-10 | (this commit) | D09 §4.2: Branding defaults — system foreground color, Inter font, default logo/favicon. `resolveTheme()` function applies defaults for null/empty fields. |
| G-023 | 2026-03-10 | (this commit) | D09 §7: Full self-scheduling UI — TimeSlotPicker component, Nylas free/busy query, 30-min slots, 15-min buffer, 7-day window, 3-reschedule limit, first-come-first-served conflict resolution. |
| G-026 | 2026-03-10 | (this commit) | D09 §9: Candidate emails use stateless signed JWT magic links (separate secret from Supabase). 5 email templates with scoped tokens. No unsubscribe (transactional only). |
| G-029 | 2026-03-10 | (this commit) | D09 §8: Typesense scoped API key per org, 90-day expiry, daily Inngest cron for rotation, client-side InstantSearch adapter. Fallback to PostgreSQL ILIKE if Typesense unavailable. |
| G-030 | 2026-03-10 | (this commit) | D09 §6.3: Adaptive polling — 30s default, exponential backoff to 60s on no change, reset on change. Lightweight endpoint (~200 bytes). No WebSocket. |

---

*This file is checked by the pre-start gate (AI-RULES §21 G3 extension). Gaps tagged to your target doc are mandatory reading before writing.*
