-- ============================================================
-- Eligeo Seed Data — itecbrains (Golden Tenant)
-- ============================================================
-- Loaded by `supabase db reset`. Grows as we build each phase.
--
-- UUIDs match golden-tenant.ts fixture (11111111-* = itecbrains, 22222222-* = Globex).
-- Auth users are created via Supabase Auth API (see below), then
-- the handle_new_user trigger auto-creates user_profiles rows.
--
-- NOTE: We use supabase_auth_admin to insert directly into auth.users
-- for local development only. Never do this in production.
-- ============================================================

-- ─── Auth Users (itecbrains) ───────────────────────────────

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, role, aud, created_at, updated_at
) VALUES
  (
    '11111111-1001-4000-a000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'senthil@itecbrains.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Senthil Kumar Babu"}'::jsonb,
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '11111111-1001-4000-a000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'prem@itecbrains.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Premkumar Govindarajulu"}'::jsonb,
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '11111111-1001-4000-a000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'roshelle@itecbrains.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Roshelle Merandez"}'::jsonb,
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '11111111-1001-4000-a000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'hm@itecbrains.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Jordan Rivera"}'::jsonb,
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '11111111-1001-4000-a000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'interviewer@itecbrains.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Taylor Chen"}'::jsonb,
    'authenticated', 'authenticated', NOW(), NOW()
  );

-- ─── Auth Users (Globex — cross-tenant testing) ────────────

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  raw_user_meta_data, role, aud, created_at, updated_at
) VALUES
  (
    '22222222-1001-4000-a000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'owner@globex-test.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Morgan Globex"}'::jsonb,
    'authenticated', 'authenticated', NOW(), NOW()
  ),
  (
    '22222222-1001-4000-a000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'recruiter@globex-test.com',
    crypt('password123', gen_salt('bf')),
    NOW(),
    '{"full_name": "Casey Globex"}'::jsonb,
    'authenticated', 'authenticated', NOW(), NOW()
  );

-- handle_new_user trigger fires automatically → user_profiles created

-- ─── Organizations ─────────────────────────────────────────

INSERT INTO organizations (id, name, slug, custom_domain, plan, subscription_status, trial_ends_at, feature_flags)
VALUES
  (
    '11111111-2001-4000-a000-000000000001',
    'itecbrains',
    'itecbrains',
    'itecbrains.com',
    'pro',
    'active',
    NULL,
    '{"ai_scoring": true, "bulk_import": true, "career_page": true}'::jsonb
  ),
  (
    '22222222-2001-4000-a000-000000000001',
    'Globex Inc',
    'globex-inc',
    NULL,
    'starter',
    'trialing',
    NOW() + INTERVAL '14 days',
    '{}'::jsonb
  );

-- ─── Organization Members ──────────────────────────────────

-- itecbrains team
INSERT INTO organization_members (organization_id, user_id, role, is_active, last_active_org_id)
VALUES
  ('11111111-2001-4000-a000-000000000001', '11111111-1001-4000-a000-000000000001', 'owner',          TRUE, '11111111-2001-4000-a000-000000000001'),
  ('11111111-2001-4000-a000-000000000001', '11111111-1001-4000-a000-000000000002', 'admin',          TRUE, '11111111-2001-4000-a000-000000000001'),
  ('11111111-2001-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003', 'recruiter',      TRUE, '11111111-2001-4000-a000-000000000001'),
  ('11111111-2001-4000-a000-000000000001', '11111111-1001-4000-a000-000000000004', 'hiring_manager', TRUE, '11111111-2001-4000-a000-000000000001'),
  ('11111111-2001-4000-a000-000000000001', '11111111-1001-4000-a000-000000000005', 'interviewer',    TRUE, '11111111-2001-4000-a000-000000000001');

-- Globex team
INSERT INTO organization_members (organization_id, user_id, role, is_active, last_active_org_id)
VALUES
  ('22222222-2001-4000-a000-000000000001', '22222222-1001-4000-a000-000000000001', 'owner',     TRUE, '22222222-2001-4000-a000-000000000001'),
  ('22222222-2001-4000-a000-000000000001', '22222222-1001-4000-a000-000000000002', 'recruiter', TRUE, '22222222-2001-4000-a000-000000000001');

-- ============================================================
-- Phase 2+ seed data will be appended below as tables are built
-- (jobs, candidates, applications, pipelines, etc.)
-- ============================================================
