-- Migration 001: Extensions + Generic Functions
-- Phase 1: Auth + Core Tenancy
-- Dependencies: None (first migration)

-- ─── Extensions ───
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- Vector extension deferred to v2.0 (CREATE EXTENSION IF NOT EXISTS "vector";)

-- ─── Trigger: set_updated_at() ───
-- Automatically sets updated_at on every UPDATE. Attached to all tables.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
