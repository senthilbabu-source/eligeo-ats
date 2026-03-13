# Environment Variables

> **ID:** D28
> **Status:** Review
> **Priority:** P0
> **Last updated:** 2026-03-13
> **Depends on:** D01, D02, D03, D14, D15
> **Depended on by:** Infrastructure setup (Phase 0)
> **Architecture decisions assumed:** ADR-001, ADR-002

---

## Overview

Complete manifest of every environment variable the application requires. All secrets are managed via Vercel Environment Variables UI — never committed to the repository. A `.env.example` file (with empty values) is committed as a developer reference.

---

## Supabase (Database & Auth)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Browser-accessible Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Browser-safe anonymous key (RLS-scoped) | Yes |
| `SUPABASE_URL` | Secret | Server-side Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Bypasses ALL RLS — server-only, never expose to client | Yes |

**CI/CD only (GitHub Actions secrets):**

| Variable | Purpose |
|----------|---------|
| `SUPABASE_STAGING_PROJECT_REF` | Staging project ref for `supabase db push` |
| `SUPABASE_PROD_PROJECT_REF` | Production project ref for `supabase db push` |

---

## Stripe (Billing)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `STRIPE_SECRET_KEY` | Secret | Server-side Stripe API key | Yes |
| `STRIPE_WEBHOOK_SECRET` | Secret | Webhook signature verification (`whsec_...`) | Yes |

---

## Inngest (Background Jobs)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `INNGEST_EVENT_KEY` | Secret | Event publishing key | Yes |
| `INNGEST_SIGNING_KEY` | Secret | Request signature verification | Yes |

---

## Typesense (Search) — v2.0+

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `TYPESENSE_API_KEY` | Secret | Full-access admin API key | v2.0+ |
| `TYPESENSE_HOST` | Secret | Typesense Cloud host URL | v2.0+ |
| `NEXT_PUBLIC_TYPESENSE_HOST` | Public | Browser-accessible host for candidate portal search | v2.0+ |
| `TYPESENSE_SEARCH_ONLY_KEY` | Secret | Read-only scoped key for portal | v2.0+ |

---

## Resend (Email)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `RESEND_API_KEY` | Secret | Transactional email API key | Yes |

> **Dev fallback:** When `RESEND_API_KEY` is unset in local development, the send-email Inngest function uses a placeholder key to prevent module-level crashes. Emails will not be sent — Inngest logs the failure.

---

## Nylas (Calendar) — v2.0+

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `NYLAS_CLIENT_ID` | Secret | OAuth client ID | v2.0+ |
| `NYLAS_API_KEY` | Secret | API key for calendar sync | v2.0+ |

---

## Dropbox Sign (E-Signature) — v1.0 (P6-3+)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `DROPBOX_SIGN_API_KEY` | Secret | API key for Dropbox Sign envelope creation and cancellation | Yes |
| `DROPBOX_SIGN_WEBHOOK_SECRET` | Secret | HMAC-SHA256 webhook signature verification | Yes |
| `DROPBOX_SIGN_TEMPLATE_ID` | Secret | Default template ID for offer letter envelopes (optional — can be per-org) | No |

---

## OpenAI (AI Features) — v1.0 (Phase 2.6+)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `OPENAI_API_KEY` | Secret | API key for AI matching, resume parsing, embeddings, scorecard summaries, daily briefing, JD generation, bias check | Yes |

---

## Sentry (Error Tracking)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `SENTRY_DSN` | Secret | Server-side error reporting DSN | Yes |
| `NEXT_PUBLIC_SENTRY_DSN` | Public | Browser-side error reporting DSN | Yes |

**CI/CD only:**

| Variable | Purpose |
|----------|---------|
| `SENTRY_AUTH_TOKEN` | Release creation + source map upload |

---

## Upstash Redis (Caching)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `UPSTASH_REDIS_REST_URL` | Secret | Redis REST API endpoint | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Secret | Redis authentication token | Yes |

---

## Application (Custom)

| Variable | Visibility | Purpose | Required |
|----------|-----------|---------|----------|
| `CANDIDATE_TOKEN_SECRET` | Secret | JWT signing secret for candidate portal magic links. Rotate every 90 days. | Yes |
| `NEXT_PUBLIC_APP_DOMAIN` | Public | Primary app domain (`eligeo.io`) for validation | Yes |
| `LOG_LEVEL` | Secret | Pino log level: `fatal`/`error`/`warn`/`info`/`debug`/`trace`. Default: `info` | No |

---

## Vercel (Automatic)

Set automatically by the platform — do not configure manually.

| Variable | Purpose |
|----------|---------|
| `VERCEL_ENV` | `development` / `preview` / `production` |
| `VERCEL_GIT_COMMIT_SHA` | Current commit SHA for release tracking |
| `VERCEL_URL` | Deployment URL (preview environments) |

**CI/CD only:**

| Variable | Purpose |
|----------|---------|
| `VERCEL_TOKEN` | API token for deployment |
| `VERCEL_ORG_ID` | Organization ID |
| `VERCEL_PROJECT_ID` | Project ID |

---

## Summary

| Category | Count | v1.0 Required |
|----------|-------|---------------|
| Public (`NEXT_PUBLIC_`) | 5 | 3 (Supabase URL, anon key, Sentry DSN) |
| Server secrets | 18 | 13 (Supabase, Stripe, Inngest, Resend, Sentry, Redis, OpenAI, Dropbox Sign ×2, candidate token, app domain) |
| CI/CD only | 7 | 7 |
| Auto-set by platform | 3 | 3 |
| **Total** | **33** | **26** |

v2.0+ variables (Typesense, Nylas) are not required for v1.0 launch. OpenAI is v1.0 required per ADR-011. Dropbox Sign is v1.0 required for e-sign (P6-3).

---

## .env.example Template

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Resend
RESEND_API_KEY=

# Sentry
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# OpenAI (v1.0 required — ADR-011)
OPENAI_API_KEY=

# Dropbox Sign (v1.0 required — P6-3)
DROPBOX_SIGN_API_KEY=
DROPBOX_SIGN_WEBHOOK_SECRET=
DROPBOX_SIGN_TEMPLATE_ID=

# Application
CANDIDATE_TOKEN_SECRET=
NEXT_PUBLIC_APP_DOMAIN=eligeo.io
LOG_LEVEL=info

# v2.0+ (uncomment when needed)
# TYPESENSE_API_KEY=
# TYPESENSE_HOST=
# NEXT_PUBLIC_TYPESENSE_HOST=
# TYPESENSE_SEARCH_ONLY_KEY=
# NYLAS_CLIENT_ID=
# NYLAS_API_KEY=
```

---

## Security Rules

1. **Never commit `.env.local`** — only `.env.example` (empty values) goes in the repo.
2. **`SUPABASE_SERVICE_ROLE_KEY` is highest sensitivity** — bypasses all RLS. Server-only.
3. **Rotate `CANDIDATE_TOKEN_SECRET` every 90 days** — see D18 secret rotation runbook.
4. **Stripe keys are environment-specific** — test keys for dev/staging, live keys for production only.
5. **All secrets managed via Vercel Environment Variables UI** — scoped per environment (Development, Preview, Production).

---

*Created: 2026-03-11. Updated: 2026-03-13 — Added Dropbox Sign variables (P6-3): DROPBOX_SIGN_API_KEY, DROPBOX_SIGN_WEBHOOK_SECRET, DROPBOX_SIGN_TEMPLATE_ID. Total: 30→33 vars, v1.0 required: 24→26.*
