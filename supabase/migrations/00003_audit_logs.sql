-- Migration 003: Audit Logs Table
-- Phase 1: Auth + Core Tenancy
-- Dependencies: 00001 (audit_trigger_func), 00002 (organizations)
-- ADR-007: Trigger-based, append-only, partitioned monthly.
-- Created before RLS/triggers migration so audit triggers can reference this table.

CREATE TABLE audit_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  table_name       TEXT        NOT NULL,
  record_id        UUID        NOT NULL,
  action           TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data         JSONB,
  new_data         JSONB,
  performed_by     UUID,
  performed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       INET,
  user_agent       TEXT
);

-- Index: query by org + time range (most common audit query)
CREATE INDEX idx_audit_org_time ON audit_logs(organization_id, performed_at DESC);
-- Index: query by table + record (investigation)
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);
-- Index: query by performer (user activity)
CREATE INDEX idx_audit_performer ON audit_logs(performed_by, performed_at DESC)
  WHERE performed_by IS NOT NULL;

COMMENT ON TABLE audit_logs IS 'Append-only audit trail. ADR-007. No soft-delete (ADR-006 exception). No RLS — accessed via service role only.';
COMMENT ON COLUMN audit_logs.old_data IS 'Previous row state (UPDATE/DELETE). NULL on INSERT.';
COMMENT ON COLUMN audit_logs.new_data IS 'New row state (INSERT/UPDATE). NULL on DELETE.';
