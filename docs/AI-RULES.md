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
33. Error responses follow RFC 9457 (Problem Details) format: `{ type, title, status, detail, instance }`

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

## §13 — Post-Build Audit Protocol

Every major deliverable (document, feature, sprint, hotfix) MUST end with a structured audit before the work is considered complete.

59. **Audit triggers** — an audit is mandatory after:
- Completing any D01-D21 document
- Completing a batch of related ADRs
- Completing a sprint or milestone
- Any hotfix that touches schema, RLS, or auth
- Any refactor that touches 3+ files

60. **Audit scope** — every audit checks these 7 categories:

| # | Category | What to check |
|---|----------|---------------|
| A1 | Cross-reference consistency | Do all references (ADR numbers, doc IDs, table names) in every file point to things that actually exist? |
| A2 | Decision contradictions | Do any two documents disagree on a fact, pattern, or decision? |
| A3 | Schema consistency | Do column names, types, constraints, and table names match across all docs that reference them? |
| A4 | Completeness | Are there any TODO, TBD, [VERIFY], or placeholder markers left unresolved? |
| A5 | Tracking file accuracy | Do INDEX.md statuses, PLAN.md decisions, and DEVLOG.md entries accurately reflect reality? |
| A6 | Template compliance | Do all documents follow their respective templates and AI-RULES? |
| A7 | Regression check | Did this change break anything that previously passed? |

61. **Audit output format** — every audit produces a structured report:

```
## Audit Report — [scope description]
### PASS (N items) — brief list
### FAIL (N items) — detailed, with file paths, line numbers, and exact issue
### WARNINGS (N items) — not wrong but could cause confusion
### FIXES REQUIRED — prioritized by:
  1. Dependency order (fix upstream before downstream)
  2. Severity (security > correctness > consistency > style)
  3. Blast radius (fixes affecting many docs before isolated fixes)
```

62. All FAIL items must be fixed before the deliverable is marked complete. WARNINGS must be acknowledged (fixed or explicitly accepted with reason).

63. Fixes must be applied in dependency order: if Fix A changes something that Fix B depends on, Fix A goes first. Never batch fixes that have ordering dependencies.

## §14 — Downstream Impact Protocol

64. **When any document changes**, the author must:
- Check the "Depended on by" field in the document's front matter
- For each downstream doc: verify the change doesn't invalidate it
- If it does: either update the downstream doc in the same commit, or add `⚠️ Needs revalidation` to INDEX.md

65. **When an ADR changes or is superseded**, the author must:
- Update the Decisions Registry in PLAN.md
- Search all docs for references to the old decision
- Update or flag every reference

66. **When D01 (schema) changes after initial completion**, the author must:
- Verify all module specs (D06-D12) still reference correct table/column names
- Verify D02 (API spec) request/response schemas still match
- Verify D10 (Search) collection schema still matches
- Run the full audit protocol (rule 60)

## §15 — Breaking Change Protocol

67. A "breaking change" is any change to a completed document that invalidates assumptions in downstream documents. Examples:
- Renaming a table or column in D01
- Changing an ADR decision
- Modifying an API contract in D02
- Changing RLS policy patterns

68. Breaking changes require:
- A DEVLOG entry explaining what changed and why
- An impact list of all affected downstream documents
- All affected documents updated or flagged in the same commit batch
- A post-fix audit (rule 60) to verify nothing was missed

## §16 — Security Review Gates

69. **RLS completeness review** — before any table is marked "done" in D01:
- [ ] All 4 operations (SELECT/INSERT/UPDATE/DELETE) have explicit policies
- [ ] `deleted_at IS NULL` included in SELECT policies (per ADR-006)
- [ ] `organization_id = current_user_org_id()` in every policy
- [ ] Tested with 2-tenant fixture: Tenant A cannot access Tenant B's data
- [ ] Role-based restrictions verified against RBAC matrix

70. **Auth flow review** — before any auth-related code is marked done:
- [ ] No client-provided `organization_id` accepted (derive server-side)
- [ ] JWT expiry and refresh handled
- [ ] Org-switch flow tested (per ADR-005)
- [ ] Service role usage limited to background jobs with explicit `SET LOCAL`

71. **Data exposure review** — before any API endpoint is marked done:
- [ ] Response does not leak fields from other tenants
- [ ] Pagination cannot be used to enumerate records across tenants
- [ ] Error messages do not reveal existence of resources in other tenants (return 404, not 403)
- [ ] File download URLs are scoped and expire

## §17 — Schema Evolution Rules

72. All schema changes after D01 completion use Supabase migrations (`supabase migration new <name>`).
73. Every migration file has a corresponding reverse migration documented (even if not automated).
74. Migrations must be idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
75. No migration may drop a column or table without a 2-step deprecation: (1) stop writing to it, (2) drop in a later migration after confirming no reads.
76. Every migration must be tested against `supabase db reset` with seed data before merging.

## §18 — Third-Party Integration Verification

77. Every claimed capability of a third-party service (Supabase, Inngest, Stripe, Nylas, Typesense, Merge.dev) must be verified against official documentation before the document is marked complete.
78. `[VERIFY]` markers are acceptable in Draft status but must be resolved before Review status.
79. Version-specific behavior must note the version: "Supabase JS v2.x supports..." not just "Supabase supports...".
80. When a third-party service has breaking changes in a new version, treat it as a breaking change (rule 67) and follow the protocol.

## §19 — Performance and Scalability Considerations

81. Every table in D01 must document estimated row volume at 1-year and 3-year scale (per tenant and total).
82. Indexes must be justified by query patterns documented in comments. No speculative indexes.
83. Any query expected to run in a user-facing request must target <100ms response time. Document the expected query plan.
84. Tables expected to exceed 1M rows must have a partitioning strategy documented (or explicitly state why partitioning is not needed).

## §20 — Dependency and Ordering Discipline

85. When multiple fixes or changes are identified, they must be resolved in dependency order:
- Upstream documents before downstream documents
- Schema changes before API changes before UI changes
- Security fixes before feature fixes before style fixes

86. When creating a prioritized fix list, assign each fix:
- **Priority:** P0 (security/data integrity) > P1 (correctness) > P2 (consistency) > P3 (style/clarity)
- **Dependency:** list which other fixes must complete first
- **Blast radius:** number of documents/files affected

87. No fix with unresolved upstream dependencies may be started. Verify the dependency is resolved before beginning downstream work.

## §21 — Pre-Start Gate (mandatory before beginning any deliverable)

88. **Before starting any document, feature, or task**, run this gate checklist:

| # | Check | How to verify | Fail action |
|---|-------|---------------|-------------|
| G1 | All upstream dependencies are complete | Check INDEX.md "Depends On" column — every listed dependency must have status ✅ Complete or 🟡 In Progress with the specific sections you need already done | Stop. Complete the upstream dependency first. |
| G2 | All referenced ADRs are Accepted | Check PLAN.md Decisions Registry — every decision your work assumes must be `Resolved → ADR-NNN` or `Decided (S3)`, never `Open` | Stop. Write the missing ADR first. |
| G3 | No unresolved [VERIFY] markers in dependencies | Grep upstream docs for `[VERIFY]` — any unresolved marker in a doc you depend on is a landmine | Resolve the [VERIFY] or accept the risk explicitly in your doc. |
| G4 | DEVLOG has no pending audit fixes | Check the most recent audit report — all FAIL items must be resolved | Fix outstanding FAILs first. |
| G5 | Git working tree is clean | `git status` shows no uncommitted changes | Commit or stash before starting new work. |
| G6 | You can state the deliverable's Definition of Done | Reference the specific checklist from §12 (rules 54-58) for your document type | Clarify scope before starting. |

89. The pre-start gate output is a brief confirmation block logged at the top of the work session:

```
## Pre-Start Gate — [deliverable name]
- G1 Dependencies: ✅ [list checked]
- G2 ADRs: ✅ [list referenced]
- G3 No [VERIFY] in deps: ✅
- G4 No pending audit fixes: ✅
- G5 Clean git: ✅
- G6 DoD identified: ✅ [rule number]
→ GATE PASSED — proceeding
```

90. If any gate fails, the work does not start. Fix the blocker first, re-run the gate, then proceed. No exceptions.
