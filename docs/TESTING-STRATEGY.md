# Consolidated Testing Strategy

> **ID:** D24
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-12
> **Depends on:** D04/ADR-004 (3-tier testing strategy), D01 (schema — golden tenant fixtures)
> **Depended on by:** D15 (CI/CD — test jobs reference this document)
> **Last validated against deps:** 2026-03-12
> **Architecture decisions assumed:** ADR-001 (Supabase client, `SET LOCAL`), ADR-004 (3-tier testing), ADR-005 (multi-org), ADR-006 (soft delete)

---

## 1. Overview

This document consolidates all testing requirements scattered across D06–D12 module docs and ADR-004 into a single executable test plan. It specifies coverage targets, the golden tenant fixture, MSW mock registry, test database strategy, E2E scenario registry, and CI parallelization. ADR-004 defines *what* and *when* — this document defines *how*.

**Scope:**
- In scope: Test infrastructure setup, fixture design, mock registry, coverage targets, E2E scenarios, CI optimization, test file conventions.
- Out of scope: Individual test case implementations (those live in code), performance/load testing (D16), security testing (D22), accessibility testing (deferred).

---

## 2. Test Stack

| Tool | Purpose | Config File |
|------|---------|-------------|
| **Vitest** | Unit + integration tests | `vitest.config.ts` |
| **Playwright** | E2E browser tests | `playwright.config.ts` |
| **MSW** (Mock Service Worker) | External API mocking | `src/__mocks__/handlers.ts` |
| **Supabase CLI** | Local database for RLS tests | `supabase/config.toml` |
| **Faker** | Test data generation | (inline usage) |
| **axe-core** | Accessibility checks in Playwright | `@axe-core/playwright` |

### 2.1 Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['src/**/*.e2e.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    pool: 'threads',
    poolOptions: {
      threads: { maxThreads: 4, minThreads: 1 },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.*',
        'src/**/*.e2e.*',
        'src/__fixtures__/**',
        'src/__mocks__/**',
        'src/types/**',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'lib': path.resolve(__dirname, 'lib'),
    },
  },
});
```

### 2.2 Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'src/__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile viewport for responsive tests
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

---

## 3. Golden Tenant Fixture

### 3.1 Design

Two tenants with all entity types populated. Every test suite uses these fixtures for consistent, deterministic state.

```typescript
// src/__fixtures__/golden-tenant.ts

export const TENANT_A = {
  org: {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Acme Corp',
    slug: 'acme-corp',
    plan: 'pro' as const,
  },
  users: {
    owner: {
      id: '11111111-0001-0001-0001-000000000001',
      email: 'owner@acme-test.com',
      role: 'owner' as const,
    },
    admin: {
      id: '11111111-0001-0001-0001-000000000002',
      email: 'admin@acme-test.com',
      role: 'admin' as const,
    },
    recruiter: {
      id: '11111111-0001-0001-0001-000000000003',
      email: 'recruiter@acme-test.com',
      role: 'recruiter' as const,
    },
    hiringManager: {
      id: '11111111-0001-0001-0001-000000000004',
      email: 'hiring-manager@acme-test.com',
      role: 'hiring_manager' as const,
    },
    interviewer: {
      id: '11111111-0001-0001-0001-000000000005',
      email: 'interviewer@acme-test.com',
      role: 'interviewer' as const,
    },
  },
  pipeline: {
    id: '11111111-2001-0001-0001-000000000001',
    name: 'Default Pipeline',
    stages: {
      applied: { id: '11111111-2002-0001-0001-000000000001', type: 'applied', order: 1 },
      screening: { id: '11111111-2002-0001-0001-000000000002', type: 'screening', order: 2 },
      interview: { id: '11111111-2002-0001-0001-000000000003', type: 'interview', order: 3 },
      offer: { id: '11111111-2002-0001-0001-000000000004', type: 'offer', order: 4 },
      hired: { id: '11111111-2002-0001-0001-000000000005', type: 'hired', order: 5 },
      rejected: { id: '11111111-2002-0001-0001-000000000006', type: 'rejected', order: 6 },
    },
  },
  jobs: {
    engineer: {
      id: '11111111-3001-0001-0001-000000000001',
      title: 'Senior Engineer',
      department: 'Engineering',
      status: 'open',
    },
    designer: {
      id: '11111111-3001-0001-0001-000000000002',
      title: 'Product Designer',
      department: 'Design',
      status: 'open',
    },
    closedJob: {
      id: '11111111-3001-0001-0001-000000000003',
      title: 'Junior Developer',
      department: 'Engineering',
      status: 'closed',
    },
  },
  candidates: {
    active: {
      id: '11111111-4001-0001-0001-000000000001',
      full_name: 'Alice Active',
      email: 'alice@test.com',
    },
    rejected: {
      id: '11111111-4001-0001-0001-000000000002',
      full_name: 'Bob Rejected',
      email: 'bob@test.com',
    },
    hired: {
      id: '11111111-4001-0001-0001-000000000003',
      full_name: 'Carol Hired',
      email: 'carol@test.com',
    },
  },
  applications: {
    aliceToEngineer: {
      id: '11111111-5001-0001-0001-000000000001',
      candidate_id: '11111111-4001-0001-0001-000000000001', // Alice
      job_opening_id: '11111111-3001-0001-0001-000000000001', // Engineer
      status: 'active',
      current_stage_id: '11111111-2002-0001-0001-000000000003', // Interview
    },
    bobToDesigner: {
      id: '11111111-5001-0001-0001-000000000002',
      candidate_id: '11111111-4001-0001-0001-000000000002', // Bob
      job_opening_id: '11111111-3001-0001-0001-000000000002', // Designer
      status: 'rejected',
      current_stage_id: '11111111-2002-0001-0001-000000000006', // Rejected
    },
  },
  scorecardTemplate: {
    id: '11111111-6001-0001-0001-000000000001',
    name: 'Engineering Interview',
    categories: [
      { id: '11111111-6002-0001-0001-000000000001', name: 'Technical Skills', weight: 40 },
      { id: '11111111-6002-0001-0001-000000000002', name: 'Communication', weight: 30 },
      { id: '11111111-6002-0001-0001-000000000003', name: 'Culture Fit', weight: 30 },
    ],
  },
  interviews: {
    aliceScreening: {
      id: '11111111-7001-0001-0001-000000000001',
      application_id: '11111111-5001-0001-0001-000000000001', // aliceToEngineer
      job_opening_id: '11111111-3001-0001-0001-000000000001', // engineer
      interviewer_id: '11111111-0001-0001-0001-000000000005', // interviewer
      scorecard_template_id: '11111111-6001-0001-0001-000000000001',
      status: 'completed',
      scheduled_at: '2026-03-12T10:00:00Z',
      completed_at: '2026-03-12T11:00:00Z',
    },
    aliceTechnical: {
      id: '11111111-7001-0001-0001-000000000002',
      application_id: '11111111-5001-0001-0001-000000000001',
      job_opening_id: '11111111-3001-0001-0001-000000000001',
      interviewer_id: '11111111-0001-0001-0001-000000000004', // hiringManager
      scorecard_template_id: '11111111-6001-0001-0001-000000000001',
      status: 'scheduled',
      scheduled_at: '2026-03-15T14:00:00Z',
    },
  },
  scorecardSubmissions: {
    screeningFeedback: {
      id: '11111111-7002-0001-0001-000000000001',
      interview_id: '11111111-7001-0001-0001-000000000001', // aliceScreening
      application_id: '11111111-5001-0001-0001-000000000001',
      submitted_by: '11111111-0001-0001-0001-000000000005', // interviewer
      recommendation: 'strong_yes',
      overall_score: 4.2,
      submitted_at: '2026-03-12T11:30:00Z',
    },
  },
  offers: {
    aliceDraft: {
      id: '11111111-8001-0001-0001-000000000001',
      application_id: '11111111-5001-0001-0001-000000000001',
      candidate_id: '11111111-4001-0001-0001-000000000001', // Alice
      job_opening_id: '11111111-3001-0001-0001-000000000001',
      status: 'draft',
      created_by: '11111111-0001-0001-0001-000000000003', // recruiter
      compensation: {
        base_salary: 120000,
        currency: 'USD',
        equity: '0.05%',
        signing_bonus: 5000,
      },
    },
  },
  notes: {
    onAlice: {
      id: '11111111-9001-0001-0001-000000000001',
      candidate_id: '11111111-4001-0001-0001-000000000001', // Alice
      author_id: '11111111-0001-0001-0001-000000000003', // recruiter
      body: 'Strong technical background. Passed screening with flying colors. @hiring-manager please review.',
      created_at: '2026-03-12T12:00:00Z',
    },
    replyToAlice: {
      id: '11111111-9001-0001-0001-000000000002',
      candidate_id: '11111111-4001-0001-0001-000000000001',
      author_id: '11111111-0001-0001-0001-000000000004', // hiringManager
      parent_id: '11111111-9001-0001-0001-000000000001', // threaded reply
      body: 'Agreed, moving to technical interview.',
      created_at: '2026-03-12T14:00:00Z',
    },
  },
};

export const TENANT_B = {
  org: {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Globex Inc',
    slug: 'globex-inc',
    plan: 'starter' as const,
  },
  users: {
    owner: {
      id: '22222222-0001-0001-0001-000000000001',
      email: 'owner@globex-test.com',
      role: 'owner' as const,
    },
    recruiter: {
      id: '22222222-0001-0001-0001-000000000002',
      email: 'recruiter@globex-test.com',
      role: 'recruiter' as const,
    },
  },
  candidates: {
    active: {
      id: '22222222-4001-0001-0001-000000000001',
      full_name: 'Xavier Globex',
      email: 'xavier@test.com',
    },
  },
};
```

### 3.2 Seed SQL

```sql
-- supabase/seed.sql (loaded by `supabase db reset`)
-- This file is generated from golden-tenant.ts during build

-- Tenant A
INSERT INTO organizations (id, name, slug, plan) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Acme Corp', 'acme-corp', 'pro');

-- Tenant A users (via Supabase Auth admin API in seed script)
-- ... user_profiles and organization_members created by seed script

-- Tenant B
INSERT INTO organizations (id, name, slug, plan) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Globex Inc', 'globex-inc', 'starter');

-- Full seed data: pipeline, stages, jobs, candidates, applications
-- (generated from golden-tenant.ts constants)
```

### 3.3 Fixture Helpers

```typescript
// src/__tests__/helpers.ts
import { createClient } from '@supabase/supabase-js';
import { TENANT_A, TENANT_B } from '../__fixtures__/golden-tenant';

// Create Supabase client authenticated as a specific user
export function createTestClient(user: { id: string; email: string }, orgId: string) {
  // Uses Supabase local's auth.admin API to generate a JWT for the user
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
  // Sign in as test user (seeded in local Supabase)
  return supabase;
}

// Reset test data between tests (restore golden state)
export async function resetTestData() {
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  // Truncate transient data, re-seed from fixtures
  await admin.rpc('reset_test_data');
}

// Assert cross-tenant isolation
export async function assertTenantIsolation(
  table: string,
  tenantAClient: SupabaseClient,
  tenantBRecordId: string,
) {
  const { data } = await tenantAClient
    .from(table)
    .select('id')
    .eq('id', tenantBRecordId)
    .maybeSingle();

  expect(data).toBeNull(); // Tenant A cannot see Tenant B's data
}
```

---

## 4. MSW Mock Registry

All external API calls are intercepted by MSW in tests. No real external API calls in CI.

### 4.1 Mock Handlers

```typescript
// src/__mocks__/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Stripe
  http.post('https://api.stripe.com/v1/checkout/sessions', () => {
    return HttpResponse.json({
      id: 'cs_test_mock',
      url: 'https://checkout.stripe.com/test',
    });
  }),
  http.post('https://api.stripe.com/v1/billing_portal/sessions', () => {
    return HttpResponse.json({
      id: 'bps_test_mock',
      url: 'https://billing.stripe.com/test',
    });
  }),

  // Resend (email)
  http.post('https://api.resend.com/emails', () => {
    return HttpResponse.json({ id: 'email_test_mock' });
  }),

  // Nylas (calendar)
  http.get('https://api.us.nylas.com/v3/grants/:grantId/events', () => {
    return HttpResponse.json({ data: [] });
  }),
  http.post('https://api.us.nylas.com/v3/grants/:grantId/events', () => {
    return HttpResponse.json({
      data: { id: 'nylas_event_mock', status: 'confirmed' },
    });
  }),

  // Typesense (search)
  http.post('https://*.typesense.example.com/collections/:collection/documents/search', () => {
    return HttpResponse.json({
      hits: [],
      found: 0,
      page: 1,
    });
  }),
  http.post('https://*.typesense.example.com/collections/:collection/documents', () => {
    return HttpResponse.json({ id: 'ts_doc_mock' });
  }),

  // OpenAI (embeddings)
  http.post('https://api.openai.com/v1/embeddings', () => {
    return HttpResponse.json({
      data: [{ embedding: new Array(1536).fill(0.01), index: 0 }],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });
  }),

  // Merge.dev (ATS integration)
  http.get('https://api.merge.dev/api/ats/v1/candidates', () => {
    return HttpResponse.json({ results: [], next: null });
  }),

  // Dropbox Sign (e-sign)
  http.post('https://api.hellosign.com/v3/signature_request/send', () => {
    return HttpResponse.json({
      signature_request: {
        signature_request_id: 'sign_test_mock',
        signing_url: 'https://app.hellosign.com/sign/test',
      },
    });
  }),

  // Inngest (event send — no-op in tests)
  http.post('https://inn.gs/e/*', () => {
    return HttpResponse.json({ ids: ['evt_mock'] });
  }),

  // Slack (alerts)
  http.post('https://hooks.slack.com/services/*', () => {
    return HttpResponse.json({ ok: true });
  }),
];
```

### 4.2 MSW Setup

```typescript
// src/__tests__/setup.ts
import { setupServer } from 'msw/node';
import { handlers } from '../__mocks__/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

The `onUnhandledRequest: 'error'` setting ensures no test accidentally makes a real external API call.

### 4.3 Per-Test Handler Overrides

```typescript
// In a specific test file
import { server } from '../setup';
import { http, HttpResponse } from 'msw';

it('should handle Stripe webhook failure', async () => {
  server.use(
    http.post('https://api.stripe.com/v1/checkout/sessions', () => {
      return HttpResponse.json({ error: { message: 'Card declined' } }, { status: 402 });
    }),
  );
  // ... test that handles the error
});
```

---

## 5. Coverage Targets

### 5.1 Per-Module Coverage

| Module | Unit | Integration | E2E | Priority |
|--------|------|-------------|-----|----------|
| **Auth & RBAC** | 90% | 100% (all roles × all tables) | 5 scenarios | Day 1 |
| **RLS policies** | N/A | 100% (4 ops × every table × 2 tenants) | N/A | Day 1 |
| **Background jobs** | 80% | 100% (tenant context) | N/A | Day 1 |
| **State machines** (D06, D12) | 100% transitions | Edge cases | 3 scenarios | Per module |
| **API routes** | 80% | 100% (auth + status codes) | N/A | Per module |
| **Server Actions** | 80% | Auth + validation | N/A | Per module |
| **Search** (D10) | 80% | Sync + relevance | 2 scenarios | Per module |
| **Notifications** (D08) | 80% | Template + preferences | 1 scenario | Per module |
| **Billing** (D03) | 80% | Webhook handlers | 2 scenarios | Per module |
| **GDPR** (D13) | 90% | Erasure + export | 1 scenario | Per module |
| **Analytics/Dashboard** (D17) | 80% pure util functions (`calcTimeToHire`, `aggregateSourceQuality`, `findAtRiskJobs`, `generateDailyBriefing` cache paths) | MSW for OpenAI briefing call | 3 scenarios (E2E-16–18) | Per module |
| **Interviews/Scorecards** (D07) | 80% — scoring utility (`computeScorecardSummary`), AI prompt builder (`buildScorecardSummaryPrompt`), SA error paths (`createScorecardTemplate`, `deleteScorecardTemplate` guard) | 75 RLS tests (6 tables × 4 ops × 2 tenants). MSW for OpenAI summarization | 10 scenarios (settings-scorecards 4 + interviews 6) | Day 1 (P3-W1→W5) |
| **Notifications** (D08) | 80% — token renderer (`renderTemplate`, `escapeHtml`, `validateMergeFields`), SA CRUD (create/update/delete/preview email templates, preference upsert), Inngest handlers (dispatch routing, send-email rendering, interview reminder windows) | 32 RLS tests (2 tables × 4 ops × 2 tenants + role-specific guards) | 6 scenarios (settings-email-templates 4 + notifications 2) | Wave F |
| **Offers** (D06) | 80% — state machine (18 tests: all transitions + guards), AI (14 tests: comp suggest, letter draft, salary check), intent patterns (16 tests), SA CRUD (34 tests), Inngest handlers (15 tests: approval-notify, approval-advanced, check-expiry, withdraw, send-esign) | 44 RLS tests (3 tables × 4 ops × 2 tenants: offer_templates 15, offers 15, offer_approvals 14) | 2 planned scenarios (E2E-06, E2E-07) | Phase 4 |

### 5.2 Global Minimums (CI Gate)

| Metric | Minimum | Enforced By |
|--------|---------|-------------|
| Statement coverage | 80% | Vitest `thresholds` |
| Branch coverage | 75% | Vitest `thresholds` |
| Function coverage | 80% | Vitest `thresholds` |
| Line coverage | 80% | Vitest `thresholds` |
| RLS test pass rate | 100% | CI fails on any RLS failure |
| E2E critical path pass rate | 100% | CI fails on any E2E failure |

---

## 6. RLS Test Matrix

### 6.1 Test Generation Pattern

Every table gets 4 operations × 5 roles × 2 tenants = up to 40 test cases. Using a generator pattern:

```typescript
// src/__tests__/rls/rls-test-generator.ts
import { TENANT_A, TENANT_B } from '../../__fixtures__/golden-tenant';

interface RLSTestConfig {
  table: string;
  operations: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'>;
  roles: Record<string, { allowed: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[]; denied: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[] }>;
  sampleRecord: Record<string, unknown>;
}

export function generateRLSTests(config: RLSTestConfig) {
  describe(`RLS: ${config.table}`, () => {
    // Cross-tenant isolation (Tenant A cannot access Tenant B)
    describe('Tenant isolation', () => {
      for (const op of config.operations) {
        it(`Tenant A cannot ${op} Tenant B records`, async () => {
          // Test with Tenant A client against Tenant B data
        });
      }
    });

    // Role-based access
    describe('Role enforcement', () => {
      for (const [role, { allowed, denied }] of Object.entries(config.roles)) {
        for (const op of allowed) {
          it(`${role} CAN ${op}`, async () => { /* assert success */ });
        }
        for (const op of denied) {
          it(`${role} CANNOT ${op}`, async () => { /* assert empty/forbidden */ });
        }
      }
    });

    // Soft-delete invisibility
    it('Soft-deleted records are invisible to SELECT', async () => {
      // Insert record, soft-delete, verify SELECT returns empty
    });
  });
}
```

### 6.2 RLS Test Registry

| Table | SELECT | INSERT | UPDATE | DELETE | Total Cases |
|-------|--------|--------|--------|--------|-------------|
| organizations | all roles | owner | owner/admin | owner | 20 |
| user_profiles | all roles | (auto) | self | owner | 16 |
| organization_members | all roles | owner/admin | owner | owner | 20 |
| job_openings | all roles | owner/admin/recruiter | owner/admin/recruiter | owner/admin | 20 |
| candidates | all roles | owner/admin/recruiter | owner/admin/recruiter | owner/admin | 20 |
| applications | all roles | owner/admin/recruiter | owner/admin/recruiter | owner/admin | 20 |
| interviews | all roles | owner-recruiter-hm | owner-recruiter | owner/admin | 20 |
| scorecard_submissions | all roles | self only | self only | owner/admin | 20 |
| candidate_dei_data | owner/admin only | owner/admin | owner/admin | owner/admin | 12 |
| offer_templates | all roles | owner/admin/recruiter | owner/admin/recruiter | owner/admin | 15 (Migration 028, Phase 4) |
| offers | owner/admin/recruiter+hm | owner/admin/recruiter | owner/admin/recruiter | owner/admin | 15 (Migration 028, Phase 4) |
| offer_approvals | owner/admin/recruiter+hm | owner/admin/recruiter | approver (own) | owner/admin | 14 (Migration 028, Phase 4) |
| audit_logs | admin+ | trigger only | DENIED ALL | DENIED ALL | 10 |
| notes | all roles | all roles | author | owner/admin | 20 |
| org_daily_briefings | org members (SELECT only) | service role only | DENIED ALL | DENIED ALL | 8 (pre-migration spec — Migration 021) |
| ai_score_feedback | org members (own signal only) | org members (self-INSERT) | DENIED ALL | self/owner/admin | 16 (pre-migration spec — Migration 022, AI-Proof Wave A) |
| email_templates | all roles | owner/admin/recruiter | owner/admin/recruiter | owner/admin (non-system only) | 17 (Migration 027, Wave F) |
| notification_preferences | self + admin/owner | self only | self only | self only | 15 (Migration 027, Wave F) |
| **Total** | | | | | **~338 cases** (294 pre-P4 + 44 offers) |

---

## 7. E2E Scenario Registry

### 7.1 Critical Path Scenarios (Day 1)

| ID | Scenario | Steps | Module |
|----|----------|-------|--------|
| E2E-01 | **Signup → Onboarding → First Job** | Register → create org → onboarding wizard → create pipeline → post job | Auth, D19 |
| E2E-02 | **Login → Org Switch → Logout** | Login → view dashboard → switch org → verify data changes → logout → verify redirect | Auth, ADR-005 |
| E2E-03 | **Candidate Application** | Visit career page → search jobs → apply → upload resume → receive confirmation | D09 |
| E2E-04 | **Recruiter Daily Flow** | Login → view pipeline → move candidate → add note → schedule interview | D12, D07 |
| E2E-05 | **Expired Session Recovery** | Login → wait for token expiry → attempt action → silent refresh → action succeeds | Auth |

### 7.2 Module Scenarios (Built Per Feature)

| ID | Scenario | Steps | Module |
|----|----------|-------|--------|
| E2E-06 | **Full Hiring Flow** | Create job → receive application → screen → interview → scorecard → offer → signed | D06, D07, D12 |
| E2E-07 | **Offer Approval Chain** | Create offer → sequential approvers → approve/reject → candidate notification | D06 |
| E2E-08 | **Interview Scheduling** | Assign scorecard template → schedule interview → submit scorecard → view aggregated results | D07 |
| E2E-09 | **Candidate Self-Scheduling** | Receive scheduling link → select time slot → confirmation → calendar sync | D07, D09 |
| E2E-10 | **Bulk Operations** | Select multiple candidates → bulk move stage → verify all moved → notifications sent | D12 |
| E2E-11 | **GDPR Erasure** | Candidate requests deletion → 48h cooling period → erasure executes → data verified gone | D13 |
| E2E-12 | **CSV Import** | Upload CSV → preview → confirm → import processing → verify candidates created | D19 |
| E2E-13 | **Billing Upgrade** | Start on Starter → hit limit → upgrade to Growth → verify features unlocked | D03 |
| E2E-14 | **Notification Preferences** | Set preferences → trigger event → verify correct channel delivery | D08 |
| E2E-15 | **Search & AI Matching** | Create job with skills → run AI match → verify ranked results | D10 |
| E2E-16 | **Mine Mode Cookie Persistence** | Login → navigate to dashboard → click "My Jobs" toggle → reload page → assert "My Jobs" is still active (cookie persisted) | D17, R13 |
| E2E-17 | **At-Risk Jobs Empty State** | Seed org with recently-active jobs → navigate to dashboard → assert at-risk widget shows green empty state ("All open roles have active pipeline activity") | D17, R10 |
| E2E-18 | **Recent Apps Navigation** | Navigate to dashboard → click a recent application row → assert navigation to `/candidates/<id>` with stage and status visible | D17, R12 |
| E2E-19 | **Email Templates Settings** | Navigate to Settings > Email Templates → view seeded templates → navigate to editor → navigate to new template form | D08, Wave F |
| E2E-20 | **Notification Preferences** | Navigate to Settings > Notifications → verify event type list → verify channel dropdowns | D08, Wave F |

### 7.3 Failure Scenarios

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| E2E-F01 | Login with wrong password (5 attempts) | Rate limited, helpful error message |
| E2E-F02 | Access page without auth | Redirect to login, return to original page after auth |
| E2E-F03 | Submit form with invalid data | Inline validation errors, no data loss |
| E2E-F04 | Network error during form submit | Retry prompt, no duplicate submissions (idempotency) |
| E2E-F05 | Access another org's candidate by URL | 404 page (not 403) |

---

## 8. Test Database Strategy

### 8.1 Local Supabase

All integration tests run against Supabase local (`supabase start`). This provides:
- Real PostgreSQL with RLS policies
- Auth emulation (user creation, JWT generation)
- Storage emulation
- Realtime (for subscription tests)

### 8.2 Database Reset Strategy

```typescript
// Between test suites: full reset (slow, ~5s)
beforeAll(async () => {
  await exec('npx supabase db reset');
});

// Between tests: targeted cleanup (fast, <100ms)
afterEach(async () => {
  await admin.rpc('reset_test_data');
});
```

The `reset_test_data()` function:

```sql
CREATE OR REPLACE FUNCTION reset_test_data() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Delete transient test data (keep golden fixture data)
  DELETE FROM scorecard_ratings WHERE id NOT IN (SELECT id FROM golden_scorecard_ratings);
  DELETE FROM scorecard_submissions WHERE id NOT IN (SELECT id FROM golden_scorecard_submissions);
  DELETE FROM interviews WHERE id NOT IN (SELECT id FROM golden_interviews);
  DELETE FROM offers WHERE id NOT IN (SELECT id FROM golden_offers);
  DELETE FROM application_stage_history WHERE id NOT IN (SELECT id FROM golden_stage_history);
  DELETE FROM applications WHERE id NOT IN (
    '11111111-5001-0001-0001-000000000001',
    '11111111-5001-0001-0001-000000000002'
  );
  DELETE FROM notes WHERE created_at > NOW() - INTERVAL '1 second';
  -- Restore soft-deleted golden records
  UPDATE candidates SET deleted_at = NULL WHERE id LIKE '11111111-4001%' OR id LIKE '22222222-4001%';
  UPDATE job_openings SET deleted_at = NULL WHERE id LIKE '11111111-3001%';
  -- Truncate audit_logs (test-only, not in production)
  TRUNCATE audit_logs;
END;
$$;
```

### 8.3 CI Database

In CI (GitHub Actions), Supabase local runs in a service container:

```yaml
# In ci.yml (extends D15 §3.1)
test-integration:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: supabase/setup-cli@v1
    - run: supabase start
    - run: supabase db reset  # Apply migrations + seed
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: 'npm' }
    - run: npm ci
    - run: npm test -- --reporter=github-actions
      env:
        SUPABASE_URL: http://127.0.0.1:54321
        SUPABASE_ANON_KEY: ${{ steps.supabase.outputs.anon_key }}
        SUPABASE_SERVICE_ROLE_KEY: ${{ steps.supabase.outputs.service_role_key }}
```

---

## 9. Background Job Testing

### 9.1 Inngest Test Pattern

Inngest functions are tested by directly invoking the step functions, not through the Inngest event system:

```typescript
// src/__tests__/inngest/workflow-stage-changed.test.ts
import { workflowStageChanged } from '@/inngest/functions/workflow';

describe('workflow/stage-changed', () => {
  it('should execute auto-actions on stage transition', async () => {
    const event = {
      data: {
        organization_id: TENANT_A.org.id,
        application_id: TENANT_A.applications.aliceToEngineer.id,
        from_stage_id: TENANT_A.pipeline.stages.screening.id,
        to_stage_id: TENANT_A.pipeline.stages.interview.id,
      },
    };

    // Mock Inngest step runner
    const step = createMockStep();
    await workflowStageChanged.fn({ event, step });

    // Verify auto-actions executed
    expect(step.run).toHaveBeenCalledWith('execute-auto-actions', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('notify-stakeholders', expect.any(Function));
    expect(step.run).toHaveBeenCalledWith('sync-search', expect.any(Function));
  });

  it('should use SET LOCAL for tenant context', async () => {
    // Verify the service role client sets org context
    const querySpy = vi.spyOn(supabase, 'rpc');
    await workflowStageChanged.fn({ event, step: createMockStep() });

    expect(querySpy).toHaveBeenCalledWith('set_local_context', {
      org_id: TENANT_A.org.id,
    });
  });
});
```

### 9.2 Inngest Function Registry

Every Inngest function must have corresponding test coverage:

| Function ID | Test File | Cases |
|-------------|-----------|-------|
| `workflow/stage-changed` | `workflow-stage-changed.test.ts` | Auto-actions, notifications, search sync, tenant isolation |
| `workflow/application-withdrawn` | `workflow-withdrawn.test.ts` | Status update, offer voiding, notifications |
| `notification/dispatch` | `notification-dispatch.test.ts` | Channel routing, preferences, template rendering |
| `notification/webhook-deliver` | `webhook-deliver.test.ts` | Signing, retry, auto-disable |
| `interview/nylas-event-sync` | `nylas-sync.test.ts` | Calendar sync, conflict handling |
| `billing/stripe-webhook-*` | `stripe-webhooks.test.ts` | Subscription lifecycle, seat changes |
| `compliance/retention-cron` | `retention-cron.test.ts` | Candidate erasure, partition management |
| `migration/extract` | `migration-extract.test.ts` | Merge.dev pull, staging insert |
| `search/sync-candidate` | `search-sync.test.ts` | Typesense upsert, embedding generation |

---

## 10. State Machine Testing

### 10.1 Application Lifecycle (D12)

```typescript
describe('Application State Machine', () => {
  const validTransitions = [
    { from: 'applied', to: 'screening' },
    { from: 'screening', to: 'interview' },
    { from: 'interview', to: 'offer' },
    { from: 'offer', to: 'hired' },
    { from: 'any_active_stage', to: 'rejected' },
    { from: 'any_active_stage', to: 'withdrawn' },
  ];

  const invalidTransitions = [
    { from: 'rejected', to: 'screening', reason: 'Rejected is terminal' },
    { from: 'withdrawn', to: 'applied', reason: 'Withdrawn is terminal' },
    { from: 'hired', to: 'offer', reason: 'Hired is terminal' },
    { from: 'interview', to: 'applied', reason: 'Cannot move backward' },
  ];

  for (const { from, to } of validTransitions) {
    it(`allows ${from} → ${to}`, async () => {
      // Create application at 'from' stage, move to 'to', assert success
    });
  }

  for (const { from, to, reason } of invalidTransitions) {
    it(`blocks ${from} → ${to} (${reason})`, async () => {
      // Create application at 'from' stage, attempt move to 'to', assert error
    });
  }
});
```

### 10.2 Offer State Machine (D06)

```typescript
describe('Offer State Machine', () => {
  const validTransitions = [
    { from: 'draft', to: 'pending_approval' },
    { from: 'pending_approval', to: 'approved' },
    { from: 'approved', to: 'sent' },
    { from: 'sent', to: 'signed' },
    { from: 'sent', to: 'declined' },
    { from: 'draft', to: 'withdrawn' },
    { from: 'pending_approval', to: 'withdrawn' },
    { from: 'approved', to: 'withdrawn' },
    { from: 'sent', to: 'expired' },
  ];

  const invalidTransitions = [
    { from: 'signed', to: 'withdrawn', reason: 'Signed is terminal' },
    { from: 'declined', to: 'sent', reason: 'Declined is terminal' },
    { from: 'expired', to: 'sent', reason: 'Must create new offer' },
  ];

  // ... generate tests same pattern as application lifecycle
});
```

---

## 11. CI Parallelization

### 11.1 Job Matrix

```yaml
# Extended ci.yml
jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm run lint && npm run typecheck

  test-unit:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm test -- --shard=${{ matrix.shard }}/3 --reporter=github-actions

  test-rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start && supabase db reset
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm test -- --project=rls --reporter=github-actions

  test-e2e:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck]
    strategy:
      matrix:
        shard: [1, 2]
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start && supabase db reset
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e -- --shard=${{ matrix.shard }}/2
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-${{ matrix.shard }}
          path: playwright-report/

  coverage-report:
    runs-on: ubuntu-latest
    needs: [test-unit, test-rls]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm test -- --coverage --reporter=json-summary
      - name: Check coverage thresholds
        run: node scripts/check-coverage.js
```

### 11.2 Estimated CI Times

| Job | Duration | Parallelism |
|-----|----------|-------------|
| Lint + typecheck | ~30s | 1 runner |
| Unit tests (3 shards) | ~45s each | 3 runners |
| RLS integration | ~2 min | 1 runner (serial, needs DB) |
| E2E (2 shards) | ~3 min each | 2 runners |
| Coverage report | ~1 min | 1 runner |
| **Total wall time** | **~4 min** | 8 runners max |

---

## 12. Test File Conventions

### 12.1 Naming

```
src/
├── modules/
│   └── workflow/
│       ├── actions.ts                    ← Source code
│       ├── actions.test.ts               ← Unit tests (co-located)
│       └── __tests__/
│           └── workflow.integration.test.ts  ← Integration tests
├── __tests__/
│   ├── setup.ts                          ← Global test setup (MSW)
│   ├── helpers.ts                        ← Shared test utilities
│   ├── rls/                              ← RLS test suites
│   │   ├── rls-test-generator.ts
│   │   ├── candidates.rls.test.ts
│   │   ├── applications.rls.test.ts
│   │   └── ...
│   ├── inngest/                          ← Background job tests
│   │   ├── workflow-stage-changed.test.ts
│   │   ├── notification-dispatch.test.ts
│   │   └── ...
│   └── e2e/                              ← Playwright E2E tests
│       ├── auth.e2e.ts
│       ├── hiring-flow.e2e.ts
│       └── ...
├── __fixtures__/
│   └── golden-tenant.ts                  ← Deterministic seed data
└── __mocks__/
    └── handlers.ts                       ← MSW handlers
```

### 12.2 Naming Rules

| Pattern | Meaning |
|---------|---------|
| `*.test.ts` | Unit test (Vitest) |
| `*.integration.test.ts` | Integration test requiring Supabase local |
| `*.rls.test.ts` | RLS isolation test |
| `*.e2e.ts` | Playwright E2E test |

### 12.3 Test Writing Guidelines

1. **Arrange-Act-Assert:** Every test follows this pattern
2. **One assertion per test** for unit tests. Integration tests may have multiple related assertions.
3. **No test interdependence:** Each test must be runnable in isolation
4. **Use golden fixtures:** Never generate random data for deterministic tests
5. **Use Faker for volume tests only:** When testing with many records, use seeded Faker (`faker.seed(12345)`)
6. **Name tests as behaviors:** `it('should reject application when stage type is terminal')` not `it('test rejection')`
7. **Mock at the boundary:** Mock external APIs (MSW), not internal functions

---

*Created: 2026-03-11*
