# ADR-004: Testing Strategy — What's Built When

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04

---

## Context

A multi-tenant SaaS with RLS-based tenant isolation, background jobs processing tenant data, and AI-powered features has a high cost of test debt. Retrofitting tenant isolation tests or auth flow tests after features ship means vulnerabilities exist in production during the gap. This ADR defines what testing is mandatory from Day 1, what's built alongside its feature area, and what's a dedicated pre-launch sprint.

## Decision Drivers

- **Tenant isolation is the #1 security invariant.** A cross-tenant data leak is an extinction-level event for a SaaS product.
- **Background jobs run outside request context.** ADR-001's `SET LOCAL` pattern must be verified — it's the only thing standing between Inngest functions and unscoped data access.
- **Test debt compounds.** Retrofitting tests for 16 tables × 4 RLS operations × 5 roles after the fact is 320 test cases nobody will write.
- **Flaky tests kill velocity.** Golden fixtures and deterministic seed data prevent "works on my machine" test failures.

## Decision

### Tier 1: Day 1 — Built alongside every feature (PR gate)

No pull request merges without these. CI fails the build.

| Type | Scope | Tool | Minimum coverage |
|------|-------|------|------------------|
| Unit tests | Every utility, helper, validation, state machine transition | Vitest | Every exported function |
| RLS integration tests | Every table: Tenant A cannot SELECT/INSERT/UPDATE/DELETE Tenant B's data | Vitest + Supabase local | All 4 ops × every table × 2 tenants |
| Role boundary tests | Every table: each of 5 roles can only do what RBAC matrix allows | Vitest + Supabase local | 5 roles × every table |
| API integration tests | Every route handler: auth required, status codes, error format (RFC 7807), pagination | Vitest + MSW | Every endpoint |
| Background job tests | Every Inngest function: tenant context setup, idempotency, failure/retry | Vitest | Every function |
| E2E critical paths | Grows per module: happy path + 1 failure path per user-facing feature | Playwright | Auth flow from Day 1, then per module |
| Golden tenant fixtures | Deterministic seed data for 2 tenants, all roles, realistic relationships | `golden-tenant.ts` | Defined alongside D01 |

### Tier 2: Built when feature area exists

| Type | Trigger | Scope |
|------|---------|-------|
| Smoke tests | CI/CD pipeline (D15) | Health endpoint, auth, DB connectivity — post-deploy gate |
| Contract tests | API spec (D02) | Request/response schemas match OpenAPI 3.1 spec |
| Accessibility tests | Design system (D05) | WCAG 2.1 AA via axe-core in Playwright on every component |
| Email/notification tests | Notifications (D08) | Template rendering, trigger conditions, preference filtering |
| Search relevance tests | Search (D10) | Known queries → expected results in expected order |

### Tier 3: Pre-launch dedicated sprint

| Type | Trigger | Scope |
|------|---------|-------|
| Performance tests | D16 | Response time per endpoint, query budget (no query >100ms) |
| Load tests | After performance baselines | Concurrent users by tier, connection pool, queue depth |
| Security tests | Auth + RLS + API complete | OWASP Top 10, IDOR beyond RLS, JWT manipulation, prompt injection, rate limits |
| Disaster recovery tests | Runbooks (D18) | Execute each runbook, verify it works end-to-end |

### Never retrofit — these are inline or 10x cost later

1. **RLS integration tests** — Every table, all 4 operations, from the moment the migration runs
2. **Background job tenant context tests** — ADR-001's `SET LOCAL` pattern is the async tenant boundary
3. **Golden tenant fixtures** — Defined with D01, shared by all test suites
4. **Auth flow E2E** — Login, logout, token refresh, org switch, expired session
5. **State machine transition tests** — Application lifecycle (D12), offer workflow (D06)

## Consequences

### Positive

- Tenant isolation is verified continuously, not assumed
- Every PR has a mechanical quality gate — no "we'll add tests later"
- Golden fixtures prevent test flakiness and ensure reproducibility
- Security and performance testing has a defined trigger, not an afterthought

### Negative

- Higher upfront cost per feature (mitigation: pays back immediately in fewer production bugs and faster debugging)
- CI pipeline is slower with integration tests against Supabase local (mitigation: parallelize test suites, use Vitest's concurrent mode)
- Developers must learn Supabase local testing patterns (mitigation: document in D01 alongside fixtures)

### Neutral

- Test tooling (Vitest, Playwright, MSW) is already specified in CLAUDE.md — no new dependencies

## References

- [ADR-001] Supabase client everywhere — defines the `SET LOCAL` pattern that background job tests must verify
- [CLAUDE.md] Testing section — Vitest, Playwright, golden-tenant.ts, MSW already specified
- [PLAN.md] D01 (schema), D02 (API), D05 (design system), D08 (notifications), D10 (search), D15 (CI/CD), D16 (performance), D18 (runbooks) — all referenced as triggers

---

*Recorded: 2026-03-10*
