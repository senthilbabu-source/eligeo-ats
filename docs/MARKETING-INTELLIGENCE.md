# Eligeo — Marketing Intelligence

> **ID:** MKT-01
> **Format:** Markdown (git-tracked, diff-friendly, edited directly — not regenerated)
> **Status:** Living document — updated at every phase boundary
> **Last updated:** 2026-03-13 (Phase 6 complete — retroactive enrichment pass)
> **Depends on:** D00 (Competitive Analysis), D27 (Product Roadmap), D31 (Brand Guide)
> **Depended on by:** Marketing website, pitch decks, sales sheets, investor materials
> **Update protocol:** See `docs/MARKETING-UPDATE-CHECKLIST.md`

---

## Change Log

| Phase | Date | Marketing-Relevant What Shipped |
|-------|------|----------------------------------|
| Phase 0 | 2025-Q4 | Project foundation. Next.js 15 + Supabase + full RLS architecture from day one. All 39 tables with row-level isolation before a single user-facing feature was written. The security architecture was first, not an afterthought. |
| Pre-code Docs | 2025-Q4 | Architecture decisions locked: no traditional ORMs, HNSW vector indexing, trigger-based audit logs, per-candidate encryption keys for GDPR. ADRs 001–010 fixed the foundation so it never needs revisiting. Brand renamed from itecbrains ATS to **Eligeo** — name etymology: Latin *eligeo* = "I choose." Logo designed (people profiles + selection ring + checkmark). |
| Phase 1 | 2025-Q4 | Auth + Core Tenancy. Multi-org with JWT refresh on org switch. Golden-tenant fixture established for deterministic testing. Real PostgreSQL RLS tested from day one — not mocked. |
| Phase 2 | 2025-Q4 | Jobs, candidates, career portal, pipeline Kanban. Public job listings via `careers.eligeo.io/[slug]`. No-account candidate apply via tokenised link. Pipeline stages fully configurable. |
| Phase 2.5 | 2025-Q4 | Pagination, application form, org-scoped career portal. Robust multi-page candidate list at volume — tested against real data sizes. |
| ADR-011 Pivot | 2025-Q4 | **Strategic inflection: AI-first mandate adopted.** Resolved: every user-facing feature ships with an AI-assisted path from day one. No "AI deferred to v2.0." This decision locked in what makes Eligeo fundamentally different from legacy ATSs. |
| Phase 2.6 | 2025-Q4 | **Command bar shipped.** Natural language ⌘K interface. 20+ intents. Two-layer architecture: regex quick-match (zero AI cost) + GPT-4o-mini fallback. Highest-impact differentiator. No competitor had this. Also shipped: AI job description generation (streaming), bias check, title suggestions, email drafting, intent wiring. |
| Phase 2.7 | 2025-Q4 | Pipeline analytics: hire rates by source, funnel stage distribution, at-risk jobs widget (open ≥21 days + <3 active apps). Recruiter personalisation (mine mode). Job clone with AI context rewrite for different locations. JD quality scoring with inclusivity analysis. |
| Wave A–E (AI gaps) | 2025-Q4 | Closed 5 AI surface gaps: score feedback thumbs up/down, embedding staleness badge, per-match skill gap explanation, email draft panel on candidate profile, resume paste + AI parse on candidate form. |
| Phase 3 | 2025-Q4 | Interviews + Scorecards. Scheduling, scorecard templates, per-role configurable scoring. **AI scorecard summarisation** (Wave 5): after all interviewers submit, AI produces a structured hiring recommendation with signal extraction. |
| Wave F | 2025-Q4 | Notification system — in-app + email, with Inngest durable delivery (no dropped notifications on server restart). |
| Phase 4 | 2025-Q4 | **Offer management end-to-end.** 8-state offer state machine (11 transitions). AI compensation intelligence: market comp suggestion + salary band check. Dropbox Sign e-sign wiring. AI offer letter preview. Full approval workflow. |
| Hardening (H1–H4) | 2025-Q4 | Data integrity hardening: missing FK constraints, orphan RLS policies, concurrency guards on state transitions. Zero regressions introduced. Test count expanded. |
| Phase 5 | 2025-Q4 | **Stripe billing live.** Three plans enforced at the API layer — not just the UI. Credit system for AI usage with atomic consumption (no double-spend). Plan enforcement on every AI call, every job post, every seat. |
| H6 AI Hardening | 2025-Q4 | Pre-Phase 6 AI safety pass: H6-1 through H6-6. Hardened all AI endpoints against timeouts, partial responses, and credit leaks. |
| Phase 6 (P6-1) | 2026-03 | **Resume extraction pipeline.** Hybrid parsing: pdf-parse → mammoth → GPT-4o vision fallback. Every format, including scanned paper. Zod schema validation on all AI output before touching the DB. |
| Phase 6 (P6-2a) | 2026-03 | **Candidate status portal.** Token-based access (no login). AI-narrated status updates — candidates see a personal, stage-aware message instead of "Application Under Review." |
| Phase 6 (P6-2b) | 2026-03 | Candidate merge UI with AI confidence scoring. Duplicate detection with side-by-side comparison. |
| Phase 6 (P6-5) | 2026-03 | **AI batch shortlisting.** 5-dimension scoring (Skills 35%, Experience 25%, Education 15%, Domain 15%, Trajectory 10%). EEOC compliance enforced in model prompt. Tier classification: Shortlist / Hold / Reject with evidence. |
| Phase 6 (P6-3) | 2026-03 | **Dropbox Sign full integration.** Real e-sign with webhook. AI offer letter preview (Pro+). Complete offer → approve → sign → filed pipeline. |
| Phase 6 (P6-4) | 2026-03 | **Conversational AI Screening v1.** Config builder, branded candidate portal, multi-turn AI conversation, per-question scoring, AI summary for recruiter. Candidate access via magic link — no account required. |
| Phase 6 (Post) | 2026-03-13 | Post-Phase 6 audit, seed-demo.sql, W-01 stub fixed. 1,467 total tests. 33 migrations. All passing. |
| Phase 7 | — | Wave A1 Analytics (snapshots, trends, hiring velocity). Migration 033. |
| Phase 8 | — | — |

---

## 1. Core Positioning

### 1.1 One-Line Pitches

**Primary — Command bar focus:**
> The ATS that thinks before you ask. Eligeo replaces 50 browser tabs and 20 manual steps with one command bar that understands plain English.

**Variant — Enterprise angle:**
> Enterprise AI hiring — without the enterprise price tag. Eligeo brings Greenhouse-grade structured hiring and Ashby-level AI to teams that can't afford either.

**Variant — Speed angle:**
> From "we're hiring" to signed offer — without leaving one tab.

**Variant — Brand etymology angle:**
> *Eligeo* is Latin for "I choose." In hiring, that's the only decision that matters. Everything else is noise we automate.

---

### 1.2 Positioning Statement (About page / pitch decks)

Most ATSs were built to track applicants. Eligeo was built to make hiring decisions. Every feature ships with an AI-assisted path from day one — not as a premium add-on or a future roadmap item. The command bar understands plain English. The screening tool conducts real conversations. The shortlist engine scores candidates across five dimensions with built-in EEOC compliance. And none of it requires a consultant to configure.

Eligeo targets the 50–500 person company that has outgrown spreadsheets and BambooHR, but refuses to pay Greenhouse prices or spend six months on implementation. It is the first ATS built AI-first, not AI-bolted-on.

---

### 1.3 Category Definition

**How to describe the category:**
> Eligeo is an **AI-Native ATS** — not an ATS with AI features added. The difference: in Eligeo, AI is the primary interface, not a secondary panel. Every workflow has an AI path.

---

### 1.4 Brand Story

**The name:** *Eligeo* is Latin for "I choose." Every concept in hiring flows from a single act of human judgment — the choice. Everything else is overhead. Eligeo automates the overhead so the choice is cleaner, faster, and fairer.

**The logo:** Three candidate profiles arranged together — one is selected (ringed, bright, white). The mark visualises the moment of hiring decision. Simple. Immediate. Unmistakable.

---

## 2. Unique Differentiators — Features No Competitor Has

*These three capabilities are confirmed absent in Lever, Greenhouse, and Ashby as of March 2026. They anchor the hero section.*

---

### 2.1 The Natural Language Command Bar (⌘K)

**Website hero claim:**
> The first ATS you can talk to. Type anything — in plain English — and Eligeo does it. No menus. No training. No 30-tab workflow.

**How it works:** Parses natural language into 20+ structured actions using a two-layer architecture — regex quick-match for common commands (zero AI latency, handles ~60% of inputs), GPT-4o-mini for complex intent.

**Example commands:**

| What you type | What Eligeo does |
|---------------|-----------------|
| "Screen Sarah Chen for Backend Engineer" | Sends AI screening invite to that candidate for that role |
| "Draft a warm rejection for Marcus, he made it to final round" | Generates a personalised, empathetic rejection email with context |
| "Shortlist all applicants for the PM role" | Runs 5-dimension AI scoring on every applicant, produces a ranked report |
| "Clone the London DevOps role for New York" | Clones the job, rewrites the description for NY context, updates skills delta |
| "Create an offer for Jordan at $145K + 0.5% equity" | Pre-fills the offer form with AI compensation validation |
| "Who should I interview?" | Runs AI shortlisting and surfaces the top candidates with reasons |

**Why it matters for the website:**
- No competitor has a natural language command interface — Lever, Greenhouse, and Ashby all require clicking through menus
- Highest-impact demo moment — show it early, make it the homepage hero
- Directly solves the #1 ATS complaint on G2 and Reddit: "too many clicks to do simple things"

**Copy snippet (feature page):**
> "Hiring is a conversation. Your ATS should be too. Press ⌘K and just tell Eligeo what you need."

---

### 2.2 Conversational AI Screening with Real Follow-ups

**Website claim:**
> AI screening that actually listens. Eligeo doesn't just fire questions at candidates — it evaluates their answers and asks the right follow-up when something's unclear. Just like a great recruiter would.

**How it works:** Recruiters configure a question bank per job with tone instructions. Candidates access a branded screening portal via tokenised magic link — no account required. Eligeo then conducts a multi-turn conversation: rephrases questions conversationally, evaluates each answer, generates a targeted follow-up when an answer is vague or off-topic (< 50 words, or doesn't address the question topic), then produces an overall score, per-question breakdown, and AI summary for the recruiter.

**Competitor comparison:**

| Capability | Eligeo | Greenhouse Intelligence | Lever | Ashby |
|-----------|--------|------------------------|-------|-------|
| Sends screening questions | ✅ | ✅ | ❌ | ⚠️ Basic |
| Evaluates answers in real time | ✅ | ❌ | ❌ | ❌ |
| Generates contextual follow-ups | ✅ | ❌ | ❌ | ❌ |
| Per-question scoring | ✅ | ❌ | ❌ | ❌ |
| AI summary for recruiter | ✅ | ⚠️ Partial | ❌ | ❌ |
| No-account candidate access | ✅ Magic link | ❌ Requires login | ❌ Requires login | ❌ Requires login |

**Copy snippet (feature page):**
> "Other ATSs send candidates a form. Eligeo sends them a conversation. There's a difference — and candidates notice."

---

### 2.3 AI Offer Compensation Intelligence

**Website claim:**
> Make offers that close. Eligeo checks every compensation package against market benchmarks before you send it — and tells you when you're about to lose the candidate.

**How it works:**
- AI suggests a compensation range on offer creation (role, level, location, market data)
- Salary band check flags out-of-band offers before they're sent
- AI offer letter preview (Pro+) drafts the full letter with compensation details and company tone
- Complete offer state machine: Draft → Approved → Sent → Signed (or Declined/Expired/Withdrawn) — 8 states, 11 transitions, with guards preventing illegal state jumps
- All accessible from the command bar: "create offer for Jordan" pre-fills everything

No direct equivalent exists in Greenhouse or Lever. Ashby has basic salary benchmarking but not the integrated offer-creation-to-letter pipeline.

---

## 3. Near-Unique Features — 12–24 Months Ahead of Market

*These exist in some form at competitors, but Eligeo's implementation is meaningfully deeper.*

---

### 3.1 5-Dimension AI Shortlisting with Built-in EEOC Compliance

**Website claim:**
> AI that ranks candidates — not just filters them. And won't expose you to a discrimination lawsuit. Eligeo's shortlist engine scores across 5 dimensions, flags EEOC-sensitive signals, and explains every decision in plain English.

**The 5 dimensions:**

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Skills Coverage | 35% | Required skills present vs. total required. Mandatory skills trigger auto-reject if missing. |
| Experience Match | 25% | Years of relevant experience vs. minimum required. Overqualification scored, not penalised. |
| Education Match | 15% | Degree + field relevance. No degree required = 1.0 score. |
| Domain Match | 15% | Industry and company-type alignment. Derived from semantic embedding — not keyword matching. |
| Career Trajectory | 10% | Seniority progression and tenure patterns. Gaps flagged for human review, never auto-rejected. |

**Tier thresholds (transparent — not secret):**
- **Shortlist:** composite ≥ 0.72 AND skills ≥ 0.60
- **Hold:** composite ≥ 0.45
- **Reject:** composite < 0.45 OR mandatory skill missing

**EEOC compliance — enforced in the model, not just disclosed in the UI:**
- Employment gaps classified as "clarification recommended" — system prompt prohibits auto-rejection on gaps alone
- Protected characteristics (parental leave, military service, medical) acknowledged as valid gap explanations
- Every tier decision comes with specific text evidence: e.g., "Python mentioned in 3 roles over 5 years"

**Copy snippet (compliance page):**
> "Eligeo's AI doesn't just avoid discrimination — it's architected to prevent it. EEOC compliance is enforced in the model, not just disclosed in the UI."

---

### 3.2 AI Job Description Quality Scoring

Every job description is automatically analysed across 4 dimensions before publishing:

| Dimension | What it checks |
|-----------|---------------|
| Completeness | Role summary, responsibilities, requirements, benefits present |
| Gender balance | Masculine-coded word density (28 flagged terms) + feminine-coded word density (29 flagged terms). Balanced JDs attract 42% more applicants in research. |
| Bias signals | Overuse of superlatives ("rockstar", "ninja"), exclusionary language, unrealistic requirement stacking |
| Composite score | 0–100 overall quality rating with actionable suggestions |

**Why this matters in marketing:**
- Recruiters don't know their JDs are costing them applicants. This is a "wow" demo feature — paste a bad JD, watch the score drop, watch Eligeo suggest the fix.
- No competitor has a 4-dimension quality gate integrated into the JD creation flow.

---

### 3.3 Resume Parsing with Vision Fallback

**Three-layer approach:**
1. `pdf-parse` for text-selectable PDFs (fast, zero AI cost)
2. `mammoth` for DOCX (handles Word formats natively)
3. GPT-4o vision for scanned or image-based PDFs (catches what others miss)

All output is Zod schema-validated before hitting the database — corrupted or hallucinated AI output is caught at the API boundary, not discovered later in the recruiter's UI.

**Copy snippet:**
> "Every resume. Any format. Eligeo reads PDFs, Word docs, and even scanned paper resumes — and turns them into structured candidate profiles automatically."

---

### 3.4 AI-Narrated Candidate Status Portal

Candidates apply with no account required — just a magic link. When checking their status, they don't see "Application Under Review" — they see an AI-generated personal update tailored to their current stage.

**Copy snippet (candidate experience page):**
> "Your candidates deserve better than 'Application Under Review.' Eligeo gives every applicant a personalised, human-sounding status update — automatically."

---

### 3.5 At-Risk Job Intelligence

The dashboard automatically flags jobs as at-risk when they meet all three conditions: open ≥ 21 days, fewer than 3 active applications, and no new application in the past 7 days. No configuration required — this runs as a derived query on the pipeline.

**Why it matters:** Most ATSs show a job count. Eligeo shows which jobs are silently failing. The at-risk widget is a daily action item, not a vanity metric.

---

## 4. Technical Proof Points

*Verifiable claims for "Why Eligeo" / "Built Different" sections. Resonates with technical buyers.*

### 4.1 Security & Compliance

| Claim | Technical Proof | Where to use |
|-------|----------------|--------------|
| Tenant isolation on every row, not just every table | RLS on all 39+ database tables — enforced at the PostgreSQL layer, not application code. A bug in app code cannot leak another org's data. | Security / Trust page |
| Full audit trail of every action | Trigger-based audit logging on every table (ADR-007) — append-only, partitioned monthly. Enforced at the DB layer, not application code. | Compliance page, Enterprise pitch |
| GDPR erasure — cryptographic, not just deletion | Per-candidate encryption keys. Crypto-shred destroys the key — stored data is permanently unreadable even if the database were copied. | GDPR / Privacy page |
| EEOC compliance in AI scoring | Employment gaps never auto-disqualifying. Enforced in model prompt + tier rules — not just disclosed. | Compliance / AI Ethics page |
| EU AI Act compliant screening | Disclosure shown to candidates before screening begins (enforceable since August 2025). Most ATSs have not shipped this. | Compliance page |

### 4.2 GDPR — Specific Numbers to Use

| Claim | Detail |
|-------|--------|
| Data erasure SLA | 30-day legal deadline (GDPR requirement). Eligeo internal SLA: **48 hours**. |
| DSAR rights supported | All 5: Access (Art.15), Portability (Art.20), Erasure (Art.17), Rectification (Art.16), Restriction (Art.18) |
| Data retention schedule | Rejected candidates: 24 months. Withdrawn: 12 months. Hired employees: 7 years post-employment. Audit logs: 24 months. |
| Erasure mechanism | Cryptographic key destruction — the encrypted data remains but is permanently unreadable without the key. Not just a soft-delete flag. |

**Copy snippet (Privacy page):**
> "GDPR erasure in Eligeo isn't a button that soft-deletes a record. It destroys the encryption key. The data is permanently unreadable — mathematically, not just policy-wise."

### 4.3 AI Transparency & Cost Control

| Claim | Technical Proof |
|-------|----------------|
| You know exactly what AI is costing you | Every AI call — including failures and skipped operations — logged with model, token count, latency, and credit cost. |
| AI decisions are explainable, not black boxes | Shortlist scores include specific text evidence: "Python mentioned in 3 roles over 5 years." Not just a number. |
| AI never makes final decisions | Every AI output is a recommendation. Stage moves, offers, rejections — all require human confirmation. |
| Predictable AI costs | Actions priced in credits with documented weights. No surprise bills. |

**AI credit cost schedule (per action):**

| Action | Credits | Notes |
|--------|---------|-------|
| Intent resolve (command bar) | 1 | Often free — regex quick-match has zero cost |
| Email draft | 1 | Low-cost, high-frequency |
| Status narration (candidate portal) | 1 | Per update |
| Match explanation | 1 | Per candidate |
| Resume parse | 2 | Hybrid — cost only when vision fallback needed |
| Bias check | 2 | JD quality gate |
| Salary check | 2 | Compensation validation |
| JD generate | 3 | Full streaming generation |
| Shortlist score | 3 | Per candidate |
| Screening summary | 5 | Full conversation synthesis |
| Offer letter | 4 | Pro+ only |

### 4.4 Build Quality Signals

| Claim | Proof |
|-------|-------|
| 1,467 automated tests — all passing | 1,399 Vitest (unit + integration + RLS) + 68 Playwright E2E. RLS tests run against real PostgreSQL — the actual security boundary is tested, not mocked. |
| Zero-account candidate experience | Apply and screen via tokenised magic links. No signup, no password. |
| Durable background jobs — no dropped tasks | All async work (resume parsing, screening, shortlisting, email, billing) runs via Inngest with automatic retry. A server restart doesn't lose a screening session. |
| 33 database migrations — clean forward-only history | No rollbacks in production history. All migrations additive. |
| 39+ database tables — all with RLS | Security enforced at every layer, not just the sensitive ones. |

---

## 5. Feature Comparison Table

*Ready for a website `/compare` or "vs. Greenhouse" page.*

| Feature | Eligeo | Greenhouse | Lever | Ashby |
|---------|--------|-----------|-------|-------|
| Natural language command bar | ✅ Full (20+ intents) | ❌ | ❌ | ❌ |
| Conversational AI screening + follow-ups | ✅ Full | ⚠️ Basic (no follow-ups) | ❌ | ⚠️ Basic |
| 5-dimension candidate scoring | ✅ Full + EEOC compliant | ⚠️ Less transparent | ❌ | ✅ Comparable |
| AI job description generation (streaming) | ✅ Intent-aware + bias check + quality score | ✅ Basic | ✅ Basic | ✅ Basic |
| JD inclusivity / gender bias analysis | ✅ 4-dimension quality score | ❌ | ❌ | ⚠️ Basic |
| Resume parsing (PDF + DOCX + vision fallback) | ✅ Hybrid + vision fallback | ✅ Via partner | ✅ Via Fetch | ✅ Built-in |
| AI email drafting (context-enriched) | ✅ Score + stage + days context | ⚠️ Template-only | ⚠️ Template-only | ⚠️ Template-only |
| AI offer compensation intelligence | ✅ Market comp + salary band check + AI letter | ❌ | ❌ | ⚠️ Basic |
| Candidate status AI narration | ✅ Personalised per application | ❌ | ❌ | ❌ |
| AI scorecard summarisation | ✅ Auto-triggered after all submit | ⚠️ Partial | ❌ | ✅ Built-in |
| AI daily hiring briefing | ✅ Win / blocker / action | ❌ | ❌ | ⚠️ Analytics only |
| At-risk job detection | ✅ Automatic (21-day + activity threshold) | ⚠️ Manual reports | ❌ | ⚠️ Basic |
| No-account candidate apply (magic link) | ✅ Zero friction apply | ❌ Requires account | ❌ Requires account | ❌ Requires account |
| EEOC compliance in AI model (not just UI) | ✅ Enforced in prompt + rules | ⚠️ UI disclosure only | ❌ | ⚠️ Partial |
| EU AI Act compliant screening disclosure | ✅ Shipped Aug 2025+ | ❌ | ❌ | ❌ |
| Cryptographic GDPR erasure (crypto-shred) | ✅ Per-candidate keys | ⚠️ Standard deletion | ⚠️ Standard deletion | ⚠️ Standard deletion |
| 48-hour GDPR erasure SLA | ✅ | ❌ Not stated | ❌ Not stated | ❌ Not stated |
| Row-level tenant isolation (RLS) | ✅ All 39+ tables | ✅ | ✅ | ✅ |
| G2 rating | — | 4.4 ★ | 4.2 ★ | 4.7 ★ |
| Full-text search (Typesense/Elastic) | ⏳ Roadmap v2.0 | ✅ Elastic at scale | ✅ | ✅ |
| Calendar self-scheduling (Nylas/Calendly) | ⏳ Roadmap v2.0 | ✅ Cronofy | ✅ Calendly | ✅ Nylas |
| Public REST API + webhooks | ⏳ Roadmap v2.1 | ✅ Harvest API | ✅ | ✅ |
| Pricing — starts at | ✅ $29/mo | ❌ $6,000+/yr minimum | ❌ $5,000+/yr minimum | ❌ $3,000+/yr minimum |

> ⏳ = on roadmap with committed phase · ⚠️ = partial · ❌ = not available
> Competitor assessments as of March 2026 — verify against live products before publishing.

---

## 6. Pricing — What to Say and How to Say It

### 6.1 Plan Overview

| Plan | Price | Seats | Jobs | AI Credits/mo | Best for |
|------|-------|-------|------|--------------|---------|
| Starter | $29/mo | 2 | 5 active | 10 | First hires — founders and small teams |
| Growth | $79/mo | 10 | 25 active | 500 | Scaling teams hiring 10–50/yr |
| Pro | $199/mo | 25 | Unlimited | 2,000 | Talent teams with volume and structure |
| Enterprise | Custom | Unlimited | Unlimited | 10,000 | Large orgs needing SSO, HRIS integrations, SLA |

**Extra seat pricing:** Starter $15/seat, Growth $12/seat, Pro $10/seat.
**AI credit overage:** $5 per 100 credits.

### 6.2 How to Frame Pricing in Copy

**Against Greenhouse ($6,000+/yr minimum = $500+/mo):**
> Greenhouse pricing starts at $6,000/year — before implementation, before training, before you've hired a single person. Eligeo starts at $29/month. You're paying for the hiring tool, not the consultant to configure it.

**Against the "too small for an ATS" objection:**
> If you're making more than 5 hires this year, the time saved on your first hire pays for Eligeo's Starter plan. You don't need a procurement process to start.

**The AI credits angle (transparency):**
> Every AI action has a documented credit cost. Screening summary = 5 credits. Resume parse = 2. You always know exactly what you're spending — no AI mystery bills.

---

## 7. Customer Segment Messaging

### 7.1 Startup Founders (1–50 employees)

**Pain:** Making first hires is chaotic — spreadsheets and email threads, no process, every candidate a snowflake.

**Hook:** "Make your first 20 hires look like you have a Head of Talent."

**Hero line:** From first hire to repeatable process — in one afternoon.

**Lead with:** Command bar, zero-account apply, AI screening.
**Avoid:** Approval chains, EEOC reporting (too enterprise-sounding).
**CTA:** Start for free — your first job post takes 5 minutes.

---

### 7.2 Growth-Stage Companies (50–200 employees)

**Pain:** Outgrew BambooHR/JazzHR. Volume is up, quality is inconsistent, interviewers hate the scorecard process, offers taking too long.

**Hook:** "You're hiring 40 people this year. You can't afford 40 spreadsheets."

**Hero line:** Hire at volume without losing the quality bar. Eligeo's AI does the sifting — your team does the deciding.

**Lead with:** Batch shortlisting, scorecard AI summarisation, pipeline kanban, AI screening (save 2–3 hours per role on phone screens).
**CTA:** See how much time Eligeo saves per hire →

---

### 7.3 Heads of Talent / Recruiters

**Pain:** Buried in admin — scheduling, drafting rejections, reviewing 80 resumes per role. Not enough time for strategic work. Industry research shows recruiters spend 17.7 hours per vacancy on administrative tasks alone.

**Hook:** "Eligeo handles the grunt work so you can do the work only humans can do."

**Hero line:** The ATS that does the tedious parts, so you can focus on the human parts.

**Lead with:** AI screening, rejection email drafting, batch shortlisting, resume parsing, command bar ("3 clicks → 3 words").
**ROI angle:** "Reclaim 6 hours per week per recruiter."

---

### 7.4 Hiring Managers

**Pain:** Don't understand why they have to use the ATS. It's slow, confusing, and sends too many irrelevant candidates.

**Hook:** "Eligeo only sends you the candidates worth your time — and tells you why."

**Hero line:** Stop reviewing 80 resumes. Review 8 candidates with an AI explanation of why each one matters.

**Lead with:** Shortlist report with explanations, AI scorecard summary, command bar for status checks.
**Avoid:** Technical detail about how scoring works.

---

## 8. Sales Objection Handling

| Objection | Response |
|-----------|----------|
| "We already use Greenhouse and we're happy." | Greenhouse is excellent for enterprise teams with a dedicated TA ops person to configure it. Eligeo is built for teams that need Greenhouse-level structure without the implementation project. Our AI features — conversational screening, the command bar, offer compensation intelligence — aren't in Greenhouse at all. |
| "AI in hiring makes me nervous about bias." | It should. Most AI hiring tools are black boxes that don't document their bias prevention. Eligeo's shortlisting model has EEOC compliance enforced inside the model — employment gaps are never auto-disqualifying, mandatory vs. preferred skills are handled separately, and every decision comes with a plain-English explanation. We're more transparent about our AI than our competitors. |
| "Is the AI actually useful or is it gimmicky?" | The command bar alone eliminates 10+ clicks per workflow. The AI screening tool evaluates answers and asks follow-ups when candidates are vague — that's 2–3 hours per role saved on phone screens. Our customers use it on day one, not after a training programme. |
| "We're too small for a proper ATS." | Eligeo starts at $29/month and your first job post takes 5 minutes. No implementation project, no onboarding call required. If you're making more than 5 hires a year, the time saved on your first hire pays for the tool. |
| "What happens to our data?" | Your data is isolated by row-level security on every table — enforced at the database layer, not application code. GDPR erasure uses cryptographic key destruction, not just deletion. Full audit trail of every action for legal defensibility. |
| "We tried an AI ATS before and it was bad." | Most 'AI ATSs' bolted AI onto a legacy system as a marketing feature. Eligeo was designed AI-first from day one — 13 AI features, all production-quality with credit gating, error fallbacks, and full usage logging. It's a different category. |
| "How does GDPR work?" | Data retention is automated: rejected candidates erased at 24 months, withdrawn at 12, hired employees archived for 7 years post-employment. GDPR erasure requests are handled within 48 hours (vs. the 30-day legal minimum). Erasure is cryptographic — not a soft delete. |

---

## 9. Numbers for Marketing Copy

### 9.1 Product Stats (as of Phase 6 complete — 2026-03-13)

| Stat | Number | How to use |
|------|--------|-----------|
| AI features shipped | 13 | "13 AI-powered features — all available from day one, not as add-ons" |
| Command bar intents | 20+ | "20+ actions you can trigger with plain English" |
| Shortlisting dimensions | 5 | "5-dimension AI scoring — not just a single match score" |
| Database tables with RLS | 39+ | "Security enforced on every table — not just the sensitive ones" |
| Automated tests | 1,467 | "1,467 automated tests — all green" (developer / technical buyer trust signal) |
| Time to first job post | < 5 minutes | "Post your first job in 5 minutes — no implementation call required" |
| Resume formats supported | 3 (PDF, DOCX, scanned) | "Any resume format — including scanned paper resumes" |
| Candidate apply without account | Zero clicks to create | "Candidates apply in 3 minutes — no signup, no password" |
| GDPR erasure SLA | 48 hours | "GDPR erasure in 48 hours — vs. the 30-day legal minimum" |
| Offer state machine | 8 states, 11 transitions | "Every offer has a full audit trail — from draft to signed, in one place" |
| At-risk job threshold | 21 days open + < 3 apps | "Know which jobs are silently failing — before a quarter goes by" |
| AI credit actions | 11 documented | "Transparent AI pricing — every action has a documented cost" |

### 9.2 Industry Stats — Third-Party (cite source on marketing site)

| Claim | Source | How to use |
|-------|--------|-----------|
| 17.7 hours per vacancy spent on administrative tasks | Industry research (recruitment sector) | "Eligeo is built to give that time back" — recruiter segment hook |
| 92% of candidates who click Apply on Workday don't complete the application | Workday application data / HR research | "Candidates abandon complex apply flows. Eligeo's magic link apply takes 3 minutes." |
| Millions of qualified candidates rejected annually by keyword-only matching | Harvard Business School / Accenture "Hidden Workers" research | "Skills-based vector matching — not keyword filtering" — shortlisting section |
| Greenhouse implementation: typically 2–6 weeks with consultants | Greenhouse onboarding docs + G2 partner reviews | "Eligeo setup: one afternoon, no consultant" |
| Taleo implementation: 6–12 months | Enterprise HR implementation reports | Used to establish legacy ATS baseline — makes Eligeo's 5-minute setup dramatic by contrast |

### 9.3 Competitive Numbers

| Claim | Source |
|-------|--------|
| Greenhouse minimum contract: $6,000+/year | Greenhouse pricing page (invite-only) + G2 reviews citing $6K+ minimums |
| Lever minimum: $5,000+/year | Lever pricing page + Capterra review data |
| Ashby minimum: $3,000+/year | Ashby pricing page (Growth tier) |
| Ashby G2 rating: 4.7★ | G2.com (verify before publishing) |
| Greenhouse G2 rating: 4.4★ | G2.com (verify before publishing) |
| Lever G2 rating: 4.2★ | G2.com (verify before publishing) |
| "Too many clicks" is the #1 ATS complaint on G2 | G2 ATS category reviews — "navigation" and "complex UI" cited in top negative themes |
| Greenhouse profile load times: 10+ minutes reported | G2 reviews (enterprise tier) — "slow on high volumes" pattern |

---

## 10. Copy Snippets Library

### 10.1 Homepage Hero Options

**Option A — Command bar focus:**
> The ATS you can talk to.
> Press ⌘K. Type what you need. Eligeo handles the rest — from sourcing to signed offer.

**Option B — Differentiation focus:**
> Built for teams who hire. Not for teams who configure.
> Greenhouse-grade structure. Ashby-level AI. Startup-friendly pricing. No implementation consultant required.

**Option C — Speed focus:**
> Your next hire — without the 40-tab workflow.
> Eligeo's AI screens, scores, and shortlists while you focus on the humans worth your time.

**Option D — Brand story focus:**
> *Eligeo.* Latin for "I choose."
> In hiring, one decision matters. We built the AI that makes it easier to make the right one.

---

### 10.2 Trust Section Snippets

> "We tell you exactly what our AI is doing — and why. Every shortlist score comes with a plain-English explanation. No black boxes. No excuses."

> "Your data is isolated at the row level — not just the account level. A bug in application code cannot touch another customer's data. That's a database guarantee, not a policy promise."

> "GDPR erasure requests handled in 48 hours. Cryptographic key destruction — not a soft delete. We're not hiding behind a 30-day legal deadline."

---

### 10.3 Feature Subheadlines

| Feature | Headline | Subheadline |
|---------|----------|-------------|
| Command Bar | Say it. Done. | ⌘K opens Eligeo's AI command bar. Type in plain English — "screen Sarah for the PM role" — and watch it happen. |
| AI Screening | Conversations, not interrogations. | Eligeo evaluates answers and asks follow-ups, just like a great recruiter. |
| Shortlisting | From 80 resumes to 8 candidates. | 5-dimension AI scoring with evidence, EEOC compliance, and a hiring manager summary — in minutes. |
| Resume Parsing | Every resume. Instantly structured. | PDF, Word, or scanned paper — Eligeo reads it and creates a complete candidate profile automatically. |
| Candidate Portal | Candidates deserve better than "Under Review." | Every applicant gets an AI-narrated, personalised status update. Because candidate experience is your employer brand. |
| Offer Intelligence | Make offers that close. | AI compensation benchmarking + salary band compliance + AI-drafted offer letter — all before you hit send. |
| JD Generator | Write job descriptions in seconds. Good ones. | Inclusive language. Zero jargon. The right skills. AI generates your JD, scores it for quality, and checks it for bias before you publish. |
| At-Risk Jobs | Know which jobs are silently failing. | Eligeo flags open roles before they become quarter-long problems — automatically. |
| GDPR Compliance | Privacy by architecture, not policy. | Cryptographic erasure. 48-hour SLA. All 5 DSAR rights supported. Your candidates' data is safe — not because we say so, but because the math makes it impossible otherwise. |

---

### 10.4 Email / Outbound Subject Lines

- "The ATS your hiring managers will actually use (no training required)"
- "Greenhouse for $29/month (without the 6-week implementation)"
- "Your recruiting team is spending 17.7 hours per vacancy on admin. We built the fix."
- "What if your ATS understood plain English?"
- "80 applications. 8 worth interviewing. Eligeo finds the 8."
- "GDPR erasure in 48 hours. Most ATSs hope you don't ask."
- "The ATS named after the Latin word for 'I choose.' We take the decision seriously."

---

## 11. What NOT to Say

| Don't say | Why | Say instead |
|-----------|-----|-------------|
| "AI-powered hiring" | Every ATS says this. Meaningless. | "Conversational AI screening" / "5-dimension AI shortlisting" — be specific |
| "The only ATS with AI" | Not true and provably false. | "The only ATS where AI is the primary interface, not a premium add-on" |
| "Saves 10x time" | No data to back this up yet. | "Eliminates 40+ clicks per hire" — specific, verifiable |
| "Replaces your recruiter" | Scares buyers. Wrong framing. | "Gives your recruiter 6 hours back per week for the work AI can't do" |
| "Our AI is unbiased" | No AI is unbiased. Overreaches. | "Our AI is EEOC-compliant — built to assist human judgment, not replace it" |
| "Enterprise-grade" | Vague buzzword. | "Row-level security on every table. Full audit logging. Cryptographic GDPR erasure." |
| "Coming soon" features in hero | Destroys credibility. | Only feature what's shipped. Use roadmap page for what's next. |
| "Better than Greenhouse" | Invites legal and credibility risk. | "Built for teams that can't afford Greenhouse — or its implementation timeline" |
| "AI handles everything" | Wrong — and EEOC-risky. | "AI surfaces the signal. Humans make the call." |

---

*Last updated: 2026-03-13 (Phase 6 complete — retroactive enrichment pass). Next scheduled review: Phase 7 completion. See `docs/MARKETING-UPDATE-CHECKLIST.md` for the update protocol.*
