# Error Taxonomy & Recovery Patterns

> **ID:** D26
> **Status:** Review
> **Priority:** P2
> **Last updated:** 2026-03-11
> **Depends on:** D02 (API — RFC 9457 error format, status codes), D14 (Observability — Sentry, logging)
> **Depended on by:** —
> **Last validated against deps:** 2026-03-11
> **Architecture decisions assumed:** ADR-002 (Next.js 16)

---

## 1. Overview

This document defines the application error code scheme (ATS-XXXX), user-facing error messages, graceful degradation patterns, and retry strategies. It ensures consistent error handling across the entire application: API routes, Server Actions, Inngest functions, and client-side UI.

**Scope:**
- In scope: Error code taxonomy, error response format, user-facing messages, degradation patterns, retry strategies, error boundary design, Inngest failure handling.
- Out of scope: Infrastructure-level errors (Vercel/Supabase platform), operational runbooks (D18).

**Relationship to D02:** D02 defines the RFC 9457 response envelope. This document defines the error codes and messages that populate that envelope.

**Module cross-reference:** Error codes map to source modules: AU (Auth) → D02 §2, WF (Workflow) → D12, OF (Offers) → D06, IV (Interviews) → D07, SR (Search) → D10, BL (Billing) → D03, FL (Files) → D01 §07, NT (Notifications) → D08, CP (Candidate Portal) → D09, MG (Migration) → D23, VL (Validation) → D02 §7, SY (System) → D14.

---

## 2. Error Code Scheme

### 2.1 Format

```
ATS-{CATEGORY}{NUMBER}
```

| Segment | Values | Example |
|---------|--------|---------|
| `ATS-` | Fixed prefix | — |
| `{CATEGORY}` | 2-letter module code | `AU` (auth), `WF` (workflow) |
| `{NUMBER}` | 2-digit sequential | `01`, `02`, ... `99` |

Example: `ATS-AU01` = Authentication required.

### 2.2 Category Registry

| Code | Module | Error Range |
|------|--------|-------------|
| `AU` | Authentication & Authorization | ATS-AU01 → ATS-AU20 |
| `VL` | Validation | ATS-VL01 → ATS-VL20 |
| `WF` | Workflow & State Machine | ATS-WF01 → ATS-WF20 |
| `OF` | Offers | ATS-OF01 → ATS-OF15 |
| `IV` | Interviews & Scorecards | ATS-IV01 → ATS-IV15 |
| `SR` | Search & AI | ATS-SR01 → ATS-SR15 |
| `BL` | Billing & Subscriptions | ATS-BL01 → ATS-BL15 |
| `FL` | Files & Storage | ATS-FL01 → ATS-FL10 |
| `NT` | Notifications | ATS-NT01 → ATS-NT10 |
| `CP` | Compliance & GDPR | ATS-CP01 → ATS-CP10 |
| `MG` | Migration & Import | ATS-MG01 → ATS-MG10 |
| `SY` | System & Infrastructure | ATS-SY01 → ATS-SY10 |

---

## 3. Error Code Catalog

### 3.1 Authentication & Authorization (ATS-AU)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-AU01 | 401 | Authentication required | Please sign in to continue. | No valid session or API key provided |
| ATS-AU02 | 401 | Session expired | Your session has expired. Please sign in again. | JWT expired, refresh failed |
| ATS-AU03 | 401 | Invalid API key | The API key provided is invalid or expired. | SHA-256 hash lookup failed or key expired |
| ATS-AU04 | 403 | Insufficient permissions | You don't have permission to perform this action. | RBAC check failed for role + permission |
| ATS-AU05 | 404 | Resource not found | The requested resource was not found. | Cross-tenant access attempt (404 not 403) |
| ATS-AU06 | 401 | Invalid magic link | This link has expired or already been used. Please request a new one. | Candidate token HMAC verification failed or expired |
| ATS-AU07 | 403 | Account suspended | Your account has been suspended. Please contact your administrator. | `organization_members.is_active = false` |
| ATS-AU08 | 429 | Login rate limited | Too many login attempts. Please try again in {retry_after} seconds. | Supabase Auth rate limit or proxy.ts rate limit |

### 3.2 Validation (ATS-VL)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-VL01 | 400 | Validation failed | Please fix the highlighted errors and try again. | Zod schema validation failed, `errors[]` field contains details |
| ATS-VL02 | 400 | Invalid email format | Please enter a valid email address. | Email field failed Zod `.email()` |
| ATS-VL03 | 400 | Required field missing | {field_name} is required. | Zod `.min(1)` or non-optional field missing |
| ATS-VL04 | 400 | Value too long | {field_name} must be {max} characters or fewer. | Zod `.max()` exceeded |
| ATS-VL05 | 400 | Invalid UUID | The provided ID is not valid. | UUID format validation failed |
| ATS-VL06 | 409 | Duplicate entry | A record with this {field} already exists. | Unique constraint violation |
| ATS-VL07 | 422 | Idempotency mismatch | This request has already been processed with different data. | Same idempotency key, different body hash |

### 3.3 Workflow & State Machine (ATS-WF)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-WF01 | 422 | Invalid stage transition | This candidate cannot be moved to {stage}. | State machine rejected the transition |
| ATS-WF02 | 422 | Terminal state | This application has been {status} and cannot be modified. | Attempting to modify rejected/withdrawn/hired application |
| ATS-WF03 | 422 | Stage requires interview | An interview must be completed before moving to this stage. | Auto-advance blocked — no completed interview |
| ATS-WF04 | 422 | Bulk limit exceeded | You can process a maximum of 50 items at once. | Bulk operation exceeds limit (D12 §6) |
| ATS-WF05 | 409 | Concurrent modification | This record was modified by another user. Please refresh and try again. | Optimistic locking conflict (updated_at mismatch) |
| ATS-WF06 | 422 | Pipeline stage not found | The target pipeline stage does not exist. | Stage ID not in active pipeline |

### 3.4 Offers (ATS-OF)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-OF01 | 422 | Invalid offer transition | This offer cannot be moved to {status}. | Offer state machine rejected transition |
| ATS-OF02 | 422 | Approval required | This offer requires approval before it can be sent. | Offer in `draft` state, approval chain not completed |
| ATS-OF03 | 422 | Offer already signed | A signed offer cannot be modified or withdrawn. | Terminal state: `signed` |
| ATS-OF04 | 422 | Offer expired | This offer has expired. Please create a new offer. | Past `expires_at` timestamp |
| ATS-OF05 | 409 | Active offer exists | This candidate already has an active offer for this position. | Only one active offer per application |
| ATS-OF06 | 422 | Self-approval not allowed | You cannot approve an offer you created. | Creator cannot be approver |

### 3.5 Interviews & Scorecards (ATS-IV)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-IV01 | 422 | Invalid interview transition | This interview cannot be moved to {status}. | Interview state machine rejected transition |
| ATS-IV02 | 409 | Scorecard already submitted | You have already submitted a scorecard for this interview. | Duplicate submission by same user |
| ATS-IV03 | 403 | Scorecard not yet submitted | Submit your own scorecard before viewing others. | Blind review enforcement (D07 §4) |
| ATS-IV04 | 422 | Calendar conflict | The selected time slot conflicts with an existing event. | Nylas availability check failed |
| ATS-IV05 | 422 | Scheduling link expired | This scheduling link has expired. Please request a new one. | Self-scheduling token expired |

### 3.6 Search & AI (ATS-SR)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-SR01 | 402 | AI credits exhausted | Your organization has used all AI credits this month. Upgrade your plan for more. | Monthly billing quota exceeded (D03 §2) |
| ATS-SR02 | 429 | AI rate limited | Too many AI requests. Please wait {retry_after} seconds. | Daily burst cap exceeded (D02 §6) |
| ATS-SR03 | 503 | Search unavailable | Search is temporarily unavailable. Please try again shortly. | Typesense is down — graceful degradation |
| ATS-SR04 | 503 | AI service unavailable | AI features are temporarily unavailable. You can continue without AI matching. | OpenAI is down — graceful degradation |

### 3.7 Billing & Subscriptions (ATS-BL)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-BL01 | 402 | Payment required | Please update your payment method to continue. | Stripe subscription past due |
| ATS-BL02 | 403 | Feature not available on plan | This feature requires the {plan} plan or higher. | Feature gated by plan tier |
| ATS-BL03 | 403 | Seat limit reached | Your plan allows {max} users. Please upgrade or remove a user. | `organization_members` count exceeds plan limit |
| ATS-BL04 | 422 | Cannot downgrade | Please reduce usage before downgrading (current: {current}, limit: {limit}). | Downgrade validation failed (D03 §6) |
| ATS-BL05 | 402 | Subscription cancelled | Your subscription has been cancelled. Please resubscribe. | Subscription in `cancelled` state |

### 3.8 Files & Storage (ATS-FL)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-FL01 | 413 | File too large | File must be smaller than {max_size}MB. | Exceeds upload limit (10MB resumes, 5MB CSV) |
| ATS-FL02 | 415 | Unsupported file type | Supported formats: {formats}. | MIME type validation failed |
| ATS-FL03 | 404 | File not found | The requested file could not be found. | Storage object missing or deleted |
| ATS-FL04 | 403 | Download link expired | This download link has expired. Please request a new one. | Signed URL past expiry |

### 3.9 Compliance & GDPR (ATS-CP)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-CP01 | 409 | Erasure in progress | A deletion request for this candidate is already being processed. | Duplicate erasure request |
| ATS-CP02 | 422 | Legal hold active | This candidate's data is under legal hold and cannot be erased. | `legal_hold = true` in metadata |
| ATS-CP03 | 422 | Erasure cooling period | The deletion request is in the cooling period and will be processed on {date}. | 48h cooling period not elapsed |
| ATS-CP04 | 409 | Erasure already completed | This candidate's data has already been erased. | Candidate is anonymized |

### 3.10 Migration & Import (ATS-MG)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-MG01 | 409 | Import already in progress | An import is already running. Please wait for it to complete. | One active import per org (D19 §9) |
| ATS-MG02 | 400 | Invalid CSV format | The CSV file could not be parsed. Please check the format. | CSV parsing failed |
| ATS-MG03 | 422 | Stage mapping required | Please map all source pipeline stages before continuing. | Unmapped stages in migration data |
| ATS-MG04 | 403 | Migration limit reached | Your plan allows importing up to {limit} candidates. Upgrade for higher limits. | Plan-gated migration limit exceeded |

### 3.11 System (ATS-SY)

| Code | HTTP | Title | User Message | Developer Detail |
|------|------|-------|-------------|-----------------|
| ATS-SY01 | 500 | Internal error | Something went wrong. Please try again. If the problem persists, contact support. | Unhandled exception, logged to Sentry |
| ATS-SY02 | 503 | Service degraded | Some features are temporarily unavailable. We're working on it. | Health check reports degraded status |
| ATS-SY03 | 429 | Rate limited | You've made too many requests. Please wait {retry_after} seconds. | Plan-tier rate limit exceeded (D02 §6) |
| ATS-SY04 | 503 | Maintenance | The system is undergoing scheduled maintenance. Please try again shortly. | Maintenance mode flag enabled |

---

## 4. Error Response Format

All errors use RFC 9457 `application/problem+json` (defined in D02 §7). This document adds the `code` extension field:

```typescript
interface ATSProblemDetail {
  // RFC 9457 standard fields
  type: string;            // e.g., "https://docs.eligeo.io/errors/validation-error"
  title: string;           // e.g., "Validation failed."
  status: number;          // HTTP status code
  detail?: string;         // Human-readable explanation for this specific occurrence
  instance?: string;       // Request path

  // ATS extensions
  code: string;            // e.g., "ATS-VL01"
  trace_id?: string;       // Request trace ID (x-request-id)
  retry_after?: number;    // Seconds until retry is allowed (for 429)
  errors?: Array<{         // Per-field validation errors (ATS-VL01 only)
    field: string;
    message: string;
    code: string;
  }>;
}
```

### 4.1 Error Response Helper

```typescript
// lib/errors.ts
import { NextResponse } from 'next/server';

export function problemResponse(
  status: number,
  code: string,
  title: string,
  detail?: string,
  extras?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      type: `https://docs.eligeo.io/errors/${title.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '')}`,
      title,
      status,
      detail,
      instance: undefined, // Set by middleware
      code,
      trace_id: undefined, // Set by middleware
      ...extras,
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json' },
    },
  );
}

// Usage
return problemResponse(422, 'ATS-WF01', 'Invalid stage transition',
  `Cannot move application from "${fromStage}" to "${toStage}".`);
```

### 4.2 Server Action Error Pattern

```typescript
// Server Actions cannot return HTTP status codes. Use a result type instead.
interface ActionResult<T> {
  data?: T;
  error?: {
    code: string;      // ATS-XXXX
    message: string;   // User-facing
    field?: string;    // For form field errors
  };
}

export async function moveApplicationStage(
  applicationId: string,
  toStageId: string,
): Promise<ActionResult<Application>> {
  try {
    const session = await requireAuth();
    if (!can(session.org_role, 'applications:update')) {
      return { error: { code: 'ATS-AU04', message: 'You don\'t have permission to move candidates.' } };
    }

    const result = await transitionStage(applicationId, toStageId);
    return { data: result };
  } catch (error) {
    if (error instanceof InvalidTransitionError) {
      return { error: { code: 'ATS-WF01', message: error.userMessage } };
    }
    Sentry.captureException(error);
    return { error: { code: 'ATS-SY01', message: 'Something went wrong. Please try again.' } };
  }
}
```

---

## 5. Graceful Degradation Patterns

When external services fail, the application should degrade gracefully rather than break entirely.

### 5.1 Degradation Matrix

| Service Down | Affected Features | Degradation Strategy | User Message |
|-------------|-------------------|---------------------|-------------|
| **Typesense** | Full-text search | Fallback to PostgreSQL `ILIKE` with warning | "Search results may be limited. Full search will be restored shortly." |
| **OpenAI** | AI matching, embeddings | Disable AI features, show manual alternatives | "AI matching is temporarily unavailable. You can browse candidates manually." |
| **Resend** | Email notifications | Queue emails for retry (Inngest), in-app notifications still work | (No user message — emails arrive later) |
| **Nylas** | Calendar sync, self-scheduling | Show manual scheduling UI, disable calendar sync | "Calendar integration is temporarily offline. Please schedule manually." |
| **Stripe** | Billing changes | Block plan changes, existing features work | "Billing is temporarily unavailable. Your current plan is unaffected." |
| **Upstash Redis** | Rate limiting, caching | Fail open (allow all requests), no caching (direct DB) | (No user message — slightly slower) |
| **Dropbox Sign** | E-signatures | Show "Mark as Manually Signed" option | "E-signatures are temporarily unavailable. You can mark offers as manually signed." |

### 5.2 Circuit Breaker Pattern

```typescript
// lib/circuit-breaker.ts
interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 60_000; // 1 minute

const circuits = new Map<string, CircuitState>();

export async function withCircuitBreaker<T>(
  service: string,
  operation: () => Promise<T>,
  fallback: () => T,
): Promise<T> {
  const circuit = circuits.get(service) ?? { failures: 0, lastFailure: 0, state: 'closed' };

  if (circuit.state === 'open') {
    if (Date.now() - circuit.lastFailure > RESET_TIMEOUT_MS) {
      circuit.state = 'half-open';
    } else {
      return fallback();
    }
  }

  try {
    const result = await operation();
    circuit.failures = 0;
    circuit.state = 'closed';
    circuits.set(service, circuit);
    return result;
  } catch (error) {
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= FAILURE_THRESHOLD) {
      circuit.state = 'open';
      logger.warn({ service, failures: circuit.failures }, 'Circuit breaker opened');
    }
    circuits.set(service, circuit);
    return fallback();
  }
}

// Usage
const searchResults = await withCircuitBreaker(
  'typesense',
  () => typesenseSearch(query),
  () => postgresSearchFallback(query),
);
```

---

## 6. Retry Strategies

### 6.1 By Failure Type

| Failure Type | Retryable? | Strategy | Max Attempts |
|-------------|------------|----------|-------------|
| **Network timeout** | Yes | Exponential backoff: 1s, 2s, 4s | 3 |
| **429 Rate Limited** | Yes | Wait `Retry-After` header value | 3 |
| **5xx Server Error** | Yes | Exponential backoff: 2s, 4s, 8s | 3 |
| **401 Unauthorized** | No (unless token refresh) | Refresh token, retry once | 1 |
| **400 Validation** | No | Show error to user | 0 |
| **403 Forbidden** | No | Show error to user | 0 |
| **404 Not Found** | No | Show error to user | 0 |
| **409 Conflict** | Maybe | Refetch, check state, retry if stale | 1 |
| **422 Business Logic** | No | Show error to user | 0 |

### 6.2 Client-Side Retry Utility

```typescript
// lib/retry.ts
interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_CONFIG, ...config };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      if (!isRetryable(error)) throw error;

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500,
        maxDelayMs,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}

function isRetryable(error: unknown): boolean {
  if (error instanceof Response) {
    return error.status === 429 || error.status >= 500;
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true; // Network error
  }
  return false;
}
```

### 6.3 Inngest Retry Configuration

Inngest handles retries for background jobs. Standard configuration:

| Function Type | Retries | Backoff | On Permanent Failure |
|--------------|---------|---------|---------------------|
| Webhook delivery | 5 | 30s, 5m, 30m, 2h, 6h | Auto-disable endpoint, notify admin |
| Email send | 3 | 30s, 5m, 30m | Log failure, Sentry alert |
| Search sync | 3 | 10s, 60s, 5m | Log, data will sync on next event |
| AI operations | 2 | 30s, 5m | Return partial results, notify user |
| Migration batch | 2 | 60s, 5m | Mark batch as failed, continue next batch |
| GDPR operations | 2 | 5m, 30m | P2 alert (compliance-sensitive) |

---

## 7. Error Boundary Design

### 7.1 React Error Boundaries

```typescript
// components/error-boundary.tsx
'use client';

import { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  module?: string;   // For Sentry tagging
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: { module: this.props.module ?? 'unknown' },
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-6 text-center">
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground mt-2">
            Please refresh the page. If the problem persists, contact support.
          </p>
          <button
            className="mt-4 btn btn-primary"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 7.2 Error Boundary Placement

| Boundary | Scope | Behavior |
|----------|-------|----------|
| Root layout | Entire application | Full-page error with retry + support link |
| Page level | Individual page | Page-specific error, nav still works |
| Widget level | Dashboard widgets, panels | Individual widget fails, others work |
| Form level | Data entry forms | Form shows error, preserves input data |

### 7.3 Next.js Error Files

```
app/
├── error.tsx              ← Root error boundary (ATS-SY01)
├── not-found.tsx          ← 404 page
├── (dashboard)/
│   ├── error.tsx          ← Dashboard error boundary
│   └── candidates/
│       ├── error.tsx      ← Candidates page error
│       └── not-found.tsx  ← Candidate not found
└── (public)/
    └── error.tsx          ← Public page error (career site)
```

---

## 8. User-Facing Error Messages

### 8.1 Writing Guidelines

1. **Say what happened** — not technical jargon ("Session expired" not "JWT validation failed")
2. **Say what to do** — include actionable next step ("Please sign in again" not just "Error")
3. **Be specific when possible** — include the field name or entity ("Job title is required" not "Required field")
4. **Never expose internals** — no stack traces, SQL errors, table names, or internal IDs
5. **Use consistent tone** — polite, concise, no exclamation marks, no blame

### 8.2 Message Templates

| Situation | Template | Example |
|-----------|----------|---------|
| Missing required field | `{field_label} is required.` | "Email is required." |
| Invalid format | `Please enter a valid {field_label}.` | "Please enter a valid email address." |
| Permission denied | `You don't have permission to {action}.` | "You don't have permission to delete jobs." |
| Resource not found | `The {resource} was not found.` | "The candidate was not found." |
| Plan limit | `This feature requires the {plan} plan or higher.` | "This feature requires the Pro plan or higher." |
| Quota exceeded | `Your organization has used all {resource} this {period}.` | "Your organization has used all AI credits this month." |
| Temporary failure | `{feature} is temporarily unavailable. {alternative}.` | "AI matching is temporarily unavailable. You can browse candidates manually." |
| Generic error | `Something went wrong. Please try again. If the problem persists, contact support.` | — |

---

## 9. Error Logging Standards

### 9.1 What to Log

| Level | When | Include | Never Include |
|-------|------|---------|-------------|
| `error` | Unhandled exceptions, permanent failures | Error code, message, stack, entity IDs, user ID | Candidate PII, passwords, tokens |
| `warn` | Degraded service, approaching limits | Service name, metric values, thresholds | — |
| `info` | Handled business errors (validation, auth) | Error code, user ID, request path | — |

### 9.2 Sentry Context

```typescript
// When capturing to Sentry, always include:
Sentry.captureException(error, {
  tags: {
    error_code: 'ATS-WF01',        // Our error code
    module: 'workflow',              // Module name
    org_id: session.orgId,           // Tenant
  },
  extra: {
    application_id: applicationId,   // Entity IDs (not PII)
    from_stage: fromStage,
    to_stage: toStage,
  },
  // Never set: user.email, candidate names, file contents
});
```

---

*Created: 2026-03-11*
