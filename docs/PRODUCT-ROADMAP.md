# Product Roadmap & Release Strategy

> **ID:** D27
> **Status:** Review
> **Priority:** P0
> **Last updated:** 2026-03-11
> **Depends on:** D00 (competitive positioning), D03 (billing tiers), D25 (user personas), all module specs (D06–D12)
> **Depended on by:** All implementation work — this document determines build order
> **Architecture decisions assumed:** All ADRs (001–010)

---

## 1. Overview

This document translates 27 specification documents into a phased release strategy. It defines what ships in each version, the build order within each version, launch criteria, and the revenue justification for every feature decision.

**Core principle:** Ship the complete hiring loop first. Every subsequent version expands capability, never fills a gap in the core loop.

**Target customer for v1.0:** Growth-stage companies (50–200 employees) currently using BambooHR, spreadsheets, or a legacy ATS they've outgrown. They need to hire, not configure. They'll pay $29–$79/mo from day one if the tool works.

---

## 2. Release Summary

| Version | Codename | Theme | Target | Key Metric |
|---------|----------|-------|--------|-----------|
| **v1.0** | Launch | Complete hiring loop | First paying customers | 10 orgs, $1K MRR |
| **v1.1** | Velocity | Hire efficiently at volume | Reduce churn from v1.0 | 50 orgs, $5K MRR |
| **v2.0** | Intelligence | AI + automation + analytics | Justify Pro tier pricing | 200 orgs, $20K MRR |
| **v2.1** | Scale | Migration + integrations + API | Enterprise pipeline | 500 orgs, $50K MRR |
| **v3.0** | Enterprise | White-label + compliance + i18n | Enterprise contracts | 1,000 orgs, $100K MRR |

---

## 3. v1.0 — "Launch" (Complete Hiring Loop)

### 3.1 What Ships

The minimum set of features that lets a team post a job, receive applications, evaluate candidates, and make a hire — end to end. If any link is missing, the product is unusable.

| # | Feature | Persona | Spec | Plan Gate | Why v1.0 |
|---|---------|---------|------|-----------|----------|
| 1 | Signup + org creation | Admin | D19 §2 | All | Can't use the product |
| 2 | Onboarding wizard (5 steps) | Admin | D19 §3 | All | Time-to-first-value < 10 min |
| 3 | Team invites + RBAC (5 roles) | Admin | D01 §1 | All (seat limits) | Teams hire together |
| 4 | Pipeline template builder | Admin | D01 §2, D12 | All | Customizable hiring process |
| 5 | Job creation + editing | Recruiter | D01 §2 | All (job limits) | No jobs = no applications |
| 6 | Career page (branded, public) | Candidate | D09 §4–5 | All | How candidates find you |
| 7 | Application form (resume + magic link) | Candidate | D09 §6–7 | All | **Zero-account apply — our #1 differentiator** |
| 8 | Candidate list + profile view | Recruiter | D01 §3 | All | Must see who applied |
| 9 | Pipeline kanban (drag to move) | Recruiter | D12 §2–3 | All | **This IS the daily workspace** |
| 10 | Stage history tracking | Recruiter | D01 §3 | All | "When did this candidate move?" |
| 11 | Notes + @mentions | All internal | D01 §7 | All | Collaboration is table stakes |
| 12 | Basic search (PostgreSQL ILIKE) | Recruiter | D10 (fallback) | All | Find candidates by name/email/skills |
| 13 | Interview scheduling (manual) | Recruiter, HM | D07 (subset) | All | Date, time, location/link — no Nylas yet |
| 14 | Scorecard templates + submission | Admin, Interviewer | D07 §3–4 | All | **Structured hiring — our differentiator vs BambooHR/JazzHR** |
| 15 | Blind scorecard review | Interviewer | D07 §4 | All | Reduces bias — enterprise selling point |
| 16 | Score aggregation view | Recruiter, HM | D07 §5 | All | See all evaluations at a glance |
| 17 | Basic offers (create, track status) | Recruiter | D06 (subset) | All | Close the loop — no e-sign, manual "mark as accepted" |
| 18 | Email notifications (10 critical events) | All | D08 (subset) | All | App received, interview scheduled, offer status, @mention, etc. |
| 19 | Billing (Stripe Checkout + Portal) | Admin | D03 §4–5 | All | Must charge money |
| 20 | Plan enforcement (seats, jobs) | System | D03 §2 | Per plan | Feature gating from day 1 |
| 21 | Settings (org profile, team, billing) | Admin | D01, D03 | All | Basic admin |
| 22 | Audit logging (automatic) | System | ADR-007 | All | Security by design — never retrofit |
| 23 | RLS on every table | System | D01 | All | Tenant isolation — our security claim |
| 24 | GDPR consent checkbox + basic privacy | Candidate | D13 (subset) | All | Legal requirement for EU candidates |
| 25 | Error handling (ATS-XXXX codes) | System | D26 | All | Consistent, user-friendly errors |
| 26 | Health endpoints | System | D14 §4 | All | Monitoring from day 1 |

### 3.2 What Does NOT Ship in v1.0

| Feature | Why Deferred | Version |
|---------|-------------|---------|
| AI matching / resume parsing | Not needed to hire. Expensive to build. Justifies Pro tier later. | v2.0 |
| Typesense full-text search | PostgreSQL ILIKE is sufficient for < 10K candidates. | v2.0 |
| Talent pools / CRM | Retention feature, not acquisition. | v2.0 |
| Custom fields | Orgs can work with standard fields initially. | v2.0 |
| Workflow automation (auto-actions) | Manual stage moves work fine for < 50 hires/month. | v2.0 |
| Self-scheduling (Nylas) | Manual scheduling works. Nylas integration is complex. | v2.0 |
| E-signatures (Dropbox Sign) | "Mark as accepted" works. E-sign is a premium feature. | v2.0 |
| Offer approval chains | Small teams don't need multi-step approvals. | v2.0 |
| Advanced analytics | Basic counts ("X candidates this week") in v1.0. Full dashboards in v2.0. | v2.0 |
| CSV import | Manual candidate creation works for onboarding < 100 candidates. | v1.1 |
| Bulk operations | Not needed until volume exceeds manual capacity. | v1.1 |
| Webhook outbound | No external consumers exist until API access launches. | v2.1 |
| API access | No external consumers. Pro+ feature. | v2.1 |
| ATS migration (Merge.dev) | Complex. Target customers for v1.0 are spreadsheet/BambooHR users, not Greenhouse migrations. | v2.1 |
| White-label / custom domains | Enterprise feature. | v3.0 |
| i18n | English-only for launch. | v3.0 |
| GDPR automation (erasure, DSAR) | Basic consent + manual deletion for v1.0. Automation in v2.1. | v2.1 |
| Realtime (presence, live updates) | Nice-to-have. Standard page refresh works. | v2.1 |
| SSO/SAML | Enterprise-only feature. | v3.0 |
| DEI reporting | Pro/Enterprise feature. | v3.0 |

### 3.3 v1.0 Build Order

Within v1.0, features must be built in dependency order. Six phases over 12 weeks:

```
Phase 0: Infrastructure                    Week 1
  ├── Next.js 16 project init
  ├── Supabase init + core schema migrations (all 39 tables)
  ├── Tailwind CSS + shadcn/ui setup
  ├── proxy.ts middleware (auth + rate limiting skeleton)
  ├── Vitest + Playwright + MSW setup
  ├── Inngest setup
  ├── Sentry integration
  ├── Pino logger with PII redaction
  └── Golden tenant seed (D24 §3)

Phase 1: Auth + Core Tenancy               Weeks 2–3
  ├── Supabase Auth (signup, login, logout, password reset)
  ├── JWT claims hook (org_id, role, plan)
  ├── Organization creation
  ├── Team invites + role assignment
  ├── RBAC enforcement (can() helper + RLS)
  ├── RLS policies — ALL tables, ALL operations
  ├── Org switching (ADR-005) — if multi-org in v1, otherwise defer
  └── RLS integration tests (Tier 1, ADR-004)

Phase 2: Jobs + Career Page                Weeks 3–4
  ├── Pipeline template builder (CRUD + stage ordering)
  ├── Job creation/editing
  ├── Job publishing (status: draft → open → closed)
  ├── Career page (public, org-branded, ISR)
  ├── Application form (resume upload, consent, magic link confirmation)
  ├── Supabase Storage setup (resume bucket, signed URLs)
  └── E2E: Candidate applies to a job (E2E-03)

Phase 3: Candidate Pipeline                Weeks 5–6
  ├── Candidate list (sortable, filterable)
  ├── Candidate profile page
  ├── Pipeline kanban view (per job)
  ├── Stage movement (drag-and-drop + API)
  ├── Stage history (application_stage_history)
  ├── Notes (create, edit, @mention)
  ├── Basic search (PostgreSQL ILIKE on name, email, skills)
  └── E2E: Recruiter daily flow (E2E-04)

Phase 4: Interviews + Scorecards           Weeks 7–8
  ├── Scorecard template builder (categories, attributes, weights)
  ├── Interview creation (manual: date, time, duration, location/link)
  ├── Interview status management (scheduled → completed → cancelled)
  ├── Scorecard submission form
  ├── Blind review enforcement (hide others until own submitted)
  ├── Score aggregation view (weighted scores, all interviewers)
  ├── Scorecard snapshot on assign (template versioning)
  └── E2E: Interview + scorecard flow (E2E-08 subset)

Phase 5: Offers + Notifications            Weeks 9–10
  ├── Offer creation (compensation fields, no approval chain)
  ├── Offer status tracking (draft → sent → accepted/declined)
  ├── "Mark as manually signed/accepted" action
  ├── Email notification system (Resend + React Email)
  ├── 10 critical notification events (see §3.4)
  ├── Notification dispatch via Inngest
  ├── Candidate email delivery (application received, interview scheduled)
  └── E2E: Full hiring flow end-to-end (E2E-06)

Phase 6: Billing + Polish                  Weeks 11–12
  ├── Stripe Checkout integration
  ├── Stripe Customer Portal (payment method, invoice history)
  ├── Stripe webhook handlers (6 events)
  ├── Plan enforcement (seat limits, job limits)
  ├── Settings pages (org profile, team management, billing)
  ├── Onboarding wizard (5-step)
  ├── Health endpoints (/api/health, /api/health/ready)
  ├── Error boundaries (root + page + widget)
  ├── Audit log implementation (triggers on all tables)
  ├── Performance pass (< 500ms p95 target)
  ├── Bug fixes + edge case handling
  └── E2E: Signup → onboarding → first job → first hire (full journey)
```

### 3.4 v1.0 Notification Events (10)

| Event | Channel | Persona Notified |
|-------|---------|-----------------|
| `application.created` | Email + In-app | Recruiter |
| `application.stage_changed` | In-app | Recruiter, HM |
| `interview.scheduled` | Email | Interviewer, Candidate |
| `interview.cancelled` | Email | Interviewer, Candidate |
| `scorecard.submitted` | In-app | Recruiter |
| `offer.sent` | Email | Candidate |
| `offer.accepted` | Email + In-app | Recruiter, HM |
| `offer.declined` | Email + In-app | Recruiter |
| `note.mention` | Email + In-app | Mentioned user |
| `team.invited` | Email | Invited user |

### 3.5 v1.0 Launch Criteria

All must be true before launch:

- [ ] Complete hiring loop works end-to-end (apply → hire)
- [ ] RLS tests pass: all tables × all operations × 2 tenants
- [ ] E2E critical paths pass: E2E-01 through E2E-06
- [ ] Stripe billing works: subscribe, upgrade, cancel
- [ ] Career page loads in < 2s (ISR)
- [ ] Pipeline kanban loads in < 500ms
- [ ] Zero PII in logs (verified via Pino redact tests)
- [ ] Sentry configured and capturing errors
- [ ] Health endpoints responding
- [ ] GDPR consent checkbox on all application forms
- [ ] Mobile-responsive career page and application form
- [ ] Email notifications deliver within 30 seconds
- [ ] No P1 or P2 bugs open

### 3.6 v1.0 Schema Scope

All 39 tables are created in Phase 0 migrations (future-proofing). But only these tables are actively used in v1.0:

| Used in v1.0 | Created but unused until later |
|-------------|-------------------------------|
| organizations | talent_pools, talent_pool_members |
| user_profiles | custom_field_definitions, custom_field_values |
| organization_members | webhook_endpoints |
| pipeline_templates, pipeline_stages | api_keys |
| job_openings | nylas_grants |
| candidates | candidate_dei_data |
| applications, application_stage_history | candidate_encryption_keys |
| interviews | gdpr_erasure_log |
| scorecard_templates, scorecard_categories, scorecard_attributes | ai_usage_logs |
| scorecard_submissions, scorecard_ratings | email_templates (hardcoded in v1.0) |
| offers | offer_templates (simplified in v1.0) |
| offer_approvals (single auto-approve) | candidate_sources (manual entry) |
| notes | rejection_reasons (free text in v1.0) |
| files | skills, candidate_skills, job_required_skills (v2.0) |
| audit_logs | notification_preferences (defaults in v1.0) |

---

## 4. v1.1 — "Velocity" (Hire Efficiently at Volume)

**When:** 4–6 weeks after v1.0 launch.
**Trigger:** Customer feedback from first 10 orgs. These are the features they'll ask for first.

| # | Feature | Spec | Why Now |
|---|---------|------|---------|
| 1 | Email templates (customizable) | D08 §4 | Recruiters send 50+ emails/day — they need templates |
| 2 | Rejection reasons (lookup table) | D01 §3 | "Why was this person rejected?" — compliance + analytics |
| 3 | Rejection flow (with reason + optional email) | D12 §5 | Currently just "move to rejected" — needs ceremony |
| 4 | Candidate source tracking | D01 §3 | "Where do our best candidates come from?" |
| 5 | Notification preferences | D08 §6 | "How do I stop getting emails about everything?" |
| 6 | CSV import (candidates + jobs) | D19 §4 | Onboarding users migrating from spreadsheets |
| 7 | Bulk operations (move stage, reject) | D12 §6 | Volume recruiters (100+ applications) can't move one-by-one |
| 8 | Basic dashboard widgets | D17 (subset) | Pipeline funnel, time-in-stage, open jobs count, recent activity |
| 9 | Candidate status tracker (magic link) | D09 §6 | Candidates ask "what's happening with my application?" |
| 10 | Application withdrawal (candidate-initiated) | D09 §10, D12 §8.3 | Candidates must be able to withdraw |

### 4.1 v1.1 Launch Criteria

- [ ] All v1.0 criteria still passing
- [ ] CSV import handles 10K rows without timeout
- [ ] Bulk operations process 50 items in < 5 seconds
- [ ] Email templates render correctly in Gmail, Outlook, Apple Mail
- [ ] Dashboard loads in < 1 second

---

## 5. v2.0 — "Intelligence" (AI + Automation + Analytics)

**When:** Quarter 2 (3–4 months after launch).
**Goal:** Justify Pro tier pricing ($199/mo). This is where the product becomes clearly better than BambooHR/JazzHR and starts competing with Greenhouse/Lever.

| # | Feature | Spec | Plan Gate | Revenue Impact |
|---|---------|------|-----------|---------------|
| 1 | Typesense full-text search | D10 §2–3 | All | Fast search — Greenhouse's #1 complaint is slowness |
| 2 | AI candidate matching (pgvector) | D10 §4–5 | Pro+ | **"Semantic matching, not keyword"** — our claim |
| 3 | AI resume parsing | D10 | Growth+ | Auto-extract skills, experience from resumes |
| 4 | Workflow automation (auto-actions) | D12 §4 | Growth+ | Auto-email on apply, auto-notify on stage move |
| 5 | Self-scheduling (Nylas calendar) | D07 §6 | Growth+ | Eliminates back-and-forth scheduling emails |
| 6 | Offer approval chains | D06 §4 | Growth+ | Sequential approvals for compliance |
| 7 | E-signatures (Dropbox Sign) | D06 §5 | Pro+ | Digital offer acceptance — no manual "mark as signed" |
| 8 | Advanced analytics & reporting | D17 | Pro+ | Pipeline metrics, hiring velocity, source effectiveness |
| 9 | Talent pools | D01 §3 | Growth+ | CRM/nurture — retain candidates for future roles |
| 10 | Custom fields | D01 §7 | Growth+ | "Every company is different" — configuration power |
| 11 | Skills taxonomy + matching | D01 §4 | Growth+ | Structured skill tracking per candidate and job |
| 12 | AI scorecard summarization | D07 | Pro+ | Auto-summarize interview feedback |

### 5.1 v2.0 Launch Criteria

- [ ] Typesense search returns results in < 50ms
- [ ] AI matching returns ranked candidates in < 3 seconds
- [ ] Nylas calendar sync bidirectional and working
- [ ] E-signature round-trip (send → sign → webhook → status update) works
- [ ] Auto-actions fire reliably on stage transitions (Inngest)
- [ ] Analytics dashboard renders 12 months of data in < 2 seconds
- [ ] AI credit metering accurate (Stripe usage records match)

---

## 6. v2.1 — "Scale" (Migration + API + Compliance)

**When:** Quarter 3 (5–7 months after launch).
**Goal:** Unlock Enterprise pipeline. Companies migrating from Greenhouse/Lever need migration tooling and API access.

| # | Feature | Spec | Plan Gate | Revenue Impact |
|---|---------|------|-----------|---------------|
| 1 | ATS-to-ATS migration (Merge.dev) | D19 §5, D23 | Growth+ | **Day-one customer need for Greenhouse/Lever refugees** |
| 2 | External API + API keys | D02 §2.2 | Pro+ | Enables custom integrations — enterprise requirement |
| 3 | Webhook outbound | D02 §9, D08 | Growth+ | Event-driven integrations for technical teams |
| 4 | GDPR automation (erasure, DSAR, retention) | D13 §3–4 | Growth+ | EU customers require this for compliance |
| 5 | Crypto-shredding (ADR-010) | D13 §3.5 | Growth+ | Enterprise security selling point |
| 6 | Supabase Realtime (presence, live updates) | D11 | All | Collaborative editing, team awareness |
| 7 | Advanced audit log querying + export | D13 §7 | Pro+ | SOC 2 readiness — enterprise requirement |
| 8 | Notification digest mode | D08 §6 | All | "I get too many notifications" — retention feature |
| 9 | OpenAPI spec generation | D02 §11 | Pro+ | Developer experience for API consumers |

### 6.1 v2.1 Launch Criteria

- [ ] Greenhouse → itecbrains migration works end-to-end with real data
- [ ] API authentication (JWT + API key) both working
- [ ] Webhook delivery with HMAC signing and retry
- [ ] GDPR erasure crypto-shreds candidate data irreversibly
- [ ] DSAR export generates downloadable JSON in < 60 seconds
- [ ] Realtime presence shows active users on candidate pages

---

## 7. v3.0 — "Enterprise" (White-Label + i18n + Advanced Compliance)

**When:** Quarter 4+ (9–12 months after launch).
**Goal:** Enterprise contracts ($499+/mo). Features that large organizations require for procurement approval.

| # | Feature | Spec | Plan Gate | Revenue Impact |
|---|---------|------|-----------|---------------|
| 1 | White-label / custom domains | D20 | Enterprise | Brand control — enterprise requirement |
| 2 | Custom email sender domain (SPF/DKIM) | D20 §3 | Enterprise | Emails from `@customer.com` not `@itecbrains.com` |
| 3 | i18n (multi-language) | D21 | All | EU market expansion |
| 4 | SSO/SAML | D03 | Enterprise | Procurement requirement for 500+ employee companies |
| 5 | DEI reporting (EEO-1 export) | D13 §6, D17 | Pro+ | US compliance requirement for 100+ employee orgs |
| 6 | HRIS integration (Merge.dev) | D19 | Enterprise | Sync employees, departments, locations from Workday/BambooHR |
| 7 | Data region selection | D13 §9 | Enterprise | EU data residency — enterprise procurement |
| 8 | Advanced role customization | D01 | Enterprise | Custom permission sets beyond 5 standard roles |
| 9 | "Powered by" badge removal | D20 §5 | Enterprise | Brand control |

### 7.1 v3.0 Launch Criteria

- [ ] Custom domain with SSL working (Vercel + DNS verification)
- [ ] Career page renders in customer's domain and branding
- [ ] i18n: en-US and en-GB complete, framework ready for additional locales
- [ ] SSO/SAML working with Okta and Azure AD
- [ ] EEO-1 CSV export matches EEOC Component 1 format

---

## 8. Post-v3.0 Backlog (Not Scheduled)

Features identified in D00 gap analysis (G-01 through G-07) that are post-MVP:

| Feature | Source | Trigger |
|---------|--------|---------|
| Career site builder (drag-and-drop) | D00 G-01 (Teamtailor's moat) | When career page customization requests exceed template capabilities |
| Sourcing database | D00 G-02 (Workable's 260M) | If we enter the sourcing market (strategic decision) |
| AI interview notetaker | D00 G-03 (Ashby innovation) | When video interview integration ships |
| Hiring predictions / forecasting | D00 G-04 (Greenhouse) | When analytics data is mature (12+ months) |
| AI job description generator | D00 G-05 | Quick win — could be v2.0 if time allows |
| Video interviewing (native) | D00 G-06 | Strategic decision — build vs integrate |
| Fraud detection (AI-generated applications) | D00 G-07 | When application volume warrants it |

---

## 9. Feature-to-Plan Mapping (Cross-Reference)

How D03's feature matrix maps to release versions:

| D03 Feature | Plan | Version | Notes |
|-------------|------|---------|-------|
| Core hiring loop | All | v1.0 | Base product |
| Email templates | All | v1.1 | — |
| CSV import / bulk ops | Growth+ | v1.1 | — |
| Custom fields | Growth+ | v2.0 | — |
| AI resume parsing | Growth+ | v2.0 | — |
| AI candidate matching | Pro+ | v2.0 | Key Pro differentiator |
| Workflow automation | Growth+ | v2.0 | — |
| Advanced analytics | Pro+ | v2.0 | Key Pro differentiator |
| API access | Pro+ | v2.1 | — |
| Webhook outbound | Growth+ | v2.1 | — |
| GDPR automation | Growth+ | v2.1 | — |
| White-label | Enterprise | v3.0 | — |
| SSO/SAML | Enterprise | v3.0 | — |
| i18n | All | v3.0 | — |

---

## 10. Risk Mitigation

### 10.1 What If v1.0 Gets No Traction?

| Signal | Response |
|--------|----------|
| < 5 signups in first month | Problem is marketing, not product. Career page + application form should be live for customer demos even before full product. |
| Signups but no activation (< 30% create first job) | Onboarding wizard friction. Simplify. Add demo data option. |
| Activation but churn within 30 days | Missing feature — survey churned users, pull forward v1.1/v2.0 features they need most. |
| "Works but too basic" feedback | Expected. Ship v1.1 fast (4–6 weeks). Set expectations on roadmap page. |

### 10.2 What If a Competitor Feature Becomes Table Stakes?

| Scenario | Response |
|----------|----------|
| AI matching becomes expected at all price points | Accelerate v2.0 AI features. Consider offering basic AI in Growth tier. |
| Self-scheduling becomes mandatory | Pull Nylas integration from v2.0 into v1.1. |
| Customers demand API from day 1 | Ship read-only API in v1.1 (low effort). Full CRUD in v2.1. |

### 10.3 Build Order Risks

| Risk | Mitigation |
|------|-----------|
| Supabase RLS adds development overhead | Invest in Phase 0 properly. Golden tenant + RLS test generator (D24) prevents rework. |
| Stripe integration takes longer than expected | Start Stripe in Week 9 (Phase 5), not Week 11. Billing is complex. |
| Career page SEO/performance issues | ISR from day 1 (Next.js). Test with Lighthouse in CI. |
| Email deliverability problems | Use Resend with proper SPF/DKIM from launch. Test with mail-tester.com. |

---

## 11. Revenue Projections by Version

### 11.1 Conservative Scenario

| Version | Months | Orgs | Avg Revenue/Org | MRR | ARR |
|---------|--------|------|----------------|-----|-----|
| v1.0 | 0–3 | 10 | $54 (mix Starter/Growth) | $540 | $6.5K |
| v1.1 | 3–5 | 50 | $62 | $3.1K | $37K |
| v2.0 | 5–8 | 200 | $89 (Pro tier activates) | $17.8K | $214K |
| v2.1 | 8–11 | 500 | $105 | $52.5K | $630K |
| v3.0 | 11–15 | 1,000 | $125 (Enterprise) | $125K | $1.5M |

### 11.2 Key Assumptions

- **Conversion rate:** 5% of signups become paying (industry average for self-serve SaaS)
- **Average plan mix:** 40% Starter, 35% Growth, 20% Pro, 5% Enterprise
- **Monthly churn:** 5% (high for early stage, improves to 3% by v2.0)
- **Seat expansion:** 20% of Growth+ orgs add seats within 6 months
- **Upgrade rate:** 15% of Starter upgrade to Growth within 3 months

---

## 12. Decision Log

Decisions made in this document that override or refine earlier specs:

| Decision | Rationale | Affected Docs |
|----------|-----------|---------------|
| All 39 tables created in Phase 0 but many unused until later | Avoids schema migration complexity when features ship. RLS + audit triggers on all tables from day 1. | D01 |
| Email templates hardcoded in v1.0 (not customizable) | Reduces scope. Customizable templates in v1.1. | D08 |
| Offer approval auto-approve (single step) in v1.0 | Small teams don't need approval chains. Full chain in v2.0. | D06 |
| No Typesense in v1.0 | PostgreSQL ILIKE is sufficient for < 10K candidates. Avoids Typesense infra dependency. | D10 |
| No Nylas in v1.0 | Manual scheduling works. Reduces third-party dependency for launch. | D07 |
| No AI features in v1.0 | Expensive, complex, and not needed to complete a hiring loop. Justifies Pro tier in v2.0. | D10, D03 |
| Multi-org switching in v1.0 only if trivial | ADR-005 is designed but implementation may be v1.1 if it delays launch. | ADR-005 |
| Career page is mobile-first | 60%+ of job seekers browse on mobile. D05 responsive breakpoints apply. | D05, D09 |
| Candidate tracker page ships in v1.1, not v1.0 | Candidates get email notifications in v1.0. Self-service tracker is v1.1. | D09 |

---

## 13. What to Build After This Document

This document is the bridge between documentation and code. The next step is **project initialization**:

1. `npx create-next-app@latest` with TypeScript, Tailwind, App Router
2. `npx supabase init` — local development database
3. Install dependencies: `@supabase/ssr`, `inngest`, `@sentry/nextjs`, `pino`, `zod`, `msw`, `@upstash/ratelimit`
4. Configure: `vitest.config.ts`, `playwright.config.ts`, `proxy.ts`, `.env.local`
5. Create golden tenant seed (`src/__fixtures__/golden-tenant.ts` → `supabase/seed.sql`)
6. Write first migration: all 39 tables from D01
7. Begin Phase 1: Auth + Core Tenancy

**Build order = this document's §3.3. Not document order (D01 → D21). Not feature alphabetical order. Revenue order.**

---

*Created: 2026-03-11*
