# [Module Name]

> **Purpose:** One-line description of what this module does.
> **Status:** Draft | Review | Approved
> **Last updated:** YYYY-MM-DD
> **INDEX ID:** D##
> **Depends on:** [D01], [D##]

---

## 1. Overview

What this module is, why it exists, and its scope boundaries (what it does NOT cover).

## 2. User Stories

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|---------------------|
| US-01 | Recruiter | As a recruiter, I want to... | Given... When... Then... |
| US-02 | Candidate | As a candidate, I want to... | Given... When... Then... |

## 3. Data Model

### 3.1 Tables

```sql
-- DDL here (or reference D01 section)
```

### 3.2 JSONB Type Definitions

```typescript
// TypeScript interfaces for any JSONB columns
```

### 3.3 RLS Policies

```sql
-- RLS for tables introduced by this module
```

## 4. Architecture

### 4.1 Flow Diagram

```
Step-by-step flow using ASCII art or numbered list
```

### 4.2 Integration Points

| System | Direction | Purpose |
|--------|-----------|---------|
| Inngest | Outbound | Event trigger for... |
| Supabase Realtime | Inbound | Subscribe to... |

## 5. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/...` | JWT | List... |
| POST | `/api/v1/...` | JWT | Create... |

### 5.1 Request/Response Schemas

```typescript
// Zod schemas for request and response bodies
```

## 6. Background Jobs (Inngest)

| Function ID | Trigger Event | Steps | Concurrency | Rate Limit |
|-------------|---------------|-------|-------------|------------|
| `module-action` | `ats/module.action` | 3 | 10 | 5/min/org |

## 7. UI Components

| Component | Page | Description |
|-----------|------|-------------|
| `ModuleWidget` | `/dashboard/...` | Renders... |

## 8. Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Network failure during... | Retry with backoff via Inngest |
| Concurrent updates to... | Optimistic locking with `updated_at` |

## 9. Security Considerations

- [ ] RLS policies cover all 4 operations
- [ ] No client-side org_id acceptance
- [ ] Input validation via Zod on all endpoints
- [ ] Rate limiting applied

## 10. Testing Strategy

| Type | File | What it tests |
|------|------|---------------|
| Unit | `tests/unit/module.test.ts` | Business logic |
| Integration | `tests/integration/module.test.ts` | API contracts |
| E2E | `tests/e2e/module.spec.ts` | User flows |

## 11. Open Questions

- [ ] Question 1 — needs decision before implementation
- [ ] Question 2 — blocked on external research

---

*Changelog: Created YYYY-MM-DD*
