# ADR-002: Next.js 16 with proxy.ts Middleware Convention

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04
> **Resolves:** AC-2 (Next.js version), AC-3 (Middleware file naming)

---

## Context

S3 references Next.js 15 in its title and architecture sections (§1, §4.2), while the project CLAUDE.md specifies Next.js 16. S3 uses `middleware.ts` at the project root, while Next.js 16 renamed this file to `proxy.ts` with an expanded API surface.

This mismatch affects:
- Middleware/proxy file naming and API usage across all documentation
- Route handler conventions referenced in D01, D02
- Auth flow implementation (JWT extraction, redirect logic)
- Deployment configuration (Vercel runtime compatibility)

## Decision Drivers

- **CLAUDE.md is the authority** for the active project. It specifies Next.js 16.
- **Next.js 16 is production-stable** (released and widely adopted).
- **`proxy.ts` naming** is the official convention in Next.js 16 — using `middleware.ts` would trigger deprecation warnings.
- **S3 was written before** the project's CLAUDE.md was established. CLAUDE.md supersedes S3 where they conflict.

## Options Considered

### Option A: Next.js 16 with `proxy.ts`

| Pros | Cons |
|------|------|
| Aligns with project CLAUDE.md (source of truth) | S3 code samples reference `middleware.ts` — must be treated as errata |
| Latest stable release with long-term support | Newer convention means fewer community examples (shrinking gap) |
| `proxy.ts` has enhanced API: `before()`, `after()` hooks | Team must learn `proxy.ts` API differences from `middleware.ts` |
| No deprecation warnings | |

### Option B: Next.js 15 with `middleware.ts`

| Pros | Cons |
|------|------|
| Matches S3 code samples exactly | **Contradicts project CLAUDE.md** — creates authority conflict |
| More community examples available today | Next.js 15 is approaching end of active support |
| | Would require updating CLAUDE.md (the authoritative document) |
| | Misses `proxy.ts` improvements (request/response interception, composable middleware) |

## Decision

**Chosen option: Option A (Next.js 16 with `proxy.ts`)**, because:

1. CLAUDE.md is the project authority and already specifies Next.js 16.
2. All S3 references to `middleware.ts` are cataloged as errata (S3 Errata #2 and #3 in CLAUDE.md).
3. `proxy.ts` provides architectural benefits: composable middleware via `before()`/`after()` hooks simplify auth + tenant resolution + redirect logic.

**Option B rejected** because it would require overriding CLAUDE.md, which is the established source of truth for the active project.

## Consequences

### Positive

- Single, consistent framework version across all documentation and code
- S3 errata table in CLAUDE.md already flags this — no silent confusion
- Access to Next.js 16 features: improved caching, `proxy.ts` composability, enhanced Server Actions

### Negative

- Every S3 code sample using `middleware.ts` must be mentally translated when referenced (mitigation: S3 errata table in CLAUDE.md lists this explicitly)
- Documentation (D02, D09) must use `proxy.ts` patterns, not `middleware.ts` (mitigation: this ADR is the reference, and CLAUDE.md enforces it)

### Neutral

- Deployment target remains Vercel, which supports Next.js 16 natively

## References

- [S3] Enterprise Multi-Tenant ATS Pre-Plan, §1 (title), §4.2 (middleware)
- [PLAN.md] Decisions Registry, AC-2 and AC-3
- CLAUDE.md — "Middleware: File is `proxy.ts` at root (not `middleware.ts`). Next.js 16 convention."

---

*Recorded: 2026-03-10*
