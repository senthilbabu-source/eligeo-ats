# Eligeo — User Story Map

> Prioritized mapping of all user stories to build phases. Stories tagged with the phase they ship in,
> the plan tier that gates them, and whether they're already built. The **v1.0 launch boundary** is
> marked clearly — everything above it ships before first customers.
>
> **Authority:** ADR-011 governs build order. This doc maps WHAT (stories) to WHEN (phases).

---

## Legend

| Tag | Meaning |
|-----|---------|
| ✅ BUILT | Already shipped in Phase 0–2.7 |
| 🔶 2.6 | Phase 2.6 — shipped, tag preserved for historical traceability |
| 🔷 2.7 | Phase 2.7 — UX polish (complete — all stories ✅ BUILT) |
| 🟢 P3 | Phase 3 — Interviews + scorecards |
| 🟣 P4 | Phase 4 — Offers |
| 🔵 P5 | Phase 5 — Billing |
| ━━━ | **v1.0 LAUNCH BOUNDARY** |
| 🟡 v1.1 | 4–6 weeks post-launch |
| 🟠 v2.0 | 3–4 months post-launch |
| 🔴 v3.0+ | 9+ months / enterprise |
| ❌ OUT | Not building (use integration or out of scope) |

---

## 1. Job Creation & Management

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| J1 | AI generates full job description from title + bullets | 🔶 2.6 | Growth+ | OpenAI structured output. Command bar: "create job Senior Engineer" |
| J2 | AI suggests required skills based on role title | 🔶 2.6 | Growth+ | Embedding similarity against skills taxonomy |
| J3 | Clone job + AI auto-updates for new location/level | ✅ BUILT | All | Clone is CRUD, AI rewrite is Growth+. Wave 1: skills/team fields cloned, clean slug, hiring_manager_id/recruiter_id copied. Wave 2: CloneIntentModal (4 reasons), intent stored in metadata.clone_intent. Wave 3: streaming RewritePanel, intent-aware rewrite prompt, acceptJobRewrite/revertJobDescription, description_previous stored before overwrite. Wave 4: JdQualityPanel (JD1–4), SkillsDeltaPanel, TitleSuggestionBadge, CloneChecklist (6 items, auto-dismiss via metadata). Wave 5: command bar clone intent (intent.ts quick patterns + executeCommand job lookup + navigate). All 5 waves ✅ COMPLETE. E2E: intent selection + accept/revert flows added 2026-03-11. |
| J4 | Approval workflows for job requisitions | 🟠 v2.0 | Pro+ | Small teams don't need this at launch |
| J5 | AI warns about biased/exclusionary language | 🔶 2.6 | Growth+ | OpenAI moderation pass before publish. ⚠️ Current: client-side only (rewrite panel + quality panel). Bias check does NOT fire on manual-written JDs at publish time. **AI-Proof Wave B**: server-side gate in publishJob() SA — soft warning stored in metadata, surfaced as banner. |

---

## 2. Job Description Quality & Bias Checker

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| JD1 | Live quality score before publishing | ✅ BUILT | Growth+ | Readability + completeness + bias signal combined into single score |
| JD2 | Biased words highlighted inline with neutral replacement suggestions | ✅ BUILT | Growth+ | Frontend layer on J5 bias check — surface inline in editor, one-click replace |
| JD3 | Completeness check: salary, reporting line, reading level | ✅ BUILT | All | Rule-based heuristics. Warn panel before publish. Zero AI cost |
| JD4 | Gender-coded language balance meter (masculine vs. feminine) | ✅ BUILT | Growth+ | Known word-list analysis (Textio vocabulary). Runs on description body |

---

## 3. AI-Powered Sourcing

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| S1 | AI searches talent pool before external sourcing | 🟡 v1.1 | Pro+ | talent_pools built (Phase 2.7). Embedding search over pool members: v1.1 |
| S2 | AI ranks existing candidates against new job | 🔶 2.6 | Pro+ | pgvector cosine similarity — core Phase 2.6 |
| S3 | AI-suggested Boolean search strings for LinkedIn | 🟠 v2.0 | Pro+ | Nice-to-have, not core hiring loop |
| S4 | Auto-enrich profiles from public data | ❌ OUT | — | GDPR legal risk. Let candidates self-enrich via LinkedIn import |
| S5 | AI identifies passive candidates from careers page engagement | 🟠 v2.0 | Pro+ | Requires analytics tracking + talent pool |
| S6 | AI drafts personalized outreach messages | ✅ BUILT | Growth+ | Command bar: "draft outreach for Jane re: Backend Engineer". `EmailDraftPanel` on candidate profile (`/candidates/[id]`) — type/tone/context selectors, calls `aiDraftEmail()` with Wave B context enrichment. Wave D D2. |

---

## 4. Browser Extension

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| BE1 | Browser extension: add candidates to ATS from LinkedIn or any webpage | 🟠 v2.0 | Pro+ | Chrome + Firefox extension. Significant engineering + review effort |
| BE2 | Extension auto-detects if candidate already exists before adding | 🟠 v2.0 | Pro+ | Email + name fuzzy match against candidates table. Depends on BE1 |
| BE3 | Assign sourced prospect to job and pipeline stage from extension | 🟠 v2.0 | Pro+ | Depends on BE1. Full pipeline write-back via API |
| BE4 | Find candidate's verified email while browsing their profile | ❌ OUT | — | GDPR + ToS risk on data scraping. Integrate Hunter.io/Apollo instead |
| BE5 | Notes and outreach logged in extension sync to ATS candidate profile | 🟠 v2.0 | Pro+ | REST API write-back. Depends on BE1 |

---

## 5. Candidate Experience & Application

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| C1 | Apply with LinkedIn profile or resume only — no account | ✅ BUILT | All | Career portal app form (Phase 2.5). Resume upload in 2.6 |
| C2 | Mobile-first application under 3 minutes | ✅ BUILT | All | Current form works on mobile; polish in 2.7 |
| C3 | Instant confirmation after applying with timeline | 🟢 P3 | All | Confirmation email via Inngest + Resend |
| C4 | Track application status without logging in | 🟡 v1.1 | All | Magic link to status page (D09 candidate portal) |
| C5 | Timely updates at every stage change | 🟢 P3 | All | Notification triggers on stage move (D08) |
| C6 | Withdraw application or update details | 🟡 v1.1 | All | Self-service via candidate portal magic link |

---

## 6. Branded Careers Page

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| B1 | Branded careers page without needing a developer | ✅ BUILT | All | Org-scoped `/careers?org=slug` (Phase 2.5). Branding config in 2.7 |
| B2 | Auto-display active listings filtered by dept/location | ✅ BUILT | All | Career portal already filters open jobs |
| B3 | Embed testimonials and culture videos | 🟠 v2.0 | Growth+ | Requires career page builder — complex UI |
| B4 | AI generates "Why join us" copy per department | 🔶 2.6 | Growth+ | OpenAI from company profile + dept info |

---

## 7. AI Screening & Scoring

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| A1 | AI screens all applications with match score | 🔶 2.6 | Growth+ | **Core differentiator.** pgvector embeddings + cosine similarity |
| A2 | AI surfaces top 10 from 500 applicants instantly | 🔶 2.6 | Pro+ | Ranked by fit score, filterable |
| A3 | AI flags career progression patterns from past hires | 🟠 v2.0 | Pro+ | Requires historical hire data (not available at launch) |
| A4 | Custom screening criteria per role | 🔶 2.6 | Growth+ | Job-specific required skills + weights |
| A5 | AI detects duplicate/spam applications | 🔶 2.6 | All | Email dedup already exists. AI spam detection: simple heuristics |
| A6 | Plain-language explanation of AI score | ✅ BUILT | Growth+ | "Matched: React, Node. Missing: Kubernetes. 3 yrs vs 5 required." `computeSkillGap()` on `AiMatchPanel` — compares `job_required_skills` vs `candidate.skills` (case-insensitive). Wave D D4. |
| AF1 | AI score feedback — recruiter thumbs-up/down on match panel | ✅ BUILT | Growth+ | `ai_score_feedback` table (Migration 022) + `submitScoreFeedback()` SA + thumbs up/down buttons on `AiMatchPanel`. Optimistic UI + graceful error when no application exists. Wave D D1. |
| AF2 | Job embedding staleness detection | ✅ BUILT | All | `embedding_updated_at TIMESTAMPTZ` on `job_openings` (Migration 022). Amber "⚠ Scores may be outdated" badge on `AiMatchPanel` when embedding >7 days stale. `isEmbeddingStale()` pure function. Wave D D3. |

---

## 8. Anonymized Resume Review

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| AR1 | Review resumes in anonymized mode — names, photos, contact hidden | 🟠 v2.0 | Growth+ | `is_anonymized` flag exists (D2). Toggle UI + PDF redaction pipeline needed |
| AR2 | Exact and similar keyword matches highlighted on resume | 🟡 v1.1 | Growth+ | Frontend highlight pass against job required skills. No backend change |
| AR3 | AI extracts and surfaces top skills and language proficiencies | ✅ BUILT | Growth+ | Phase 2.6 resume parser (`parseResume()` + `extractSkills()`). Collapsible resume paste section on `/candidates/new` — "Extract with AI" calls `aiParseResume()`, pre-fills all form fields. Wave D D5. |
| AR4 | Advance, reject, or leave feedback without leaving the resume screen | ✅ BUILT | All | Inline action panel on candidate detail. Extends AR5 sequential view |
| AR5 | Sequential navigation through all applicants in a review queue | ✅ BUILT | All | Prev/next controls with position indicator. Uses existing application list |
| AR6 | Admin enforces anonymized review as default for specific roles or org-wide | 🟠 v2.0 | Growth+ | Pipeline-stage setting + org-level config. Depends on AR1 |

---

## 9. Candidate Profile Detail

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| CP1 | Unified profile: interviews, recordings, AI highlights, all activity in one view | 🟢 P3 | All | Recordings require P3. Current profile shows applications + stage history |
| CP2 | Days in current stage visible on candidate profile | ✅ BUILT | All | Calculate from application_stage_history.moved_at. Simple UI addition |
| CP3 | AI flags candidates at closing risk | 🟡 v1.1 | Growth+ | Inngest cron: no activity 5+ days + offer-pending pattern |
| CP4 | Referral source automatically tagged on profile | ✅ BUILT | All | candidate_sources FK already on candidates table. Surface in profile header |
| CP5 | AI highlights aggregated across all of a candidate's interviews | 🟢 P3 | Pro+ | Requires scorecard data from P3. gpt-4o summary pass |
| CP6 | Dedicated debrief workflow on profile — panel aligns before hire/no-hire | 🟢 P3 | All | Panel view + decision + notes. Separate from scorecard |
| CP7 | Candidate pronouns displayed on profile | ✅ BUILT | All | Add pronouns field to candidates table. One migration + UI |
| CP8 | Profile header: has portfolio, has resume, was a referral indicators | ✅ BUILT | All | Derived from files table + candidate_sources. Badge row in header |
| CP9 | Rejection reason picker on inline reject action | 🔵 AI-Proof Wave A | All | P1 UI fix only (~2h) — no migration needed. Schema (`rejection_reason_id`, `rejection_notes`) + SA (`rejectApplication()`) already fully support this. `inline-app-actions.tsx` calls `rejectApplication(applicationId)` with no reason; fix: select dropdown from `rejection_reasons` table. Ships in Wave A because Wave B email enrichment (N1) depends on rejection reason data being captured. |
| CP10 | Next Best Action strip on candidate profile | 🔵 AI-Proof Wave C | Growth+ | Server component above profile body. Rules-based: stalled in stage (>org avg), no interviewer assigned, no recent activity in N days. AI-enhanced for Pro+. Turns the profile from data display into an action surface. |

---

## 10. All Candidates List View

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| CL1 | Full text search across all candidate resumes and notes | 🟠 v2.0 | Pro+ | Requires Typesense (v2.0 per ADR). pgvector NL search as interim path |
| CL2 | Multi-dimensional filter: source, job, application type, profile details | ✅ BUILT | All | Extend /candidates filter bar with source + job dropdowns |
| CL3 | Auto-flag duplicate candidate profiles for merge or dismiss | 🟠 v2.0 | Growth+ | Email + name fuzzy match. Inngest background dedup job |
| CL4 | Bulk actions: move stage, send email, reject — across selected candidates | 🟡 v1.1 | All | Checkbox select + floating action bar. High recruiter time-saver |
| CL5 | Next required action visible on each candidate in list view | 🟡 v1.1 | Growth+ | Computed: pending feedback, days stalled, no contact in N days |
| CL6 | Generate filtered candidate report from any list view | 🟠 v2.0 | Growth+ | CSV/PDF export of filtered results. Inngest-queued for large sets |

---

## 11. Interview Management & Scheduling

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| I1 | Candidate self-schedules from interviewer real-time availability | 🟠 v2.0 | Growth+ | Requires Nylas calendar sync — complex integration |
| I2 | AI suggests optimal interview panel | 🟠 v2.0 | Pro+ | Requires scheduling history data |
| I3 | Automated reminders before interviews | 🟢 P3 | All | Inngest cron job, 24h + 1h before |
| I4 | AI-generated role-specific interview questions | 🔶 2.6 | Growth+ | Command bar: "generate questions for Backend Engineer interview" |
| I5 | Multi-stage interview pipelines with auto-progression | ✅ BUILT | All | Pipeline stages with stage_type (Phase 2). Auto-actions in v1.1 |
| I6 | Video interviews auto-transcribed and summarized | ❌ OUT | — | Use Otter.ai/Grain. Not building transcription engine |
| I7 | AI flags scheduling conflicts across panel | 🟠 v2.0 | Growth+ | Requires calendar integration (Nylas) |

---

## 12. Interviewer Performance & Coaching

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| IP1 | Personal interview quality score dashboard per interviewer | 🟠 v2.0 | Pro+ | Aggregates: scorecard completeness, on-time rate, candidate experience ratings |
| IP2 | Talk ratio per interview (interviewer vs. candidate speech time) | ❌ OUT | — | Requires audio analysis. Depends on I6 (❌ OUT) |
| IP3 | AI flags potentially illegal or high-risk questions during interview | ❌ OUT | — | Requires real-time transcription. Depends on I6 (❌ OUT) |
| IP4 | HR manager view of interviewer performance metrics across team | 🟠 v2.0 | Pro+ | Aggregated from scorecard_submissions. Needs P3 data |
| IP5 | On-time start rate and agenda-setting habits per interviewer | 🟠 v2.0 | Pro+ | Timestamps from interviews table |
| IP6 | Period-over-period interviewer quality benchmarks | 🟠 v2.0 | Pro+ | Needs P3 baseline + 2+ months of data |

---

## 13. Hiring Team Collaboration & Scorecards

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| T1 | Structured feedback after interviews (scorecards) | 🟢 P3 | All | Scorecard templates + submissions (D07) |
| T2 | Consolidated panel feedback in one view | 🟢 P3 | All | Score aggregation view (D07) |
| T3 | @mention colleagues on candidate card | 🟢 P3 | All | Notes with @mentions + notification (D08) |
| T4 | Candidate context before interview (resume, scores, prior notes) | 🟢 P3 | All | Interview prep view with all prior data |
| T5 | AI summarizes conflicting panel feedback | 🟢 P3 | Pro+ | AI scorecard summarization (D07, gated by feature flag) |
| T6 | Role-level access controls (interviewers see own candidates) | ✅ BUILT | All | RBAC 5 roles × 30 permissions (Phase 1) |
| T7 | Toggle between individual scorecard view and attribute summary view | 🟢 P3 | All | Two-tab layout on scorecards page |
| T8 | Each competency rated visually by every panellist (alignment heatmap) | 🟢 P3 | All | Per-panellist columns on attribute summary. Spot consensus vs. disagreement |
| T9 | Comment counts visible per competency in summary view | 🟢 P3 | All | Count badge on each attribute row. Shows where panel had most discussion |
| T10 | Sequential candidate navigation inside pipeline without returning to list | ✅ BUILT | All | Prev/next controls on candidate detail when opened from pipeline view |

---

## 14. Communication, Notifications & Email Templates

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| N1 | AI drafts personalized, warm rejection emails | ✅ BUILT | Growth+ | Command bar: "draft rejection for Jane, warm tone". `EmailDraftPanel` on candidate profile — enriched with matchScore, stageName, daysInPipeline, rejectionReason via Wave B `buildEmailContextLines()`. Wave D D2. |
| N2 | Automated email sequences on stage changes | 🟢 P3 | All | 10 critical event notifications (D08) |
| N3 | Communication via preferred channel (email/SMS/WhatsApp) | 🟠 v2.0 | Growth+ | Email only in v1.0. SMS/WhatsApp require additional providers |
| N4 | Shared inbox for candidate replies | 🟠 v2.0 | Pro+ | Requires email receiving infra — complex |
| N5 | AI follow-up when candidate unresponsive 3+ days | 🟡 v1.1 | Growth+ | Inngest cron checks + AI draft |
| ET1 | Org-wide email templates with dynamic tokens ({{candidate.name}}, etc.) | 🟢 P3 | All | email_templates table (D08). Admin-managed, recruiter-accessible |
| ET2 | Templates auto-populate candidate, job, application, and offer data | 🟢 P3 | All | Token renderer at send time. Merge fields from application context |
| ET3 | Permission controls for template CRUD (who can create/edit/delete) | 🟢 P3 | All | RBAC gate: admin creates/edits, recruiter uses. Prevents off-brand sends |
| ET4 | Auto-CC assigned recruiter or coordinator on templated emails | 🟢 P3 | All | CC field populated from job_openings.recruiter_id at send time |

---

## 15. Offer Management

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| O1 | One-click templated offer letter pre-filled | 🟣 P4 | All | Offer templates with merge fields (D06) |
| O2 | AI recommends compensation based on market + equity | 🟠 v2.0 | Pro+ | Requires comp data source — not available at launch |
| O3 | Send, track, e-sign without leaving platform | 🟠 v2.0 | Pro+ | Dropbox Sign integration (D06). Manual "mark signed" in v1.0 |
| O4 | Real-time visibility: opened, viewed, signed | 🟠 v2.0 | Pro+ | Requires Dropbox Sign webhook callbacks |
| O5 | Offer approval workflows (finance/HR review) | 🟠 v2.0 | Pro+ | Sequential approvals. Auto-approve in v1.0 |
| O6 | AI flags offers outside approved salary band | 🟣 P4 | Growth+ | Simple range check + AI warning |

---

## 16. Compensation Intelligence & Market Data

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| CI1 | Real-time market salary benchmarks by role and level | 🟠 v2.0 | Pro+ | External data source required (Levels.fyi, Radford, or similar API) |
| CI2 | Compare our offer acceptance rates against market averages | 🟠 v2.0 | Pro+ | Internal acceptance rate from offers table + external benchmark delta |
| CI3 | AI-generated offer insights per role family (competitive/declining trend) | 🟠 v2.0 | Pro+ | Aggregated from internal offer history + CI1 market data |
| CI4 | Salary percentile data (25th–90th) per level for pay band design | 🟠 v2.0 | Pro+ | Depends on CI1 external data source |
| CI5 | Filter benchmarks by geography, company stage, and currency | 🟠 v2.0 | Pro+ | Multi-dimension filter layer on CI1 data |
| CI6 | Trend charts: our salary offers vs. market over time | 🟠 v2.0 | Pro+ | Historical offers table + CI1 benchmark time series |
| CI7 | Equity benchmark data by role and company stage | 🔴 v3.0+ | Enterprise | Specialized equity comp data source (Carta, Option Impact) |

---

## 17. Onboarding Handoff

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| H1 | Auto-trigger onboarding workflow on offer acceptance | 🔴 v3.0+ | Enterprise | Requires HRIS integration (Merge.dev) |
| H2 | New hire welcome portal: role, team, location, start date | 🔴 v3.0+ | Enterprise | Separate new-hire portal. Out of ATS core scope |
| H3 | 30-day goals plan pre-loaded in onboarding portal | 🔴 v3.0+ | Enterprise | Onboarding goal templates. Depends on H2 |
| H4 | Task list with due dates and manager attribution | 🔴 v3.0+ | Enterprise | Onboarding task engine. Depends on H2 |
| H5 | Payroll and compliance actions (direct deposit, tax forms) in portal | ❌ OUT | — | HRIS/payroll scope. Use Rippling/Gusto |
| H6 | Hiring manager tracks new hire onboarding task completion | 🔴 v3.0+ | Enterprise | Depends on H4 task engine |
| H7 | 30/60/90-day goal templates that auto-assign on hire | 🔴 v3.0+ | Enterprise | Template library. Depends on H3 |
| H8 | Pass candidate profile, interview notes, and offer to HRIS on hire | 🔴 v3.0+ | Enterprise | Merge.dev HRIS sync on application status = hired |

---

## 18. Talent Pool & Candidate CRM

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| P1 | Save strong candidates to tagged talent pool | ✅ BUILT | All | talent_pools + talent_pool_members tables (Phase 2). UI in 2.7 |
| P2 | AI auto-matches pool candidates to new roles | 🟠 v2.0 | Pro+ | Requires embeddings (2.6) + pool UI (2.7) + matching job |
| P3 | Nurture campaigns for past candidates | 🟠 v2.0 | Growth+ | Requires email sequence builder |
| P4 | AI scores pool candidates for role-readiness over time | 🟠 v2.0 | Pro+ | Re-score on profile updates |
| P5 | Segment pool by skills, location, availability | ✅ BUILT | Growth+ | /talent-pools with URL-based search filter, member list, add/remove (Phase 2.7) |

---

## 19. Customizable Workflows & Automation

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| W1 | No-code drag-and-drop pipeline builder | ✅ BUILT | All | /settings/pipelines — DnD stage editor with @dnd-kit, CRUD + reorder, delete guards (Phase 2.7) |
| W2 | Auto-move candidates on actions (assessment done → interview) | 🟡 v1.1 | Growth+ | Auto-actions in pipeline_stages.auto_actions JSONB |
| W3 | AI alerts when candidate stuck in stage too long | 🟡 v1.1 | Growth+ | Inngest cron + SLA config per stage |
| W4 | Role-specific pipelines (tech vs sales vs ops) | ✅ BUILT | All | Pipeline templates per org (Phase 2) |
| W5 | Trigger third-party actions at specific stages | 🟠 v2.0 | Pro+ | Webhook auto-action type |

---

## 20. Per-Job Dashboard & Insights

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| JI1 | Dedicated dashboard per job: pipeline health, source quality, AI insights | ✅ BUILT | All | Job detail page enhancements. Reuse dashboard query patterns from R1 |
| JI2 | Which sources produce actual hires per job (quality, not volume) | 🟡 v1.1 | Growth+ | Join applications + stage_history + candidate_sources. Source quality metric |
| JI3 | Live pipeline stage count per role (bottleneck view) | ✅ BUILT | All | Count per stage on job detail sidebar. Parallel query |
| JI4 | AI proactively surfaces pre-matched candidates before sourcing starts | 🟠 v2.0 | Pro+ | Trigger match on job publish. Requires talent pool + embeddings |

---

## 21. Job Board Integrations

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| JB1 | Post to 200+ job boards in one click | ❌ OUT | — | Use Broadbean/Joveo. Not building aggregator |
| JB2 | AI adapts job copy per board audience | ❌ OUT | — | Depends on JB1 — same verdict |
| JB3 | Unified applicant view from all boards in one pipeline | 🟠 v2.0 | Growth+ | Parse inbound emails/webhooks from boards |
| JB4 | Analytics: which boards drive best candidates | 🟠 v2.0 | Growth+ | Source attribution from candidate_sources |
| JB5 | Job board budget management | ❌ OUT | — | Accounting feature, not ATS |

---

## 22. Social Recruiting & Events

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| SR1 | Share job postings to LinkedIn and Twitter in one click | 🟡 v1.1 | All | Intent URLs + Open Graph meta on job pages. No API auth needed |
| SR2 | Candidates and hires attributed to each social media post | 🟠 v2.0 | Growth+ | UTM parameter tracking on careers page + source attribution |
| SR3 | Follow specific open roles to receive activity notifications | 🟡 v1.1 | Growth+ | Notification subscription on job_openings. Inngest-delivered |
| SR4 | Create and manage recruiting events (career fairs, campus drives) | 🟠 v2.0 | Growth+ | New events module. Prospect capture → pipeline applications |
| SR5 | Career fair mobile/tablet app for on-spot resume capture | 🔴 v3.0+ | Enterprise | Native or PWA app. Significant scope |
| SR6 | Personalized recruiter dashboard (my metrics + my jobs) | ✅ BUILT | All | Filter main dashboard by recruiter_id. Same infra as R1–R4 |

---

## 23. Reporting & Analytics

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| R1 | Real-time dashboard: time-to-hire, drop-off, diversity metrics | ✅ BUILT | All | 4 metric cards, pipeline funnel, source attribution, recent apps — parallel queries (Phase 2.7). DEI in v3.0. P0 fixed 2026-03-11: Active Jobs uses `status="open"` |
| R2 | AI proactively surfaces insights ("acceptance rate dropped 20%") | 🟠 v2.0 | Pro+ | Requires historical data baseline |
| R3 | Pipeline velocity reports (where candidates stall) | ✅ BUILT | Growth+ | **Current implementation is a stage snapshot ("Current Stage Distribution"), not passthrough funnel.** Shows `applications.current_stage_id` — where candidates are now. Passthrough funnel (using `application_stage_history`) is Phase 3. P1 fixed 2026-03-11: `aggregateFunnel()` filters to default template. Bars link to `/candidates?stage=<id>` (Wave 1). |
| R4 | Source attribution: which channel delivered each hire | ✅ BUILT | All | Top-5 source volume shipped (Phase 2.7). P0/P1 fixed 2026-03-11: canonical source name + proportional bars. Source quality (hire rate per source, min cohort 5) added in Wave 2. |
| R5 | Scheduled reports to stakeholders | 🟠 v2.0 | Pro+ | Inngest cron + PDF/email generation |
| R6 | DEI funnel reports by gender/ethnicity/age | 🔴 v3.0+ | Pro+ | candidate_dei_data table exists. UI + compliance in v3.0 |
| R7 | Cost-per-hire and recruiter productivity | 🟠 v2.0 | Pro+ | Requires billing + time tracking data |
| R8 | Hires This Month + avg Time to Hire metric card | ✅ BUILT | All | Replaces "Candidates in DB" card. Direct query: `applications WHERE status='hired'`, count + avg computed in-app via reduce. `hired_at` nullable — guarded with `IS NOT NULL`. `calcTimeToHire()` in `lib/utils/dashboard.ts`. Shipped Wave 1 (`f7ceb50`). |
| R9 | Source quality: hire rate per source with minimum cohort | ✅ BUILT | Growth+ | Volume bar + hire rate badge side-by-side. Rate suppressed when total < 5 (D13 cohort rule). `aggregateSourceQuality(activeRows, hiredRows, minCohort=5)` in `lib/utils/dashboard.ts`. Shipped Wave 2 (`7c92c54`). |
| R10 | At-risk jobs widget with healthy empty state | ✅ BUILT | All | At-risk = open ≥21 days AND <3 active apps AND no app in 7 days. CTAs: "Refresh JD" + "Clone" (`?action=clone`). **Always renders** — green empty state when all jobs healthy. `findAtRiskJobs()` in `lib/utils/dashboard.ts`. Shipped Wave 2 (`7c92c54`). |
| R11 | Daily AI Briefing card (cached per org per day) | ✅ BUILT | Growth+ | OpenAI structured output: `{win, blocker, action}`. Cache-first via `org_daily_briefings(org_id, date)`. Regenerate button (admin only). Suspense boundary. Logs `action='daily_briefing'` to `ai_usage_logs`. Migration 021. Inngest function `analytics-generate-briefing`. Shipped Wave 3. |
| R12 | Recent apps: links + stage + status | ✅ BUILT | All | Each row `<Link href="/candidates/<id>">`. Stage name badge + status chip (hired=green, rejected=muted, active=default). Shipped Wave 1 (`f7ceb50`). |
| R13 | Mine mode cookie persistence + data freshness timestamp | ✅ BUILT | All | `mine_mode` cookie (7-day, sameSite strict) as default; URL param overrides. `<MineToggle>` client component sets cookie on click. "as of HH:MM" server-rendered below page title. Shipped Wave 1 (`f7ceb50`). |

---

## 24. Compliance & DEI

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| D1 | GDPR + EEOC compliant out of the box | ✅ BUILT | All | RLS, audit logs, GDPR erasure (ADR-010), consent checkbox |
| D2 | Anonymize profiles for blind screening | 🟠 v2.0 | Growth+ | `is_anonymized` column exists. Toggle UI needed |
| D3 | Automated data retention policies | 🟠 v2.0 | Growth+ | Inngest cron + retention config. Schema ready (D13) |
| D4 | AI flags biased job descriptions/screening | 🔶 2.6 | Growth+ | Same as J5 — OpenAI moderation |
| D5 | Audit logs for legal defensibility | ✅ BUILT | All | Trigger-based, append-only, monthly partitions (ADR-007) |
| D6 | Self-service data deletion (right to erasure) | 🟠 v2.0 | All | `erase_candidate()` exists (ADR-010). Needs self-service link |

---

## 25. Mobile Experience

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| M1 | Review/score/move candidates from phone | ✅ BUILT | All | Kanban rewritten with dnd-kit, optimistic UI, DragOverlay, arrow-button fallback (Phase 2.7) |
| M1-K | Kanban card health indicator — coloured left border by days-in-stage | 🔵 AI-Proof Wave C | All | Green (healthy) / amber (stalled vs. org avg) / red (at risk, uses `findAtRiskJobs` criteria). `days_in_stage` data already computed (CP2). Zero new queries. Makes the board intelligence, not just a list. |
| M2 | Mobile interview feedback form | 🟢 P3 | All | Scorecard form designed mobile-first |
| M3 | Mobile application experience for candidates | ✅ BUILT | All | Career portal already works; polish spacing/touch targets |
| M4 | Push notifications on phone | 🟠 v2.0 | Growth+ | Requires PWA or native app — significant effort |

---

## 26. AI Copilot

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| AI1 | NL questions: "top 5 candidates for Senior Engineer?" | 🔶 2.6 | Growth+ | **Core Phase 2.6.** Command bar NL → search + rank. ⚠️ `move_stage` intent is **parsed** (intent.ts defines it) but **not executed** — `executeCommand()` has no handler for it; returns intent to frontend only. **AI-Proof Wave B**: wire to `moveStage()` SA with confirmation step (one new case in executeCommand). |
| AI2 | AI daily summary: where every open role stands | 🟡 v1.1 | Growth+ | Inngest morning digest + OpenAI summarization |
| AI3 | AI suggests next best action on every open role | 🔶 2.6 | Growth+ | Command bar context: stale candidates, pending feedback. **AI-Proof Wave C**: CP10 (Next Best Action strip on candidate profile) is the on-page equivalent. |
| AI4 | AI drafts all candidate communications | 🔶 2.6 | Growth+ | Command bar: "draft update for all phone screen candidates". Context enrichment shipped in Wave B (see N1). |
| AI5 | AI meeting brief before debrief (scores + feedback summary) | 🟢 P3 | Pro+ | AI scorecard summarization before panel debrief |

---

## 27. Admin, Security & Permissions

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| AD1 | Role-based access controls with granular permissions | ✅ BUILT | All | 5 roles × 30 permissions (Phase 1) |
| AD2 | SSO with Okta/Google/Azure AD | 🔴 v3.0+ | Enterprise | SAML2 integration |
| AD3 | Full audit trail of every action | ✅ BUILT | All | Trigger-based audit_logs (ADR-007) |
| AD4 | Data residency settings | 🔴 v3.0+ | Enterprise | data_region column exists. Deployment config needed |
| AD5 | API access for internal tools/data warehouse | 🟠 v2.0 | Pro+ | REST API + api_keys table (D02) |
| AD6 | Agency recruiter access and submission management | 🟠 v2.0 | Pro+ | Separate access tier. Candidate submissions routed through pipeline |
| AD7 | Interviewer groups for panel assignment by role type | 🟢 P3 | All | Group → members table. Needed for scheduling + access control in P3 |

---

## 28. Talent Intelligence & Sourcing Engine

> **Design rationale (2026-03-11):** This module was scoped after a deep capability analysis. The original concept described a "30+ data source" sourcing platform (comparable to SeekOut or Findem). That framing requires LinkedIn partnerships, data vendor contracts, and GDPR consent chains that are not feasible pre-revenue. This section splits the concept into two realistic tracks: **Track A — Internal Talent Intelligence** (buildable now with existing stack) and **Track B — External Sourcing** (requires data vendor). Four stories from the original concept are ❌ OUT with explicit rationale in the excluded table below.

### Track A — Internal Talent Intelligence (v1.1, existing stack)

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| TI1 | NL search over internal candidates + talent pools | 🟡 v1.1 | Growth+ | pgvector + intent parsing already in stack. Scoped to internal ATS data only |
| TI2 | AI summary per candidate explaining why they match the current search | 🟡 v1.1 | Growth+ | Context-aware OpenAI call per search. Distinct from static AiMatchPanel bio |
| TI3 | Real-time calibration filters: seniority, skills, activity, location, source | 🟡 v1.1 | All | All filterable fields already in schema. No new DB work |
| TI4 | Hover preview panel: skills, experience, AI insights without opening profile | 🟡 v1.1 | All | Pure UI work. All data available. Popover on search result row |
| TI5 | Bulk export sourced candidates to a specific pipeline stage in one click | 🟡 v1.1 | Growth+ | `moveStage` action exists. Bulk loop with 50-candidate limit |
| TI6 | Skills normalization — "React", "ReactJS", "React.js" treated as same skill | 🟡 v1.1 | All | `skill_aliases` lookup table: 1 migration + 1 query change |
| TI7 | Tag talent pool members by role, stage, or tier | 🟡 v1.1 | All | Tags = metadata column on `talent_pool_members`. One migration away |
| TI8 | Deduplication: check sourced candidates against existing records before adding | 🟡 v1.1 | All | Email dedup exists (A5). Extend with embedding-based soft dedup |

### Track B — External Sourcing (v2.0, requires new integrations)

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| TI9 | GitHub opt-in enrichment: commit activity and repo signals | 🟠 v2.0 | Growth+ | GitHub public API. Candidate-provided opt-in only — GDPR-safe |
| TI10 | External data vendor integration (Apollo.io or People Data Labs) | 🟠 v2.0 | Pro+ | ~$299–999/month vendor subscription. REST API via Inngest. No scraping |
| TI11 | Heuristic engagement score: likelihood to respond based on internal signals | 🟠 v2.0 | Pro+ | Formula-based score over internal data. ML model: v3.0+ |

---

## v1.0 Launch Story Count

| Phase | Stories | Status |
|-------|---------|--------|
| ✅ Built (Phase 0–2.7 partial) | 21 | Done |
| 🔶 Phase 2.6 (AI core) | 18 | Complete |
| 🔷 Phase 2.7 remaining | 14 | In progress |
| 🟢 Phase 3 (Interviews) | 17 | After 2.7 |
| 🟣 Phase 4 (Offers) | 2 | After P3 |
| 🔵 Phase 5 (Billing) | 0 | Parallel |
| **v1.0 total** | **72** | — |
| ━━━ **LAUNCH BOUNDARY** ━━━ | | |
| 🟡 v1.1 | 21 | 4–6 wks post |
| 🟠 v2.0 | 50 | 3–4 mo post |
| 🔴 v3.0+ | 17 | 9+ mo post |
| ❌ Out of scope | 13 | Never |
| **Grand total** | **173** | — |

> **2026-03-11 delta (original):** +11 stories (TI1–TI11, §28). S1 moved v2.0→v1.1 (talent_pools built). Built: 15→21. Phase 2.7 remaining: 3 (J3, C2, M3). Total: 98→113.
>
> **2026-03-11 delta (new stories from full story map review):** +60 stories across 8 new sections (JD, BE, AR, CP, CL, IP, CI, SR) and 4 expanded sections (T, N/ET, H, AD). New v1.0 pre-launch: JD1-4 (🔷), AR4-5 (🔷), CP2/4/7/8 (🔷), CL2 (🔷), T7-10 (🟢+🔷), ET1-4 (🟢), JI1/3 (🔷), SR6 (🔷), AR3 (✅). New post-launch: BE1-5, AR1/2/6, CP3/5/6, CL1/3-6, IP1-6, CI1-7, H5-8, SR1-5, AD6-7, JI2/4. New ❌ OUT: BE4, IP2/3, H5. Total: 113→173.
>
> **2026-03-11 delta (Phase 2.7 final pass):** All Phase 2.7 user stories completed. Marked ✅ BUILT: JI1, JI3, SR6, CP2, CP4, CP7, CP8, CL2, AR4, AR5, T10, JD1, JD2, JD3, JD4, C2, M3. Phase 2.7 is complete. Next: Phase 3 (interviews + scorecards with AI summarization).
>
> **2026-03-12 delta (Wave E — pre-Phase 3 completeness):** 10 gaps fixed. Migrations 023–025. Candidate embedding auto-generation (Inngest pipeline), resume_text persistence, bias check banner rendering, slug collision fix, candidate edit panel, candidate_notes table + 16 RLS tests, moveStage revalidation, atomic reorder_pipeline_stages RPC, email context enrichment wiring, batch embedding backfill SA. No new user stories — all fixes to existing built stories. Phase 3 unblocked.

---

## Phase 2.7 Priority Stack — ✅ ALL COMPLETE

1. ~~**J3** — Clone job + AI rewrite~~ ✅ DONE
2. ~~**R1/R4 dashboard P0 fixes**~~ ✅ DONE
3. ~~**R3/R4 dashboard P1 fixes**~~ ✅ DONE
4. ~~**J3 Wave 5: post-clone checklist (D4), command bar intent (E2)**~~ ✅ DONE
5. ~~**JD1/JD2/JD3/JD4** — Job description quality panel~~ ✅ DONE
6. ~~**JI1/JI3** — Per-job stage counts + pipeline breakdown~~ ✅ DONE
7. ~~**SR6** — Recruiter dashboard personalization~~ ✅ DONE
8. ~~**CP2/CP4/CP7/CP8** — Candidate profile improvements + migration~~ ✅ DONE
9. ~~**CL2** — Multi-dimensional candidate filters~~ ✅ DONE
10. ~~**AR4/AR5 + T10** — Inline actions + sequential navigation~~ ✅ DONE
11. ~~**C2/M3** — Mobile polish~~ ✅ DONE

**Phase 3 is next:** Interviews + scorecard templates + AI interview summarization.

---

## Stories Excluded (with rationale)

| # | Story | Why excluded |
|---|-------|-------------|
| S4 | Auto-enrich from public data | GDPR scraping risk. Let candidates self-enrich |
| I6 | Video transcription + summarization | Build vs buy. Use Otter.ai/Grain |
| IP2 | Interviewer talk ratio | Requires audio analysis. Depends on I6 (❌) |
| IP3 | Flag illegal questions in real time | Requires real-time transcription. Depends on I6 (❌) |
| JB1 | Post to 200+ job boards | Aggregator product (Broadbean/Joveo), not ATS core |
| JB2 | AI adapts copy per board | Depends on JB1 |
| JB5 | Job board budget management | Accounting, not ATS |
| BE4 | Find verified email while browsing | GDPR + ToS scraping risk. Integrate Apollo/Hunter |
| H5 | Payroll/compliance actions in onboarding portal | HRIS scope. Use Rippling/Gusto |
| TI-X1 | Auto-aggregate profiles from 30+ external sources | LinkedIn ToS prohibits automated collection. GDPR consent chain impossible. S4 precedent applies |
| TI-X2 | LinkedIn job-seeking signal detection | LinkedIn API restricts this to approved Talent Solutions partners ($50K+/year). Not feasible pre-revenue |
| TI-X3 | ML-based engagement prediction model | Requires labeled training data that doesn't exist at launch. Revisit v3.0+ |
| TI-X4 | Auto-refresh candidate profiles from external sources | Blocked: no external source access (TI-X1 ❌). Revisit when TI10 data vendor integrated |
