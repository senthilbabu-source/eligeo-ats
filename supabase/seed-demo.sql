-- ============================================================
-- Eligeo Demo Seed Data
-- ============================================================
-- Usage:
--   supabase db reset            # loads migrations + seed.sql
--   psql $DB_URL -f supabase/seed-demo.sql   # loads this file on top
--
-- Or in one step via psql:
--   supabase db reset && psql $(supabase db url) -f supabase/seed-demo.sql
--
-- This file EXTENDS seed.sql (golden-tenant.ts fixtures remain intact).
-- Do NOT run this file instead of seed.sql.
-- ============================================================
-- Run AFTER `supabase db reset` (which loads seed.sql first).
-- Adds rich demo data for both tenants covering all Phase 6 features,
-- all pipeline stages, all offer states, and 4 months of backdated
-- timestamps so Phase 7 analytics compute real values.
--
-- UUID type codes (hex):
--   d001=candidates  d002=jobs       d003=applications d004=interviews
--   d005=scorecard-submissions       d006=scorecard-ratings
--   d007=offers      d008=shortlist-reports            d009=shortlist-candidates
--   d010=talent-pools d011=pool-members d012=screening-configs
--   d013=screening-sessions          d014=notes        d016=ai-match-explanations
--   e001=B-candidates e002=B-jobs    e003=B-applications e004=B-interviews
--   e005=B-offers    e006=B-screening-sessions
-- ============================================================

-- ============================================================
-- SECTION 1: TENANT_A — Additional Jobs
-- ============================================================

INSERT INTO job_openings (
  id, organization_id, pipeline_template_id,
  title, slug, description, department, location, location_type,
  employment_type, salary_min, salary_max, salary_currency,
  status, hiring_manager_id, recruiter_id, headcount, published_at
) VALUES
  (
    '11111111-d002-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'Frontend Engineer', 'frontend-engineer',
    'Build beautiful, performant UIs with React and TypeScript. Own the candidate-facing career portal.',
    'Engineering', 'Dallas, TX', 'hybrid', 'full_time',
    100000, 140000, 'USD', 'open',
    '11111111-1001-4000-a000-000000000004',
    '11111111-1001-4000-a000-000000000003',
    2,
    NOW() - INTERVAL '4 months'
  ),
  (
    '11111111-d002-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'DevOps Engineer', 'devops-engineer',
    'Own our Kubernetes infrastructure, CI/CD pipelines, and observability stack.',
    'Engineering', 'Remote', 'remote', 'full_time',
    115000, 155000, 'USD', 'open',
    '11111111-1001-4000-a000-000000000004',
    '11111111-1001-4000-a000-000000000003',
    1,
    NOW() - INTERVAL '3 months'
  ),
  (
    '11111111-d002-4000-a000-000000000003',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'Data Scientist', 'data-scientist',
    'Build ML models for candidate ranking, resume parsing, and predictive hiring analytics.',
    'Engineering', 'Remote', 'remote', 'full_time',
    125000, 165000, 'USD', 'open',
    '11111111-1001-4000-a000-000000000004',
    '11111111-1001-4000-a000-000000000003',
    1,
    NOW() - INTERVAL '2 months'
  ),
  (
    '11111111-d002-4000-a000-000000000004',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'UX Designer', 'ux-designer',
    'Design intuitive recruiting workflows used by thousands of recruiters worldwide.',
    'Design', 'Dallas, TX', 'hybrid', 'full_time',
    90000, 125000, 'USD', 'closed',
    '11111111-1001-4000-a000-000000000004',
    '11111111-1001-4000-a000-000000000003',
    1,
    NOW() - INTERVAL '5 months'
  ),
  (
    '11111111-d002-4000-a000-000000000005',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'Engineering Manager', 'engineering-manager',
    'Lead a team of 6 engineers across frontend and backend. Drive technical strategy and execution.',
    'Engineering', 'Dallas, TX', 'hybrid', 'full_time',
    160000, 200000, 'USD', 'open',
    '11111111-1001-4000-a000-000000000002',
    '11111111-1001-4000-a000-000000000003',
    1,
    NOW() - INTERVAL '1 month'
  ),
  (
    '11111111-d002-4000-a000-000000000006',
    '11111111-2001-4000-a000-000000000001',
    '11111111-6001-4000-a000-000000000001',
    'QA Engineer', 'qa-engineer',
    'Own test strategy, automation frameworks, and quality gates for our Next.js SaaS platform.',
    'Engineering', 'Remote', 'remote', 'full_time',
    85000, 115000, 'USD', 'draft',
    '11111111-1001-4000-a000-000000000004',
    '11111111-1001-4000-a000-000000000003',
    1,
    NULL
  );

-- ============================================================
-- SECTION 2: TENANT_A — Demo Candidates (20)
-- ============================================================

INSERT INTO candidates (
  id, organization_id, full_name, email, phone,
  current_title, current_company, location, linkedin_url,
  skills, tags, source, source_id
) VALUES
  ('11111111-d001-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   'Emma Davis', 'emma.davis@example.com', '+1-555-1001',
   'Frontend Engineer', 'DesignFlow Inc', 'Austin, TX',
   'https://linkedin.com/in/emmadavis',
   ARRAY['React', 'TypeScript', 'CSS', 'Figma', 'Storybook'],
   ARRAY['strong-technical', 'design-systems'], 'LinkedIn',
   '11111111-6003-4000-a000-000000000002'),

  ('11111111-d001-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   'Frank Miller', 'frank.miller@example.com', '+1-555-1002',
   'Senior DevOps Engineer', 'CloudBase', 'Denver, CO',
   'https://linkedin.com/in/frankmiller',
   ARRAY['Kubernetes', 'Terraform', 'AWS', 'Docker', 'Prometheus', 'Grafana'],
   ARRAY['strong-technical', 'senior', 'cloud-expert'], 'Referral',
   '11111111-6003-4000-a000-000000000001'),

  ('11111111-d001-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   'Grace Lee', 'grace.lee@example.com', '+1-555-1003',
   'Data Scientist', 'ML Ventures', 'Seattle, WA',
   'https://linkedin.com/in/gracelee',
   ARRAY['Python', 'PyTorch', 'scikit-learn', 'SQL', 'dbt'],
   ARRAY['ml-background', 'phd'], 'LinkedIn',
   '11111111-6003-4000-a000-000000000002'),

  ('11111111-d001-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   'Henry Wilson', 'henry.wilson@example.com', '+1-555-1004',
   'Principal Backend Engineer', 'FinCore', 'New York, NY',
   'https://linkedin.com/in/henrywilson',
   ARRAY['Go', 'PostgreSQL', 'Redis', 'gRPC', 'Kafka'],
   ARRAY['strong-technical', 'senior', 'distributed-systems'], 'Job Board',
   '11111111-6003-4000-a000-000000000004'),

  ('11111111-d001-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   'Isabel Martinez', 'isabel.martinez@example.com', '+1-555-1005',
   'Senior UX Designer', 'Craft Studio', 'San Francisco, CA',
   'https://linkedin.com/in/isabelmartinez',
   ARRAY['Figma', 'User Research', 'Prototyping', 'Design Systems'],
   ARRAY['senior', 'design-systems', 'portfolio-strong'], 'Career Page',
   '11111111-6003-4000-a000-000000000003'),

  ('11111111-d001-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001',
   'James Taylor', 'james.taylor@example.com', '+1-555-1006',
   'Full Stack Developer', 'StartupHub', 'Remote',
   NULL,
   ARRAY['React', 'Node.js', 'PostgreSQL', 'Tailwind'],
   ARRAY['startup-experience', 'early-career'], 'Career Page',
   '11111111-6003-4000-a000-000000000003'),

  ('11111111-d001-4000-a000-000000000007', '11111111-2001-4000-a000-000000000001',
   'Kate Anderson', 'kate.anderson@example.com', '+1-555-1007',
   'ML Engineer', 'DataForge', 'Boston, MA',
   'https://linkedin.com/in/kateanderson',
   ARRAY['Python', 'TensorFlow', 'Spark', 'Airflow', 'SQL'],
   ARRAY['ml-background', 'data-engineering'], 'LinkedIn',
   '11111111-6003-4000-a000-000000000002'),

  ('11111111-d001-4000-a000-000000000008', '11111111-2001-4000-a000-000000000001',
   'Liam Johnson', 'liam.johnson@example.com', '+1-555-1008',
   'DevOps Engineer', 'CloudNative Co', 'Austin, TX',
   NULL,
   ARRAY['AWS', 'Terraform', 'Docker', 'GitHub Actions'],
   ARRAY['mid-level'], 'Referral',
   '11111111-6003-4000-a000-000000000001'),

  ('11111111-d001-4000-a000-000000000009', '11111111-2001-4000-a000-000000000001',
   'Maya Patel', 'maya.patel@example.com', '+1-555-1009',
   'Senior Frontend Engineer', 'UI Metrics', 'Chicago, IL',
   'https://linkedin.com/in/mayapatel',
   ARRAY['React', 'TypeScript', 'GraphQL', 'Next.js', 'Testing Library'],
   ARRAY['strong-technical', 'senior'], 'LinkedIn',
   '11111111-6003-4000-a000-000000000002'),

  ('11111111-d001-4000-a000-000000000010', '11111111-2001-4000-a000-000000000001',
   'Noah Brown', 'noah.brown@example.com', '+1-555-1010',
   'Staff Backend Engineer', 'ScaleOps', 'Remote',
   'https://linkedin.com/in/noahbrown',
   ARRAY['Rust', 'PostgreSQL', 'Redis', 'AWS', 'System Design'],
   ARRAY['strong-technical', 'staff-level', 'distributed-systems'], 'Agency',
   '11111111-6003-4000-a000-000000000005'),

  ('11111111-d001-4000-a000-000000000011', '11111111-2001-4000-a000-000000000001',
   'Olivia Clark', 'olivia.clark@example.com', '+1-555-1011',
   'Data Analyst', 'InsightCo', 'Dallas, TX',
   NULL,
   ARRAY['Python', 'SQL', 'Tableau', 'Excel'],
   ARRAY['early-career', 'analytics'], 'Direct',
   '11111111-6003-4000-a000-000000000006'),

  ('11111111-d001-4000-a000-000000000012', '11111111-2001-4000-a000-000000000001',
   'Paul Roberts', 'paul.roberts@example.com', '+1-555-1012',
   'Engineering Director', 'EnterpriseNet', 'Dallas, TX',
   'https://linkedin.com/in/paulroberts',
   ARRAY['Team Leadership', 'System Design', 'Go', 'Python', 'OKRs'],
   ARRAY['senior', 'leadership', 'enterprise-experience'], 'LinkedIn',
   '11111111-6003-4000-a000-000000000002'),

  ('11111111-d001-4000-a000-000000000013', '11111111-2001-4000-a000-000000000001',
   'Quinn Thompson', 'quinn.thompson@example.com', '+1-555-1013',
   'Frontend Developer', 'Webify', 'Remote',
   NULL,
   ARRAY['React', 'JavaScript', 'CSS', 'Vue'],
   ARRAY['mid-level'], 'Career Page',
   '11111111-6003-4000-a000-000000000003'),

  ('11111111-d001-4000-a000-000000000014', '11111111-2001-4000-a000-000000000001',
   'Rachel Scott', 'rachel.scott@example.com', '+1-555-1014',
   'Senior Software Engineer', 'BuildCo', 'Houston, TX',
   'https://linkedin.com/in/rachelscott',
   ARRAY['TypeScript', 'Node.js', 'PostgreSQL', 'React', 'AWS'],
   ARRAY['strong-technical', 'senior', 'full-stack'], 'Referral',
   '11111111-6003-4000-a000-000000000001'),

  ('11111111-d001-4000-a000-000000000015', '11111111-2001-4000-a000-000000000001',
   'Sam Harris', 'sam.harris@example.com', '+1-555-1015',
   'UX Designer', 'PixelWorks', 'Austin, TX',
   NULL,
   ARRAY['Figma', 'Sketch', 'User Research', 'Wireframing'],
   ARRAY['mid-level'], 'Job Board',
   '11111111-6003-4000-a000-000000000004'),

  ('11111111-d001-4000-a000-000000000016', '11111111-2001-4000-a000-000000000001',
   'Tina Lewis', 'tina.lewis@example.com', '+1-555-1016',
   'QA Lead', 'TestCraft', 'Remote',
   'https://linkedin.com/in/tinalewis',
   ARRAY['Playwright', 'Cypress', 'Jest', 'Python', 'CI/CD'],
   ARRAY['qa-specialist', 'automation'], 'LinkedIn',
   '11111111-6003-4000-a000-000000000002'),

  ('11111111-d001-4000-a000-000000000017', '11111111-2001-4000-a000-000000000001',
   'Umar Khan', 'umar.khan@example.com', '+1-555-1017',
   'DevOps Engineer', 'NetFlow', 'Dallas, TX',
   NULL,
   ARRAY['Kubernetes', 'Helm', 'GitOps', 'Azure'],
   ARRAY['mid-level', 'cloud-background'], 'Direct',
   '11111111-6003-4000-a000-000000000006'),

  ('11111111-d001-4000-a000-000000000018', '11111111-2001-4000-a000-000000000001',
   'Victoria Wright', 'victoria.wright@example.com', '+1-555-1018',
   'Senior Data Scientist', 'Predictive Labs', 'San Francisco, CA',
   'https://linkedin.com/in/victoriawright',
   ARRAY['Python', 'R', 'PyTorch', 'SQL', 'MLflow', 'dbt'],
   ARRAY['strong-technical', 'senior', 'ml-background'], 'LinkedIn',
   '11111111-6003-4000-a000-000000000002'),

  -- William: near-duplicate of Emma (for candidate merge demo)
  ('11111111-d001-4000-a000-000000000019', '11111111-2001-4000-a000-000000000001',
   'William Garcia', 'will.garcia@example.com', '+1-555-1019',
   'Frontend Engineer', 'DesignFlow Inc', 'Austin, TX',
   NULL,
   ARRAY['React', 'TypeScript', 'CSS'],
   ARRAY['potential-duplicate'], 'Career Page',
   '11111111-6003-4000-a000-000000000003'),

  ('11111111-d001-4000-a000-000000000020', '11111111-2001-4000-a000-000000000001',
   'Xena Nguyen', 'xena.nguyen@example.com', '+1-555-1020',
   'Software Engineer', 'CodeFirst', 'Remote',
   NULL,
   ARRAY['TypeScript', 'Node.js', 'React', 'PostgreSQL'],
   ARRAY['early-career'], 'Career Page',
   '11111111-6003-4000-a000-000000000003');

-- ============================================================
-- SECTION 3: TENANT_A — Applications + Stage History
-- ============================================================

INSERT INTO applications (
  id, organization_id, candidate_id, job_opening_id, current_stage_id,
  status, source, applied_at, created_at, hired_at, rejected_at, withdrawn_at
) VALUES
  -- Frontend Engineer pipeline
  ('11111111-d003-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000001', '11111111-d002-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000006', -- Hired
   'hired', 'LinkedIn',
   NOW() - INTERVAL '4 months', NOW() - INTERVAL '4 months',
   NOW() - INTERVAL '3 months 15 days', NULL, NULL),

  ('11111111-d003-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000013', '11111111-d002-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000003', -- Technical (where rejected)
   'rejected', 'Career Page',
   NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months',
   NULL, NOW() - INTERVAL '2 months', NULL),

  ('11111111-d003-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000006', '11111111-d002-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000002', -- Screening
   'active', 'Career Page',
   NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000009', '11111111-d002-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000004', -- Onsite
   'active', 'LinkedIn',
   NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks',
   NULL, NULL, NULL),

  -- DevOps Engineer pipeline
  ('11111111-d003-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000002', '11111111-d002-4000-a000-000000000002',
   '11111111-6002-4000-a000-000000000006', -- Hired
   'hired', 'Referral',
   NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months',
   NOW() - INTERVAL '2 months 15 days', NULL, NULL),

  ('11111111-d003-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000008', '11111111-d002-4000-a000-000000000002',
   '11111111-6002-4000-a000-000000000003', -- Technical
   'active', 'Referral',
   NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '4 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000007', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000017', '11111111-d002-4000-a000-000000000002',
   '11111111-6002-4000-a000-000000000002', -- Screening
   'active', 'Direct',
   NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '2 weeks',
   NULL, NULL, NULL),

  -- Data Scientist pipeline
  ('11111111-d003-4000-a000-000000000008', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000003', '11111111-d002-4000-a000-000000000003',
   '11111111-6002-4000-a000-000000000003', -- Technical
   'active', 'LinkedIn',
   NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000009', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000007', '11111111-d002-4000-a000-000000000003',
   '11111111-6002-4000-a000-000000000002', -- Screening
   'active', 'LinkedIn',
   NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000010', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000018', '11111111-d002-4000-a000-000000000003',
   '11111111-6002-4000-a000-000000000004', -- Onsite
   'active', 'LinkedIn',
   NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '7 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000011', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000011', '11111111-d002-4000-a000-000000000003',
   '11111111-6002-4000-a000-000000000002', -- Screening (rejected here)
   'rejected', 'Direct',
   NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months',
   NULL, NOW() - INTERVAL '1 month 15 days', NULL),

  -- UX Designer pipeline (closed role)
  ('11111111-d003-4000-a000-000000000012', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000005', '11111111-d002-4000-a000-000000000004',
   '11111111-6002-4000-a000-000000000006', -- Hired
   'hired', 'Career Page',
   NOW() - INTERVAL '5 months', NOW() - INTERVAL '5 months',
   NOW() - INTERVAL '3 months', NULL, NULL),

  ('11111111-d003-4000-a000-000000000013', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000015', '11111111-d002-4000-a000-000000000004',
   '11111111-6002-4000-a000-000000000005', -- Offer (declined)
   'rejected', 'Job Board',
   NOW() - INTERVAL '4 months 2 weeks', NOW() - INTERVAL '4 months 2 weeks',
   NULL, NOW() - INTERVAL '3 months 1 week', NULL),

  -- Engineering Manager pipeline
  ('11111111-d003-4000-a000-000000000014', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000012', '11111111-d002-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000005', -- Offer stage
   'active', 'LinkedIn',
   NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000015', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000004', '11111111-d002-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000004', -- Onsite
   'active', 'Job Board',
   NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '4 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000016', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000010', '11111111-d002-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000005', -- Was at Offer
   'withdrawn', 'Agency',
   NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks',
   NULL, NULL, NOW() - INTERVAL '2 months'),

  -- Senior Engineer (existing job) — additional applicants
  ('11111111-d003-4000-a000-000000000017', '11111111-2001-4000-a000-000000000001',
   '11111111-4001-4000-a000-000000000003', '11111111-3001-4000-a000-000000000001', -- Carol
   '11111111-6002-4000-a000-000000000005', -- Offer
   'active', 'Career Page',
   NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '7 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000018', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000014', '11111111-3001-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000003', -- Technical
   'active', 'Referral',
   NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks',
   NULL, NULL, NULL),

  ('11111111-d003-4000-a000-000000000019', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000020', '11111111-3001-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000001', -- Applied
   'active', 'Career Page',
   NOW() - INTERVAL '1 week', NOW() - INTERVAL '1 week',
   NULL, NULL, NULL);

-- ── Stage history for key candidates (analytics backbone) ───

-- Emma (d003-001): full pipeline journey, hired 3.5 months ago
INSERT INTO application_stage_history (organization_id, application_id, from_stage_id, to_stage_id, transitioned_by, created_at) VALUES
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000001',
   NULL, '11111111-6002-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '4 months'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000001', '11111111-6002-4000-a000-000000000002',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '3 months 3 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000002', '11111111-6002-4000-a000-000000000003',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '3 months 2 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000003', '11111111-6002-4000-a000-000000000004',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '3 months 1 week'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000004', '11111111-6002-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '3 months 4 days'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000001',
   '11111111-6002-4000-a000-000000000005', '11111111-6002-4000-a000-000000000006',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '3 months 15 days');

-- Frank (d003-005): DevOps hired
INSERT INTO application_stage_history (organization_id, application_id, from_stage_id, to_stage_id, transitioned_by, created_at) VALUES
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000005',
   NULL, '11111111-6002-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '3 months'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000001', '11111111-6002-4000-a000-000000000002',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '2 months 3 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000002', '11111111-6002-4000-a000-000000000003',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '2 months 2 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000003', '11111111-6002-4000-a000-000000000004',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '2 months 10 days'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000004', '11111111-6002-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '2 months 6 days'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000005',
   '11111111-6002-4000-a000-000000000005', '11111111-6002-4000-a000-000000000006',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '2 months 15 days');

-- Isabel (d003-012): UX hired
INSERT INTO application_stage_history (organization_id, application_id, from_stage_id, to_stage_id, transitioned_by, created_at) VALUES
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000012',
   NULL, '11111111-6002-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '5 months'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000012',
   '11111111-6002-4000-a000-000000000001', '11111111-6002-4000-a000-000000000002',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '4 months 3 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000012',
   '11111111-6002-4000-a000-000000000002', '11111111-6002-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '3 months 2 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000012',
   '11111111-6002-4000-a000-000000000005', '11111111-6002-4000-a000-000000000006',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '3 months');

-- Quinn (d003-002): rejected at Technical
INSERT INTO application_stage_history (organization_id, application_id, from_stage_id, to_stage_id, transitioned_by, created_at) VALUES
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000002',
   NULL, '11111111-6002-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '3 months'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000002',
   '11111111-6002-4000-a000-000000000001', '11111111-6002-4000-a000-000000000002',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '2 months 3 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000002',
   '11111111-6002-4000-a000-000000000002', '11111111-6002-4000-a000-000000000003',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '2 months 2 weeks');

-- Noah (d003-016): withdrawn after reaching Offer
INSERT INTO application_stage_history (organization_id, application_id, from_stage_id, to_stage_id, transitioned_by, created_at) VALUES
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000016',
   NULL, '11111111-6002-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '6 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000016',
   '11111111-6002-4000-a000-000000000001', '11111111-6002-4000-a000-000000000002',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '5 weeks 3 days'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000016',
   '11111111-6002-4000-a000-000000000002', '11111111-6002-4000-a000-000000000003',
   '11111111-1001-4000-a000-000000000005', NOW() - INTERVAL '5 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000016',
   '11111111-6002-4000-a000-000000000003', '11111111-6002-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '4 weeks 2 days');

-- Carol (d003-017): SSE pipeline to Offer
INSERT INTO application_stage_history (organization_id, application_id, from_stage_id, to_stage_id, transitioned_by, created_at) VALUES
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000017',
   NULL, '11111111-6002-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '7 weeks'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000017',
   '11111111-6002-4000-a000-000000000001', '11111111-6002-4000-a000-000000000002',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '6 weeks 2 days'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000017',
   '11111111-6002-4000-a000-000000000002', '11111111-6002-4000-a000-000000000003',
   '11111111-1001-4000-a000-000000000005', NOW() - INTERVAL '5 weeks 3 days'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000017',
   '11111111-6002-4000-a000-000000000003', '11111111-6002-4000-a000-000000000004',
   '11111111-1001-4000-a000-000000000005', NOW() - INTERVAL '4 weeks 2 days'),
  ('11111111-2001-4000-a000-000000000001', '11111111-d003-4000-a000-000000000017',
   '11111111-6002-4000-a000-000000000004', '11111111-6002-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '10 days');

-- ============================================================
-- SECTION 4: TENANT_A — Interviews + Scorecards
-- ============================================================

INSERT INTO interviews (
  id, organization_id, application_id, job_id, interviewer_id,
  interview_type, scheduled_at, duration_minutes, status,
  scorecard_template_id, created_by
) VALUES
  -- Emma: phone screen + technical (both completed)
  ('11111111-d004-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000001', '11111111-d002-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000003', 'phone_screen',
   NOW() - INTERVAL '3 months 3 weeks', 30, 'completed',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  ('11111111-d004-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000001', '11111111-d002-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000005', 'technical',
   NOW() - INTERVAL '3 months 2 weeks', 90, 'completed',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  ('11111111-d004-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000001', '11111111-d002-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000004', 'behavioral',
   NOW() - INTERVAL '3 months 10 days', 60, 'completed',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  -- Frank: technical (completed)
  ('11111111-d004-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000005', '11111111-d002-4000-a000-000000000002',
   '11111111-1001-4000-a000-000000000005', 'technical',
   NOW() - INTERVAL '2 months 2 weeks', 60, 'completed',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  -- Victoria: technical (upcoming)
  ('11111111-d004-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000010', '11111111-d002-4000-a000-000000000003',
   '11111111-1001-4000-a000-000000000005', 'technical',
   NOW() + INTERVAL '3 days', 90, 'scheduled',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  -- Paul: behavioral (completed) + panel (scheduled)
  ('11111111-d004-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000014', '11111111-d002-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000004', 'behavioral',
   NOW() - INTERVAL '2 weeks', 60, 'completed',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  ('11111111-d004-4000-a000-000000000007', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000014', '11111111-d002-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000002', 'panel',
   NOW() + INTERVAL '1 day', 90, 'scheduled',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  -- Carol (SSE): technical (completed)
  ('11111111-d004-4000-a000-000000000008', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000017', '11111111-3001-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000005', 'technical',
   NOW() - INTERVAL '4 weeks', 90, 'completed',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  -- Quinn: technical (no_show — reason for rejection)
  ('11111111-d004-4000-a000-000000000009', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000002', '11111111-d002-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000005', 'technical',
   NOW() - INTERVAL '2 months 2 weeks', 60, 'no_show',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003'),

  -- Maya: onsite (confirmed, upcoming)
  ('11111111-d004-4000-a000-000000000010', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000004', '11111111-d002-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000004', 'final',
   NOW() + INTERVAL '5 days', 120, 'confirmed',
   '11111111-7003-4000-a000-000000000001', '11111111-1001-4000-a000-000000000003');

-- Scorecard submissions for completed interviews
INSERT INTO scorecard_submissions (
  id, organization_id, interview_id, application_id, submitted_by,
  overall_recommendation, overall_notes
) VALUES
  -- Emma phone screen (Roshelle)
  ('11111111-d005-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-d004-4000-a000-000000000001', '11111111-d003-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000003', 'strong_yes',
   'Impressive depth in React and TypeScript. Design systems experience is exactly what we need. Very articulate. Advance immediately.'),

  -- Emma technical (Taylor)
  ('11111111-d005-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d004-4000-a000-000000000002', '11111111-d003-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000005', 'strong_yes',
   'Exceptional frontend skills. Live coding was clean and idiomatic. Systems thinking was well above senior level.'),

  -- Emma behavioral (Jordan/HM)
  ('11111111-d005-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d004-4000-a000-000000000003', '11111111-d003-4000-a000-000000000001',
   '11111111-1001-4000-a000-000000000004', 'yes',
   'Strong team player. Handling feedback examples were mature. Recommend offer.'),

  -- Frank technical (Taylor)
  ('11111111-d005-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d004-4000-a000-000000000004', '11111111-d003-4000-a000-000000000005',
   '11111111-1001-4000-a000-000000000005', 'strong_yes',
   'Deep Kubernetes and Terraform knowledge. Incident management story was excellent. Hire immediately.'),

  -- Paul behavioral (Jordan/HM)
  ('11111111-d005-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-d004-4000-a000-000000000006', '11111111-d003-4000-a000-000000000014',
   '11111111-1001-4000-a000-000000000004', 'yes',
   'Strong leadership philosophy. Good track record of growing engineers. Pending final panel interview.'),

  -- Carol technical (Taylor)
  ('11111111-d005-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001',
   '11111111-d004-4000-a000-000000000008', '11111111-d003-4000-a000-000000000017',
   '11111111-1001-4000-a000-000000000005', 'yes',
   'Solid full-stack skills. Java background is different from our stack but she picks up quickly. Good communicator.');

-- Scorecard ratings for Emma phone screen (detailed)
INSERT INTO scorecard_ratings (id, submission_id, attribute_id, organization_id, rating, notes) VALUES
  ('11111111-d006-4000-a000-000000000001', '11111111-d005-4000-a000-000000000001',
   '11111111-7005-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   5, 'Described designing a real-time data pipeline with excellent architectural thinking'),
  ('11111111-d006-4000-a000-000000000002', '11111111-d005-4000-a000-000000000001',
   '11111111-7005-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   5, 'Mentioned open source contributions and test-driven development practices'),
  ('11111111-d006-4000-a000-000000000003', '11111111-d005-4000-a000-000000000001',
   '11111111-7005-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   5, 'Extremely clear, structured answers. No filler words.');

-- ============================================================
-- SECTION 5: TENANT_A — Offers (all 8 states)
-- ============================================================
-- seed.sql already has: Alice → SSE → draft (11111111-8001-...)

INSERT INTO offers (
  id, organization_id, application_id, candidate_id, job_id, template_id,
  status, compensation, start_date, expiry_date,
  esign_provider, esign_envelope_id,
  sent_at, signed_at, declined_at, created_by, created_at
) VALUES
  -- pending_approval: Bob for SSE
  ('11111111-d007-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-5001-4000-a000-000000000002', -- Bob's existing application
   '11111111-4001-4000-a000-000000000002', -- Bob
   '11111111-3001-4000-a000-000000000001', -- SSE
   '11111111-8002-4000-a000-000000000001',
   'pending_approval',
   '{"base_salary": 125000, "currency": "USD", "period": "annual"}'::jsonb,
   (CURRENT_DATE + INTERVAL '30 days')::date,
   (CURRENT_DATE + INTERVAL '60 days')::date,
   NULL, NULL, NULL, NULL, NULL,
   '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '2 days'),

  -- approved: Carol for SSE
  ('11111111-d007-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000017', -- Carol's application
   '11111111-4001-4000-a000-000000000003', -- Carol
   '11111111-3001-4000-a000-000000000001',
   '11111111-8002-4000-a000-000000000001',
   'approved',
   '{"base_salary": 135000, "currency": "USD", "period": "annual"}'::jsonb,
   (CURRENT_DATE + INTERVAL '14 days')::date,
   (CURRENT_DATE + INTERVAL '14 days')::date,
   NULL, NULL, NULL, NULL, NULL,
   '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '5 days'),

  -- sent: Victoria for Data Scientist (with e-sign)
  ('11111111-d007-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000010', -- Victoria's application
   '11111111-d001-4000-a000-000000000018', -- Victoria
   '11111111-d002-4000-a000-000000000003',
   '11111111-8002-4000-a000-000000000001',
   'sent',
   '{"base_salary": 145000, "currency": "USD", "period": "annual"}'::jsonb,
   (CURRENT_DATE + INTERVAL '21 days')::date,
   (CURRENT_DATE + INTERVAL '14 days')::date,
   'dropbox_sign', 'mock-envelope-victoria-001',
   NOW() - INTERVAL '3 days', NULL, NULL,
   '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '4 days'),

  -- signed: Emma for Frontend Engineer (hired)
  ('11111111-d007-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000001', -- Emma's application
   '11111111-d001-4000-a000-000000000001', -- Emma
   '11111111-d002-4000-a000-000000000001',
   '11111111-8002-4000-a000-000000000001',
   'signed',
   '{"base_salary": 118000, "currency": "USD", "period": "annual"}'::jsonb,
   (NOW() - INTERVAL '3 months 10 days')::date,
   NULL,
   'dropbox_sign', 'mock-envelope-emma-001',
   NOW() - INTERVAL '3 months 20 days',
   NOW() - INTERVAL '3 months 15 days', NULL,
   '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '3 months 22 days'),

  -- declined: Sam for UX Designer
  ('11111111-d007-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000013', -- Sam's application
   '11111111-d001-4000-a000-000000000015', -- Sam
   '11111111-d002-4000-a000-000000000004',
   '11111111-8002-4000-a000-000000000001',
   'declined',
   '{"base_salary": 98000, "currency": "USD", "period": "annual"}'::jsonb,
   (NOW() - INTERVAL '3 months 5 days')::date,
   NULL,
   'dropbox_sign', 'mock-envelope-sam-001',
   NOW() - INTERVAL '3 months 10 days',
   NULL, NOW() - INTERVAL '3 months 1 week',
   '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '3 months 12 days'),

  -- expired: Noah for Engineering Manager
  ('11111111-d007-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000016', -- Noah's application
   '11111111-d001-4000-a000-000000000010', -- Noah
   '11111111-d002-4000-a000-000000000005',
   '11111111-8002-4000-a000-000000000001',
   'expired',
   '{"base_salary": 175000, "currency": "USD", "period": "annual"}'::jsonb,
   (NOW() - INTERVAL '1 month 20 days')::date,
   (NOW() - INTERVAL '1 month')::date,
   'dropbox_sign', 'mock-envelope-noah-001',
   NOW() - INTERVAL '2 months',
   NULL, NULL,
   '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '2 months 2 days'),

  -- withdrawn: Henry for Engineering Manager
  ('11111111-d007-4000-a000-000000000007', '11111111-2001-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000015', -- Henry's application
   '11111111-d001-4000-a000-000000000004', -- Henry
   '11111111-d002-4000-a000-000000000005',
   '11111111-8002-4000-a000-000000000001',
   'withdrawn',
   '{"base_salary": 165000, "currency": "USD", "period": "annual"}'::jsonb,
   (CURRENT_DATE + INTERVAL '21 days')::date,
   (CURRENT_DATE + INTERVAL '14 days')::date,
   NULL, NULL, NULL, NULL, NULL,
   '11111111-1001-4000-a000-000000000003',
   NOW() - INTERVAL '1 week');

-- Offer approvals for pending + approved offers
INSERT INTO offer_approvals (id, organization_id, offer_id, approver_id, sequence_order, status, decided_at) VALUES
  -- Bob's offer: pending approval by Jordan (HM)
  ('11111111-d00a-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-d007-4000-a000-000000000001', '11111111-1001-4000-a000-000000000004',
   1, 'pending', NULL),

  -- Carol's offer: approved by Jordan (HM) + Senthil (owner)
  ('11111111-d00a-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d007-4000-a000-000000000002', '11111111-1001-4000-a000-000000000004',
   1, 'approved', NOW() - INTERVAL '4 days'),

  ('11111111-d00a-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d007-4000-a000-000000000002', '11111111-1001-4000-a000-000000000001',
   2, 'approved', NOW() - INTERVAL '3 days'),

  -- Victoria's offer: already approved before sending
  ('11111111-d00a-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d007-4000-a000-000000000003', '11111111-1001-4000-a000-000000000004',
   1, 'approved', NOW() - INTERVAL '5 days');

-- ============================================================
-- SECTION 6: TENANT_A — Screening Configs + Sessions
-- ============================================================

-- Additional screening configs for new jobs
INSERT INTO screening_configs (
  id, organization_id, job_opening_id, questions, instructions,
  max_duration_min, is_active, created_by
) VALUES
  (
    '11111111-d012-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d002-4000-a000-000000000001', -- Frontend Engineer
    '[
      {"id": "q1", "order": 1, "topic": "React experience", "raw_question": "Walk me through your experience building production React applications.", "is_required": true, "scoring_criteria": "Depth of experience, state management patterns, performance optimizations"},
      {"id": "q2", "order": 2, "topic": "TypeScript", "raw_question": "How has TypeScript improved your workflow, and where does it fall short?", "is_required": true, "scoring_criteria": "Type system understanding, practical tradeoffs"},
      {"id": "q3", "order": 3, "topic": "Collaboration", "raw_question": "Describe your process for collaborating with designers on a complex UI.", "is_required": false, "scoring_criteria": "Communication, design system awareness, iteration mindset"}
    ]'::jsonb,
    'Focus on real production experience. Probe for performance wins and pain points.',
    15, TRUE, '11111111-1001-4000-a000-000000000003'
  ),
  (
    '11111111-d012-4000-a000-000000000003',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d002-4000-a000-000000000002', -- DevOps Engineer
    '[
      {"id": "q1", "order": 1, "topic": "Infrastructure background", "raw_question": "Describe your experience managing Kubernetes clusters in production.", "is_required": true, "scoring_criteria": "Cluster ops depth, incident experience, tooling choices"},
      {"id": "q2", "order": 2, "topic": "IaC", "raw_question": "How do you manage infrastructure as code, and what is your testing strategy for it?", "is_required": true, "scoring_criteria": "Terraform/Pulumi depth, module design, testing maturity"}
    ]'::jsonb,
    'Focus on real production operations — not just CI/CD pipelines.',
    15, TRUE, '11111111-1001-4000-a000-000000000003'
  ),
  (
    '11111111-d012-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d002-4000-a000-000000000003', -- Data Scientist
    '[
      {"id": "q1", "order": 1, "topic": "ML background", "raw_question": "Tell me about your most impactful ML model in production. What was the outcome?", "is_required": true, "scoring_criteria": "Business impact, model lifecycle, monitoring"},
      {"id": "q2", "order": 2, "topic": "Data pipelines", "raw_question": "How do you ensure data quality upstream of your models?", "is_required": true, "scoring_criteria": "Data engineering awareness, validation strategies"},
      {"id": "q3", "order": 3, "topic": "Evaluation", "raw_question": "How do you handle concept drift in a deployed model?", "is_required": false, "scoring_criteria": "MLOps maturity, retraining strategy"}
    ]'::jsonb,
    'Looking for applied ML experience, not pure research. Ask for concrete metrics.',
    20, TRUE, '11111111-1001-4000-a000-000000000003'
  );

-- Screening sessions
INSERT INTO screening_sessions (
  id, organization_id, application_id, candidate_id, config_id,
  status, turns, ai_summary, ai_score, score_breakdown,
  human_review_requested, started_at, completed_at
) VALUES
  -- Kate: completed screening for Data Scientist
  (
    '11111111-d013-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d003-4000-a000-000000000009', -- Kate's application
    '11111111-d001-4000-a000-000000000007', -- Kate
    '11111111-d012-4000-a000-000000000002',
    'completed',
    '[
      {"id": "t1", "question_id": "q1", "ai_question_text": "Tell me about your most impactful ML model in production.", "candidate_answer": "I built a candidate ranking model at DataForge that reduced time-to-shortlist by 40%. We used a gradient-boosted tree on 200+ features, with SHAP values for explainability. It went from prototype to production in 8 weeks and is still serving 50k predictions/day.", "turn_score": 0.91},
      {"id": "t2", "question_id": "q2", "ai_question_text": "How do you ensure data quality upstream of your models?", "candidate_answer": "We had a Great Expectations suite that ran on every ingestion, with alerts in Slack. I also built a simple anomaly detector that flagged statistical distribution shifts before they hit training.", "turn_score": 0.88},
      {"id": "t3", "question_id": "q3", "ai_question_text": "How do you handle concept drift in a deployed model?", "candidate_answer": "We tracked PSI and KS statistics on feature distributions weekly. When drift exceeded a threshold, it triggered an automated retraining pipeline. I presented the drift dashboard to stakeholders monthly.", "turn_score": 0.85}
    ]'::jsonb,
    'Strong ML practitioner with real production experience. Excellent data quality and MLOps awareness. Business-first mindset. Recommend advancing to technical interview.',
    0.88,
    '{"q1": 0.91, "q2": 0.88, "q3": 0.85}'::jsonb,
    FALSE,
    NOW() - INTERVAL '2 weeks',
    NOW() - INTERVAL '2 weeks' + INTERVAL '18 minutes'
  ),

  -- Grace: in_progress (started, not finished)
  (
    '11111111-d013-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d003-4000-a000-000000000008', -- Grace's application
    '11111111-d001-4000-a000-000000000003', -- Grace
    '11111111-d012-4000-a000-000000000002',
    'in_progress',
    '[
      {"id": "t1", "question_id": "q1", "ai_question_text": "Tell me about your most impactful ML model in production.", "candidate_answer": "At ML Ventures I built a churn prediction model for a fintech client. We used XGBoost and reduced monthly churn by 12% over 6 months. The key was getting the right lagged features.", "turn_score": 0.82}
    ]'::jsonb,
    NULL, NULL, NULL,
    FALSE,
    NOW() - INTERVAL '30 minutes',
    NULL
  ),

  -- James: abandoned (dropped off mid-screening)
  (
    '11111111-d013-4000-a000-000000000003',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d003-4000-a000-000000000003', -- James's application
    '11111111-d001-4000-a000-000000000006', -- James
    '11111111-d012-4000-a000-000000000001',
    'abandoned',
    '[
      {"id": "t1", "question_id": "q1", "ai_question_text": "Walk me through your experience building production React applications.", "candidate_answer": "I have about 2 years with React. Mostly internal tools and a customer portal.", "turn_score": 0.55}
    ]'::jsonb,
    NULL, NULL, NULL,
    FALSE,
    NOW() - INTERVAL '5 days',
    NULL
  ),

  -- Umar: skipped (recruiter manually bypassed)
  (
    '11111111-d013-4000-a000-000000000004',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d003-4000-a000-000000000007', -- Umar's application
    '11111111-d001-4000-a000-000000000017', -- Umar
    '11111111-d012-4000-a000-000000000003', -- DevOps screening config
    'skipped',
    '[]'::jsonb,
    NULL, NULL, NULL,
    FALSE, NULL, NULL
  );

-- ============================================================
-- SECTION 7: TENANT_A — AI Shortlist Reports
-- ============================================================

INSERT INTO ai_shortlist_reports (
  id, organization_id, job_opening_id, triggered_by, status,
  total_applications, shortlist_count, hold_count, reject_count, insufficient_data_count,
  executive_summary, hiring_manager_note, completed_at
) VALUES
  (
    '11111111-d008-4000-a000-000000000001',
    '11111111-2001-4000-a000-000000000001',
    '11111111-3001-4000-a000-000000000001', -- Senior Engineer
    '11111111-1001-4000-a000-000000000003', -- Roshelle
    'complete',
    5, 2, 2, 0, 1,
    'Strong candidate pool for the Senior Software Engineer role. Alice Johnson and Carol Williams are clear shortlist candidates with deep TypeScript/React experience and strong interview signals. Bob Smith and Rachel Scott are solid holds. Xena Nguyen lacks sufficient profile data for a reliable score.',
    'I agree with the shortlist. Prioritize Alice and Carol. Rachel could be a backup if either withdraws.',
    NOW() - INTERVAL '2 days'
  ),
  (
    '11111111-d008-4000-a000-000000000002',
    '11111111-2001-4000-a000-000000000001',
    '11111111-d002-4000-a000-000000000001', -- Frontend Engineer
    '11111111-1001-4000-a000-000000000003',
    'complete',
    4, 2, 1, 1, 0,
    'Emma Davis (hired) and Maya Patel are the strongest candidates for Frontend Engineer. Emma''s hire validated the AI ranking. Maya is progressing well. James Taylor needs technical validation — hold pending screening. Quinn Thompson showed weak technical depth.',
    'Emma was a great hire. Fast-track Maya to final round.',
    NOW() - INTERVAL '3 months 22 days'
  );

INSERT INTO ai_shortlist_candidates (
  id, organization_id, report_id, application_id, candidate_id,
  ai_tier, composite_score, skills_score, experience_score, education_score,
  domain_score, trajectory_score,
  strengths, gaps, clarifying_question
) VALUES
  -- Report 1: SSE candidates
  ('11111111-d009-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000001',
   '11111111-5001-4000-a000-000000000001', -- Alice
   '11111111-4001-4000-a000-000000000001',
   'shortlist', 0.917, 0.95, 0.90, 0.85, 0.92, 0.94,
   ARRAY['Deep React/TypeScript expertise', '5+ years production experience', 'Strong system design intuition'],
   ARRAY['No Kubernetes/infra exposure listed'],
   'Can you describe experience with backend or API design?'),

  ('11111111-d009-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000001',
   '11111111-5001-4000-a000-000000000002', -- Bob
   '11111111-4001-4000-a000-000000000002',
   'hold', 0.741, 0.78, 0.72, 0.70, 0.74, 0.76,
   ARRAY['Solid Python/Django background', 'Startup experience shows adaptability'],
   ARRAY['TypeScript not listed', 'No PostgreSQL depth mentioned'],
   NULL),

  ('11111111-d009-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000017', -- Carol
   '11111111-4001-4000-a000-000000000003',
   'shortlist', 0.883, 0.88, 0.91, 0.88, 0.87, 0.86,
   ARRAY['Enterprise Java/Spring Boot expertise', 'Kubernetes and PostgreSQL depth', 'Strong senior background'],
   ARRAY['Different primary stack (Java vs TypeScript)'],
   'How quickly have you picked up new languages/frameworks in past roles?'),

  ('11111111-d009-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000018', -- Rachel
   '11111111-d001-4000-a000-000000000014',
   'hold', 0.802, 0.84, 0.80, 0.75, 0.80, 0.79,
   ARRAY['TypeScript and Node.js proficiency', 'Full-stack experience', 'AWS background'],
   ARRAY['Limited system design signals in profile'],
   NULL),

  ('11111111-d009-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000001',
   '11111111-d003-4000-a000-000000000019', -- Xena
   '11111111-d001-4000-a000-000000000020',
   'insufficient_data', NULL, NULL, NULL, NULL, NULL, NULL,
   ARRAY['TypeScript and Node.js listed'],
   ARRAY['Sparse work history', 'No LinkedIn profile', 'No company details'],
   'Could you share more about your recent projects and experience level?'),

  -- Report 2: Frontend Engineer candidates
  ('11111111-d009-4000-a000-000000000006', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000002',
   '11111111-d003-4000-a000-000000000001', -- Emma
   '11111111-d001-4000-a000-000000000001',
   'shortlist', 0.931, 0.96, 0.92, 0.88, 0.94, 0.95,
   ARRAY['React + TypeScript mastery', 'Design systems expertise', 'Storybook and testing depth'],
   ARRAY['No mention of backend/API work'],
   NULL),

  ('11111111-d009-4000-a000-000000000007', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000002',
   '11111111-d003-4000-a000-000000000004', -- Maya
   '11111111-d001-4000-a000-000000000009',
   'shortlist', 0.888, 0.92, 0.88, 0.82, 0.89, 0.87,
   ARRAY['Next.js and GraphQL expertise', 'Strong testing library usage', 'Senior level experience'],
   ARRAY['Limited design system history'],
   NULL),

  ('11111111-d009-4000-a000-000000000008', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000002',
   '11111111-d003-4000-a000-000000000003', -- James
   '11111111-d001-4000-a000-000000000006',
   'hold', 0.614, 0.65, 0.58, 0.60, 0.62, 0.64,
   ARRAY['React and Node.js basics covered', 'Startup hustle'],
   ARRAY['Only 2 years experience', 'No TypeScript listed', 'No testing mentioned'],
   'Tell me about the most complex UI component you have built.'),

  ('11111111-d009-4000-a000-000000000009', '11111111-2001-4000-a000-000000000001',
   '11111111-d008-4000-a000-000000000002',
   '11111111-d003-4000-a000-000000000002', -- Quinn
   '11111111-d001-4000-a000-000000000013',
   'reject', 0.512, 0.53, 0.52, 0.48, 0.51, 0.52,
   ARRAY['Frontend basics covered'],
   ARRAY['No TypeScript listed', 'Vue listed but React is primary', 'Weak signal on production scale'],
   NULL);

-- ============================================================
-- SECTION 8: TENANT_A — Talent Pools + Members
-- ============================================================

INSERT INTO talent_pools (id, organization_id, name, description, created_by) VALUES
  ('11111111-d010-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   'Product & Design Leaders',
   'Senior ICs and managers for future product/design roles',
   '11111111-1001-4000-a000-000000000003'),

  ('11111111-d010-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   'Data & AI Talent',
   'Data scientists, ML engineers, and data engineers for future AI initiatives',
   '11111111-1001-4000-a000-000000000003');

INSERT INTO talent_pool_members (id, organization_id, talent_pool_id, candidate_id, added_by, notes) VALUES
  ('11111111-d011-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-d010-4000-a000-000000000001', '11111111-d001-4000-a000-000000000012', -- Paul
   '11111111-1001-4000-a000-000000000003',
   'Senior leader. Would be a great EM hire when budget opens. Keep warm.'),

  ('11111111-d011-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d010-4000-a000-000000000001', '11111111-d001-4000-a000-000000000005', -- Isabel
   '11111111-1001-4000-a000-000000000003',
   'Hired as UX Designer. Potential product management pivot in 12 months.'),

  ('11111111-d011-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d010-4000-a000-000000000002', '11111111-d001-4000-a000-000000000003', -- Grace
   '11111111-1001-4000-a000-000000000003',
   'Active applicant for Data Scientist. Keep regardless of outcome.'),

  ('11111111-d011-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d010-4000-a000-000000000002', '11111111-d001-4000-a000-000000000007', -- Kate
   '11111111-1001-4000-a000-000000000003',
   'Strong ML background. Top candidate for Data Scientist role.'),

  ('11111111-d011-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-d010-4000-a000-000000000002', '11111111-d001-4000-a000-000000000018', -- Victoria
   '11111111-1001-4000-a000-000000000003',
   'Offer sent. If she signs, great. If not, keep in pool — strong senior profile.');

-- ============================================================
-- SECTION 9: TENANT_A — Candidate Notes
-- ============================================================

INSERT INTO candidate_notes (id, organization_id, candidate_id, content, created_by, created_at) VALUES
  ('11111111-d014-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000012', -- Paul
   'Spoke with Paul at a Dallas tech meetup. Very impressive systems thinking. He mentioned he''s ready for his next move — timing is perfect for the EM role.',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '6 weeks'),

  ('11111111-d014-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000018', -- Victoria
   'Victoria expressed strong interest during the onsite. She mentioned she has a competing offer with a 2-week deadline. We need to move fast on this one.',
   '11111111-1001-4000-a000-000000000004', NOW() - INTERVAL '5 days'),

  ('11111111-d014-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000002', -- Frank
   'Frank was a referral from Senthil''s former colleague. Strong infrastructure background. Accepted offer, starting next month.',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '2 months 10 days'),

  ('11111111-d014-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000019', -- William (duplicate)
   'Possible duplicate of Emma Davis (d001-001). Same employer, same location, similar skills. Email domains differ (personal vs work). Flagged for merge review.',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '1 week'),

  ('11111111-d014-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-4001-4000-a000-000000000001', -- Alice
   'Alice is progressing well through the pipeline. Technical interview scheduled. Screening AI score was 0.88 — one of our highest. Jordan flagged her as top priority.',
   '11111111-1001-4000-a000-000000000003', NOW() - INTERVAL '3 days');

-- ============================================================
-- SECTION 10: TENANT_A — AI Match Explanations
-- ============================================================

INSERT INTO ai_match_explanations (
  id, organization_id, candidate_id, job_opening_id,
  explanation, key_matches, key_gaps, similarity_score
) VALUES
  ('11111111-d016-4000-a000-000000000001', '11111111-2001-4000-a000-000000000001',
   '11111111-4001-4000-a000-000000000001', -- Alice
   '11111111-3001-4000-a000-000000000001', -- SSE
   'Alice Johnson is a strong match for the Senior Software Engineer role. Her 5-year React and TypeScript experience aligns directly with core requirements. PostgreSQL and Node.js experience covers the backend requirements. Her real-time dashboard project demonstrates the scale and complexity we need.',
   ARRAY['TypeScript (advanced)', 'React (5 years)', 'Node.js', 'PostgreSQL', 'Real-time systems'],
   ARRAY['No Kubernetes/DevOps exposure', 'No Spring or JVM languages'],
   0.917),

  ('11111111-d016-4000-a000-000000000002', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000001', -- Emma
   '11111111-d002-4000-a000-000000000001', -- Frontend Engineer
   'Emma Davis is an exceptional match for the Frontend Engineer role. Her expertise in React, TypeScript, and design systems directly addresses our career portal requirements. Storybook experience will accelerate our component library work.',
   ARRAY['React', 'TypeScript', 'CSS', 'Figma', 'Storybook', 'Design Systems'],
   ARRAY['No GraphQL mentioned', 'Limited backend exposure'],
   0.931),

  ('11111111-d016-4000-a000-000000000003', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000002', -- Frank
   '11111111-d002-4000-a000-000000000002', -- DevOps Engineer
   'Frank Miller is a top-tier match for the DevOps Engineer role. Deep Kubernetes and Terraform expertise covers the core requirements. Prometheus/Grafana experience matches our observability requirements. AWS proficiency aligns with our cloud infrastructure.',
   ARRAY['Kubernetes', 'Terraform', 'AWS', 'Docker', 'Prometheus', 'Grafana'],
   ARRAY['No mention of GitHub Actions or ArgoCD'],
   0.924),

  ('11111111-d016-4000-a000-000000000004', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000018', -- Victoria
   '11111111-d002-4000-a000-000000000003', -- Data Scientist
   'Victoria Wright is a strong match for the Data Scientist role. Senior experience with PyTorch and scikit-learn covers the ML core. MLflow experience signals production ML maturity. SQL and dbt background means she can own the data pipeline too.',
   ARRAY['Python', 'PyTorch', 'scikit-learn', 'MLflow', 'dbt', 'SQL'],
   ARRAY['No NLP-specific experience listed', 'No real-time serving mentioned'],
   0.902),

  ('11111111-d016-4000-a000-000000000005', '11111111-2001-4000-a000-000000000001',
   '11111111-d001-4000-a000-000000000012', -- Paul
   '11111111-d002-4000-a000-000000000005', -- Engineering Manager
   'Paul Roberts is a strong match for the Engineering Manager role. 12 years of engineering with director-level leadership experience directly aligns. Go and Python background matches our backend stack. OKR familiarity signals strategic thinking.',
   ARRAY['Team Leadership', 'System Design', 'Go', 'Python', 'OKRs', 'Enterprise experience'],
   ARRAY['No SaaS startup experience', 'Enterprise background may require adjustment to pace'],
   0.878);

-- ============================================================
-- SECTION 11: TENANT_A — Candidate Merge (William → Emma)
-- ============================================================

-- Insert merge audit record (William is near-duplicate of Emma)
INSERT INTO candidate_merges (
  organization_id, primary_id, secondary_id, merged_by,
  ai_confidence, merge_reason
) VALUES (
  '11111111-2001-4000-a000-000000000001',
  '11111111-d001-4000-a000-000000000001', -- primary: Emma Davis
  '11111111-d001-4000-a000-000000000019', -- secondary: William Garcia (duplicate)
  '11111111-1001-4000-a000-000000000001', -- merged by Senthil (owner)
  0.94,
  'Same employer (DesignFlow Inc), same location (Austin TX), very similar skill set and email domains. AI confidence 94%.'
);

-- Soft-delete William Garcia (secondary candidate after merge)
UPDATE candidates
  SET deleted_at = NOW() - INTERVAL '5 days', updated_at = NOW() - INTERVAL '5 days'
  WHERE id = '11111111-d001-4000-a000-000000000019';

-- ============================================================
-- SECTION 12: TENANT_B — Demo Data (Globex Inc, starter plan)
-- ============================================================

-- Two new jobs for Globex
INSERT INTO job_openings (
  id, organization_id, pipeline_template_id,
  title, slug, status, location_type, employment_type,
  salary_min, salary_max, salary_currency,
  hiring_manager_id, recruiter_id, headcount, published_at
) VALUES
  (
    '22222222-e002-4000-a000-000000000001',
    '22222222-2001-4000-a000-000000000001',
    '22222222-6001-4000-a000-000000000001',
    'JavaScript Developer', 'javascript-developer',
    'open', 'remote', 'full_time',
    80000, 110000, 'USD',
    '22222222-1001-4000-a000-000000000001',
    '22222222-1001-4000-a000-000000000002',
    1,
    NOW() - INTERVAL '6 weeks'
  ),
  (
    '22222222-e002-4000-a000-000000000002',
    '22222222-2001-4000-a000-000000000001',
    '22222222-6001-4000-a000-000000000001',
    'Project Manager', 'project-manager',
    'draft', 'hybrid', 'full_time',
    75000, 100000, 'USD',
    '22222222-1001-4000-a000-000000000001',
    '22222222-1001-4000-a000-000000000002',
    1,
    NULL
  );

-- Five new candidates for Globex
INSERT INTO candidates (
  id, organization_id, full_name, email, phone,
  current_title, location, skills, source
) VALUES
  ('22222222-e001-4000-a000-000000000001', '22222222-2001-4000-a000-000000000001',
   'Eve Sanders', 'eve.sanders@example.com', '+1-555-2001',
   'JavaScript Developer', 'Miami, FL',
   ARRAY['React', 'JavaScript', 'Node.js', 'CSS'], 'LinkedIn'),

  ('22222222-e001-4000-a000-000000000002', '22222222-2001-4000-a000-000000000001',
   'Felix Grant', 'felix.grant@example.com', '+1-555-2002',
   'Frontend Developer', 'Remote',
   ARRAY['Vue', 'JavaScript', 'TypeScript'], 'Career Page'),

  ('22222222-e001-4000-a000-000000000003', '22222222-2001-4000-a000-000000000001',
   'Gia Romano', 'gia.romano@example.com', '+1-555-2003',
   'Full Stack Developer', 'Miami, FL',
   ARRAY['React', 'Node.js', 'MongoDB', 'AWS'], 'Referral'),

  ('22222222-e001-4000-a000-000000000004', '22222222-2001-4000-a000-000000000001',
   'Hank Morris', 'hank.morris@example.com', '+1-555-2004',
   'Project Manager', 'Remote',
   ARRAY['Agile', 'Jira', 'Confluence', 'Scrum'], 'Job Board'),

  ('22222222-e001-4000-a000-000000000005', '22222222-2001-4000-a000-000000000001',
   'Isla Pierce', 'isla.pierce@example.com', '+1-555-2005',
   'Software Engineer', 'Remote',
   ARRAY['Python', 'JavaScript', 'React'], 'Direct');

-- Applications for Globex
INSERT INTO applications (
  id, organization_id, candidate_id, job_opening_id, current_stage_id,
  status, source, applied_at, created_at, hired_at, rejected_at
) VALUES
  ('22222222-e003-4000-a000-000000000001', '22222222-2001-4000-a000-000000000001',
   '22222222-e001-4000-a000-000000000001', -- Eve
   '22222222-e002-4000-a000-000000000001', -- JS Developer
   '22222222-6002-4000-a000-000000000002', -- Interview
   'active', 'LinkedIn',
   NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '4 weeks', NULL, NULL),

  ('22222222-e003-4000-a000-000000000002', '22222222-2001-4000-a000-000000000001',
   '22222222-e001-4000-a000-000000000002', -- Felix
   '22222222-e002-4000-a000-000000000001', -- JS Developer
   '22222222-6002-4000-a000-000000000001', -- Applied
   'active', 'Career Page',
   NOW() - INTERVAL '1 week', NOW() - INTERVAL '1 week', NULL, NULL),

  ('22222222-e003-4000-a000-000000000003', '22222222-2001-4000-a000-000000000001',
   '22222222-e001-4000-a000-000000000003', -- Gia
   '22222222-e002-4000-a000-000000000001', -- JS Developer
   '22222222-6002-4000-a000-000000000003', -- Offer
   'active', 'Referral',
   NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks', NULL, NULL),

  ('22222222-e003-4000-a000-000000000004', '22222222-2001-4000-a000-000000000001',
   '22222222-e001-4000-a000-000000000004', -- Hank
   '22222222-e002-4000-a000-000000000002', -- PM
   '22222222-6002-4000-a000-000000000001', -- Applied
   'active', 'Job Board',
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NULL, NULL),

  ('22222222-e003-4000-a000-000000000005', '22222222-2001-4000-a000-000000000001',
   '22222222-e001-4000-a000-000000000005', -- Isla
   '22222222-e002-4000-a000-000000000001', -- JS Developer
   '22222222-6002-4000-a000-000000000001', -- Applied (rejected)
   'rejected', 'Direct',
   NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks',
   NULL, NOW() - INTERVAL '4 weeks');

-- Globex interview (Eve)
INSERT INTO interviews (
  id, organization_id, application_id, job_id, interviewer_id,
  interview_type, scheduled_at, duration_minutes, status,
  scorecard_template_id, created_by
) VALUES
  ('22222222-e004-4000-a000-000000000001', '22222222-2001-4000-a000-000000000001',
   '22222222-e003-4000-a000-000000000001', -- Eve
   '22222222-e002-4000-a000-000000000001',
   '22222222-1001-4000-a000-000000000002', -- Casey
   'phone_screen',
   NOW() - INTERVAL '3 weeks', 30, 'completed',
   NULL,
   '22222222-1001-4000-a000-000000000002'),

  ('22222222-e004-4000-a000-000000000002', '22222222-2001-4000-a000-000000000001',
   '22222222-e003-4000-a000-000000000003', -- Gia
   '22222222-e002-4000-a000-000000000001',
   '22222222-1001-4000-a000-000000000001', -- Morgan
   'final',
   NOW() + INTERVAL '4 days', 60, 'scheduled',
   NULL,
   '22222222-1001-4000-a000-000000000002');

-- Globex offer (Gia — sent)
INSERT INTO offers (
  id, organization_id, application_id, candidate_id, job_id,
  status, compensation, start_date, expiry_date,
  esign_provider, esign_envelope_id, sent_at, created_by, created_at
) VALUES
  ('22222222-e005-4000-a000-000000000001', '22222222-2001-4000-a000-000000000001',
   '22222222-e003-4000-a000-000000000003', -- Gia's application
   '22222222-e001-4000-a000-000000000003', -- Gia
   '22222222-e002-4000-a000-000000000001', -- JS Developer
   'sent',
   '{"base_salary": 92000, "currency": "USD", "period": "annual"}'::jsonb,
   (CURRENT_DATE + INTERVAL '14 days')::date,
   (CURRENT_DATE + INTERVAL '7 days')::date,
   'dropbox_sign', 'mock-envelope-gia-001',
   NOW() - INTERVAL '2 days',
   '22222222-1001-4000-a000-000000000002',
   NOW() - INTERVAL '3 days');

-- Globex screening session (Eve — completed)
INSERT INTO screening_sessions (
  id, organization_id, application_id, candidate_id, config_id,
  status, turns, ai_summary, ai_score, score_breakdown,
  started_at, completed_at
) VALUES
  (
    '22222222-e006-4000-a000-000000000001',
    '22222222-2001-4000-a000-000000000001',
    '22222222-e003-4000-a000-000000000001', -- Eve's application
    '22222222-e001-4000-a000-000000000001', -- Eve
    '22222222-b001-4000-a000-000000000001', -- Python Developer config (reused for JS)
    'completed',
    '[
      {"id": "t1", "question_id": "q1", "ai_question_text": "Describe your Python experience.", "candidate_answer": "I primarily work in JavaScript but have 1 year of Python for automation scripts and small APIs. My main strength is in React and Node.js.", "turn_score": 0.62}
    ]'::jsonb,
    'Candidate is primarily a JavaScript developer. Python experience is limited. Strong React and Node.js background makes her a better fit for the JavaScript Developer role.',
    0.62,
    '{"q1": 0.62}'::jsonb,
    NOW() - INTERVAL '5 weeks',
    NOW() - INTERVAL '5 weeks' + INTERVAL '8 minutes'
  );

-- ============================================================
-- End of demo seed data
-- ============================================================
-- Summary:
--   TENANT_A (itecbrains / Pro):
--     Jobs:          6 new (4 open, 1 closed, 1 draft) + 2 existing = 8 total
--     Candidates:    20 new + 3 existing = 23 total (1 merged/soft-deleted)
--     Applications:  19 new + 3 existing = 22 total
--       Statuses:    active(12), hired(3), rejected(4), withdrawn(1), + existing
--     Offers:        7 new + 1 existing = 8 total (all 8 states covered)
--     Interviews:    10 new + 2 existing = 12 total
--     Screening:     2 new configs + 4 new sessions (all 4 non-pending states)
--     Shortlists:    2 reports, 9 candidates scored
--     Talent pools:  2 new + 1 existing = 3 total
--     Merges:        1 candidate merge audit record
--   TENANT_B (Globex Inc / starter):
--     Jobs:          2 new + 1 existing = 3 total
--     Candidates:    5 new + 1 existing = 6 total
--     Applications:  5 new + 1 existing = 6 total
--     Interviews:    2 new = 2 total
--     Offers:        1 new (sent with e-sign)
--     Screening:     1 new session (completed)
-- ============================================================
