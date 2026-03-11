# CI/CD Pipeline

> **ID:** D15
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-10
> **Depends on:** D04 (ADRs — testing strategy ADR-004), D14 (Observability — deployment monitoring)
> **Depended on by:** D18 (Security Runbooks — rollback procedures)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-002 (Next.js 16), ADR-004 (3-tier testing)

---

## 1. Overview

CI/CD Pipeline defines the automated build, test, and deployment workflow for the ATS. This covers GitHub Actions workflows, database migration strategy, preview environments, rollback procedures, and release management. The system deploys to Vercel (application) with Supabase (database) and uses GitHub as the single source of truth.

**Scope:**
- In scope: GitHub Actions workflows, PR checks, database migrations, preview environments, production deployment, rollback procedures, dependency management, release tagging, environment management.
- Out of scope: Infrastructure provisioning (Supabase/Vercel managed), local development setup (README), monitoring (D14).

## 2. Environment Strategy

| Environment | Branch | URL | Database | Purpose |
|-------------|--------|-----|----------|---------|
| **Development** | Feature branches | Local (`localhost:3000`) | Local Supabase (`supabase start`) | Developer workstation |
| **Preview** | PR branches | `*.vercel.app` | Supabase preview branch | PR review, integration testing |
| **Staging** | `staging` | `staging.eligeo.io` | Supabase staging project | Pre-production validation |
| **Production** | `main` | `eligeo.io` | Supabase production project | Live system |

### 2.1 Environment Variables

```
# Managed via Vercel Environment Variables UI
# Never committed to repository

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CANDIDATE_TOKEN_SECRET=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
NYLAS_CLIENT_ID=
NYLAS_API_KEY=
TYPESENSE_API_KEY=
TYPESENSE_HOST=
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
OPENAI_API_KEY=
```

### 2.2 Secret Rotation

| Secret | Rotation Frequency | Procedure |
|--------|-------------------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | On compromise only | Regenerate in Supabase dashboard → update Vercel |
| `CANDIDATE_TOKEN_SECRET` | 90 days | Generate new → deploy → old tokens expire naturally |
| `STRIPE_WEBHOOK_SECRET` | On endpoint change | Recreate webhook in Stripe → update Vercel |
| `INNGEST_SIGNING_KEY` | On compromise only | Regenerate in Inngest dashboard → update Vercel |
| API keys (Nylas, Resend, etc.) | On compromise only | Regenerate in provider dashboard → update Vercel |

## 3. GitHub Actions Workflows

### 3.1 PR Check (`ci.yml`)

Runs on every pull request to `main` and `staging`.

```yaml
name: CI
on:
  pull_request:
    branches: [main, staging]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npm test -- --reporter=github-actions

  test-e2e:
    runs-on: ubuntu-latest
    needs: [lint]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'npm' }
      - run: npm ci
      - run: npx supabase start
      - run: npx supabase db reset
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  db-migration-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase db reset
      - run: supabase db lint
```

### 3.2 Deploy to Staging (`deploy-staging.yml`)

Triggered on push to `staging` branch.

```yaml
name: Deploy Staging
on:
  push:
    branches: [staging]

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.SUPABASE_STAGING_PROJECT_REF }}
      - run: supabase db push

  deploy:
    needs: [migrate]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--env staging'

  smoke-test:
    needs: [deploy]
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -f https://staging.eligeo.io/api/health || exit 1
          curl -f https://staging.eligeo.io/api/health/ready || exit 1
```

### 3.3 Deploy to Production (`deploy-production.yml`)

Triggered on push to `main` (after PR merge).

```yaml
name: Deploy Production
on:
  push:
    branches: [main]

jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: production  # Requires approval
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase link --project-ref ${{ secrets.SUPABASE_PROD_PROJECT_REF }}
      - run: supabase db push

  deploy:
    needs: [migrate]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'

  post-deploy:
    needs: [deploy]
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -f https://eligeo.io/api/health/ready || exit 1
      - name: Create Sentry release
        uses: getsentry/action-release@v1
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
          SENTRY_ORG: eligeo
          SENTRY_PROJECT: ats
        with:
          environment: production
          version: ${{ github.sha }}
```

### 3.4 Dependency Updates (`dependabot.yml`)

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 10
    groups:
      production:
        patterns: ['*']
        exclude-patterns: ['@types/*', 'eslint*', 'prettier*', 'vitest*', 'playwright*']
      dev:
        patterns: ['@types/*', 'eslint*', 'prettier*', 'vitest*', 'playwright*']
    labels: ['dependencies']
```

## 4. Database Migration Strategy

### 4.1 Migration Tool

Supabase CLI (`supabase migration`) for all schema changes. No raw SQL in application code.

```bash
# Create migration
supabase migration new add_candidate_tags_index

# Apply locally
supabase db reset  # Resets + applies all migrations

# Apply to staging/production
supabase db push   # Applies pending migrations
```

### 4.2 Migration Rules

| Rule | Rationale |
|------|-----------|
| One migration per PR | Easier to review and rollback |
| Backward-compatible only | Zero-downtime deploys — old code must work with new schema |
| No `DROP COLUMN` in single step | 1) Deploy code that stops using column 2) Migration drops column |
| Add columns as `NULL` or with `DEFAULT` | Avoids table locks on large tables |
| Index creation with `CONCURRENTLY` | Prevents table locks during index build |
| Test with `supabase db reset` in CI | Ensures migrations apply cleanly from scratch |

### 4.3 Breaking Change Protocol

For schema changes that aren't backward-compatible:

```
1. Migration A: Add new column/table (backward-compatible)
2. Deploy code that writes to both old + new
3. Migration B: Backfill data from old to new
4. Deploy code that reads from new only
5. Migration C: Drop old column/table (cleanup)
```

Each step is a separate PR with its own CI run.

### 4.4 Migration Rollback

Supabase does not support automatic rollback. For production issues:

1. **Schema rollback:** Create a new "reverse" migration that undoes the change
2. **Data rollback:** Supabase PITR (Point-in-Time Recovery) for data loss scenarios
3. **Application rollback:** Vercel instant rollback to previous deployment

## 5. Preview Environments

### 5.1 Vercel Preview Deployments

Every PR gets an automatic Vercel preview deployment. Preview environments use:
- **Database:** Supabase branching (if available) or shared staging database with isolated schema prefix
- **Services:** Shared staging instances of Inngest, Typesense, Redis
- **Secrets:** Preview environment variables in Vercel (non-production keys)

### 5.2 Preview Database Strategy

```
Option A (preferred): Supabase Branching
- Each PR gets an isolated database branch
- Migrations applied automatically
- Branch deleted when PR merges/closes

Option B (fallback): Shared staging DB
- All preview deployments share staging database
- Risk of migration conflicts between concurrent PRs
- Use `supabase db reset` before each PR's E2E tests
```

## 6. Release Management

### 6.1 Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`) for releases. Git tags on `main`.

```bash
# Tag a release
git tag -a v1.2.0 -m "Release 1.2.0: Interview self-scheduling"
git push origin v1.2.0
```

### 6.2 Release Checklist

```markdown
- [ ] All PR checks passing
- [ ] Staging smoke tests passing
- [ ] Database migrations reviewed (backward-compatible)
- [ ] Sentry release created with source maps
- [ ] CHANGELOG updated
- [ ] Feature flags set for gradual rollout (if applicable)
```

### 6.3 Feature Flags

Gradual feature rollout via `organizations.feature_flags` JSONB:

```typescript
// Check feature flag in Server Action
const org = await getOrganization(orgId);
if (!org.feature_flags?.new_kanban_board) {
  // Use old implementation
}
```

Feature flags are set per-organization in the database, not via a feature flag service. Controlled by admin via Settings → Feature Flags (Enterprise plan) or by support team directly.

## 7. Rollback Procedures

### 7.1 Application Rollback

```bash
# Vercel instant rollback (< 30 seconds)
vercel rollback --target production

# Or via Vercel dashboard: Deployments → select previous → Promote to Production
```

### 7.2 Database Rollback

| Scenario | Action | RTO |
|----------|--------|-----|
| Bad migration (no data loss) | Deploy reverse migration | 5-10 min |
| Bad migration (data corruption) | Supabase PITR restore | 30-60 min |
| Accidental data deletion | Supabase PITR to pre-delete point | 30-60 min |

### 7.3 Rollback Decision Matrix

| Symptom | First Action | Escalation |
|---------|-------------|------------|
| 5xx error spike post-deploy | Vercel rollback | Investigate logs |
| Database errors post-migration | Reverse migration PR | PITR if data affected |
| Inngest functions failing | Pause affected function | Fix + redeploy |
| Third-party service down | Feature flag disable | Wait for recovery |

## 8. Security in CI/CD

- **Secrets:** Never in code. Managed via Vercel Environment Variables + GitHub Secrets.
- **Dependency scanning:** Dependabot for updates. `npm audit` in CI pipeline.
- **Branch protection:** `main` requires: PR approval, CI passing, no force push.
- **Environment approvals:** Production deploys require manual approval via GitHub Environments.
- **Source maps:** Uploaded to Sentry only (not served publicly).
- **Docker:** No Docker in the pipeline — Vercel builds natively. Supabase CLI uses Docker locally only.
