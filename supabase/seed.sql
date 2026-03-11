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

-- GoTrue requires all varchar columns to be non-NULL (Scan error on NULL→string).
-- Set all nullable token/change columns to empty strings.
UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change = COALESCE(email_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  phone_change = COALESCE(phone_change, ''),
  reauthentication_token = COALESCE(reauthentication_token, '');

-- handle_new_user trigger fires automatically → user_profiles created

-- ─── Auth Identities (required for email/password login) ─────
-- Supabase Auth checks auth.identities for sign-in. Without these,
-- signInWithPassword returns "Invalid email or password".

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES
  ('11111111-1001-4000-a000-000000000001', '11111111-1001-4000-a000-000000000001', '{"sub":"11111111-1001-4000-a000-000000000001","email":"senthil@itecbrains.com"}'::jsonb, 'email', '11111111-1001-4000-a000-000000000001', NOW(), NOW(), NOW()),
  ('11111111-1001-4000-a000-000000000002', '11111111-1001-4000-a000-000000000002', '{"sub":"11111111-1001-4000-a000-000000000002","email":"prem@itecbrains.com"}'::jsonb, 'email', '11111111-1001-4000-a000-000000000002', NOW(), NOW(), NOW()),
  ('11111111-1001-4000-a000-000000000003', '11111111-1001-4000-a000-000000000003', '{"sub":"11111111-1001-4000-a000-000000000003","email":"roshelle@itecbrains.com"}'::jsonb, 'email', '11111111-1001-4000-a000-000000000003', NOW(), NOW(), NOW()),
  ('11111111-1001-4000-a000-000000000004', '11111111-1001-4000-a000-000000000004', '{"sub":"11111111-1001-4000-a000-000000000004","email":"hm@itecbrains.com"}'::jsonb, 'email', '11111111-1001-4000-a000-000000000004', NOW(), NOW(), NOW()),
  ('11111111-1001-4000-a000-000000000005', '11111111-1001-4000-a000-000000000005', '{"sub":"11111111-1001-4000-a000-000000000005","email":"interviewer@itecbrains.com"}'::jsonb, 'email', '11111111-1001-4000-a000-000000000005', NOW(), NOW(), NOW()),
  ('22222222-1001-4000-a000-000000000001', '22222222-1001-4000-a000-000000000001', '{"sub":"22222222-1001-4000-a000-000000000001","email":"owner@globex-test.com"}'::jsonb, 'email', '22222222-1001-4000-a000-000000000001', NOW(), NOW(), NOW()),
  ('22222222-1001-4000-a000-000000000002', '22222222-1001-4000-a000-000000000002', '{"sub":"22222222-1001-4000-a000-000000000002","email":"recruiter@globex-test.com"}'::jsonb, 'email', '22222222-1001-4000-a000-000000000002', NOW(), NOW(), NOW());

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
-- Phase 2: Jobs + Career Portal
-- ============================================================

-- ─── Candidate Sources (itecbrains system defaults) ────────

INSERT INTO candidate_sources (id, organization_id, name, is_system) VALUES
  ('11111111-6003-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001', 'Referral',     TRUE),
  ('11111111-6003-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001', 'LinkedIn',     TRUE),
  ('11111111-6003-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001', 'Career Page',  TRUE),
  ('11111111-6003-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001', 'Job Board',    TRUE),
  ('11111111-6003-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001', 'Agency',       TRUE),
  ('11111111-6003-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001', 'Direct',       TRUE);

-- ─── Rejection Reasons (itecbrains system defaults) ────────

INSERT INTO rejection_reasons (id, organization_id, name, is_system) VALUES
  ('11111111-6004-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001', 'Not qualified',          TRUE),
  ('11111111-6004-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001', 'Position filled',        TRUE),
  ('11111111-6004-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001', 'Candidate withdrew',     TRUE),
  ('11111111-6004-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001', 'Failed assessment',      TRUE),
  ('11111111-6004-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001', 'Compensation mismatch',  TRUE),
  ('11111111-6004-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001', 'Culture fit',            TRUE),
  ('11111111-6004-4000-a000-000000000007', '11111111-2001-4000-a000-000000000001', 'Other',                  TRUE);

-- ─── Pipeline Template (itecbrains default) ────────────────

INSERT INTO pipeline_templates (id, organization_id, name, description, is_default, created_by) VALUES
  (
    '11111111-6001-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Standard Engineering Pipeline',
    'Default pipeline for engineering roles',
    TRUE,
    '11111111-1001-4000-a000-000000000001'
  );

INSERT INTO pipeline_stages (id, organization_id, pipeline_template_id, name, stage_type, stage_order, is_terminal) VALUES
  ('11111111-6002-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001', '11111111-6001-4000-a000-000000000001', 'Applied',    'applied',    0, FALSE),
  ('11111111-6002-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001', '11111111-6001-4000-a000-000000000001', 'Screening',  'screening',  1, FALSE),
  ('11111111-6002-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001', '11111111-6001-4000-a000-000000000001', 'Technical',  'interview',  2, FALSE),
  ('11111111-6002-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001', '11111111-6001-4000-a000-000000000001', 'Onsite',     'interview',  3, FALSE),
  ('11111111-6002-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001', '11111111-6001-4000-a000-000000000001', 'Offer',      'offer',      4, FALSE),
  ('11111111-6002-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001', '11111111-6001-4000-a000-000000000001', 'Hired',      'hired',      5, TRUE);

-- ─── Job Openings (itecbrains) ─────────────────────────────

INSERT INTO job_openings (id, organization_id, pipeline_template_id, title, slug, description, department, location, location_type, employment_type, salary_min, salary_max, salary_currency, status, hiring_manager_id, recruiter_id, headcount, published_at) VALUES
  (
    '11111111-3001-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'Senior Software Engineer',
    'senior-software-engineer',
    'We are looking for a Senior Software Engineer to join our team and help build the next generation of staffing technology.',
    'Engineering',
    'Dallas, TX',
    'hybrid',
    'full_time',
    120000, 160000, 'USD',
    'open',
    '11111111-1001-4000-a000-000000000004',
    '11111111-1001-4000-a000-000000000003',
    2,
    NOW() - INTERVAL '7 days'
  ),
  (
    '11111111-3001-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'Product Manager',
    'product-manager',
    'Join itecbrains as a Product Manager to drive our ATS product strategy and work closely with engineering.',
    'Product',
    'Remote',
    'remote',
    'full_time',
    130000, 170000, 'USD',
    'draft',
    '11111111-1001-4000-a000-000000000004',
    '11111111-1001-4000-a000-000000000003',
    1,
    NULL
  );

-- ─── Candidates (itecbrains) ───────────────────────────────

INSERT INTO candidates (id, organization_id, full_name, email, phone, current_title, current_company, location, linkedin_url, skills, tags, source, source_id) VALUES
  (
    '11111111-4001-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Alice Johnson',
    'alice@example.com',
    '+1-555-0101',
    'Software Engineer',
    'TechCorp',
    'Austin, TX',
    'https://linkedin.com/in/alicejohnson',
    ARRAY['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    ARRAY['strong-technical', 'senior'],
    'LinkedIn',
    '11111111-6003-4000-a000-000000000002'
  ),
  (
    '11111111-4001-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    'Bob Smith',
    'bob@example.com',
    '+1-555-0102',
    'Full Stack Developer',
    'StartupXYZ',
    'San Francisco, CA',
    'https://linkedin.com/in/bobsmith',
    ARRAY['Python', 'Django', 'React', 'AWS'],
    ARRAY['startup-experience'],
    'Referral',
    '11111111-6003-4000-a000-000000000001'
  ),
  (
    '11111111-4001-4000-a000-000000000003',
    '11111111-2001-4000-a000-000000000001',
    'Carol Williams',
    'carol@example.com',
    '+1-555-0103',
    'Senior Engineer',
    'BigCo',
    'New York, NY',
    NULL,
    ARRAY['Java', 'Spring Boot', 'Kubernetes', 'PostgreSQL'],
    ARRAY['enterprise-experience', 'senior'],
    'Career Page',
    '11111111-6003-4000-a000-000000000003'
  );

-- Globex candidate (cross-tenant isolation test)
INSERT INTO candidates (id, organization_id, full_name, email, source) VALUES
  (
    '22222222-4001-4000-a000-000000000001',
    '22222222-2001-4000-a000-000000000001',
    'Dave Brown',
    'dave@example.com',
    'Direct'
  );

-- ─── Applications (itecbrains) ─────────────────────────────

INSERT INTO applications (id, organization_id, candidate_id, job_opening_id, current_stage_id, status, source) VALUES
  (
    '11111111-5001-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-4001-4000-a000-000000000001',
    '11111111-3001-4000-a000-000000000001',
    '11111111-6002-4000-a000-000000000003',  -- Technical stage
    'active',
    'LinkedIn'
  ),
  (
    '11111111-5001-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-4001-4000-a000-000000000002',
    '11111111-3001-4000-a000-000000000001',
    '11111111-6002-4000-a000-000000000002',  -- Screening stage
    'active',
    'Referral'
  );

-- ─── Stage History (itecbrains — Alice's journey) ──────────

INSERT INTO application_stage_history (organization_id, application_id, from_stage_id, to_stage_id, transitioned_by) VALUES
  (
    '11111111-2001-4000-a000-000000000001',
    '11111111-5001-4000-a000-000000000001',
    NULL,
    '11111111-6002-4000-a000-000000000001',  -- → Applied
    '11111111-1001-4000-a000-000000000003'   -- by Roshelle (recruiter)
  ),
  (
    '11111111-2001-4000-a000-000000000001',
    '11111111-5001-4000-a000-000000000001',
    '11111111-6002-4000-a000-000000000001',  -- Applied →
    '11111111-6002-4000-a000-000000000002',  -- → Screening
    '11111111-1001-4000-a000-000000000003'   -- by Roshelle
  ),
  (
    '11111111-2001-4000-a000-000000000001',
    '11111111-5001-4000-a000-000000000001',
    '11111111-6002-4000-a000-000000000002',  -- Screening →
    '11111111-6002-4000-a000-000000000003',  -- → Technical
    '11111111-1001-4000-a000-000000000003'   -- by Roshelle
  );

-- ─── Talent Pool (itecbrains) ──────────────────────────────

INSERT INTO talent_pools (id, organization_id, name, description, created_by) VALUES
  (
    '11111111-6005-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Strong Engineers',
    'High-potential engineering candidates for future roles',
    '11111111-1001-4000-a000-000000000003'
  );

INSERT INTO talent_pool_members (organization_id, talent_pool_id, candidate_id, added_by, notes) VALUES
  (
    '11111111-2001-4000-a000-000000000001',
    '11111111-6005-4000-a000-000000000001',
    '11111111-4001-4000-a000-000000000003',
    '11111111-1001-4000-a000-000000000003',
    'Strong enterprise background, keep warm for next senior role'
  );

-- ============================================================
-- Phase 3+ seed data will be appended below
-- (interviews, scorecards, offers, etc.)
-- ============================================================
