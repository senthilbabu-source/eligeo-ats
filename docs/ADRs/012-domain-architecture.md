# ADR-012: Domain Architecture — Marketing + App Split

**Status:** Accepted
**Date:** 2026-03-11
**Decision Makers:** Senthil Kumar Babu, Claude (architect)

## Context

Eligeo needs both a public marketing presence (SEO, content, career portals) and an authenticated application (the ATS itself). These have fundamentally different requirements:

- **Marketing:** Static/ISR, heavy SEO, zero auth, fast LCP, content-driven, frequent copy updates
- **App:** Dynamic, Supabase Auth, interactive React, feature-driven, sprint-cycle deploys

Coupling them in one codebase creates deployment risk (marketing copy change can break app), performance overhead (app JS bundle on marketing pages), and team bottlenecks (content blocked by engineering).

## Decision

Split into separate projects on distinct subdomains:

| Domain | Purpose | Framework | Hosting |
|--------|---------|-----------|---------|
| `eligeo.io` | Marketing site (public) | Next.js (static/ISR) or Astro | Vercel (separate project) |
| `app.eligeo.io` | ATS application (auth) | Next.js 16 (current codebase) | Vercel |
| `api.eligeo.io` | Public REST API (v2.0, Pro+) | Next.js Route Handlers or standalone | Vercel |
| `docs.eligeo.io` | API documentation (v2.0) | Mintlify or Nextra | Vercel |

### Career portal bridge pattern

Career portals live on the marketing site for SEO but delegate writes to the app:

```
eligeo.io/careers/{org-slug}              → Marketing renders career portal (ISR)
    ↓ form submit
app.eligeo.io/api/public/apply            → App API handles application creation
    ↓ redirect
eligeo.io/careers/{org-slug}/thanks       → Marketing renders confirmation
```

### Marketing site pages

**Platform:** `/`, `/features`, `/features/ai-recruiting`, `/features/candidate-experience`, `/features/workflows`, `/pricing`, `/security`, `/integrations`

**Why Eligeo:** `/compare`, `/customers`, `/roi`

**Resources:** `/blog` (CMS-driven), `/docs` (v2.0), `/changelog`

**Company:** `/about` (includes brand story + logo narrative), `/careers/{org-slug}` (bridge), `/contact`, `/privacy`, `/terms`

**Candidate-facing:** `/careers/{org-slug}/{job-slug}`, `/application-status`

### CMS

Blog, case studies, and customer stories managed via headless CMS (Sanity or Contentful). Marketing team can publish without engineering involvement.

## Consequences

### Positive
- Independent deploy pipelines — marketing ships daily without app risk
- Optimal performance — marketing pages are static HTML, no app JS bundle
- SEO-first career portals — ISR pages indexed by Google, structured data, sitemaps
- Content team independence — CMS-driven blog/pages, no PR reviews for copy changes
- Clear security boundary — marketing has zero access to Supabase, auth, or user data

### Negative
- Two Vercel projects to manage (minimal overhead)
- Career portal bridge adds a cross-origin API call (mitigated by CORS config)
- Shared design tokens need a package or copied CSS (Tailwind config sync)
- `app.eligeo.io` requires subdomain DNS + Vercel domain config

### Neutral
- Current `eligeo.io` app deployment continues as-is until marketing site is built
- Migration path: when marketing site launches, current app moves to `app.eligeo.io`

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| **Single codebase, path-based** (`eligeo.io/app/*`) | Couples deploys, marketing change risks app breakage, shared bundle bloat |
| **`dashboard.eligeo.io`** | Verbose, less standard than `app.` for SaaS |
| **`hire.eligeo.io`** | Creative but confusing — not industry standard |
| **Separate domain** (`eligeo-app.io`) | Brand fragmentation, cookie/auth complexity |

## When to Execute

This is **not v1.0 launch-blocking**. The current single-project deployment works for beta.

**Trigger:** When any of these become true:
- Pre-launch landing page needed for marketing
- Blog/content strategy begins
- Custom career portals per org require full branding control
- Marketing team needs to publish independently

**Migration path:**
1. Build marketing site as new Vercel project on `eligeo.io`
2. Move current app to `app.eligeo.io` (Vercel domain alias)
3. Add public API route for career portal bridge (`/api/public/jobs`, `/api/public/apply`)
4. Configure CORS for `eligeo.io` → `app.eligeo.io` cross-origin calls
5. Update `NEXT_PUBLIC_APP_DOMAIN` env var
