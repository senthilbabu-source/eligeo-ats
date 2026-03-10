# D06 — Offers & Approvals

> Sub-document of [DATABASE-SCHEMA.md](../DATABASE-SCHEMA.md)
> Tables: `offer_templates`, `offers`, `offer_approvals`

---

## `offer_templates`

Reusable compensation and terms templates for consistent offer creation across the organization.

```sql
CREATE TABLE offer_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name            TEXT        NOT NULL,
  department      TEXT,
  compensation    JSONB       NOT NULL DEFAULT '{}',  -- see OfferCompensation interface
  terms_template  TEXT,
  created_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Org-scoped template listing (offer builder template picker)
CREATE INDEX idx_offer_templates_org ON offer_templates(organization_id)
  WHERE deleted_at IS NULL;

-- Department-filtered template search
CREATE INDEX idx_offer_templates_dept ON offer_templates(organization_id, department)
  WHERE deleted_at IS NULL AND department IS NOT NULL;
```

### RLS

```sql
ALTER TABLE offer_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_templates FORCE ROW LEVEL SECURITY;

CREATE POLICY "offer_templates_select" ON offer_templates FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
  );

CREATE POLICY "offer_templates_insert" ON offer_templates FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
  );

CREATE POLICY "offer_templates_update" ON offer_templates FOR UPDATE
  USING (has_org_role(organization_id, 'owner', 'admin', 'recruiter'))
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "offer_templates_delete" ON offer_templates FOR DELETE
  USING (FALSE);  -- Templates are soft-deleted, never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON offer_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON offer_templates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `offers`

Formal employment offers tied to a specific application. Tracks the full offer lifecycle from
draft through e-signature. The `compensation` JSONB column conforms to the `OfferCompensation`
TypeScript interface.

```sql
CREATE TABLE offers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  application_id    UUID        NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  candidate_id      UUID        NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  job_id            UUID        NOT NULL REFERENCES job_openings(id) ON DELETE RESTRICT,
  template_id       UUID        REFERENCES offer_templates(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN (
                                  'draft', 'pending_approval', 'approved', 'sent',
                                  'signed', 'declined', 'expired', 'withdrawn'
                                )),
  compensation      JSONB       NOT NULL,  -- see OfferCompensation interface
  start_date        DATE,
  expiry_date       DATE,
  terms             TEXT,
  esign_provider    TEXT        CHECK (esign_provider IN ('dropbox_sign', 'docusign') OR esign_provider IS NULL),
  esign_envelope_id TEXT,
  sent_at           TIMESTAMPTZ,
  signed_at         TIMESTAMPTZ,
  declined_at       TIMESTAMPTZ,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Offers for an application (offer tab on candidate profile)
CREATE INDEX idx_offers_application ON offers(application_id)
  WHERE deleted_at IS NULL;

-- Offers for a candidate across all applications
CREATE INDEX idx_offers_candidate ON offers(candidate_id)
  WHERE deleted_at IS NULL;

-- Job-level offer rollup (offer rate analytics)
CREATE INDEX idx_offers_job ON offers(job_id, status)
  WHERE deleted_at IS NULL;

-- Org-scoped status dashboard (pending offers, expiring soon)
CREATE INDEX idx_offers_org_status ON offers(organization_id, status)
  WHERE deleted_at IS NULL;

-- E-sign webhook reconciliation
CREATE UNIQUE INDEX idx_offers_esign_envelope ON offers(esign_envelope_id)
  WHERE esign_envelope_id IS NOT NULL AND deleted_at IS NULL;

-- Expiring offers cron job (find offers approaching expiry_date)
CREATE INDEX idx_offers_expiry ON offers(expiry_date)
  WHERE deleted_at IS NULL AND status = 'sent';
```

### RLS

Interviewers cannot see offers. Only owner, admin, recruiter, and hiring_manager have access.

```sql
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers FORCE ROW LEVEL SECURITY;

CREATE POLICY "offers_select" ON offers FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND has_org_role(organization_id, 'owner', 'admin', 'recruiter', 'hiring_manager')
  );

CREATE POLICY "offers_insert" ON offers FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
  );

CREATE POLICY "offers_update" ON offers FOR UPDATE
  USING (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "offers_delete" ON offers FOR DELETE
  USING (FALSE);  -- Offers are soft-deleted, never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON offers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```

---

## `offer_approvals`

Sequential approval chain for an offer. Each row represents one approver in the sequence.
The `sequence_order` column determines the approval order (1 = first approver, 2 = second, etc.).

```sql
CREATE TABLE offer_approvals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  offer_id        UUID        NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  approver_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sequence_order  INTEGER     NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at      TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);
```

### Indexes

```sql
-- Approvals for an offer, ordered by sequence (approval chain view)
CREATE INDEX idx_offer_approvals_offer ON offer_approvals(offer_id, sequence_order)
  WHERE deleted_at IS NULL;

-- Pending approvals for a user (My Approvals inbox)
CREATE INDEX idx_offer_approvals_approver_pending ON offer_approvals(approver_id, status)
  WHERE deleted_at IS NULL AND status = 'pending';

-- Org-scoped queries
CREATE INDEX idx_offer_approvals_org ON offer_approvals(organization_id)
  WHERE deleted_at IS NULL;
```

### RLS

Approvers (typically hiring_managers) can see and decide on their own approvals. Owner, admin,
and recruiter can see all approvals. Interviewers have no access.

```sql
ALTER TABLE offer_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_approvals FORCE ROW LEVEL SECURITY;

CREATE POLICY "offer_approvals_select" ON offer_approvals FOR SELECT
  USING (
    is_org_member(organization_id)
    AND deleted_at IS NULL
    AND (
      has_org_role(organization_id, 'owner', 'admin', 'recruiter')
      OR approver_id = auth.uid()  -- Approvers can see their own approval requests
    )
  );

CREATE POLICY "offer_approvals_insert" ON offer_approvals FOR INSERT
  WITH CHECK (
    has_org_role(organization_id, 'owner', 'admin', 'recruiter')
  );

CREATE POLICY "offer_approvals_update" ON offer_approvals FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      approver_id = auth.uid()  -- Approver can approve/reject their own step
      OR has_org_role(organization_id, 'owner', 'admin')  -- Owner/admin can override
    )
  )
  WITH CHECK (organization_id = current_user_org_id());

CREATE POLICY "offer_approvals_delete" ON offer_approvals FOR DELETE
  USING (FALSE);  -- Approvals are soft-deleted, never hard-deleted
```

### Triggers

```sql
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON offer_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON offer_approvals
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
```
