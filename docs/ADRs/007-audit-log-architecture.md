# ADR-007: Trigger-Based Audit Logging with Append-Only Table

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04

---

## Context

Audit logging is required for compliance (GDPR Article 30 processing records, SOC 2), debugging, and customer trust. The two main approaches are: (a) application-level logging (the app writes audit entries), or (b) database trigger-based logging (triggers fire on every INSERT/UPDATE/DELETE and capture the change automatically).

This affects D01 because trigger-based logging means every table needs an associated trigger definition in the schema.

## Decision Drivers

- **Completeness.** Every data mutation must be captured — no code path can skip the audit trail.
- **Reliability.** If the application crashes mid-request, the audit entry must still exist (same transaction as the data change).
- **Immutability.** Audit records cannot be modified or deleted (SOC 2 requirement).
- **Performance.** Trigger overhead must be minimal for high-throughput tables.

## Options Considered

### Option A: Database triggers (automatic, in-transaction)

| Pros | Cons |
|------|------|
| Every mutation is captured — no code path can skip it | Trigger overhead on every INSERT/UPDATE/DELETE |
| Same transaction as the data change — crash-safe | More complex trigger function (must handle all table schemas) |
| Cannot be bypassed by application bugs | Debugging trigger logic is harder than application code |
| Immutable by design (no UPDATE/DELETE on audit table) | Storage grows faster (full row snapshots) |

### Option B: Application-level logging

| Pros | Cons |
|------|------|
| Full control over what's logged | **Any code path that forgets to log = gap in audit trail** |
| Can include business context (who clicked what) | Not crash-safe — if app crashes between mutation and log write, entry is lost |
| Easier to test in isolation | Can be bypassed by direct DB access (Supabase dashboard, migration scripts) |

## Decision

**Chosen option: Option A (Database triggers)**, because:

1. Completeness is non-negotiable. Trigger-based logging captures every mutation regardless of which code path, Inngest function, or migration script caused it.
2. Transactional consistency. The audit entry is written in the same transaction as the data change. If the transaction rolls back, the audit entry rolls back too — no orphaned logs.
3. Immutability. The `audit_logs` table has no UPDATE or DELETE policies. RLS prevents modification.

### Trigger Design

```sql
-- Generic audit trigger function (applied to all audited tables)
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    organization_id,
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    performed_by,
    performed_at
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid(),
    NOW()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Applied to each table:
CREATE TRIGGER audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON table_name
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

### Tables That Get Audit Triggers

All tables EXCEPT:
- `audit_logs` itself (no recursive auditing)
- `idempotency_keys` (ephemeral, no business value in auditing)
- Read-only reference tables (if any)

### Retention & Partitioning

- `audit_logs` is partitioned by month (`PARTITION BY RANGE (performed_at)`)
- Partitions older than the retention period (configurable per org, default 2 years) are dropped
- GDPR erasure uses crypto-shredding (ADR-010), not deletion of audit records

## Consequences

### Positive

- 100% mutation coverage — no gaps in audit trail
- Crash-safe — same transaction as data change
- Immutable — SOC 2 compliant by design
- Works for all code paths: API routes, Inngest functions, migrations, manual DB access

### Negative

- Trigger overhead on every write (~1-3ms per mutation) (mitigation: acceptable for an ATS write volume; monitor via D14)
- Storage growth from full row snapshots in JSONB (mitigation: monthly partitioning + retention-based partition drops)
- Generic trigger captures all columns including potentially sensitive data (mitigation: crypto-shredding per ADR-010 handles erasure)

## References

- [S3] STRIDE threat model, Risk 3 (immutable audit log)
- [PLAN.md] D01 gap (audit_logs table missing)
- GDPR Article 30 (records of processing activities)

---

*Recorded: 2026-03-10*
