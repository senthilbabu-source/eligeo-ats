# Security Threat Model

> **ID:** D22
> **Status:** Review
> **Priority:** P1
> **Last updated:** 2026-03-11
> **Depends on:** D01 (schema — RLS, audit, encryption), D02 (API — auth, rate limiting, error format), D13 (Compliance — GDPR, SOC 2, data retention)
> **Depended on by:** D18 (Security Runbooks — incident types reference this model)
> **Last validated against deps:** 2026-03-11
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-005 (multi-org), ADR-006 (soft delete), ADR-007 (audit), ADR-010 (GDPR erasure)

---

## 1. Overview

This document defines the security threat model for the itecbrains ATS. It identifies attack surfaces, applies STRIDE analysis to each component, maps attack vectors to existing controls, diagrams PII data flows, and specifies a penetration test plan. The goal is to validate that our architecture addresses enterprise-grade security requirements before writing any code.

**Scope:**
- In scope: Application-level threats, authentication/authorization, data protection, API security, third-party integrations, supply chain, insider threats.
- Out of scope: Infrastructure-level threats managed by providers (Vercel edge network, Supabase platform hardening, AWS physical security). These are covered by provider SOC 2 reports.

**Trust boundaries:**
1. Public internet → Application edge (Vercel/proxy.ts)
2. Application edge → Supabase database (RLS boundary)
3. Application → Third-party services (Stripe, Nylas, Resend, Merge.dev, OpenAI, Typesense)
4. Candidate portal → Internal application (separate auth domain)
5. Inngest → Application (background job boundary)

---

## 2. Attack Surface Inventory

### 2.1 External Attack Surfaces

| Surface | Exposure | Auth | Protocol |
|---------|----------|------|----------|
| REST API (`/api/v1/*`) | Public (authenticated) | JWT or API key | HTTPS |
| Career page (`/{org-slug}/careers`) | Public (unauthenticated) | None | HTTPS |
| Candidate portal | Public (token-authenticated) | HMAC-signed magic link | HTTPS |
| Webhook receivers (`/api/webhooks/*`) | Public (signature-verified) | HMAC-SHA256 per provider | HTTPS |
| Health endpoints (`/api/health*`) | Public | None (shallow), JWT (admin status) | HTTPS |
| OpenAPI spec (`/api/v1/openapi.json`) | Public | None | HTTPS |

### 2.2 Internal Attack Surfaces

| Surface | Exposure | Auth | Protocol |
|---------|----------|------|----------|
| Server Actions | Internal (Next.js) | JWT (session cookie) | N/A (server-side) |
| Inngest webhook receiver (`/api/inngest`) | Inngest platform only | Inngest signing key | HTTPS |
| Supabase Realtime channels | Authenticated users | JWT (RLS-scoped) | WSS |
| Supabase Storage | Authenticated users | JWT + storage policies | HTTPS |
| Admin routes (`/admin/*`) | Internal (owner/admin) | JWT + role check | HTTPS |

### 2.3 Data Stores

| Store | Data Classification | Encryption at Rest | Encryption in Transit |
|-------|-------------------|-------------------|---------------------|
| Supabase PostgreSQL | PII, business data | AES-256 (Supabase-managed) | TLS 1.2+ |
| Supabase Storage | Files (resumes, attachments) | AES-256 (Supabase-managed) | TLS 1.2+ |
| Upstash Redis | Rate limits, cache, idempotency keys | AES-256 (Upstash-managed) | TLS 1.2+ |
| Typesense | Search indexes (partial PII) | Disk encryption | TLS 1.2+ |
| Vercel Edge Config | Feature flags, config | Vercel-managed | TLS 1.2+ |

---

## 3. STRIDE Threat Analysis

### 3.1 Spoofing (Identity)

| ID | Threat | Target | Likelihood | Impact | Control | Doc Ref |
|----|--------|--------|-----------|--------|---------|---------|
| S-01 | Stolen JWT used to impersonate user | REST API, Server Actions | Medium | High | Short-lived JWTs (1h), refresh token rotation, session invalidation on password change | D02 §2.1 |
| S-02 | Forged API key | REST API | Low | High | SHA-256 hashed storage, never stored plaintext, prefix-based identification (`ats_live_`) | D02 §2.2 |
| S-03 | Forged candidate magic link | Candidate portal | Medium | Medium | HMAC-SHA256 signed tokens with expiry, scoped to specific candidate + org + action | D09 §3 |
| S-04 | Spoofed webhook delivery | Webhook receivers | Medium | High | Per-provider HMAC-SHA256 signature verification, timestamp validation (reject > 5 min drift) | D02 §10 |
| S-05 | Session fixation after org switch | Multi-org users | Low | High | JWT refresh on org switch (ADR-005), `last_active_org_id` updated server-side | ADR-005 |
| S-06 | OAuth token theft (Merge.dev, Nylas) | Third-party integrations | Low | Medium | Tokens stored encrypted, revoked after migration completes (Merge.dev), scoped to minimum permissions | D19 §9 |

### 3.2 Tampering (Data Integrity)

| ID | Threat | Target | Likelihood | Impact | Control | Doc Ref |
|----|--------|--------|-----------|--------|---------|---------|
| T-01 | Direct database manipulation bypassing RLS | All tenant data | Very Low | Critical | RLS enabled on ALL tables, `anon` and `authenticated` roles never bypass RLS, service role restricted to Inngest functions | ADR-001 |
| T-02 | Modification of audit logs | Audit trail integrity | Very Low | Critical | `UPDATE` and `DELETE` RLS policies set to `USING (FALSE)`, append-only, SECURITY DEFINER trigger function | ADR-007 |
| T-03 | Tampering with scorecard submissions after deadline | Interview integrity | Low | Medium | `submitted_at` set server-side, blind review prevents seeing others' scores until own submission | D07 §4 |
| T-04 | Modification of offer after candidate signature | Legal document integrity | Low | High | Offer state machine: `signed` state is terminal, no transitions back, Dropbox Sign provides independent audit trail | D06 §3 |
| T-05 | CSV injection via imported data | Admin spreadsheet exports | Medium | Medium | All CSV cell values starting with `=`, `+`, `-`, `@` are prefixed with single quote | D19 §9 |
| T-06 | JSONB field manipulation | Custom fields, metadata | Low | Medium | Zod schema validation on all API inputs, JSONB types defined in `lib/types/ground-truth.ts` | D02 §11 |

### 3.3 Repudiation (Deniability)

| ID | Threat | Target | Likelihood | Impact | Control | Doc Ref |
|----|--------|--------|-----------|--------|---------|---------|
| R-01 | User denies performing destructive action | Any mutation | Medium | Medium | Trigger-based audit logging on every table, `performed_by` set from `auth.uid()` (unforgeable) | ADR-007 |
| R-02 | Admin denies GDPR erasure execution | Compliance | Low | High | `gdpr_erasure_log` is append-only (no soft delete), records erasure performer, timestamp, and scope | ADR-010 |
| R-03 | Candidate denies giving consent | Application processing | Medium | High | Consent record stored with IP, timestamp, exact text shown, policy version — immutable in `applications.metadata` | D13 §5 |
| R-04 | Webhook delivery disputed | Integration reliability | Low | Medium | `X-Webhook-Id` per delivery, delivery status tracked, retry history logged | D02 §9 |

### 3.4 Information Disclosure

| ID | Threat | Target | Likelihood | Impact | Control | Doc Ref |
|----|--------|--------|-----------|--------|---------|---------|
| I-01 | Cross-tenant data leakage via API | All tenant data | Medium | Critical | RLS on every table, `organization_id` derived server-side (never from client), return `404` not `403` for cross-tenant | D02 §3 |
| I-02 | PII in application logs | Candidate data | Medium | High | Pino `redact` configuration strips emails, phones, tokens, passwords, API keys | D14 §2.5 |
| I-03 | PII in error tracking (Sentry) | Candidate data | Medium | High | Session replay disabled, `beforeSend` scrubs breadcrumbs, user context = ID only (no email) | D14 §3.3 |
| I-04 | DEI data exposed to hiring team | Candidate demographics | Low | Critical | RLS restricts `candidate_dei_data` to owner/admin only, aggregated reports enforce minimum cohort size of 5 | D13 §6 |
| I-05 | Scorecard answers visible before own submission | Interview bias | Medium | Medium | Blind review: other submissions hidden until current user submits, auto-reveal after own submission | D07 §4 |
| I-06 | Enumeration of valid email addresses | Candidate database | Medium | Low | Login/signup endpoints return identical responses for existing and non-existing accounts | D02 §7 |
| I-07 | API key exposed in client-side code | Organization API access | Low | High | API keys are server-side only (`X-API-Key` header), never embedded in frontend bundles | D02 §2.2 |
| I-08 | Typesense search exposes cross-tenant data | Search results | Low | Critical | Scoped API keys with `filter_by: organization_id` baked in, career page uses separate read-only key | D10, D09 §8 |
| I-09 | DSAR export file accessible by unauthorized party | Candidate PII bundle | Low | Critical | Private Supabase Storage bucket, signed URLs expire after 7 days, auto-deleted after 30 days | D13 §13 |

### 3.5 Denial of Service

| ID | Threat | Target | Likelihood | Impact | Control | Doc Ref |
|----|--------|--------|-----------|--------|---------|---------|
| DoS-01 | API request flooding | REST API | High | High | Per-plan rate limiting via Upstash Redis in `proxy.ts`, per-org and per-IP limits | D02 §6 |
| DoS-02 | AI endpoint abuse (expensive operations) | AI matching, embeddings | High | High | Daily burst cap (100-10K/day by plan) + monthly credit quota, `402` when exhausted | D02 §6, D03 §2 |
| DoS-03 | Large file upload exhaustion | Supabase Storage | Medium | Medium | Max file size enforced (10MB resumes, 5MB CSV), MIME type validation | D09, D19 §9 |
| DoS-04 | Webhook delivery retry storm | Outbound webhooks | Low | Medium | Exponential backoff (30s → 2h), auto-disable after 10 consecutive failures | D02 §9 |
| DoS-05 | Realtime connection flooding | Supabase Realtime | Medium | Medium | Connection limit per organization, channel authorization via RLS | D11 |
| DoS-06 | Bulk operation abuse | Application stage moves | Medium | Medium | Bulk operations capped at 50 items per request | D12 §6 |
| DoS-07 | CSV import with max-size file | Import processing | Low | Low | 10K row limit, one active import per org, async processing via Inngest | D19 §4 |
| DoS-08 | Career page scraping | Public job listings | High | Low | Typesense scoped keys with rate limiting, ISR caching reduces origin load | D09, D16 |

### 3.6 Elevation of Privilege

| ID | Threat | Target | Likelihood | Impact | Control | Doc Ref |
|----|--------|--------|-----------|--------|---------|---------|
| EoP-01 | Member escalates own role to admin/owner | RBAC bypass | Medium | Critical | Role changes require `owner` role, enforced by RLS `UPDATE` policy on `organization_members` | D01 §cluster 1 |
| EoP-02 | Hiring manager accesses admin features | Feature access | Low | Medium | Two-layer enforcement: RLS (database) + `can(role, permission)` helper (application) | D02 §3 |
| EoP-03 | API key with escalated permissions | Cross-scope access | Low | High | API key permissions stored in `api_keys.permissions`, checked on every request, scoped to org | D02 §2.2 |
| EoP-04 | Candidate accesses internal application data | Tenant data | Medium | High | Candidate auth is completely separate (stateless HMAC tokens), no Supabase Auth session, no RLS-authenticated access | D09 §3 |
| EoP-05 | Interviewer modifies other user's scorecard | Interview integrity | Low | Medium | `scorecard_submissions` INSERT policy requires `submitted_by = auth.uid()`, UPDATE only allowed on own submissions | D01 §cluster 5 |
| EoP-06 | Service role key leaked | Full database access | Very Low | Critical | Service role used only in Inngest functions (server-side), never in client code, key rotation runbook (R-04) | ADR-001, D18 §6 |

---

## 4. PII Data Flow Diagram

### 4.1 Data Classification

| Classification | Description | Examples | Storage Requirements |
|---------------|-------------|----------|---------------------|
| **Restricted** | Highly sensitive PII, legal liability | DEI data, encryption keys, GDPR erasure records | Isolated tables, role-restricted RLS, crypto-shredding on erasure |
| **Confidential** | Standard PII, business-critical | Candidate email/phone, resume content, scorecard evaluations, offer compensation | Encrypted at rest, RLS-scoped, audit-logged, retention-enforced |
| **Internal** | Business data, non-PII | Job descriptions, pipeline templates, org settings, API keys (hashed) | RLS-scoped, audit-logged |
| **Public** | Intentionally exposed | Published job listings, career page branding | No restrictions on read, org-scoped write |

### 4.2 PII Flow: Candidate Lifecycle

```
                                    TRUST BOUNDARY: Public Internet
                                    ================================
                                              │
                           ┌──────────────────┼──────────────────┐
                           │                  │                  │
                    Career Page          Apply Form         Magic Link
                    (public)            (candidate)        (candidate)
                           │                  │                  │
                           ▼                  ▼                  ▼
                    ┌─────────────────────────────────────────────────┐
                    │            TRUST BOUNDARY: proxy.ts              │
                    │         (TLS termination, rate limiting)         │
                    └─────────────────────────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
              Typesense Query          Server Action              API Route
              (scoped key)           (JWT session)              (API key)
                    │                         │                         │
                    ▼                         ▼                         ▼
             ┌─────────────┐    ┌───────────────────────┐    ┌────────────────┐
             │  Typesense  │    │   TRUST BOUNDARY:     │    │   Supabase     │
             │  (partial   │    │   Supabase RLS        │    │   Storage      │
             │   PII in    │    │                       │    │   (resumes,    │
             │   search    │    │  ┌─────────────────┐  │    │    files)      │
             │   index)    │    │  │   candidates    │  │    └────────────────┘
             └─────────────┘    │  │   applications  │  │              │
                    │           │  │   interviews    │  │    ┌────────────────┐
                    │           │  │   scorecards    │  │    │   Resend       │
               Sync via        │  │   offers        │  │    │   (email       │
               Inngest         │  │   notes         │  │    │    delivery)   │
                    │           │  │   dei_data ◄────┼──┼─── RESTRICTED      │
                    └──────────►│  │   files (meta)  │  │    └────────────────┘
                                │  └─────────────────┘  │              │
                                │           │           │    ┌────────────────┐
                                │           ▼           │    │   OpenAI       │
                                │  ┌─────────────────┐  │    │   (embeddings  │
                                │  │  audit_logs     │  │    │    — no PII    │
                                │  │  (append-only)  │  │    │    in prompts) │
                                │  └─────────────────┘  │    └────────────────┘
                                └───────────────────────┘
```

### 4.3 PII at Each Stage

| Stage | PII Present | Where Stored | Protection |
|-------|-------------|--------------|------------|
| Application submission | Name, email, phone, resume | `candidates`, `applications`, Supabase Storage | RLS, encrypted at rest |
| Search indexing | Name, email, skills, title | Typesense | Scoped API keys, org-isolated collections |
| AI matching | Skills, experience (extracted) | `candidates.embedding` (vector), Supabase | No raw PII sent to OpenAI — only structured skills text |
| Interview scheduling | Name, email (for calendar) | `interviews`, Nylas (external) | Nylas grant scoped to org, TLS |
| Email notifications | Name, email, portal links | Resend (transient), email_templates | PII in transit only, not stored by Resend beyond delivery |
| Scorecard evaluation | Interviewer feedback on candidate | `scorecard_submissions`, `scorecard_ratings` | RLS, blind review, org-scoped |
| Offer generation | Name, compensation, equity | `offers` | RLS, owner/admin/recruiter access only |
| DEI collection | Gender, ethnicity, veteran, disability | `candidate_dei_data.data` (JSONB) | Restricted RLS (owner/admin only), aggregation-only API, cohort suppression |
| GDPR export | All candidate data consolidated | Supabase Storage (temporary) | Signed URL (7-day expiry), auto-delete (30 days), private bucket |
| GDPR erasure | Encryption key destroyed | `candidate_encryption_keys` deleted, `candidates` anonymized | Crypto-shredding (ADR-010), irreversible by design |

### 4.4 PII in Third-Party Services

| Service | PII Received | Retention | DPA Required | Control |
|---------|-------------|-----------|-------------|---------|
| Supabase | All database PII | Duration of service | Yes | Platform SOC 2, encryption at rest/transit |
| Typesense | Name, email, skills, title | Duration of service | Yes (if EU data) | Scoped keys, org-isolated, TLS |
| Resend | Email address, name | Transient (delivery only) | Yes | No long-term storage of email content |
| Nylas | Email, calendar events | Duration of grant | Yes | Grant revocation, scoped permissions |
| Stripe | Billing email, org name | Duration of subscription | Yes (Stripe DPA) | No candidate PII sent to Stripe |
| OpenAI | Skills text for embeddings | Per API TOS (no training) | Yes | No raw PII — structured skills only, no names/emails |
| Merge.dev | Candidate data (migration) | Transient (sync duration) | Yes | OAuth token revoked after migration, data purged |
| Dropbox Sign | Candidate name, offer letter | Duration of document | Yes | E-sign audit trail, document retention per Dropbox Sign policy |
| Vercel | Request logs (IP, user-agent) | 30 days (Vercel log retention) | Yes (Vercel DPA) | No PII in application logs (Pino redaction) |

---

## 5. Attack Vector → Control Mapping

### 5.1 Authentication Attacks

| Attack | Vector | Existing Control | Gap? |
|--------|--------|-----------------|------|
| Credential stuffing | Login endpoint | Supabase Auth rate limiting + proxy.ts rate limiting | No |
| Brute force API key | API endpoints | SHA-256 hashing (timing-safe comparison), rate limiting per IP | No |
| Session hijacking | Stolen cookie | `httpOnly`, `secure`, `sameSite=lax` cookies, short-lived JWT (1h) | No |
| Magic link replay | Candidate portal | HMAC includes expiry timestamp, single-use nonce (if implemented) | Minor: verify single-use enforcement |
| OAuth token theft | Nylas/Merge.dev | Encrypted storage, minimum scopes, revocation on completion | No |

### 5.2 Authorization Attacks

| Attack | Vector | Existing Control | Gap? |
|--------|--------|-----------------|------|
| IDOR (direct object reference) | API resource IDs | RLS scopes ALL queries to `organization_id`, UUIDs are non-sequential | No |
| Role escalation (self-promote) | PATCH organization_members | RLS UPDATE policy requires `owner` role, `role` field change restricted | No |
| Cross-org data access (multi-org) | Org switch exploit | `current_user_org_id()` derived from JWT, refreshed on switch (ADR-005) | No |
| Privilege escalation via API key | Forged permissions | `api_keys.permissions` checked server-side, key creation requires owner role | No |
| Candidate accessing internal routes | URL guessing | Candidate auth is stateless HMAC tokens — completely separate from internal Supabase Auth | No |

### 5.3 Injection Attacks

| Attack | Vector | Existing Control | Gap? |
|--------|--------|-----------------|------|
| SQL injection | API inputs | Supabase client uses parameterized queries (PostgREST), no raw SQL from user input | No |
| XSS (stored) | Notes, custom fields, job descriptions | React escapes output by default, Zod validation on input, CSP headers | No |
| XSS (reflected) | Search queries, URL params | Server-side rendering, no `dangerouslySetInnerHTML` without sanitization | No |
| CSV injection | Imported CSV data | Cell values starting with `=+\-@` are prefixed with single quote | No |
| SSRF | Webhook URL validation | Outbound webhooks: URL allowlisting (HTTPS only), no internal network access from Vercel | No |
| Command injection | File processing | No shell commands executed on user input, file processing via libraries only | No |
| Template injection | Email templates (Handlebars) | Handlebars auto-escapes HTML, no raw helper exposed, variables are data-only | No |

### 5.4 Data Exposure Attacks

| Attack | Vector | Existing Control | Gap? |
|--------|--------|-----------------|------|
| Mass data exfiltration | API list endpoints | Cursor pagination (max 100/page), rate limiting, audit logging on bulk access | No |
| Resume harvesting | Storage URLs | Signed URLs with expiry, private buckets, no public listing | No |
| Search result scraping | Typesense API | Scoped API keys with org filter baked in, rate limiting | No |
| Error message data leak | API error responses | RFC 9457 format, no stack traces in production, generic messages for auth failures | No |
| Timing attack on user existence | Login/signup | Identical response time and format for existing/non-existing accounts | No |

### 5.5 Supply Chain Attacks

| Attack | Vector | Existing Control | Gap? |
|--------|--------|-----------------|------|
| Compromised npm package | Dependencies | Dependabot alerts, `npm audit` in CI, lockfile integrity | No |
| Compromised GitHub Action | CI/CD pipeline | Pin actions to SHA, not tags, Snyk scanning | No |
| Malicious Inngest function injection | Background jobs | Inngest signing key verification, functions defined in codebase (not external) | No |
| Compromised webhook payload | Inbound webhooks | Per-provider HMAC verification, immediate event emission (no inline execution) | No |

---

## 6. Security Controls Summary

### 6.1 Defense-in-Depth Layers

```
Layer 1: Network          Vercel Edge Network (DDoS protection, TLS termination)
                          ↓
Layer 2: Edge             proxy.ts middleware (rate limiting, auth verification, request ID)
                          ↓
Layer 3: Application      Zod validation, RBAC checks, Sentry error tracking
                          ↓
Layer 4: Database          PostgreSQL RLS (every table, all 4 operations)
                          ↓
Layer 5: Data             Encryption at rest (AES-256), crypto-shredding (ADR-010)
                          ↓
Layer 6: Audit            Trigger-based append-only audit logs (ADR-007)
                          ↓
Layer 7: Compliance       Retention enforcement, DSAR automation, consent tracking
```

### 6.2 Control Matrix by STRIDE Category

| STRIDE | Primary Controls | Secondary Controls |
|--------|-----------------|-------------------|
| **Spoofing** | JWT + API key auth, HMAC webhook verification | Rate limiting, session rotation, magic link expiry |
| **Tampering** | RLS on all tables, Zod input validation | Audit triggers, append-only logs, state machine enforcement |
| **Repudiation** | Trigger-based audit logs, `performed_by = auth.uid()` | Consent records with IP/timestamp, GDPR erasure log |
| **Information Disclosure** | RLS tenant isolation, PII redaction in logs | Sentry PII scrubbing, scoped search keys, signed Storage URLs |
| **Denial of Service** | Multi-tier rate limiting, bulk operation caps | ISR caching, Inngest concurrency limits, import size limits |
| **Elevation of Privilege** | RLS role enforcement, separate candidate auth | Two-layer RBAC (DB + app), API key permission scoping |

---

## 7. Identified Gaps & Mitigations

Gaps identified during threat analysis that need attention during implementation.

| ID | Gap | Severity | Mitigation | When |
|----|-----|----------|-----------|------|
| GAP-01 | Magic link single-use enforcement not explicitly specified | Low | Store used token hashes in Redis with TTL matching token expiry. Reject replayed tokens. | D09 implementation |
| GAP-02 | CSP (Content Security Policy) headers not documented | Medium | Add strict CSP in `proxy.ts`: `default-src 'self'`, allow Supabase/Sentry/Vercel domains. Document in D15. | Infrastructure setup |
| GAP-03 | CORS policy not explicitly specified | Medium | Restrict `Access-Control-Allow-Origin` to app domain only. API key routes: no CORS (server-to-server). | Infrastructure setup |
| GAP-04 | Webhook URL validation (SSRF prevention) | Low | Validate outbound webhook URLs: HTTPS only, no private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1). | D08 implementation |
| GAP-05 | API key rate limiting per-key vs per-org | Low | Currently per-org. Consider adding per-key limits for orgs with multiple API keys. | Post-MVP |
| GAP-06 | Supabase service role key rotation procedure not automated | Medium | Manual runbook exists (R-04). Automate with Supabase CLI + Vercel API for zero-downtime rotation. | Post-MVP |
| GAP-07 | No WAF (Web Application Firewall) | Low | Vercel Edge Network provides basic protection. Evaluate Cloudflare or Vercel Firewall for enterprise tier. | Post-MVP |

---

## 8. Penetration Test Plan

### 8.1 Test Scope

| Category | Targets | Methodology |
|----------|---------|-------------|
| **Authentication** | Login, signup, magic links, API keys, org switching | OWASP Testing Guide v4.2 — Authentication |
| **Authorization** | RLS boundary testing, role escalation, cross-tenant access | OWASP — Authorization, IDOR testing |
| **Input validation** | API endpoints, CSV import, custom fields, search queries | OWASP — Input Validation, injection testing |
| **Business logic** | State machine transitions, offer approval bypass, bulk operations | Custom test cases from D06, D07, D12 |
| **Data protection** | PII in logs/errors, storage URL guessing, search result leakage | OWASP — Data Protection, information disclosure |
| **API security** | Rate limit bypass, pagination abuse, idempotency manipulation | OWASP API Security Top 10 |

### 8.2 Test Cases

#### Authentication (AUTH)

| ID | Test | Expected Result |
|----|------|----------------|
| AUTH-01 | Send request with expired JWT | `401 Unauthorized` |
| AUTH-02 | Send request with JWT from different org than target resource | `404 Not Found` (not 403) |
| AUTH-03 | Replay used magic link token | `401` (token already consumed) |
| AUTH-04 | Brute force API key (1000 requests with random keys) | Rate limited after threshold |
| AUTH-05 | Use API key from org A to access org B resources | `404 Not Found` |
| AUTH-06 | Access internal routes with candidate magic link token | `401` (separate auth domain) |
| AUTH-07 | Login with valid email, wrong password (10 attempts) | Account lockout or increasing delays |
| AUTH-08 | Switch org and immediately access previous org's data | `404` (JWT refreshed, old org no longer in claims) |

#### Authorization (AUTHZ)

| ID | Test | Expected Result |
|----|------|----------------|
| AUTHZ-01 | Hiring manager attempts to create/delete org member | `403 Forbidden` |
| AUTHZ-02 | Interviewer attempts to view all candidates (not assigned) | Only assigned candidates returned (RLS) |
| AUTHZ-03 | API request with `organization_id` in body different from JWT claims | `organization_id` ignored, server-derived value used |
| AUTHZ-04 | Member promotes self to owner via PATCH organization_members | `403` (RLS UPDATE policy requires owner) |
| AUTHZ-05 | Access `candidate_dei_data` as recruiter | Empty result set (RLS restricts to owner/admin) |
| AUTHZ-06 | Modify another user's scorecard submission | `403` or `404` (RLS: `submitted_by = auth.uid()`) |
| AUTHZ-07 | Delete audit log record via API | `403` (DELETE policy = `USING (FALSE)`) |
| AUTHZ-08 | Access admin system status endpoint as non-admin | `403 Forbidden` |

#### Injection (INJ)

| ID | Test | Expected Result |
|----|------|----------------|
| INJ-01 | SQL injection in search query parameter | Parameterized query, no injection |
| INJ-02 | XSS payload in candidate name (`<script>alert(1)</script>`) | Stored escaped, rendered escaped |
| INJ-03 | XSS payload in note content with markdown | Markdown rendered safely (no raw HTML) |
| INJ-04 | CSV with formula injection (`=CMD('calc')`) in name field | Cell prefixed with single quote on export |
| INJ-05 | SSTI in email template variable (`{{constructor.constructor('return this')()}}`) | Handlebars safe mode, no prototype access |
| INJ-06 | Path traversal in file upload name (`../../etc/passwd`) | Filename sanitized, stored with UUID path |
| INJ-07 | JSON injection in JSONB custom field value | Zod schema validation rejects malformed input |

#### Business Logic (BIZ)

| ID | Test | Expected Result |
|----|------|----------------|
| BIZ-01 | Move application to `hired` stage bypassing offer approval | State machine enforces transition rules |
| BIZ-02 | Approve own offer (self-approval) | Approver cannot be the offer creator |
| BIZ-03 | Create 51 applications in single bulk operation | Rejected: bulk limit is 50 |
| BIZ-04 | Withdraw application, then attempt to un-withdraw | Withdrawal is terminal (no reverse transition) |
| BIZ-05 | Access AI matching with exhausted credits | `402 Payment Required` |
| BIZ-06 | Upload file exceeding 10MB limit | `413 Payload Too Large` |
| BIZ-07 | Start second CSV import while first is processing | Rejected: one active import per org |
| BIZ-08 | Cancel GDPR erasure after 48h cooling period | Cannot cancel — erasure already executed |

#### Data Protection (DATA)

| ID | Test | Expected Result |
|----|------|----------------|
| DATA-01 | Trigger application error and check response for PII | RFC 9457 format, no PII in error detail |
| DATA-02 | Check application logs for candidate email/phone | Redacted by Pino (`[REDACTED]`) |
| DATA-03 | Access Supabase Storage file without signed URL | `403` (private bucket) |
| DATA-04 | Guess signed URL for another candidate's resume | UUID-based paths, URL includes signature — infeasible |
| DATA-05 | Query Typesense without scoped API key | `403` (admin key never exposed to client) |
| DATA-06 | Check Sentry event for PII | No email, phone, or candidate names in events |
| DATA-07 | Access DSAR export with expired signed URL | `403` (URL expired) |
| DATA-08 | Request DEI report for cohort with < 5 candidates | Suppressed rows show `null` counts |

#### Rate Limiting (RATE)

| ID | Test | Expected Result |
|----|------|----------------|
| RATE-01 | Exceed plan API rate limit | `429` with `Retry-After` header |
| RATE-02 | Exceed AI daily burst cap | `429 Too Many Requests` |
| RATE-03 | Exceed AI monthly credit quota | `402 Payment Required` |
| RATE-04 | Rapid webhook endpoint testing (flood test endpoint) | Delivery rate limited per endpoint |
| RATE-05 | Career page scraping (rapid sequential requests) | Rate limited per IP |

### 8.3 Test Schedule

| Phase | Timing | Scope | Performed By |
|-------|--------|-------|-------------|
| **Pre-launch internal** | After core features complete | Full scope (§8.1) | Engineering team |
| **Pre-launch external** | Before GA launch | Authentication + Authorization + API | Third-party security firm |
| **Quarterly** | Every 3 months post-launch | Regression + new features | Engineering team |
| **Annual** | Yearly | Full scope + infrastructure | Third-party security firm |
| **Ad-hoc** | After major feature launches | Feature-specific | Engineering team |

### 8.4 Tools

| Tool | Purpose |
|------|---------|
| Burp Suite | Manual API testing, request interception, OWASP testing |
| OWASP ZAP | Automated vulnerability scanning |
| sqlmap | SQL injection verification (against staging only) |
| nuclei | Template-based vulnerability scanning |
| k6 | Rate limit and load testing (coordinated with D16) |
| trufflehog | Secret scanning in codebase and git history |
| npm audit + Snyk | Dependency vulnerability scanning |

---

## 9. Security Headers

Required HTTP security headers set in `proxy.ts` middleware:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer data leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable unnecessary browser APIs |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{random}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co https://*.sentry.io wss://*.supabase.co; frame-ancestors 'none'` | XSS mitigation, resource restriction |
| `X-Request-Id` | `{uuid}` | Request tracing (D14 §8) |

---

## 10. Incident Classification

Maps threat model findings to D18 runbook severity and response procedures.

| Threat Category | Severity | Runbook | Response Time |
|----------------|----------|---------|---------------|
| Active data breach (I-01 exploited) | P1 — Critical | R-03 | Immediate |
| RLS bypass discovered (T-01) | P1 — Critical | R-03 | Immediate |
| Service role key leaked (EoP-06) | P1 — Critical | R-04 | Immediate |
| Authentication bypass (S-01, S-02) | P1 — Critical | R-03 → R-04 | 15 min |
| Cross-tenant data access (I-01) | P1 — Critical | R-03 | 15 min |
| PII in logs discovered (I-02, I-03) | P2 — High | Custom | 1 hour |
| Rate limiting failure (DoS-01) | P2 — High | R-06 | 1 hour |
| Dependency vulnerability (supply chain) | P2–P3 | Custom | 4 hours (critical CVE: 1 hour) |
| CSP violation reports | P4 — Low | Monitor | Next business day |

---

## 11. Security Review Checklist

For every PR that touches authentication, authorization, data access, or third-party integrations:

- [ ] No `organization_id` accepted from client input
- [ ] RLS policies cover all 4 operations (SELECT, INSERT, UPDATE, DELETE)
- [ ] Zod schema validates all user input
- [ ] No PII in log statements (check Pino redact paths)
- [ ] No secrets in client-side code
- [ ] Error responses use RFC 9457 format (no stack traces)
- [ ] Rate limiting applies to new endpoints
- [ ] Audit trigger attached to new tables
- [ ] `deleted_at IS NULL` in SELECT RLS policies
- [ ] Signed URLs used for all Storage file access
- [ ] HMAC verification on any new webhook receiver
- [ ] `Sentry.captureException()` in catch blocks (no silent failures)

---

*Created: 2026-03-11*
