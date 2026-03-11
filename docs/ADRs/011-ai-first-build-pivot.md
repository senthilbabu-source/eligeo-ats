# ADR-011: AI-First Build Pivot — Command-First + AI-Assisted Architecture

**Status:** Accepted
**Date:** 2026-03-11
**Decision Makers:** Senthil Kumar Babu, Claude (architect)

## Context

After completing Phase 2 (Jobs + Career Portal), a comprehensive legacy-pitfall audit revealed that Eligeo was building a **traditional CRUD ATS with AI deferred to v2.0**. Six critical findings:

1. **Dated UI** — Pages feel like database admin tools, not recruiter workflows
2. **High click-count** — Common actions take 4–6 clicks; no inline editing, no keyboard shortcuts
3. **Zero customization UI** — Schema supports tenant config, but no settings pages exist
4. **Dead-end career portal** — No application form; candidates hit "coming soon"
5. **No pagination** — All list pages fetch every row; breaks at 500+ records
6. **Bolt-on AI** — Zero AI code exists; removing all AI references changes nothing

The original build order (Phase 3 Pipeline → Phase 4 Interviews → Phase 5 Offers → Phase 6 Billing) would have produced a feature-complete but undifferentiated ATS.

## Decision

**Abandon the sequential phase build order. Switch to a horizontal pass that fixes foundations, then makes AI the primary interaction model.**

### New Build Order

**Phase 2.5: Foundation Fixes** (unblocks everything)
- Pagination on all list pages
- Career portal application form
- Wire "Apply to Job" on candidate detail
- Missing indexes (migration 014)
- Org-scoped career portal

**Phase 2.6: Command Bar + AI Core** (the differentiator)
- Command bar (Cmd+K) with natural language → server action mapping
- AI resume parsing on candidate create (OpenAI structured output)
- Candidate-job fit scoring (embedding generation + pgvector similarity)
- Search (pg_trgm fuzzy now, NL search via command bar)

**Phase 2.7: UX Polish**
- Drag-drop Kanban (dnd-kit or Framer Motion)
- Settings pages (pipeline editor, sources, rejection reasons, branding)
- Dashboard with real metrics (funnel, time-to-fill, source breakdown)
- Role-aware views (interviewer queue, hiring manager scope)

**Then resume vertical feature build:**
- Phase 3: Interviews + Scorecards (with AI summarization from Day 1)
- Phase 4: Offers + Notifications (with AI-drafted communications)
- Phase 5: Billing + Polish

### What does NOT change
- All 10 ADRs remain final
- Schema design (39 tables) unchanged
- Backend architecture (Supabase RLS, Inngest, audit logging) unchanged
- Testing strategy (ADR-004) unchanged
- 30 spec documents remain authoritative for WHAT to build

### What changes
- Build ORDER (horizontal pass before vertical features)
- AI is wired into core workflows from now on, not deferred to v2.0
- Command bar becomes the primary interaction model
- Every new feature ships with AI-assisted mode from Day 1

## Consequences

### Positive
- Product differentiates from Greenhouse/Lever/Ashby on Day 1
- Fewer pages to build (command bar replaces many CRUD forms)
- AI infrastructure (vector columns, ai_usage_logs, credit metering) gets used immediately
- Recruiter experience: 1 step via NL instead of 4–6 clicks

### Negative
- Interview/Offer/Billing features ship later
- OpenAI API dependency introduced earlier (cost, latency, availability)
- Command bar is complex to build well (intent parsing, error handling, context awareness)
- Testing surface increases (AI responses are non-deterministic)

### Risks
- LLM intent parsing may be unreliable for edge cases → mitigate with fallback to traditional UI
- AI costs may surprise at scale → mitigate with credit metering (already in schema)
- Prompt injection via command bar → mitigate with input sanitization + server-side validation

## Alternatives Considered

**Path A: Stay the course** — Ship v1.0 as traditional ATS, add AI in v2.0. Rejected: produces undifferentiated product in crowded market.

**Path C: Full AI-first rebuild** — Rethink every workflow around autonomous AI. Rejected: too risky legally (NYC LL 144, EU AI Act), and the manual workflow needs to work first.

**Path B (chosen):** Fix foundations + add command bar + wire AI into existing workflows. Pragmatic middle ground.
