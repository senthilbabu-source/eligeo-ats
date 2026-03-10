# ADR-008: Enum Strategy — CHECK Constraints for System Values, Lookup Tables for Tenant Values

> **Status:** Accepted
> **Date:** 2026-03-10
> **Deciders:** Principal Architect
> **INDEX ID:** D04
> **Resolves:** SCHEMA-3 (Decisions Registry in PLAN.md)

---

## Context

S3 uses inline CHECK constraints for status values (e.g., `CHECK (status IN ('active','paused','closed','draft'))`). JOURNEY-LOG principle P-09 warns that hardcoded enums kill enterprise sales — pipeline stages must be configurable per tenant.

D01 needs a consistent policy: which values are CHECK constraints, which are PostgreSQL ENUMs, and which are lookup tables?

## Decision

**Three-tier enum strategy:**

### Tier 1: CHECK constraints — System-fixed values that never change per tenant

Used for values controlled by application logic, not by customers.

| Column | Values | Why CHECK |
|--------|--------|-----------|
| `organization_members.role` | owner, admin, recruiter, hiring_manager, interviewer | Role definitions are code-level (RBAC matrix). Adding a role requires code changes, not just a DB insert. |
| `applications.status` | active, withdrawn, hired, rejected, archived | Application lifecycle is a state machine. Adding a state requires code changes to transition logic. |
| `offers.status` | draft, pending_approval, approved, sent, signed, declined, expired | Offer lifecycle is a state machine with integration hooks (e-sign). |
| `audit_logs.action` | INSERT, UPDATE, DELETE | PostgreSQL trigger operations. Fixed by the database engine. |
| `organizations.plan` | starter, growth, pro, enterprise | Plan tiers are tied to billing logic. Adding a tier requires Stripe configuration. |

**Why not PostgreSQL ENUM types:** `ALTER TYPE ... ADD VALUE` cannot run inside a transaction. This makes migrations dangerous — a failed migration that added an enum value cannot be rolled back. CHECK constraints can be altered transactionally.

### Tier 2: Lookup tables — Tenant-customizable values

Used for values that enterprise customers will want to customize.

| Lookup table | Used by | Why lookup table |
|-------------|---------|-----------------|
| `pipeline_stages` | `applications.current_stage_id` | Enterprise customers need 10+ custom stages (P-09). Already a table in S3. |
| `skills` | `candidate_skills`, `job_required_skills` | Skills taxonomy grows continuously. Must support org-specific skills + global shared skills. |
| `rejection_reasons` | `applications.rejection_reason_id` | Customers track different rejection categories for analytics. |
| `candidate_sources` | `candidates.source_id` | Attribution sources vary by org (LinkedIn, referral, agency X, career fair Y). |
| `email_templates` | notification triggers | Each org customizes their communication. |
| `scorecard_templates` | structured interviews | Each job can have a different scorecard structure. |

### Tier 3: JSONB — Flexible, schema-less configuration

Used sparingly for truly dynamic, unstructured configuration.

| Column | Example | Why JSONB |
|--------|---------|-----------|
| `organizations.feature_flags` | `{"ai_matching": true, "bulk_import": false}` | Feature flags change frequently without migrations. |
| `organizations.branding_config` | `{"logo_url": "...", "primary_color": "#..."}` | Branding is free-form, varies wildly per org. |
| `custom_field_values.value` | Polymorphic — could be string, number, date, array | Custom field types are user-defined. |

**Rule:** Every JSONB column must have its structure documented as a TypeScript interface in D01 (per AI-RULES rule 28).

## Consequences

### Positive

- Tenant-customizable values are extensible without migrations
- System values are constrained at the DB level — invalid states are impossible
- No PostgreSQL ENUM types — migrations remain transactionally safe
- Clear rule for developers: "Can a customer change this? → Lookup table. Only we control it? → CHECK constraint."

### Negative

- Lookup tables require JOINs instead of direct value comparison (mitigation: minimal performance impact with proper indexing)
- More tables in D01 (mitigation: they're small reference tables with clear purpose)

## References

- [S3] §2.1 (CHECK constraints on status columns), §2.2 (pipeline_stages as lookup table)
- [JOURNEY-LOG] P-09: Hardcoded domain enums kill enterprise sales

---

*Recorded: 2026-03-10*
