# API Specification

> **ID:** D02
> **Status:** Review
> **Priority:** P0
> **Last updated:** 2026-03-10
> **Depends on:** D01 (schema)
> **Depended on by:** D19 (Data Migration & Onboarding)
> **Last validated against deps:** 2026-03-10
> **Architecture decisions assumed:** ADR-001 (Supabase client), ADR-002 (Next.js 16), ADR-006 (soft delete), ADR-007 (audit), ADR-008 (enums)

---

## 1. API Architecture

Two API layers. Server Actions for internal UI; Route Handlers for everything external.

| Layer | Technology | When to Use |
|-------|-----------|-------------|
| **Server Actions** | Next.js Server Actions | UI form submissions, status changes, notes — anything triggered by React components. No URL; Next.js manages lifecycle. |
| **Route Handlers** | `app/api/` Route Handlers | External REST API, webhook receivers, crons, streaming, API-key auth, anything called by non-browser clients. |
| **Background Jobs** | Inngest functions | Triggered by events from either layer. Async: email sends, AI scoring, webhook delivery, data sync. |

### 1.1 Route Structure

```
app/api/
├── v1/                           ← REST API (versioned)
│   ├── {resource}/route.ts       ← GET (list), POST (create)
│   ├── {resource}/[id]/route.ts  ← GET, PATCH, DELETE
│   └── openapi.json/route.ts    ← Generated OpenAPI 3.1 spec
├── webhooks/{provider}/route.ts  ← Inbound: merge, nylas, stripe, dropbox-sign
├── inngest/route.ts              ← Inngest webhook receiver
└── cron/*/route.ts               ← Scheduled: purge-idempotency, data-retention, webhook-health
```

---

## 2. Authentication

### 2.1 JWT (Supabase Auth) — Internal UI + Server Actions

All browser requests use Supabase Auth JWT. The `proxy.ts` middleware:
1. Reads auth cookie
2. Refreshes session if needed
3. Decodes claims: `org_id`, `org_role`, `plan`, `feature_flags` (injected by `custom_access_token_hook`)
4. Rejects unauthenticated requests to `/api/v1/` with `401`

```typescript
// Route Handler auth pattern (Supabase SSR v0.9+)
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return problemResponse(401, 'Unauthorized', 'Valid session required.');
  // RLS scopes all queries automatically
}
```

### 2.2 API Keys — External Integrations

For M2M (machine-to-machine) access. Stored in `api_keys` table (D01).

| Header | Format | Example |
|--------|--------|---------|
| `X-API-Key` | `ats_live_` + 40 hex chars | `ats_live_a1b2c3d4e5...` |

API key resolution:
1. Hash incoming key with SHA-256
2. Look up `api_keys.key_hash` (never store plaintext)
3. Verify `is_active = TRUE`, `expires_at > NOW()`
4. Set `organization_id` from the key record (org-scoped, no cross-tenant access)
5. Rate limit per key (see §6)

```typescript
// API key auth in Route Handler
const apiKey = req.headers.get('x-api-key');
if (!apiKey) return problemResponse(401, 'API key required');

const { data: keyRecord } = await supabaseAdmin
  .from('api_keys')
  .select('organization_id, permissions')
  .eq('key_hash', sha256(apiKey))
  .is('deleted_at', null)
  .gt('expires_at', new Date().toISOString())
  .single();

if (!keyRecord) return problemResponse(401, 'Invalid API key');
```

### 2.3 Supabase Auth Configuration

Settings applied to the Supabase project (Dashboard → Auth → Settings). Not in code — configured per environment.

| Setting | Value | Notes |
|---------|-------|-------|
| **Site URL** | `https://eligeo.io` (prod), `https://staging.eligeo.io` (staging) | Redirect target after auth flows |
| **Redirect URLs** | `https://eligeo.io/**`, `https://*.vercel.app/**`, `http://localhost:3000/**` | Wildcard for preview environments |
| **JWT expiry** | 3600 seconds (1 hour) | Access token lifetime. Refresh handled by `proxy.ts`. |
| **Refresh token rotation** | Enabled | Each refresh invalidates the old token. Prevents replay. |
| **Refresh token reuse interval** | 10 seconds | Grace period for concurrent requests during rotation. |
| **Password minimum length** | 8 characters | Supabase default. No complexity rules (encourages passphrases). |
| **Email confirmations** | Enabled | Users must verify email before first login. |
| **Double opt-in** | Disabled | Single confirmation email is sufficient. |
| **Secure email change** | Enabled | Requires confirmation on both old and new email. |
| **MFA/2FA** | Not in v1.0 | Deferred to v3.0 (Enterprise SSO/SAML). |
| **Rate limiting (auth)** | Supabase defaults (30 requests/hour per IP for signup, 5 for password reset) | Override if needed post-launch. |
| **Session per user** | Multiple concurrent sessions allowed | User can be logged in on desktop + mobile. |

**Email templates (customized):**

| Template | Subject | Key content |
|----------|---------|-------------|
| Confirm signup | "Welcome to Eligeo — verify your email" | Branded, Eligeo logo, verify button |
| Reset password | "Reset your Eligeo password" | Branded, reset link, 1-hour expiry note |
| Magic link | "Sign in to Eligeo" | Branded, one-click login button |
| Change email | "Confirm your new email address" | Branded, confirm button |
| Invite user | "You've been invited to {org_name} on Eligeo" | Branded, accept invite button, org name |

Templates use React Email (same system as D08 notifications). Rendered at deploy time, uploaded to Supabase via API.

### 2.4 API Key Permission Scoping

API keys (v2.1+, Pro/Enterprise) use the `permissions` JSONB column to restrict access.

**Permission format:** Array of `resource:action` strings from the RBAC permission set.

```typescript
// Example: read-only key for candidates and applications
{
  "permissions": ["candidates:view", "applications:view", "jobs:view"]
}

// Example: full-access key (same as recruiter role)
{
  "permissions": ["jobs:create", "jobs:publish", "candidates:view", "candidates:create", "applications:view", "applications:create", "applications:move"]
}

// Example: empty = no access (key is useless until permissions are set)
{
  "permissions": []
}
```

**Rules:**
- API key permissions are a **subset** of the creating user's role permissions. You cannot create a key with more access than you have.
- Keys inherit the org scope of the creator. No cross-org keys.
- `billing:manage`, `org:manage`, and `audit:view` are **never** available via API key — dashboard-only.
- Default TTL: 365 days. Maximum: 365 days. Configurable at creation.
- Revocation is immediate — key hash is deleted from lookup, all subsequent requests fail.

---

## 3. Authorization (RBAC)

RBAC matrix defined in D01. Enforced at two layers:

1. **Database (RLS):** Supabase RLS policies check `has_org_role()` for write operations. Transparent and unforgeable.
2. **Application:** `can(role, permission)` helper for UI gating and early rejection before DB round-trip.

```typescript
// Permission check helper
type Permission = 'jobs:create' | 'jobs:publish' | 'candidates:view' | /* ... */;

function can(role: string, permission: Permission): boolean {
  return RBAC_MATRIX[role]?.includes(permission) ?? false;
}

// Usage in Server Action
export async function createJob(formData: FormData) {
  const session = await requireAuth();
  if (!can(session.org_role, 'jobs:create')) throw new ForbiddenError();
  // ...
}
```

**Cross-tenant defense:** Never accept `organization_id` from the client. Always derive from JWT claims or API key record. Return `404` (not `403`) for cross-tenant access attempts — don't reveal resource existence.

### 3.1 Endpoint-Level Permission Matrix

Every API endpoint maps to one or more RBAC permissions from D01. Roles: **O** = Owner, **A** = Admin, **R** = Recruiter, **H** = Hiring Manager, **I** = Interviewer.

| Endpoint | O | A | R | H | I | Permission | Notes |
|----------|---|---|---|---|---|-----------|-------|
| `GET /v1/job-openings` | Y | Y | Y | Y* | — | `jobs:view` | *HM: assigned jobs only |
| `POST /v1/job-openings` | Y | Y | Y | — | — | `jobs:create` | |
| `PATCH /v1/job-openings/:id` | Y | Y | Y | — | — | `jobs:edit` | |
| `DELETE /v1/job-openings/:id` | Y | Y | — | — | — | `jobs:delete` | Soft delete |
| `GET /v1/candidates` | Y | Y | Y | Y* | Y* | `candidates:view` | *Assigned only |
| `POST /v1/candidates` | Y | Y | Y | — | — | `candidates:create` | |
| `PATCH /v1/candidates/:id` | Y | Y | Y | — | — | `candidates:edit` | |
| `DELETE /v1/candidates/:id` | Y | Y | — | — | — | `candidates:delete` | Soft delete |
| `GET /v1/applications` | Y | Y | Y | Y* | Y* | `applications:view` | *Assigned jobs only |
| `POST /v1/applications` | Y | Y | Y | — | — | `applications:create` | |
| `POST /v1/applications/:id/move-stage` | Y | Y | Y | Y | — | `applications:move` | |
| `GET /v1/interviews` | Y | Y | Y | Y* | Y* | `interviews:view` | *Own interviews only for I |
| `POST /v1/interviews` | Y | Y | Y | — | — | `interviews:create` | |
| `PATCH /v1/interviews/:id` | Y | Y | Y | — | — | `interviews:edit` | |
| `POST /v1/scorecards` | Y | Y | Y | Y | Y | `scorecards:submit` | Own interview only |
| `GET /v1/scorecards` | Y | Y | Y | Y | Y* | `scorecards:view` | *Own only (blind review) |
| `GET /v1/offers` | Y | Y | Y | Y* | — | `offers:view` | *Assigned jobs only |
| `POST /v1/offers` | Y | Y | Y | — | — | `offers:create` | |
| `POST /v1/offers/:id/submit` | Y | Y | Y | — | — | `offers:submit` | Starts approval chain |
| `POST /v1/offers/:id/approve` | Y | Y | — | Y | — | `offers:approve` | Approver in chain only |
| `POST /v1/notes` | Y | Y | Y | Y | Y | `notes:create` | |
| `GET /v1/notes` | Y | Y | Y | Y* | Y* | `notes:view` | *Assigned entity only |
| `GET /v1/pipelines` | Y | Y | Y | — | — | `pipelines:view` | |
| `POST /v1/pipelines` | Y | Y | — | — | — | `pipelines:create` | |
| `PATCH /v1/organization` | Y | Y | — | — | — | `org:manage` | |
| `GET /v1/organization/members` | Y | Y | Y | Y | Y | `org:view_members` | |
| `POST /v1/organization/invite` | Y | Y | — | — | — | `org:invite` | |
| `GET /v1/billing/*` | Y | — | — | — | — | `billing:manage` | Owner only |
| `GET /v1/audit-logs` | Y | Y | — | — | — | `audit:view` | |
| `GET /v1/api-keys` | Y | Y | — | — | — | `api_keys:manage` | |
| `GET /v1/analytics/*` | Y | Y | Y | — | — | `analytics:view` | R: limited scope |

**Conditional access patterns:**
- **"Assigned only"**: HM and I see only candidates/applications/interviews for jobs where they are assigned as hiring manager or interviewer.
- **"Blind review"**: Interviewers cannot view other scorecards until they submit their own for the same interview.
- **"Approver in chain"**: Only the current pending approver in the offer approval chain can approve/reject.

### 3.2 Timezone Convention

All timestamps follow these rules:

| Layer | Rule |
|-------|------|
| **Storage** | All columns use `TIMESTAMPTZ`. PostgreSQL stores in UTC. |
| **API responses** | Always ISO 8601 with `Z` suffix (UTC). Example: `2026-03-12T10:00:00Z` |
| **API requests** | Accept any valid ISO 8601 with timezone offset. Server converts to UTC before storage. |
| **Display (UI)** | Convert from UTC to **user's timezone** (`user_profiles.timezone`). Fall back to **org timezone** (`organizations.timezone`). Fall back to UTC. |
| **Scheduling input** | When a user schedules an interview for "2pm tomorrow", the UI sends the user's local time as ISO 8601 with offset. Server stores as UTC. |
| **Cron jobs** | All Inngest cron schedules run in **UTC**. Timezone-aware delivery (e.g., digest emails) must query `organizations.timezone` to determine org-local time. |
| **Date range filters** | API accepts UTC. UI converts user's local date range to UTC before sending. |
| **Reporting** | Analytics materialized views store dates in UTC. Reporting UI converts to org timezone for display. |
| **DST handling** | No special handling needed — `TIMESTAMPTZ` stores absolute instants. Display conversion uses `Intl.DateTimeFormat` which handles DST automatically. |

**Precedence:** User timezone > Org timezone > UTC.

---

## 4. URL Conventions

| Rule | Pattern | Example |
|------|---------|---------|
| Base path | `/api/v1/` | All external API endpoints |
| Resource names | `kebab-case`, plural | `/api/v1/job-openings`, `/api/v1/talent-pools` |
| Nested resources | Max 2 levels | `/api/v1/applications/{id}/notes` |
| Actions | POST with verb suffix | `/api/v1/applications/{id}/move-stage` |
| Filters | Query params | `?status=open&department=engineering` |
| Fields | `fields` param (sparse) | `?fields=id,name,email` |
| Expand | `expand` param | `?expand=applications,skills` |

### Naming Map (D01 tables → API resources)

| Table | API Resource | Path |
|-------|-------------|------|
| `job_openings` | job-openings | `/api/v1/job-openings` |
| `candidates` | candidates | `/api/v1/candidates` |
| `applications` | applications | `/api/v1/applications` |
| `interviews` | interviews | `/api/v1/interviews` |
| `offers` | offers | `/api/v1/offers` |
| `scorecard_submissions` | scorecards | `/api/v1/scorecards` |
| `talent_pools` | talent-pools | `/api/v1/talent-pools` |
| `notes` | notes | `/api/v1/notes` (or nested) |
| `files` | files | `/api/v1/files` |
| `pipeline_templates` | pipelines | `/api/v1/pipelines` |

---

## 5. Pagination

**Cursor-based (keyset)** for all list endpoints. No offset pagination.

### Request

| Param | Type | Default | Max | Description |
|-------|------|---------|-----|-------------|
| `cursor` | string | — | — | Opaque base64 cursor from previous response |
| `limit` | integer | 25 | 100 | Items per page |
| `sort` | string | `created_at` | — | Sort field |
| `order` | string | `desc` | — | `asc` or `desc` |

### Response Envelope

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;  // null = no more pages
    has_more: boolean;
    limit: number;
  };
}
```

### Implementation

Cursor encodes `{sort_value, id}` as base64 to keep it opaque. Ties broken by `id`.

```typescript
// Decode cursor
const { sort_value, id } = decodeCursor(cursor);

// Supabase query with keyset pagination
const { data } = await supabase
  .from('candidates')
  .select('*')
  .or(`created_at.lt.${sort_value},and(created_at.eq.${sort_value},id.gt.${id})`)
  .order('created_at', { ascending: false })
  .order('id', { ascending: true })
  .limit(limit + 1);  // +1 to detect hasMore

const hasMore = data.length > limit;
const items = hasMore ? data.slice(0, limit) : data;
const nextCursor = hasMore ? encodeCursor(items.at(-1)!) : null;
```

---

## 6. Rate Limiting

**Technology:** `@upstash/ratelimit` with Upstash Redis. Applied in `proxy.ts` middleware for edge-level blocking.

### Tiers (per plan from `organizations.plan`)

| Plan | API Requests | AI Operations (burst cap) | Webhook Deliveries |
|------|-------------|---------------------------|---------------------|
| `starter` | 500/min | 100/day | 200/hr |
| `growth` | 2,000/min | 500/day | 1,000/hr |
| `pro` | 5,000/min | 2,000/day | 2,000/hr |
| `enterprise` | 10,000/min | 10,000/day | 5,000/hr |

> **AI Operations vs AI Credits:** "AI Operations/day" is a **rate limit** (burst protection, resets daily at midnight UTC). It prevents abuse but does not govern billing. **AI credits/month** (defined in D03 §2) is the **billing quota** — each AI operation consumes 1 credit from the monthly allocation. Both limits apply simultaneously: a Starter org can burst up to 100 AI calls/day but has only 10 credits/month total. Once monthly credits are exhausted, AI endpoints return `402 Payment Required` regardless of the daily rate limit.

### Response Headers (always included)

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 1710072000
```

### Rate Limit Exceeded Response

```json
{
  "type": "https://docs.eligeo.io/errors/rate-limit-exceeded",
  "title": "Rate limit exceeded.",
  "status": 429,
  "detail": "You have exceeded your plan's request limit. Upgrade for higher limits.",
  "instance": "/api/v1/candidates",
  "retry_after": 12
}
```

---

## 7. Error Format (RFC 9457)

All API errors use `Content-Type: application/problem+json`.

```typescript
interface ProblemDetail {
  type: string;        // URI identifying problem type (default: "about:blank")
  title: string;       // Human-readable summary (same for all instances of this type)
  status: number;      // HTTP status code
  detail?: string;     // Human-readable explanation of this specific occurrence
  instance?: string;   // URI of this specific occurrence (request path)
  trace_id?: string;   // Request trace ID for support/debugging
}
```

### Standard Error Types

| Status | Type Suffix | Title | When |
|--------|------------|-------|------|
| 400 | `/validation-error` | Validation failed. | Zod schema validation fails. `errors[]` extension field with per-field details. |
| 401 | `/unauthorized` | Authentication required. | No session or API key. |
| 403 | `/forbidden` | Insufficient permissions. | RBAC check fails. |
| 404 | `/not-found` | Resource not found. | Also used for cross-tenant access (don't reveal existence). |
| 409 | `/conflict` | Resource conflict. | Duplicate unique constraint (e.g., duplicate email). |
| 422 | `/unprocessable` | Request cannot be processed. | Idempotency key reuse with different body. |
| 429 | `/rate-limit-exceeded` | Rate limit exceeded. | See §6. |
| 500 | `/internal-error` | Internal server error. | Unhandled exception. Logged to Sentry. |

### Validation Error Extension

```json
{
  "type": "https://docs.eligeo.io/errors/validation-error",
  "title": "Validation failed.",
  "status": 400,
  "detail": "2 fields failed validation.",
  "instance": "/api/v1/candidates",
  "errors": [
    { "field": "email", "message": "Invalid email format", "code": "invalid_string" },
    { "field": "full_name", "message": "Required", "code": "invalid_type" }
  ]
}
```

---

## 8. Idempotency

POST, PUT, and PATCH requests support idempotency via `Idempotency-Key` header.

| Header | Format | Required | TTL |
|--------|--------|----------|-----|
| `Idempotency-Key` | Client-generated UUID v4 | Required for POST, optional for PUT/PATCH | 24 hours |

### Behavior

| Scenario | Response |
|----------|----------|
| First request with key | Execute, cache response, return result |
| Duplicate key, same body hash | Return cached response (no re-execution) |
| Duplicate key, different body | `422` with type `/idempotency-mismatch` |
| Key expired (>24h) | Treat as new request |

### Storage

Idempotency keys stored in Upstash Redis with 24h TTL (not a database table — avoids polluting Supabase with transient data).

```typescript
const cacheKey = `idem:${orgId}:${idempotencyKey}`;
const cached = await redis.get(cacheKey);
if (cached) {
  if (cached.bodyHash !== sha256(requestBody)) {
    return problemResponse(422, 'Idempotency key reused with different request body.');
  }
  return new Response(cached.body, { status: cached.status, headers: cached.headers });
}
// ... execute, then cache
await redis.set(cacheKey, { bodyHash, status, body, headers }, { ex: 86400 });
```

---

## 9. Webhook Outbound

Customers configure webhook endpoints via `webhook_endpoints` table (D01). Events are signed and delivered with retry.

### Signing (HMAC-SHA256)

```
X-Webhook-Id: whd_abc123          ← Delivery UUID
X-Webhook-Timestamp: 1710072000   ← Unix seconds
X-Webhook-Signature: sha256=a1b2c3...
```

Signature computed over `${timestamp}.${JSON.stringify(payload)}` using the endpoint's `secret`.

### Event Format

```json
{
  "id": "evt_abc123",
  "type": "candidate.created",
  "organization_id": "org_abc123",
  "created_at": "2026-03-10T12:00:00Z",
  "data": {
    "id": "cand_abc123",
    "full_name": "Jane Doe",
    "email": "jane@example.com"
  }
}
```

### Event Types

| Resource | Events |
|----------|--------|
| `candidate` | `.created`, `.updated`, `.deleted`, `.anonymized` |
| `application` | `.created`, `.stage_changed`, `.rejected`, `.withdrawn` |
| `interview` | `.scheduled`, `.completed`, `.cancelled` |
| `offer` | `.created`, `.approved`, `.sent`, `.signed`, `.declined` |
| `job` | `.published`, `.closed`, `.archived` |
| `scorecard` | `.submitted` |

### Delivery & Retry (via Inngest)

| Attempt | Delay | Timeout |
|---------|-------|---------|
| 1 | Immediate | 30s |
| 2 | 30s | 30s |
| 3 | 5min | 30s |
| 4 | 30min | 30s |
| 5 | 2hr | 30s |

After 5 failures: status → `dead`. After 10 consecutive failures across any events: auto-disable endpoint, notify org admin.

---

## 10. Webhook Inbound

| Provider | Path | Verification | Events Handled |
|----------|------|--------------|----------------|
| Merge.dev | `/api/webhooks/merge` | `Merge-Signature` HMAC-SHA256 | `application.created`, `candidate.synced` |
| Nylas | `/api/webhooks/nylas` | `X-Nylas-Signature` HMAC-SHA256 | `calendar.event.created`, `calendar.event.updated` |
| Stripe | `/api/webhooks/stripe` | `stripe.webhooks.constructEvent()` | `checkout.session.completed`, `invoice.paid`, `customer.subscription.*` |
| Dropbox Sign | `/api/webhooks/dropbox-sign` | HMAC-SHA256 | `signature_request.signed`, `signature_request.declined` |

All inbound webhooks: verify signature → parse event → emit Inngest event → return `200 OK` immediately. Processing happens async via Inngest.

---

## 11. Request/Response Patterns

### Zod Schema Convention

Every endpoint defines input and output schemas using Zod. Schemas are the single source of truth for validation, TypeScript types, and OpenAPI generation.

```typescript
// lib/schemas/candidates.ts
import { z } from 'zod';

export const CreateCandidateSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().optional(),
  source_id: z.string().uuid().optional(),
  skills: z.array(z.string()).max(50).optional(),
});

export const CandidateResponseSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  current_stage: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type CreateCandidateInput = z.infer<typeof CreateCandidateSchema>;
export type CandidateResponse = z.infer<typeof CandidateResponseSchema>;
```

### OpenAPI Generation

```typescript
// app/api/v1/openapi.json/route.ts
import { OpenApiGeneratorV31, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

const registry = new OpenAPIRegistry();
// ... register all schemas and paths

export async function GET() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const doc = generator.generateDocument({
    openapi: '3.1.0',
    info: { title: 'Eligeo API', version: '1.0.0' },
    servers: [{ url: 'https://api.eligeo.io' }],
  });
  return Response.json(doc);
}
```

---

## 12. Standard Response Envelopes

### Single Resource

```json
{
  "data": { "id": "...", "full_name": "...", ... }
}
```

### List (Paginated)

```json
{
  "data": [ { ... }, { ... } ],
  "pagination": {
    "next_cursor": "eyJjcmVhdGVkX2F0Ijoi...",
    "has_more": true,
    "limit": 25
  }
}
```

### Mutation Success

```json
{
  "data": { "id": "...", ... },
  "message": "Candidate created successfully."
}
```

### Delete (Soft)

```
HTTP 204 No Content
```

---

## 13. Endpoint Inventory

Complete endpoint registry in [api/ENDPOINTS.md](api/ENDPOINTS.md). 50+ endpoints across 4 categories: Core CRUD, Module-Specific (D06-D12), Search & AI, Settings & Admin.

---

*Created: 2026-03-10*
