# D25 — User Personas & Journey Maps

> **ID:** D25
> **Status:** Complete (Review)
> **Priority:** P2
> **Last updated:** 2026-03-11
> **Depends on:** D00 (Competitive Analysis — pain points), D06–D12 (module user stories)
> **Depended on by:** D05 (Design System — dashboard priorities), D08 (Notifications — channel defaults)
> **Architecture decisions assumed:** ADR-005 (multi-org switching), P-19 (external users separate auth)

---

## 1. Overview

Five distinct personas use Eligeo. Each has different goals, workflows, frequency of use, and pain thresholds. This document defines who they are, what they do daily, how they move through the system, and where friction lives.

**Design principle:** The system must serve all five personas without requiring any of them to understand the others' complexity. A hiring manager should never see recruiter admin. A candidate should never need to create an account.

---

## 2. Persona Profiles

### 2.1 Admin (Organization Owner / HR Director)

| Attribute | Detail |
|-----------|--------|
| **Role in system** | `owner` or `admin` (D01 organization_members.role) |
| **Frequency** | Daily during setup, weekly during steady-state |
| **Primary goal** | Configure the system, manage team, ensure compliance |
| **Secondary goal** | Monitor org-wide hiring metrics, control costs |
| **Tech comfort** | High. Willing to configure settings. Expects self-serve. |
| **Frustration threshold** | Low tolerance for implementation delays or support tickets for basic config |

**What they do:**
- Set up organization (onboarding wizard, D19)
- Manage team members (invite, roles, suspend/remove)
- Configure pipeline templates with stages and auto-actions (D12)
- Define scorecard templates (D01 §5)
- Set up integrations (Nylas calendar, Merge.dev HRIS, Dropbox Sign)
- Configure custom fields (D01 §7)
- Review analytics dashboards (D17)
- Manage billing and plan changes (D03)
- Handle compliance (GDPR DSAR requests, consent management, D13)
- Configure webhook endpoints (D08)

**Key screens:**
- Settings hub (team, integrations, billing, compliance)
- Pipeline template builder
- Scorecard template editor
- Analytics dashboard (org-wide view)
- Audit log viewer

**Competitor pain they escaped (D00):**
- SAP: $200K–$2M implementation → We: self-serve onboarding wizard
- Greenhouse: 3–6 month implementation → We: productive on day one
- Workday: requires full-time HRIS specialist → We: no specialist needed

---

### 2.2 Recruiter

| Attribute | Detail |
|-----------|--------|
| **Role in system** | `recruiter` (D01 organization_members.role) |
| **Frequency** | All day, every day. This is their primary work tool. |
| **Primary goal** | Fill roles fast with quality candidates |
| **Secondary goal** | Reduce manual work, maintain candidate relationships |
| **Tech comfort** | Medium. Wants efficiency, not configuration. |
| **Frustration threshold** | Zero tolerance for slow pages or excessive clicks |

**What they do (daily workflow):**
1. **Morning:** Check dashboard — new applications, pending scorecards, SLA warnings
2. **Review applications:** Scan candidate profiles, resume parsing results, AI match scores
3. **Move candidates:** Drag on kanban board, triggering auto-actions (D12)
4. **Schedule interviews:** Use scheduling widget → Nylas calendar integration (D07)
5. **Send communications:** Email templates, candidate status updates (D08)
6. **Create offers:** Select template, customize compensation, submit for approval (D06)
7. **Manage talent pools:** Add promising rejected candidates for future roles (D01 §3)
8. **End of day:** Check pipeline health, time-in-stage metrics (D17)

**Key screens:**
- **Kanban board** (primary workspace — most time spent here)
- Candidate profile drawer (480px side drawer)
- Application review with AI match score
- Interview scheduler
- Offer builder
- Talent pool manager
- Job opening list with pipeline summary

**Notification priorities:**
- New application (high — immediate in-app)
- Scorecard submitted (high — affects pipeline movement)
- Offer signed/declined (high — action needed)
- SLA warning (medium — time-based alert)
- Interview reminder (medium — 1 hour before)

**Competitor pain they escaped (D00):**
- Greenhouse: 10+ min page loads → We: sub-second targets (D16)
- iCIMS: 87% need supplementary tools → We: all-in-one
- Bullhorn: "looks like 2003" → We: modern design system (D05)
- Manual admin: 17.7 hours per vacancy → We: auto-actions, AI parsing, template workflows

---

### 2.3 Hiring Manager

| Attribute | Detail |
|-----------|--------|
| **Role in system** | `hiring_manager` (D01 organization_members.role) |
| **Frequency** | 2–3 times per week during active hiring. Sporadic otherwise. |
| **Primary goal** | Find the best candidate for their team |
| **Secondary goal** | Minimal time investment — hiring is a side job for them |
| **Tech comfort** | Low–Medium. They have their own tools (Slack, Jira, etc.). ATS is not their world. |
| **Frustration threshold** | Extremely low. If it takes more than 3 clicks, they'll ask the recruiter to do it. |

**What they do:**
1. Collaborate with recruiter on job requirements
2. Review shortlisted candidates (pushed to them, not self-discovered)
3. Submit scorecard ratings after interviews (D01 §5)
4. Approve/reject candidates at key pipeline stages
5. Approve offers (approval chain, D06)
6. Check status of their open roles (pipeline view)

**Key screens:**
- **Simplified job view** (their open roles with candidate counts by stage)
- Candidate profile (read-mostly, submit scorecard)
- Scorecard submission form
- Offer approval view
- Interview schedule (their upcoming interviews)

**Design implications:**
- **Progressive disclosure is critical.** Show only what's relevant to their role. Hide recruiter complexity.
- **Email/Slack notifications drive engagement.** They don't live in the ATS — bring the ATS to them.
- **Mobile-first for approvals.** They approve offers and scorecards between meetings on their phone.
- **Bias reduction:** Scorecard scores are hidden from other interviewers until all are submitted (Recruitee pattern).

**Competitor pain they escaped (D00):**
- Ashby: 3–4 week learning curve → We: hiring managers productive in minutes
- Workday: "27 steps to get anything done" → We: 3-click approval flows

---

### 2.4 Interviewer

| Attribute | Detail |
|-----------|--------|
| **Role in system** | `interviewer` (D01 organization_members.role) |
| **Frequency** | 1–5 times per week during active interview cycles. Zero otherwise. |
| **Primary goal** | Conduct fair interviews and submit structured feedback |
| **Secondary goal** | Don't waste time on tools — get in, submit scorecard, get out |
| **Tech comfort** | Varies widely (could be an engineer or a department manager) |
| **Frustration threshold** | Very low. Will ignore the system entirely if it's hard to use. |

**What they do:**
1. Receive interview notification with candidate profile + interview kit
2. Review candidate materials before the interview
3. Conduct the interview (calendar event via Nylas, D07)
4. Submit scorecard with structured ratings + notes (D01 §5)
5. Done. No further interaction until next interview.

**Key screens:**
- **Interview prep view** (candidate profile + interview kit + scorecard template)
- **Scorecard submission form** (the ONLY form they need to fill out)
- Interview schedule (their upcoming interviews)

**Design implications:**
- **One-click access from notification.** "Submit your scorecard for [Candidate]" → lands directly on the form.
- **Scorecard is THE interaction.** If the scorecard experience is bad, interviewers submit late or not at all — blocking auto-advance (D12 §5).
- **Feedback deadline reminders** (D07 `interview/feedback-reminder` cron, daily 9 AM UTC).
- **Blind scoring:** Interviewer cannot see other interviewers' scores until they submit their own.

**Competitor pain they escaped (D00):**
- Most ATS: interviewers are an afterthought → We: dedicated interviewer role with minimal-friction UX

---

### 2.5 Candidate (External)

| Attribute | Detail |
|-----------|--------|
| **Auth model** | Stateless HMAC-signed tokens. NO password. NO account. (P-19, D09) |
| **Frequency** | 1–3 sessions during application lifecycle (apply, check status, sign offer) |
| **Primary goal** | Apply quickly, know where they stand, respond to offers |
| **Secondary goal** | Feel respected — no black holes, no 50-question forms |
| **Tech comfort** | Varies. Must work for everyone from intern to executive. |
| **Frustration threshold** | If it takes more than 2 minutes or requires account creation, they leave (92% drop-off, D00 §3.1). |

**What they do:**
1. Discover job (career page, job board, referral link)
2. Apply (resume upload + minimal fields — name, email, phone, LinkedIn)
3. Receive confirmation (magic link for future status checks)
4. Check application status (candidate portal, D09)
5. Self-schedule interviews if applicable (D07 §self-scheduling)
6. Withdraw application if needed (`workflow/application-withdrawn`, D12 §8.3)
7. Review and sign offer via e-signature (Dropbox Sign, D06)

**Key screens:**
- **Career page** (ISR-rendered, org-branded, D09)
- **Application form** (minimal — resume, name, email, optional fields)
- **Candidate portal** (status tracker, magic link access, interview self-scheduling)
- **Offer review + e-sign** (embedded Dropbox Sign)

**Design implications:**
- **Zero account creation.** Magic link with HMAC token. Scoped narrowly (`scope: 'view_status'` cannot access `scope: 'sign_offer'`).
- **Mobile-first.** Many candidates apply on phones. Career page and application form must be fully responsive.
- **Instant confirmation.** After applying, immediately show "Application received" + magic link for status.
- **Status transparency.** Show pipeline stage (without internal stage names — use candidate-friendly labels).
- **Withdrawal flow routes through workflow engine** (D12 §8.3) — voids pending offers, notifies team.

**Competitor pain they escaped (D00):**
- Workday: new account per company, 60 logins per job hunt → We: zero accounts
- Taleo: 45-minute applications → We: 2-minute apply
- SmartRecruiters: 92% drop-off due to broken resume parsing → We: clean parsing + minimal required fields
- All: "resume black hole" → We: real-time status via candidate portal

---

## 3. Journey Maps

### 3.1 Recruiter Daily Journey

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Dashboard   │────→│  Review New  │────→│ Move to Next │────→│  Schedule    │
│  (AM check)  │     │ Applications │     │    Stage     │     │ Interviews   │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
                                              │                       │
                                              ▼                       ▼
                                     ┌──────────────┐     ┌──────────────┐
                                     │ Auto-actions  │     │ Nylas calendar│
                                     │ fire (D12)    │     │ sync (D07)   │
                                     └──────────────┘     └──────────────┘
                                                                  │
┌─────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  Check PM   │←────│  Manage      │←────│  Create/Send │←───────┘
│  Metrics    │     │ Talent Pools │     │   Offers     │
└─────────────┘     └──────────────┘     └──────────────┘
```

**Friction points to eliminate:**
- Application review must show AI match score + parsed resume in the same view (no tab switching)
- Kanban drag-and-drop must be instant (optimistic UI + Realtime sync, D11)
- Interview scheduling must show interviewer availability inline (no separate calendar app)

### 3.2 Hiring Manager Journey

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Notification  │────→│ Review       │────→│ Submit       │
│ (email/Slack) │     │ Candidate    │     │ Scorecard    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                           ┌────────────────────┘
                           ▼
                  ┌──────────────┐     ┌──────────────┐
                  │ Approve/     │────→│   Done.      │
                  │ Reject Offer │     │ (back to     │
                  └──────────────┘     │  their work) │
                                       └──────────────┘
```

**Friction points to eliminate:**
- Notification → action must be ONE click (deep link to exact candidate + scorecard form)
- Offer approval must work on mobile (responsive approval view)
- Never require the hiring manager to navigate the ATS — bring everything to them via notifications

### 3.3 Candidate Journey

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Discover │────→│   Apply      │────→│ Confirmation │────→│ Magic Link   │
│ Job      │     │ (2 min max)  │     │ + Magic Link │     │ Status Check │
└─────────┘     └─────────────┘     └──────────────┘     └──────────────┘
                                                                │
                     ┌──────────────────────────────────────────┘
                     ▼
           ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
           │ Self-Schedule │────→│  Interview   │────→│  Offer /     │
           │ Interview     │     │  (external)  │     │  Rejection   │
           └──────────────┘     └──────────────┘     └──────────────┘
                                                           │
                                                    ┌──────┴──────┐
                                                    ▼             ▼
                                             ┌──────────┐  ┌──────────┐
                                             │ E-Sign   │  │ Feedback │
                                             │ Offer    │  │ (future) │
                                             └──────────┘  └──────────┘
```

**Friction points to eliminate:**
- Job discovery → completed application must be < 2 minutes
- Status must be visible without contacting anyone (candidate portal)
- Self-scheduling must show available slots without back-and-forth
- Offer signing must be a single click to Dropbox Sign embed

### 3.4 Admin Setup Journey (Onboarding)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Sign Up      │────→│ Org Profile  │────→│ Invite Team  │
│ (Supabase    │     │ (name, logo, │     │ (roles +     │
│  Auth)       │     │  settings)   │     │  permissions) │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                     ┌──────────────────────────┘
                     ▼
           ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
           │ Configure    │────→│ Create First │────→│ Productive   │
           │ Pipeline     │     │ Job Opening  │     │ (same day)   │
           │ Template     │     │              │     │              │
           └──────────────┘     └──────────────┘     └──────────────┘
```

**Target:** Signup to first job posted in < 30 minutes (D19 onboarding wizard, 5 steps).

---

## 4. Notification Priority Matrix

| Event | Admin | Recruiter | Hiring Manager | Interviewer | Candidate |
|-------|-------|-----------|---------------|-------------|-----------|
| New application | — | **High** (in-app) | Low (digest) | — | — |
| Scorecard submitted | — | **High** (in-app) | Medium (email) | — | — |
| All scorecards complete | — | **High** (in-app) | Medium (email) | — | — |
| Offer approval needed | — | — | **High** (email + in-app) | — | — |
| Offer signed | — | **High** (both) | **High** (both) | — | — |
| Offer declined | — | **High** (both) | **High** (both) | — | — |
| Interview scheduled | — | Low (in-app) | Medium (email) | **High** (email + calendar) | **High** (email) |
| Interview reminder | — | — | — | **High** (email, 1hr before) | **High** (email, 1hr before) |
| Feedback overdue | — | Medium (in-app) | — | **High** (email) | — |
| SLA breach warning | **High** (email) | **High** (in-app) | — | — | — |
| Application status change | — | — | — | — | **Medium** (email) |
| Application withdrawn | — | **High** (in-app) | Medium (email) | — | — |
| DSAR request received | **High** (email) | — | — | — | — |
| Plan limit approaching | **High** (email + in-app) | — | — | — | — |
| Webhook endpoint disabled | **High** (email) | — | — | — | — |

---

## 5. Dashboard Design by Persona

### 5.1 Recruiter Dashboard (Primary — default landing page)

| Widget | Data Source | Priority |
|--------|-----------|----------|
| **Active pipeline summary** (jobs × candidates × stages) | D17 pipeline metrics | P0 |
| **New applications today** (count + quick-review link) | applications table, last 24h | P0 |
| **Pending scorecards** (blocking pipeline movement) | scorecard_submissions + interviews | P0 |
| **SLA warnings** (candidates approaching time-in-stage limit) | D12 SLA check | P1 |
| **Upcoming interviews** (next 48 hours) | interviews table + Nylas | P1 |
| **Offer status tracker** (draft → sent → signed pipeline) | offers table | P1 |
| **Source effectiveness** (which channels produce quality candidates) | D17 source metrics | P2 |

### 5.2 Hiring Manager Dashboard (Simplified)

| Widget | Data Source | Priority |
|--------|-----------|----------|
| **My open roles** (job title, candidates in pipeline, days open) | job_openings + applications | P0 |
| **Candidates needing review** (shortlisted for their action) | applications filtered by stage | P0 |
| **Pending approvals** (offers awaiting their sign-off) | offer_approvals | P0 |
| **My upcoming interviews** (next 7 days) | interviews where interviewer_id = self | P1 |

### 5.3 Admin Dashboard

| Widget | Data Source | Priority |
|--------|-----------|----------|
| **Org-wide hiring metrics** (open roles, active candidates, time-to-hire) | D17 materialized views | P0 |
| **Plan usage** (seats, active jobs, AI credits vs limits) | organizations + ai_usage_logs | P0 |
| **Team activity** (who's active, last login) | organization_members + audit_logs | P1 |
| **Compliance alerts** (pending DSARs, consent expirations) | D13 compliance tables | P1 |
| **System health** (webhook status, integration connectivity) | webhook_endpoints, nylas_grants | P2 |

---

## 6. Role-Based Navigation

### 6.1 Primary Navigation (Sidebar)

| Nav Item | Admin | Recruiter | Hiring Mgr | Interviewer |
|----------|-------|-----------|------------|-------------|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Jobs | ✅ | ✅ | ✅ (their jobs) | — |
| Candidates | ✅ | ✅ | — | — |
| Interviews | ✅ | ✅ | ✅ (theirs) | ✅ (theirs) |
| Offers | ✅ | ✅ | ✅ (approvals) | — |
| Talent Pools | ✅ | ✅ | — | — |
| Analytics | ✅ | ✅ | ✅ (limited) | — |
| Settings | ✅ | — | — | — |

### 6.2 Navigation Philosophy

- **Recruiters** see everything except Settings — this is their full-time tool.
- **Hiring Managers** see a filtered view — only their jobs, their interviews, their approvals.
- **Interviewers** see only their interviews and scorecards — minimal surface area.
- **Admins** see everything + Settings. Analytics shows org-wide data.
- **Candidates** never see this navigation — they have the candidate portal (D09), which is a separate, simplified interface.

---

*This document drives UX decisions across D05 (Design System), D08 (Notifications), and all module UIs.*
*Last updated: 2026-03-11 | Personas: 5 | Journey maps: 4*
