# ADR-005: Multi-Org Switching via JWT Refresh with Preferred Org

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04
> **Resolves:** AC-5 (Multi-org JWT switching mechanism)

---

## Context

S3's `custom_access_token_hook()` function selects a user's organization with `ORDER BY om.joined_at ASC LIMIT 1`. Users who belong to multiple organizations (e.g., a recruiter working with two agencies) are permanently locked to their first-joined org with no switching mechanism.

The `current_user_org_id()` helper function — which every RLS policy depends on — also uses `LIMIT 1`. If the switching mechanism changes how org selection works, every RLS policy is affected.

This must be resolved before D01 because: (a) the JWT hook function DDL needs to support org selection, (b) `current_user_org_id()` must resolve correctly for the selected org, and (c) schema changes (new columns) are needed to support the mechanism.

## Decision Drivers

- **Most users belong to one org.** The common case must be simple.
- **Multi-org users must switch without re-authenticating.** Re-auth disrupts workflow and confuses users.
- **RLS must always resolve to exactly one org.** Ambiguity = data leak or silent empty results.
- **JWT claims are the single source of truth** for RLS (STACK-6, ADR-001).

## Options Considered

### Option A: `last_active_org_id` on `organization_members` + JWT refresh on switch

| Pros | Cons |
|------|------|
| No re-authentication needed — org switcher calls a server action that updates `last_active_org_id` and refreshes the session | Requires a round-trip to update the column + refresh JWT |
| JWT hook reads `last_active_org_id` instead of `ORDER BY joined_at LIMIT 1` | Small window between DB update and JWT refresh where claims are stale |
| Single-org users unaffected — `last_active_org_id` defaults to their only org | Extra column on `organization_members` |
| `current_user_org_id()` logic unchanged — still reads from JWT claims | |

### Option B: Re-authentication per org

| Pros | Cons |
|------|------|
| JWT is always fresh for the selected org | **Terrible UX** — user must sign out and sign back in to switch orgs |
| No additional columns needed | Breaks workflow for multi-org users |
| | Password/magic-link fatigue |

### Option C: All-orgs JWT with client-side org header

| Pros | Cons |
|------|------|
| JWT contains all org memberships | **JWT bloat** — users in 5+ orgs have large tokens |
| Client sends `X-Org-Id` header to select active org | **RLS can't read HTTP headers** — breaks the security model |
| No refresh needed on switch | Requires trusting client-provided org ID (IDOR risk) |

## Decision

**Chosen option: Option A (`last_active_org_id` + JWT refresh)**, because:

1. No re-authentication — org switcher is a single click.
2. JWT claims remain the sole source of truth for RLS. No client-provided org ID.
3. The stale-JWT window is mitigated by the server action atomically updating the column and calling `supabase.auth.refreshSession()` before returning.
4. Single-org users experience zero difference — `last_active_org_id` is set on first login.

**Option B rejected** because re-auth per org is unacceptable UX.

**Option C rejected** because it requires trusting a client header for tenant scoping, which is an IDOR vulnerability.

## Schema Impact on D01

```sql
-- Add to organization_members:
ALTER TABLE organization_members
  ADD COLUMN last_active_org_id UUID REFERENCES organizations(id);

-- JWT hook changes ORDER BY to prefer last_active_org_id:
-- Instead of: ORDER BY om.joined_at ASC LIMIT 1
-- Use: ORDER BY (om.organization_id = om.last_active_org_id) DESC, om.joined_at ASC LIMIT 1
```

`current_user_org_id()` remains unchanged — it reads `org_id` from JWT claims, which the hook now sets based on `last_active_org_id`.

## Consequences

### Positive

- Multi-org users can switch with one click
- RLS security model unchanged — JWT is still the authority
- Single-org users unaffected
- No JWT bloat regardless of org count

### Negative

- One additional column on `organization_members` (minimal storage impact)
- Org switch requires a server round-trip (~200ms) to update column + refresh session (acceptable latency for an infrequent action)

## References

- [S3] §3.2 (`current_user_org_id()`), §4.1 (JWT hook)
- [PLAN.md] Decisions Registry, AC-5

---

*Recorded: 2026-03-10*
