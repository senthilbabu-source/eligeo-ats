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
    '{"ai_scoring": true, "bulk_import": true, "career_page": true, "ai_scorecard_summarize": true}'::jsonb
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

-- ─── Pipeline Template (Globex — cross-tenant RLS tests) ───

INSERT INTO pipeline_templates (id, organization_id, name, is_default, created_by) VALUES
  (
    '22222222-6001-4000-a000-000000000001',
    '22222222-2001-4000-a000-000000000001',
    'Standard Pipeline',
    TRUE,
    '22222222-1001-4000-a000-000000000001'
  );

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

-- ─── Job Opening (Globex — cross-tenant RLS tests) ──────────

INSERT INTO job_openings (id, organization_id, pipeline_template_id, title, slug, status, location_type, employment_type) VALUES
  (
    '22222222-3001-4000-a000-000000000001',
    '22222222-2001-4000-a000-000000000001',
    '22222222-6001-4000-a000-000000000001',
    'Python Developer',
    'python-developer',
    'draft',
    'remote',
    'full_time'
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

-- ─── Skills (Phase 2 — RLS test fixtures) ────────────────
INSERT INTO skills (id, organization_id, name, category, is_system) VALUES
  ('11111111-6006-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001', 'TypeScript', 'programming', FALSE),
  ('11111111-6006-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001', 'React', 'framework', FALSE),
  ('22222222-6006-4000-a000-000000000001', '22222222-2001-4000-a000-000000000001', 'Python', 'programming', FALSE);

-- ─── Candidate Skills ────────────────────────────────────
INSERT INTO candidate_skills (id, organization_id, candidate_id, skill_id, proficiency, source) VALUES
  ('11111111-6007-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001', '11111111-4001-4000-a000-000000000001', '11111111-6006-4000-a000-000000000001', 'advanced', 'self_reported');

-- ─── Job Required Skills ─────────────────────────────────
INSERT INTO job_required_skills (id, organization_id, job_id, skill_id, importance) VALUES
  ('11111111-6008-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001', '11111111-3001-4000-a000-000000000001', '11111111-6006-4000-a000-000000000001', 'must_have'),
  -- Globex job skill (cross-tenant RLS tests)
  ('22222222-6008-4000-a000-000000000001', '22222222-2001-4000-a000-000000000001', '22222222-3001-4000-a000-000000000001', '22222222-6006-4000-a000-000000000001', 'must_have');

-- ─── Talent Pool Members (deterministic ID) ──────────────
INSERT INTO talent_pool_members (id, organization_id, talent_pool_id, candidate_id, added_by, notes) VALUES
  ('11111111-6009-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001', '11111111-6005-4000-a000-000000000001', '11111111-4001-4000-a000-000000000003', '11111111-1001-4000-a000-000000000003', 'Strong enterprise background, keep warm for next senior role');

-- ─── Daily Briefing (Wave 3 — E2E fixture) ───────────────
-- Uses CURRENT_DATE so the row is always "today" when seed runs.
INSERT INTO org_daily_briefings (id, organization_id, briefing_date, content, model, prompt_tokens, completion_tokens)
VALUES (
  '11111111-9001-4000-a000-000000000001',
  '11111111-2001-4000-a000-000000000001',
  CURRENT_DATE,
  '{"win": "3 hires this month across engineering roles", "blocker": "Phone screen stage has 8 candidates waiting >5 days", "action": "Assign phone screens to Roshelle for Senior Engineer and Product Manager roles"}'::jsonb,
  'gpt-4o-mini',
  120,
  85
)
ON CONFLICT (organization_id, briefing_date) DO NOTHING;

-- ============================================================
-- Phase 3: Interviews & Scorecards
-- ============================================================

-- ─── Scorecard Template (itecbrains default) ─────────────────

INSERT INTO scorecard_templates (id, organization_id, name, description, is_default, created_by) VALUES
  (
    '11111111-7003-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Engineering Interview',
    'Standard engineering interview evaluation template',
    TRUE,
    '11111111-1001-4000-a000-000000000001'
  );

-- ─── Scorecard Categories ────────────────────────────────────

INSERT INTO scorecard_categories (id, template_id, organization_id, name, position, weight) VALUES
  (
    '11111111-7004-4000-a000-000000000001',
    '11111111-7003-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Technical Skills',
    0,
    2.0
  ),
  (
    '11111111-7004-4000-a000-000000000002',
    '11111111-7003-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Communication',
    1,
    1.0
  );

-- ─── Scorecard Attributes ────────────────────────────────────

INSERT INTO scorecard_attributes (id, category_id, organization_id, name, description, position) VALUES
  (
    '11111111-7005-4000-a000-000000000001',
    '11111111-7004-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'System Design',
    'Ability to design scalable systems',
    0
  ),
  (
    '11111111-7005-4000-a000-000000000002',
    '11111111-7004-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Code Quality',
    'Clean, maintainable, well-tested code',
    1
  ),
  (
    '11111111-7005-4000-a000-000000000003',
    '11111111-7004-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    'Clarity of Thought',
    'Explains ideas clearly and concisely',
    0
  );

-- ─── Interviews (Alice's pipeline) ───────────────────────────

INSERT INTO interviews (id, organization_id, application_id, job_id, interviewer_id, interview_type, scheduled_at, duration_minutes, status, scorecard_template_id, created_by) VALUES
  (
    '11111111-7001-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-5001-4000-a000-000000000001',
    '11111111-3001-4000-a000-000000000001',
    '11111111-1001-4000-a000-000000000003',  -- Roshelle (recruiter) did screening
    'phone_screen',
    NOW() - INTERVAL '5 days',
    30,
    'completed',
    '11111111-7003-4000-a000-000000000001',
    '11111111-1001-4000-a000-000000000003'
  ),
  (
    '11111111-7001-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-5001-4000-a000-000000000001',
    '11111111-3001-4000-a000-000000000001',
    '11111111-1001-4000-a000-000000000005',  -- Taylor (interviewer) for technical
    'technical',
    NOW() + INTERVAL '2 days',
    60,
    'scheduled',
    '11111111-7003-4000-a000-000000000001',
    '11111111-1001-4000-a000-000000000003'
  );

-- ─── Scorecard Submission (Roshelle's screening feedback) ────

INSERT INTO scorecard_submissions (id, organization_id, interview_id, application_id, submitted_by, overall_recommendation, overall_notes) VALUES
  (
    '11111111-7002-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-7001-4000-a000-000000000001',
    '11111111-5001-4000-a000-000000000001',
    '11111111-1001-4000-a000-000000000003',  -- Roshelle
    'strong_yes',
    'Excellent communication skills. Strong technical foundation. Highly recommend advancing to technical round.'
  );

-- ─── Scorecard Ratings (Roshelle rated 3 attributes) ─────────

INSERT INTO scorecard_ratings (id, submission_id, attribute_id, organization_id, rating, notes) VALUES
  (
    '11111111-7006-4000-a000-000000000001',
    '11111111-7002-4000-a000-000000000001',
    '11111111-7005-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    4,
    'Good system design intuition for current level'
  ),
  (
    '11111111-7006-4000-a000-000000000002',
    '11111111-7002-4000-a000-000000000001',
    '11111111-7005-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    5,
    'Discussed past projects — code quality is clearly a priority'
  ),
  (
    '11111111-7006-4000-a000-000000000003',
    '11111111-7002-4000-a000-000000000001',
    '11111111-7005-4000-a000-000000000003',
    '11111111-2001-4000-a000-000000000001',
    5,
    'Very articulate, structured answers'
  );

-- ============================================================
-- Wave F: Email Templates + Notification Preferences
-- ============================================================

-- ─── System Email Templates (itecbrains) ──────────────────────
-- One system template per category — serves as fallback when no org template exists.

INSERT INTO email_templates (id, organization_id, name, subject, body_html, body_text, category, merge_fields, is_system, created_by) VALUES
  (
    '11111111-a001-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    'Interview Invitation',
    'Interview for {{job.title}} at {{organization.name}}',
    '<p>Hi {{candidate.name}},</p><p>We would like to invite you to an interview for the <strong>{{job.title}}</strong> position.</p><p>Date: {{interview.date}}<br/>Time: {{interview.time}}<br/>Duration: {{interview.duration}}</p><p>Best regards,<br/>{{recruiter.name}}</p>',
    'Hi {{candidate.name}}, We would like to invite you to an interview for the {{job.title}} position. Date: {{interview.date}}, Time: {{interview.time}}, Duration: {{interview.duration}}. Best regards, {{recruiter.name}}',
    'interview_invite',
    ARRAY['candidate.name', 'candidate.email', 'job.title', 'organization.name', 'recruiter.name', 'interview.date', 'interview.time', 'interview.duration'],
    TRUE,
    '11111111-1001-4000-a000-000000000001'
  ),
  (
    '11111111-a001-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    'Application Rejection',
    'Update on your application for {{job.title}}',
    '<p>Dear {{candidate.name}},</p><p>Thank you for your interest in the <strong>{{job.title}}</strong> position at {{organization.name}}. After careful consideration, we have decided to move forward with other candidates.</p><p>We appreciate your time and wish you the best in your job search.</p><p>Best regards,<br/>{{recruiter.name}}</p>',
    'Dear {{candidate.name}}, Thank you for your interest in the {{job.title}} position at {{organization.name}}. After careful consideration, we have decided to move forward with other candidates. Best regards, {{recruiter.name}}',
    'rejection',
    ARRAY['candidate.name', 'job.title', 'organization.name', 'recruiter.name'],
    TRUE,
    '11111111-1001-4000-a000-000000000001'
  ),
  (
    '11111111-a001-4000-a000-000000000003',
    '11111111-2001-4000-a000-000000000001',
    'Offer Letter',
    'Offer for {{job.title}} at {{organization.name}}',
    '<p>Dear {{candidate.name}},</p><p>We are pleased to extend an offer for the <strong>{{job.title}}</strong> position at {{organization.name}}.</p><p>Please review the attached offer details and let us know if you have any questions.</p><p>Best regards,<br/>{{recruiter.name}}</p>',
    'Dear {{candidate.name}}, We are pleased to extend an offer for the {{job.title}} position at {{organization.name}}. Please review the attached offer details. Best regards, {{recruiter.name}}',
    'offer',
    ARRAY['candidate.name', 'job.title', 'organization.name', 'recruiter.name', 'offer.title', 'offer.start_date', 'offer.expiry_date'],
    TRUE,
    '11111111-1001-4000-a000-000000000001'
  ),
  (
    '11111111-a001-4000-a000-000000000004',
    '11111111-2001-4000-a000-000000000001',
    'Follow Up',
    'Following up on your application for {{job.title}}',
    '<p>Hi {{candidate.name}},</p><p>I wanted to follow up regarding your application for the <strong>{{job.title}}</strong> position. We are still reviewing candidates and will be in touch soon.</p><p>Best regards,<br/>{{recruiter.name}}</p>',
    'Hi {{candidate.name}}, I wanted to follow up regarding your application for the {{job.title}} position. We are still reviewing candidates and will be in touch soon. Best regards, {{recruiter.name}}',
    'follow_up',
    ARRAY['candidate.name', 'job.title', 'recruiter.name'],
    TRUE,
    '11111111-1001-4000-a000-000000000001'
  ),
  (
    '11111111-a001-4000-a000-000000000005',
    '11111111-2001-4000-a000-000000000001',
    'Talent Nurture',
    'Exciting opportunities at {{organization.name}}',
    '<p>Hi {{candidate.name}},</p><p>We have new opportunities that might interest you at {{organization.name}}. Check out our latest openings!</p><p>Best regards,<br/>{{recruiter.name}}</p>',
    'Hi {{candidate.name}}, We have new opportunities that might interest you at {{organization.name}}. Best regards, {{recruiter.name}}',
    'nurture',
    ARRAY['candidate.name', 'organization.name', 'recruiter.name'],
    TRUE,
    '11111111-1001-4000-a000-000000000001'
  );

-- Custom template (non-system, for testing delete permissions)
INSERT INTO email_templates (id, organization_id, name, subject, body_html, category, merge_fields, is_system, created_by) VALUES
  (
    '11111111-a001-4000-a000-000000000006',
    '11111111-2001-4000-a000-000000000001',
    'Custom Screening Invite',
    'Phone Screen for {{job.title}}',
    '<p>Hi {{candidate.name}},</p><p>We''d like to schedule a phone screen for {{job.title}}.</p>',
    'custom',
    ARRAY['candidate.name', 'job.title'],
    FALSE,
    '11111111-1001-4000-a000-000000000003'
  );

-- Globex system template (cross-tenant RLS test)
INSERT INTO email_templates (id, organization_id, name, subject, body_html, category, merge_fields, is_system, created_by) VALUES
  (
    '22222222-a001-4000-a000-000000000001',
    '22222222-2001-4000-a000-000000000001',
    'Interview Invitation',
    'Interview at {{organization.name}}',
    '<p>Hi {{candidate.name}}, you are invited to interview at Globex.</p>',
    'interview_invite',
    ARRAY['candidate.name', 'organization.name'],
    TRUE,
    '22222222-1001-4000-a000-000000000001'
  );

-- ─── Notification Preferences (itecbrains) ────────────────────
-- Recruiter has customized a couple of event preferences

INSERT INTO notification_preferences (id, organization_id, user_id, event_type, channel) VALUES
  (
    '11111111-a002-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-1001-4000-a000-000000000003',  -- Roshelle (recruiter)
    'application.new',
    'both'
  ),
  (
    '11111111-a002-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-1001-4000-a000-000000000003',  -- Roshelle
    'scorecard.submitted',
    'email'
  );

-- Globex preference (cross-tenant RLS test)
INSERT INTO notification_preferences (id, organization_id, user_id, event_type, channel) VALUES
  (
    '22222222-a002-4000-a000-000000000001',
    '22222222-2001-4000-a000-000000000001',
    '22222222-1001-4000-a000-000000000001',  -- Morgan (Globex owner)
    'application.new',
    'in_app'
  );

-- ============================================================
-- Phase 4+ seed data will be appended below
-- (offers, etc.)
-- ============================================================
