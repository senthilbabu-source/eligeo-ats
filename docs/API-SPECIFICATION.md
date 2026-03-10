# API Specification

> **ID:** D02
> **Status:** Draft
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
// Route Handler auth pattern
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
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

| Plan | API Requests | AI Operations | Webhook Deliveries |
|------|-------------|---------------|--------------------|
| `starter` | 500/min | 100/day | 200/hr |
| `growth` | 2,000/min | 500/day | 1,000/hr |
| `pro` | 5,000/min | 2,000/day | 2,000/hr |
| `enterprise` | 10,000/min | 10,000/day | 5,000/hr |

### Response Headers (always included)

```
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 1710072000
```

### Rate Limit Exceeded Response

```json
{
  "type": "https://docs.ats.itecbrains.com/errors/rate-limit-exceeded",
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
  "type": "https://docs.ats.itecbrains.com/errors/validation-error",
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
    info: { title: 'itecbrains ATS API', version: '1.0.0' },
    servers: [{ url: 'https://api.ats.itecbrains.com' }],
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
