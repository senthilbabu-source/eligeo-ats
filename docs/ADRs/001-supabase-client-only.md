# ADR-001: Use Supabase Client Exclusively (No Prisma)

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04
> **Resolves:** AC-1 (Decisions Registry in PLAN.md)

---

## Context

S3 uses two data-access patterns: Prisma ORM in Inngest background functions (§5.1) and Supabase client in API routes (§4.3). Prisma connects with a service-role connection string and bypasses Row-Level Security (RLS) entirely. Supabase client carries the user's JWT and RLS evaluates `auth.uid()` / `current_user_org_id()` natively.

Running both patterns in the same codebase creates a dual-isolation model: some code paths are protected by RLS, others rely on manual `WHERE organization_id = ?` clauses. A single missed filter in a Prisma query exposes cross-tenant data.

This decision must be resolved before D01 (Complete Database Schema) because the chosen data-access pattern determines how RLS policies are written, how background jobs query tenant data, and whether `SET LOCAL` context is needed.

## Decision Drivers

- **Tenant isolation is non-negotiable.** RLS is the primary isolation mechanism (STACK-6). Any client that bypasses it is a risk.
- **Serverless architecture on Vercel.** Connection pooling (Supabase uses PgBouncer in transaction mode) is handled by Supabase infra — Prisma would need its own connection management.
- **Single pattern reduces surface area.** One client library to audit, one set of query patterns to review.
- **Background jobs need tenant context.** Inngest functions process tenant-specific data and must respect RLS.

## Options Considered

### Option A: Supabase Client Everywhere

| Pros | Cons |
|------|------|
| RLS enforced on every query automatically | No Prisma schema file for type generation (use `supabase gen types` instead) |
| Single client library to maintain | Less ergonomic joins than Prisma's relation API |
| `auth.uid()` and `current_user_org_id()` resolve natively | Supabase client query builder is less expressive for complex aggregations |
| Connection pooling handled by Supabase infrastructure | Must use `supabase.auth.admin` for service-level operations (explicit, auditable) |
| Background jobs use service role client with `SET LOCAL` for tenant context | Requires discipline: always set tenant context before queries in background jobs |

### Option B: Prisma Everywhere (with manual tenant scoping)

| Pros | Cons |
|------|------|
| Rich type generation from schema file | **Bypasses RLS entirely** — every query must manually filter by `organization_id` |
| Ergonomic relation API (`include`, `select`) | One missed `.where({ organizationId })` = cross-tenant data leak |
| Large ecosystem and documentation | Requires Prisma Accelerate or similar for serverless connection pooling |
| Familiar to most TypeScript developers | Cannot use `auth.uid()` in policies — must pass user context manually |

### Option C: Hybrid (Prisma for background jobs, Supabase for routes)

| Pros | Cons |
|------|------|
| Ergonomic Prisma for complex batch operations | **Two isolation models in one codebase** — the exact problem identified in S3 review |
| RLS still active for user-facing routes | Developers must know which client to use in which context |
| | Security audit must cover two query patterns |
| | A refactor moving code between contexts can silently drop RLS |

## Decision

**Chosen option: Option A (Supabase Client Everywhere)**, because:

1. RLS is the tenant isolation mechanism (STACK-6). The data-access client must respect it, not bypass it.
2. A single client pattern eliminates the class of bugs where code moves between contexts and silently loses RLS protection.
3. Supabase's `supabase gen types typescript` provides full type safety from the database schema — Prisma's type generation advantage is neutralized.
4. For background jobs (Inngest functions), we use the service-role client with explicit `SET LOCAL role = 'authenticated'; SET LOCAL request.jwt.claims = '{...}'` to activate RLS in the job's transaction context.

**Option B rejected** because manual tenant scoping is the #1 cause of multi-tenant data leaks. The entire RLS investment is wasted if the ORM bypasses it.

**Option C rejected** because it is the current S3 state and the source of this ADR. Dual patterns are architecturally unsound for a security-critical system.

## Consequences

### Positive

- Every database query, in every context, passes through RLS
- Single client pattern simplifies security audits
- No Prisma dependency to manage (schema sync, migrations, engine binary)
- `supabase gen types` keeps TypeScript types aligned with database schema automatically

### Negative

- Complex aggregation queries may require raw SQL via `supabase.rpc()` (mitigation: create database functions for complex queries, which also benefit from RLS)
- Developers unfamiliar with Supabase client need onboarding (mitigation: documented patterns in D02 API Specification)
- Background jobs require explicit tenant context setup (mitigation: shared utility function `withTenantContext(orgId, fn)` wraps all Inngest steps)

### Neutral

- Migration tooling shifts from Prisma Migrate to Supabase Migrations (both are SQL-based, minimal impact)

## References

- [S3] Enterprise Multi-Tenant ATS Pre-Plan, §4.3 (API routes), §5.1 (Inngest functions)
- [PLAN.md] Decisions Registry, AC-1
- [JOURNEY-LOG] P-02: Dual data-access patterns break tenant isolation

---

*Recorded: 2026-03-10*
