# AI-Assisted Documentation Rules

> Standards for all documentation produced in the itecbrains ATS project.
> Both human-written and AI-assisted documents MUST follow these rules.

---

## §1 — Document Lifecycle

1. Every document has a status: `Draft` → `Review` → `Approved` → `Superseded`
2. Status is tracked in [INDEX.md](INDEX.md)
3. Every change is logged in [DEVLOG.md](DEVLOG.md) with date, document ID, and summary
4. Documents are never deleted — they are marked `Superseded` with a pointer to the replacement

## §2 — Structure Rules

5. Every document starts with: title, one-line purpose, last-updated date
6. Use the template from `docs/templates/MODULE-TEMPLATE.md` for feature modules
7. Use the template from `docs/templates/ADR-TEMPLATE.md` for architecture decisions
8. Headings follow a strict hierarchy: `#` (title) → `##` (sections) → `###` (subsections)
9. No heading level may be skipped (no `#` → `###`)
10. Maximum document length: 500 lines. If longer, split into linked sub-documents

## §3 — Content Quality

11. Lead with decisions, not analysis. Put reasoning in `<details>` blocks
12. Every technical claim must be verifiable — cite source (S1/S2/S3 doc IDs, or external URL)
13. Code examples must be syntactically valid and runnable in the project's stack
14. SQL must target PostgreSQL 15+ / Supabase conventions
15. TypeScript must use strict mode conventions (no `any`, explicit return types on exports)
16. Never use placeholder names like `foo`, `bar`, `acme` — use domain terms (candidate, recruiter, job)

## §4 — Consistency

17. Table names: `snake_case`, plural (`job_openings`, not `JobOpening`)
18. Column names: `snake_case` (`organization_id`, not `organizationId`)
19. TypeScript types: `PascalCase` (`CandidateProfile`, not `candidate_profile`)
20. API endpoints: `kebab-case` (`/api/v1/job-openings`, not `/api/v1/jobOpenings`)
21. File names: `UPPER-KEBAB.md` for docs, `kebab-case.ts` for code
22. All UUIDs referenced as `UUID` (not `uuid`, `Uuid`, or `GUID`)
23. Date format in docs: `YYYY-MM-DD` (ISO 8601)
24. Use "organization" not "org" in prose (abbreviation OK in code: `org_id`)

## §5 — Schema Documentation

25. Every table definition must include: columns, types, constraints, indexes, RLS policies
26. Every RLS policy must cover all 4 operations: SELECT, INSERT, UPDATE, DELETE
27. Foreign keys must specify ON DELETE behavior explicitly
28. JSONB columns must have their structure documented as a TypeScript interface alongside the DDL
29. Every index must have a comment explaining which query pattern it optimizes

## §6 — API Documentation

30. Every endpoint must specify: method, path, auth requirement, request schema, response schema, error codes
31. Pagination: document cursor format, default page size, max page size
32. All request/response schemas defined as Zod schemas (not just TypeScript interfaces)
33. Error responses follow RFC 7807 format: `{ type, title, status, detail, instance }`

## §7 — Architecture Decision Records (ADRs)

34. ADR format: Context → Decision → Consequences (positive + negative)
35. Options considered must include at least 2 alternatives with pros/cons
36. ADRs are immutable once approved — create a new ADR to override
37. Number ADRs sequentially: `001`, `002`, etc.

## §8 — Cross-References

38. Reference other docs by their INDEX.md ID: `[D01]`, `[D06]`, `[S3]`
39. Reference sections within a doc using heading anchors: `[D01 §2.1](DATABASE-SCHEMA.md#21-core-tables)`
40. When a document depends on another, the dependency must be listed in INDEX.md

## §9 — AI-Specific Rules

41. AI-generated content must be reviewed for hallucinated API signatures — verify against official docs
42. AI must not invent features of third-party services (Inngest, Supabase, Nylas, Merge.dev, Stripe)
43. When AI is unsure about a third-party API capability, it must flag with `[VERIFY]` marker
44. AI-generated SQL must be tested against `supabase db reset` before marking a schema doc as complete
45. AI must not duplicate content across documents — use cross-references instead
46. AI must update INDEX.md status and DEVLOG.md after completing any document

## §10 — Version Control

47. Documentation lives in the same repo as code (`docs/` directory)
48. Doc changes get their own commits with prefix: `docs(<scope>): <description>` (see CLAUDE.md for full convention)
49. Large documentation PRs should be broken into logical units (one doc per commit)
50. Binary files (docx, pdf) are reference-only — all working docs are Markdown

## §11 — Document Front Matter

51. Every document (D01-D21) MUST start with a YAML-style front matter block:

```markdown
# Document Title

> **ID:** D01
> **Status:** Draft | Review | Approved | Superseded
> **Priority:** P0 | P1 | P2 | P3
> **Last updated:** YYYY-MM-DD
> **Depends on:** D01, S3 (list all dependencies)
> **Depended on by:** D02, D06, D07 (list all downstream docs)
> **Last validated against deps:** YYYY-MM-DD (update when deps change and this doc is re-verified)
> **Architecture decisions assumed:** STACK-1, STACK-6, AC-2 (reference Decisions Registry in PLAN.md)
> **Battle-tested prompt:** database-schema-design.md v1 (if applicable)
```

52. When a dependency document (e.g., D01) is updated, all downstream documents listed in "Depended on by" must have their "Last validated against deps" date checked. If stale, add a note to INDEX.md: `⚠️ Needs revalidation against D01 update YYYY-MM-DD`
53. The "Architecture decisions assumed" field must only reference decisions with status `Decided` or `Resolved` in the Decisions Registry. If a doc needs an `Open` decision, that decision must be resolved first (as an ADR).

## §12 — Definition of Done (by document type)

54. **Schema documents (D01):**
- [ ] Full DDL for every table (CREATE TABLE, not just column lists)
- [ ] All 4 RLS operations (SELECT/INSERT/UPDATE/DELETE) per table
- [ ] Every index has a comment explaining the query pattern it optimizes
- [ ] JSONB columns have TypeScript interfaces
- [ ] Triggers and functions included
- [ ] SQL tested against `supabase db reset` (or marked `[VERIFY]` if not yet testable)

55. **Module specs (D06-D12, D17, D19-D21):**
- [ ] All MODULE-TEMPLATE sections filled or explicitly N/A with reason
- [ ] State machine diagram (if applicable) with all transitions and guards
- [ ] API endpoints listed with method, path, auth requirement
- [ ] Background jobs listed with trigger, steps, error handling
- [ ] Edge cases section has at least 3 entries
- [ ] Security section covers RLS, input validation, and IDOR prevention

56. **ADRs (D04):**
- [ ] Context explains the problem clearly enough for someone unfamiliar
- [ ] At least 2 alternatives considered with pros/cons
- [ ] Decision states what was chosen AND why alternatives were rejected
- [ ] Consequences list both positive and negative impacts
- [ ] Decisions Registry in PLAN.md updated

57. **Operational docs (D14, D15, D18):**
- [ ] Runbooks have step-by-step commands, not just descriptions
- [ ] Expected output documented for diagnostic commands
- [ ] Rollback procedure included
- [ ] SLOs/SLAs have concrete numbers, not "fast" or "reliable"

58. **Cross-cutting docs (D02, D03, D05, D13, D16):**
- [ ] All relevant module interactions covered
- [ ] Consistency with D01 schema verified (column names, types, constraints match)
- [ ] Integration points with third-party services marked `[VERIFY]` until confirmed against official docs
