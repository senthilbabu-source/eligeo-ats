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

-- ─── Audit Trigger Function ───
-- Generic trigger that logs INSERT/UPDATE/DELETE to audit_logs.
-- Attached to tables in migration 005.
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_record_id UUID;
  v_row JSONB;
BEGIN
  -- Extract from appropriate row (handles tables with or without organization_id)
  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
    v_record_id := OLD.id;
  ELSE
    v_row := to_jsonb(NEW);
    v_record_id := NEW.id;
  END IF;

  -- Safely extract org_id (NULL for tables like user_profiles that lack it)
  v_org_id := (v_row ->> 'organization_id')::UUID;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, table_name, record_id, action, old_data, performed_by)
    VALUES (v_org_id, TG_TABLE_NAME, v_record_id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (v_org_id, TG_TABLE_NAME, v_record_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (organization_id, table_name, record_id, action, new_data, performed_by)
    VALUES (v_org_id, TG_TABLE_NAME, v_record_id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
