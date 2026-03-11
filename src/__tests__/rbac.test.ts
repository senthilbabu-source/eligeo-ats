import { describe, it, expect } from "vitest";
import {
  can,
  assertCan,
  ORG_ROLES,
  PERMISSIONS,
  RBAC_MATRIX,
  type Permission,
} from "@/lib/constants/roles";

describe("RBAC Matrix", () => {
  it("owner has all permissions", () => {
    for (const perm of PERMISSIONS) {
      expect(can("owner", perm)).toBe(true);
    }
  });

  it("admin has all permissions except billing:manage", () => {
    expect(can("admin", "billing:manage")).toBe(false);
    const nonBilling = PERMISSIONS.filter((p) => p !== "billing:manage");
    for (const perm of nonBilling) {
      expect(can("admin", perm)).toBe(true);
    }
  });

  it("interviewer has minimal permissions", () => {
    const allowed: Permission[] = [
      "org:view_members",
      "interviews:view",
      "scorecards:submit",
      "scorecards:view",
      "notes:create",
      "notes:view",
    ];
    for (const perm of allowed) {
      expect(can("interviewer", perm)).toBe(true);
    }
    // Should NOT have these
    expect(can("interviewer", "jobs:create")).toBe(false);
    expect(can("interviewer", "candidates:view")).toBe(false);
    expect(can("interviewer", "org:manage")).toBe(false);
    expect(can("interviewer", "billing:manage")).toBe(false);
  });

  it("hiring_manager can approve offers but not create them", () => {
    expect(can("hiring_manager", "offers:approve")).toBe(true);
    expect(can("hiring_manager", "offers:create")).toBe(false);
  });

  it("recruiter cannot manage org or billing", () => {
    expect(can("recruiter", "org:manage")).toBe(false);
    expect(can("recruiter", "org:invite")).toBe(false);
    expect(can("recruiter", "billing:manage")).toBe(false);
    expect(can("recruiter", "audit:view")).toBe(false);
  });

  it("recruiter can manage jobs and candidates", () => {
    expect(can("recruiter", "jobs:create")).toBe(true);
    expect(can("recruiter", "jobs:edit")).toBe(true);
    expect(can("recruiter", "candidates:create")).toBe(true);
    expect(can("recruiter", "candidates:edit")).toBe(true);
    expect(can("recruiter", "applications:move")).toBe(true);
  });

  it("every role has at least org:view_members", () => {
    for (const role of ORG_ROLES) {
      expect(can(role, "org:view_members")).toBe(true);
    }
  });

  it("all 5 roles are defined", () => {
    expect(ORG_ROLES).toHaveLength(5);
    expect(Object.keys(RBAC_MATRIX)).toHaveLength(5);
  });

  it("assertCan throws for unauthorized permission", () => {
    expect(() => assertCan("interviewer", "jobs:create")).toThrow(
      "Insufficient permissions",
    );
  });

  it("assertCan does not throw for authorized permission", () => {
    expect(() => assertCan("owner", "jobs:create")).not.toThrow();
  });

  it("role permissions are subsets correctly (owner > admin > recruiter)", () => {
    const adminPerms = new Set(RBAC_MATRIX.admin);
    const recruiterPerms = new Set(RBAC_MATRIX.recruiter);
    const hmPerms = new Set(RBAC_MATRIX.hiring_manager);
    const interviewerPerms = new Set(RBAC_MATRIX.interviewer);

    // Every recruiter perm should be in admin
    for (const perm of recruiterPerms) {
      expect(adminPerms.has(perm)).toBe(true);
    }

    // Every interviewer perm should be in hiring_manager
    for (const perm of interviewerPerms) {
      expect(hmPerms.has(perm)).toBe(true);
    }
  });
});
