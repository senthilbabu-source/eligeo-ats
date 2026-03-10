# ADR-006: Soft Delete Policy — All Tables with `deleted_at`

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04
> **Resolves:** AC-4, SCHEMA-1 (Decisions Registry in PLAN.md)

---

## Context

S3's design principles state "SOFT DELETES ONLY — All tables have `deleted_at`" but the `applications` table omits this column. Its DELETE RLS policy is `USING (FALSE)`, preventing deletion entirely. This creates ambiguity: is the principle "all tables" or "all tables except status-lifecycle tables"?

Every RLS SELECT policy must include `AND deleted_at IS NULL` if the table supports soft delete. Inconsistency here means some queries return deleted records, others don't.

## Decision

**All tables get a `deleted_at TIMESTAMPTZ DEFAULT NULL` column. No exceptions.**

Rationale:
1. **Consistency.** Every RLS SELECT policy follows the same pattern: `WHERE organization_id = current_user_org_id() AND deleted_at IS NULL`. No developer needs to remember which tables are exceptions.
2. **GDPR compliance.** Right to erasure may require soft-deleting records across all tables before a hard purge cycle runs.
3. **Undo capability.** Accidental deletions (archive a job, remove a candidate) are recoverable.
4. **Applications specifically:** A candidate withdraws, a recruiter archives a stale application — `deleted_at` handles this cleanly without conflating it with `status = 'withdrawn'`. Status tracks business lifecycle. `deleted_at` tracks record lifecycle.

### Tables with DELETE RLS = `USING (FALSE)`

Some tables should never be deleted by application code (only soft-deleted):
- `applications` — lifecycle managed by status, archive via `deleted_at`
- `audit_logs` — append-only, never deleted (no `deleted_at` on this table — the sole exception)
- `organizations` — deactivated, never deleted

**Append-only exceptions (no `deleted_at`):**
- `audit_logs` — immutable audit trail. GDPR erasure handled by crypto-shredding (ADR-010).
- `gdpr_erasure_log` — compliance record of erasure actions. Must be retained for regulatory proof.

### RLS Pattern

```sql
-- Every SELECT policy follows this pattern:
CREATE POLICY "tenant_isolation_select" ON table_name
  FOR SELECT USING (
    organization_id = current_user_org_id()
    AND deleted_at IS NULL
  );
```

### Cleanup

A scheduled Inngest function hard-deletes records where `deleted_at < NOW() - INTERVAL '90 days'`, respecting GDPR retention requirements. This is a D13 (Compliance) concern — D01 only defines the column.

## Consequences

### Positive

- Uniform RLS patterns across all tables
- GDPR erasure path is clear
- Accidental deletions are recoverable within 90 days

### Negative

- Every query implicitly filters `deleted_at IS NULL` (mitigation: RLS handles this transparently)
- Slightly larger table sizes due to retained soft-deleted rows (mitigation: 90-day hard-delete cycle)

## References

- [S3] Design principles ("SOFT DELETES ONLY"), §2.1 (applications table)
- [PLAN.md] AC-4

---

*Recorded: 2026-03-10*
