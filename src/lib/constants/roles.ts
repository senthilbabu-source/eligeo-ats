/**
 * RBAC constants — Single source of truth for roles and permissions.
 * Mirrors the D01 permission matrix and D02 endpoint-level matrix.
 *
 * Two-layer enforcement:
 *   1. Database: RLS via has_org_role() — unforgeable
 *   2. Application: can() — early rejection + UI gating
 */

// ── Roles ──────────────────────────────────────────────────

export const ORG_ROLES = [
  "owner",
  "admin",
  "recruiter",
  "hiring_manager",
  "interviewer",
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

// ── Permissions ────────────────────────────────────────────

export const PERMISSIONS = [
  // Organization
  "org:manage",
  "org:invite",
  "org:view_members",
  // Billing
  "billing:manage",
  // Jobs
  "jobs:create",
  "jobs:edit",
  "jobs:view",
  "jobs:publish",
  "jobs:delete",
  // Candidates
  "candidates:create",
  "candidates:edit",
  "candidates:view",
  "candidates:delete",
  // Applications
  "applications:create",
  "applications:view",
  "applications:move",
  // Interviews
  "interviews:create",
  "interviews:edit",
  "interviews:view",
  // Scorecards
  "scorecards:submit",
  "scorecards:view",
  // Offers
  "offers:create",
  "offers:view",
  "offers:submit",
  "offers:approve",
  // Notes
  "notes:create",
  "notes:view",
  // Pipelines
  "pipelines:create",
  "pipelines:view",
  // System
  "audit:view",
  "api_keys:manage",
  "analytics:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ── RBAC Matrix ────────────────────────────────────────────
// Matches D01 §Permission Matrix exactly.
// "Assigned only" constraints (hiring_manager/interviewer) are
// enforced at the RLS layer, not here. This matrix gates action type.

const OWNER_PERMISSIONS: readonly Permission[] = [...PERMISSIONS];

const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => p !== "billing:manage",
);

const RECRUITER_PERMISSIONS: readonly Permission[] = [
  "org:view_members",
  "jobs:create",
  "jobs:edit",
  "jobs:view",
  "jobs:publish",
  "candidates:create",
  "candidates:edit",
  "candidates:view",
  "applications:create",
  "applications:view",
  "applications:move",
  "interviews:create",
  "interviews:edit",
  "interviews:view",
  "scorecards:submit",
  "scorecards:view",
  "offers:create",
  "offers:view",
  "offers:submit",
  "notes:create",
  "notes:view",
  "pipelines:view",
  "analytics:view",
];

const HIRING_MANAGER_PERMISSIONS: readonly Permission[] = [
  "org:view_members",
  "jobs:view",
  "candidates:view",
  "applications:view",
  "applications:move",
  "interviews:view",
  "scorecards:submit",
  "scorecards:view",
  "offers:view",
  "offers:approve",
  "notes:create",
  "notes:view",
];

const INTERVIEWER_PERMISSIONS: readonly Permission[] = [
  "org:view_members",
  "interviews:view",
  "scorecards:submit",
  "scorecards:view",
  "notes:create",
  "notes:view",
];

export const RBAC_MATRIX: Record<OrgRole, readonly Permission[]> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  recruiter: RECRUITER_PERMISSIONS,
  hiring_manager: HIRING_MANAGER_PERMISSIONS,
  interviewer: INTERVIEWER_PERMISSIONS,
};

/**
 * Check if a role has a specific permission.
 * Does NOT handle "assigned only" or "blind review" constraints —
 * those are enforced at the database/RLS layer.
 */
export function can(role: OrgRole, permission: Permission): boolean {
  return RBAC_MATRIX[role]?.includes(permission) ?? false;
}

/**
 * Assert a role has a permission, or throw.
 * Use in Server Actions for early rejection.
 */
export function assertCan(role: OrgRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Insufficient permissions: requires ${permission}`);
  }
}
