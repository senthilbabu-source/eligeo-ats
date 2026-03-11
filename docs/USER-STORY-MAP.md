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
| ✅ BUILT | Already shipped in Phase 0–2.5 |
| 🔶 2.6 | Phase 2.6 — Command bar + AI core |
| 🔷 2.7 | Phase 2.7 — UX polish |
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
| J3 | Clone job + AI auto-updates for new location/level | 🔷 2.7 | All | Clone is CRUD, AI rewrite is Growth+ |
| J4 | Approval workflows for job requisitions | 🟠 v2.0 | Pro+ | Small teams don't need this at launch |
| J5 | AI warns about biased/exclusionary language | 🔶 2.6 | Growth+ | OpenAI moderation pass before publish |

---

## 2. AI-Powered Sourcing

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| S1 | AI searches talent pool before external sourcing | 🟠 v2.0 | Pro+ | Requires talent pool CRM (v2.0 feature) |
| S2 | AI ranks existing candidates against new job | 🔶 2.6 | Pro+ | pgvector cosine similarity — core Phase 2.6 |
| S3 | AI-suggested Boolean search strings for LinkedIn | 🟠 v2.0 | Pro+ | Nice-to-have, not core hiring loop |
| S4 | Auto-enrich profiles from public data | ❌ OUT | — | GDPR legal risk. Let candidates self-enrich via LinkedIn import |
| S5 | AI identifies passive candidates from careers page engagement | 🟠 v2.0 | Pro+ | Requires analytics tracking + talent pool |
| S6 | AI drafts personalized outreach messages | 🔶 2.6 | Growth+ | Command bar: "draft outreach for Jane re: Backend Engineer" |

---

## 3. Candidate Experience & Application

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| C1 | Apply with LinkedIn profile or resume only — no account | ✅ BUILT | All | Career portal app form (Phase 2.5). Resume upload in 2.6 |
| C2 | Mobile-first application under 3 minutes | 🔷 2.7 | All | Current form works on mobile; polish in 2.7 |
| C3 | Instant confirmation after applying with timeline | 🟢 P3 | All | Confirmation email via Inngest + Resend |
| C4 | Track application status without logging in | 🟡 v1.1 | All | Magic link to status page (D09 candidate portal) |
| C5 | Timely updates at every stage change | 🟢 P3 | All | Notification triggers on stage move (D08) |
| C6 | Withdraw application or update details | 🟡 v1.1 | All | Self-service via candidate portal magic link |

---

## 4. Branded Careers Page

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| B1 | Branded careers page without needing a developer | ✅ BUILT | All | Org-scoped `/careers?org=slug` (Phase 2.5). Branding config in 2.7 |
| B2 | Auto-display active listings filtered by dept/location | ✅ BUILT | All | Career portal already filters open jobs |
| B3 | Embed testimonials and culture videos | 🟠 v2.0 | Growth+ | Requires career page builder — complex UI |
| B4 | AI generates "Why join us" copy per department | 🔶 2.6 | Growth+ | OpenAI from company profile + dept info |

---

## 5. AI Screening & Scoring

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| A1 | AI screens all applications with match score | 🔶 2.6 | Growth+ | **Core differentiator.** pgvector embeddings + cosine similarity |
| A2 | AI surfaces top 10 from 500 applicants instantly | 🔶 2.6 | Pro+ | Ranked by fit score, filterable |
| A3 | AI flags career progression patterns from past hires | 🟠 v2.0 | Pro+ | Requires historical hire data (not available at launch) |
| A4 | Custom screening criteria per role | 🔶 2.6 | Growth+ | Job-specific required skills + weights |
| A5 | AI detects duplicate/spam applications | 🔶 2.6 | All | Email dedup already exists. AI spam detection: simple heuristics |
| A6 | Plain-language explanation of AI score | 🔶 2.6 | Growth+ | "Matched: React, Node. Missing: Kubernetes. 3 yrs vs 5 required." |

---

## 6. Interview Management & Scheduling

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| I1 | Candidate self-schedules from interviewer availability | 🟠 v2.0 | Growth+ | Requires Nylas calendar sync — complex integration |
| I2 | AI suggests optimal interview panel | 🟠 v2.0 | Pro+ | Requires scheduling history data |
| I3 | Automated reminders before interviews | 🟢 P3 | All | Inngest cron job, 24h + 1h before |
| I4 | AI-generated role-specific interview questions | 🔶 2.6 | Growth+ | Command bar: "generate questions for Backend Engineer interview" |
| I5 | Multi-stage interview pipelines with auto-progression | ✅ BUILT | All | Pipeline stages with stage_type (Phase 2). Auto-actions in v1.1 |
| I6 | Video interviews auto-transcribed and summarized | ❌ OUT | — | Use Otter.ai/Grain. Not building transcription engine |
| I7 | AI flags scheduling conflicts across panel | 🟠 v2.0 | Growth+ | Requires calendar integration (Nylas) |

---

## 7. Hiring Team Collaboration

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| T1 | Structured feedback after interviews (scorecards) | 🟢 P3 | All | Scorecard templates + submissions (D07) |
| T2 | Consolidated panel feedback in one view | 🟢 P3 | All | Score aggregation view (D07) |
| T3 | @mention colleagues on candidate card | 🟢 P3 | All | Notes with @mentions + notification (D08) |
| T4 | Candidate context before interview (resume, scores, notes) | 🟢 P3 | All | Interview prep view with all prior data |
| T5 | AI summarizes conflicting panel feedback | 🟢 P3 | Pro+ | AI scorecard summarization (D07, gated by feature flag) |
| T6 | Role-level access controls (interviewers see own candidates) | ✅ BUILT | All | RBAC 5 roles × 30 permissions (Phase 1) |

---

## 8. Communication & Notifications

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| N1 | AI drafts personalized, warm rejection emails | 🔶 2.6 | Growth+ | Command bar: "draft rejection for Jane, warm tone" |
| N2 | Automated email sequences on stage changes | 🟢 P3 | All | 10 critical event notifications (D08) |
| N3 | Communication via preferred channel (email/SMS/WhatsApp) | 🟠 v2.0 | Growth+ | Email only in v1.0. SMS/WhatsApp requires additional providers |
| N4 | Shared inbox for candidate replies | 🟠 v2.0 | Pro+ | Requires email receiving infra — complex |
| N5 | AI follow-up when candidate unresponsive 3+ days | 🟡 v1.1 | Growth+ | Inngest cron checks + AI draft |

---

## 9. Offer Management

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| O1 | One-click templated offer letter pre-filled | 🟣 P4 | All | Offer templates with merge fields (D06) |
| O2 | AI recommends compensation based on market + equity | 🟠 v2.0 | Pro+ | Requires comp data source — not available at launch |
| O3 | Send, track, e-sign without leaving platform | 🟠 v2.0 | Pro+ | Dropbox Sign integration (D06). Manual "mark signed" in v1.0 |
| O4 | Real-time visibility: opened, viewed, signed | 🟠 v2.0 | Pro+ | Requires Dropbox Sign webhook callbacks |
| O5 | Offer approval workflows (finance/HR review) | 🟠 v2.0 | Pro+ | Sequential approvals. Auto-approve in v1.0 |
| O6 | AI flags offers outside approved salary band | 🟣 P4 | Growth+ | Simple range check + AI warning |

---

## 10. Onboarding Handoff

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| H1 | Auto-trigger onboarding on offer acceptance | 🔴 v3.0+ | Enterprise | Requires HRIS integration (Merge.dev) |
| H2 | Pre-boarding checklist for new hire | 🔴 v3.0+ | Enterprise | Out of ATS core scope |
| H3 | Digital pre-joining paperwork | 🔴 v3.0+ | Enterprise | Requires document management |
| H4 | Pass candidate data to HRIS on hire | 🔴 v3.0+ | Enterprise | Merge.dev HRIS sync |

---

## 11. Talent Pool & Candidate CRM

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| P1 | Save strong candidates to tagged talent pool | ✅ BUILT | All | talent_pools + talent_pool_members tables (Phase 2). UI in 2.7 |
| P2 | AI auto-matches pool candidates to new roles | 🟠 v2.0 | Pro+ | Requires embeddings (2.6) + pool UI (2.7) + matching job |
| P3 | Nurture campaigns for past candidates | 🟠 v2.0 | Growth+ | Requires email sequence builder |
| P4 | AI scores pool candidates for role-readiness over time | 🟠 v2.0 | Pro+ | Re-score on profile updates |
| P5 | Segment pool by skills, location, availability | 🔷 2.7 | Growth+ | Filter UI on talent pool page |

---

## 12. Customizable Workflows & Automation

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| W1 | No-code drag-and-drop pipeline builder | 🔷 2.7 | All | Settings page: pipeline editor with drag-reorder |
| W2 | Auto-move candidates on actions (assessment done → interview) | 🟡 v1.1 | Growth+ | Auto-actions in pipeline_stages.auto_actions JSONB |
| W3 | AI alerts when candidate stuck in stage too long | 🟡 v1.1 | Growth+ | Inngest cron + SLA config |
| W4 | Role-specific pipelines (tech vs sales vs ops) | ✅ BUILT | All | Pipeline templates per org (Phase 2) |
| W5 | Trigger third-party actions at specific stages | 🟠 v2.0 | Pro+ | Webhook auto-action type |

---

## 13. Job Board Integrations

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| JB1 | Post to 200+ job boards in one click | ❌ OUT | — | Use Broadbean/Joveo. Not building aggregator |
| JB2 | AI adapts job copy per board audience | ❌ OUT | — | Depends on JB1 — same verdict |
| JB3 | Unified applicant view from all boards | 🟠 v2.0 | Growth+ | Parse inbound emails/webhooks from boards |
| JB4 | Analytics: which boards drive best candidates | 🟠 v2.0 | Growth+ | Source attribution from candidate_sources |
| JB5 | Job board budget management | ❌ OUT | — | Accounting feature, not ATS |

---

## 14. Reporting & Analytics

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| R1 | Real-time dashboard: time-to-hire, drop-off, diversity | 🔷 2.7 | All | Basic metrics dashboard (D17). DEI in v3.0 |
| R2 | AI proactively surfaces insights ("acceptance rate dropped 20%") | 🟠 v2.0 | Pro+ | Requires historical data baseline |
| R3 | Pipeline velocity reports (where candidates stall) | 🔷 2.7 | Growth+ | Stage duration averages from stage_history |
| R4 | Source attribution: which channel delivered each hire | 🔷 2.7 | All | candidate_sources + application.source |
| R5 | Scheduled reports to stakeholders | 🟠 v2.0 | Pro+ | Inngest cron + PDF/email generation |
| R6 | DEI funnel reports by gender/ethnicity/age | 🔴 v3.0+ | Pro+ | candidate_dei_data table exists. UI + compliance in v3.0 |
| R7 | Cost-per-hire and recruiter productivity | 🟠 v2.0 | Pro+ | Requires billing + time tracking data |

---

## 15. Compliance & DEI

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| D1 | GDPR + EEOC compliant out of the box | ✅ BUILT | All | RLS, audit logs, GDPR erasure (ADR-010), consent checkbox |
| D2 | Anonymize profiles for blind screening | 🟠 v2.0 | Growth+ | `is_anonymized` column exists. Toggle UI needed |
| D3 | Automated data retention policies | 🟠 v2.0 | Growth+ | Inngest cron + retention config. Schema ready (D13) |
| D4 | AI flags biased job descriptions/screening | 🔶 2.6 | Growth+ | Same as J5 — OpenAI moderation |
| D5 | Audit logs for legal defensibility | ✅ BUILT | All | Trigger-based, append-only, monthly partitions (ADR-007) |
| D6 | Self-service data deletion (right to erasure) | 🟠 v2.0 | All | `erase_candidate()` exists (ADR-010). Needs self-service link |

---

## 16. Mobile Experience

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| M1 | Review/score/move candidates from phone | 🔷 2.7 | All | Responsive Kanban + mobile card actions |
| M2 | Mobile interview feedback form | 🟢 P3 | All | Scorecard form designed mobile-first |
| M3 | Mobile application experience for candidates | 🔷 2.7 | All | Career portal already works; polish spacing/touch targets |
| M4 | Push notifications on phone | 🟠 v2.0 | Growth+ | Requires PWA or native app — significant effort |

---

## 17. AI Copilot

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| AI1 | NL questions: "top 5 candidates for Senior Engineer?" | 🔶 2.6 | Growth+ | **Core Phase 2.6.** Command bar NL → search + rank |
| AI2 | AI daily summary: where every open role stands | 🟡 v1.1 | Growth+ | Inngest morning digest + OpenAI summarization |
| AI3 | AI suggests next best action on every open role | 🔶 2.6 | Growth+ | Command bar context: stale candidates, pending feedback |
| AI4 | AI drafts all candidate communications | 🔶 2.6 | Growth+ | Command bar: "draft update for all phone screen candidates" |
| AI5 | AI meeting brief before debrief (scores + feedback summary) | 🟢 P3 | Pro+ | AI scorecard summarization before panel debrief |

---

## 18. Admin, Security & Permissions

| # | Story | Phase | Plan | Notes |
|---|-------|-------|------|-------|
| AD1 | Role-based access controls with granular permissions | ✅ BUILT | All | 5 roles × 30 permissions (Phase 1) |
| AD2 | SSO with Okta/Google/Azure AD | 🔴 v3.0+ | Enterprise | SAML2 integration |
| AD3 | Full audit trail of every action | ✅ BUILT | All | Trigger-based audit_logs (ADR-007) |
| AD4 | Data residency settings | 🔴 v3.0+ | Enterprise | data_region column exists. Deployment config needed |
| AD5 | API access for internal tools/data warehouse | 🟠 v2.0 | Pro+ | REST API + api_keys table (D02) |

---

## v1.0 Launch Story Count

| Phase | Stories | Status |
|-------|---------|--------|
| ✅ Built (Phase 0–2.5) | 15 | Done |
| 🔶 Phase 2.6 (AI core) | 18 | Next |
| 🔷 Phase 2.7 (UX polish) | 9 | After 2.6 |
| 🟢 Phase 3 (Interviews) | 10 | After 2.7 |
| 🟣 Phase 4 (Offers) | 2 | After P3 |
| 🔵 Phase 5 (Billing) | 0 | Parallel |
| **v1.0 total** | **54** | — |
| ━━━ **LAUNCH BOUNDARY** ━━━ | | |
| 🟡 v1.1 | 7 | 4–6 wks post |
| 🟠 v2.0 | 25 | 3–4 mo post |
| 🔴 v3.0+ | 7 | 9+ mo post |
| ❌ Out of scope | 5 | Never |
| **Total** | **98** | — |

---

## Phase 2.6 Priority Stack (the AI differentiator)

These 18 stories ship next. Ordered by impact:

1. **A1** — AI match scoring (the product's core value prop)
2. **AI1** — NL search via command bar ("top candidates for...")
3. **A6** — Plain-language score explanations (trust building)
4. **J1** — AI job description generation (first-touch wow moment)
5. **A2** — Surface top 10 from 500 (recruiter time-saver)
6. **S2** — Rank candidates against new job (talent pool leverage)
7. **A4** — Custom screening criteria per role
8. **A5** — Duplicate/spam detection
9. **J2** — AI suggests required skills
10. **J5/D4** — Bias detection in job descriptions
11. **S6** — AI drafts outreach messages
12. **N1** — AI drafts rejection emails
13. **AI3** — Next best action suggestions
14. **AI4** — AI drafts candidate communications
15. **B4** — AI "Why join us" copy generation
16. **I4** — AI interview questions
17. **J3** — Clone job + AI rewrite (clone is CRUD, AI rewrite is the differentiator)
18. **O6** — AI flags out-of-band offers

---

## Stories Excluded (with rationale)

| # | Story | Why excluded |
|---|-------|-------------|
| S4 | Auto-enrich from public data | GDPR scraping risk. Let candidates self-enrich |
| I6 | Video transcription + summarization | Build vs buy. Use Otter.ai/Grain |
| JB1 | Post to 200+ job boards | Aggregator product (Broadbean/Joveo), not ATS core |
| JB2 | AI adapts copy per board | Depends on JB1 |
| JB5 | Job board budget management | Accounting, not ATS |
