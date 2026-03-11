import { describe, it, expect } from "vitest";
import { TENANT_A, TENANT_B } from "@/__fixtures__/golden-tenant";

describe("smoke", () => {
  it("golden fixture tenants have different org IDs", () => {
    expect(TENANT_A.org.id).not.toBe(TENANT_B.org.id);
  });

  it("golden fixture UUIDs encode tenant prefix", () => {
    expect(TENANT_A.org.id).toMatch(/^11111111-/);
    expect(TENANT_B.org.id).toMatch(/^22222222-/);
  });

  it("TENANT_A has all required roles", () => {
    const roles = Object.values(TENANT_A.users).map((u) => u.role);
    expect(roles).toContain("owner");
    expect(roles).toContain("admin");
    expect(roles).toContain("recruiter");
    expect(roles).toContain("hiring_manager");
    expect(roles).toContain("interviewer");
  });
});
