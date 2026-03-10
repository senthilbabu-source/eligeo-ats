# ADR-010: GDPR Erasure via Crypto-Shredding + Selective Anonymization

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04

---

## Context

GDPR Article 17 (Right to Erasure) requires deleting personal data on request. However, audit logs (ADR-007) are append-only and immutable for SOC 2 compliance. These two requirements directly conflict: you can't delete audit records, but you must erase personal data.

Additionally, some data has legitimate retention needs: hiring analytics (anonymized), EEO compliance reporting, and financial records (Stripe invoices).

## Decision

**Two-layer erasure: crypto-shredding for audit logs + selective anonymization for entity tables.**

### Layer 1: Crypto-Shredding (audit logs)

Each candidate gets a per-candidate encryption key stored in a `candidate_encryption_keys` table. Audit log entries containing candidate PII are encrypted with this key. To "erase" a candidate from audit logs, delete their encryption key. The audit records remain (SOC 2 satisfied) but are unreadable (GDPR satisfied).

```sql
CREATE TABLE candidate_encryption_keys (
  candidate_id UUID PRIMARY KEY REFERENCES candidates(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  encryption_key BYTEA NOT NULL, -- AES-256 key, encrypted at rest by Supabase
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Layer 2: Selective Anonymization (entity tables)

When a DSAR (Data Subject Access Request) for erasure is received:

1. **Anonymize `candidates`:** Replace PII fields (first_name, last_name, email, phone, resume_url, resume_text, resume_embedding) with anonymized values. Set `is_anonymized = TRUE`.
2. **Soft-delete `applications`:** Set `deleted_at = NOW()` on all applications for this candidate.
3. **Soft-delete related records:** notes, interview scorecards, files, custom field values — all soft-deleted.
4. **Delete files from Storage:** Remove actual files (resumes, photos) from Supabase Storage buckets.
5. **Delete encryption key:** Remove row from `candidate_encryption_keys` — crypto-shreds all audit entries.
6. **Retain anonymized analytics:** Hire/reject/source data remains for aggregate reporting but is no longer linked to a real person.

### Erasure Function

```sql
CREATE OR REPLACE FUNCTION erase_candidate(p_candidate_id UUID, p_org_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Anonymize candidate record
  UPDATE candidates SET
    first_name = 'REDACTED',
    last_name = 'REDACTED',
    email = 'redacted-' || id || '@erased.invalid',
    phone = NULL,
    resume_url = NULL,
    resume_text = NULL,
    resume_embedding = NULL,
    is_anonymized = TRUE,
    updated_at = NOW()
  WHERE id = p_candidate_id AND organization_id = p_org_id;

  -- Soft-delete applications
  UPDATE applications SET deleted_at = NOW()
  WHERE candidate_id = p_candidate_id AND organization_id = p_org_id;

  -- Soft-delete notes
  UPDATE notes SET deleted_at = NOW()
  WHERE candidate_id = p_candidate_id AND organization_id = p_org_id;

  -- Delete files metadata (Storage cleanup via Inngest function)
  UPDATE files SET deleted_at = NOW()
  WHERE entity_type = 'candidate' AND entity_id = p_candidate_id
    AND organization_id = p_org_id;

  -- Crypto-shred audit logs
  DELETE FROM candidate_encryption_keys
  WHERE candidate_id = p_candidate_id AND organization_id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Automated Retention

An Inngest cron function runs weekly:
- Finds candidates where `gdpr_expiry_at < NOW()` and `is_anonymized = FALSE`
- Calls `erase_candidate()` for each
- Logs the erasure in a separate `gdpr_erasure_log` (non-PII: candidate_id, org_id, erased_at, reason)

## Schema Impact on D01

New tables:
- `candidate_encryption_keys` (candidate_id, organization_id, encryption_key, created_at)
- `gdpr_erasure_log` (id, organization_id, candidate_id, erased_at, reason, performed_by)

New columns:
- `candidates.is_anonymized BOOLEAN DEFAULT FALSE`
- `candidates.gdpr_consent_at TIMESTAMPTZ` (already in S3)
- `candidates.gdpr_expiry_at TIMESTAMPTZ` (already in S3)

New function:
- `erase_candidate(UUID, UUID)` — the erasure procedure

## Consequences

### Positive

- GDPR Article 17 compliance without breaking audit log immutability
- SOC 2 audit trail preserved (records exist, just unreadable)
- Anonymized data retained for aggregate analytics (DEI, hiring funnel)
- Automated retention prevents manual compliance burden

### Negative

- Per-candidate encryption adds complexity to audit log reads (mitigation: decryption only needed for compliance investigations, not normal operations)
- Encryption key management is a security-critical component (mitigation: keys encrypted at rest by Supabase, access restricted to admin roles)
- Erasure is irreversible (mitigation: GDPR requires this — it's a feature, not a bug)

## References

- GDPR Article 17 (Right to Erasure)
- [ADR-007] Trigger-based audit logging (append-only, immutable)
- [S3] §2.1 (candidates table GDPR fields)
- [PLAN.md] D13 (GDPR & Compliance)

---

*Recorded: 2026-03-10*
