import { describe, it, expect } from "vitest";
import { extractSession, decodeJwtPayload } from "@/lib/auth/session";

describe("decodeJwtPayload", () => {
  it("should decode a valid JWT payload", () => {
    // Create a JWT with known claims
    const claims = { org_id: "test-org", org_role: "owner", sub: "user-123" };
    const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const token = `${header}.${payload}.signature`;

    const result = decodeJwtPayload(token);
    expect(result.org_id).toBe("test-org");
    expect(result.org_role).toBe("owner");
    expect(result.sub).toBe("user-123");
  });

  it("should return empty object for malformed token (no dots)", () => {
    expect(decodeJwtPayload("not-a-jwt")).toEqual({});
  });

  it("should return empty object for token with wrong number of parts", () => {
    expect(decodeJwtPayload("one.two")).toEqual({});
    expect(decodeJwtPayload("one.two.three.four")).toEqual({});
  });

  it("should return empty object for invalid base64 payload", () => {
    expect(decodeJwtPayload("header.!!!invalid!!!.signature")).toEqual({});
  });

  it("should return empty object for empty string", () => {
    expect(decodeJwtPayload("")).toEqual({});
  });
});

describe("extractSession", () => {
  it("should extract org claims from JWT payload", () => {
    const claims = {
      org_id: "org-123",
      org_role: "owner",
      plan: "pro",
      feature_flags: { ai_enabled: true },
    };

    const session = extractSession("user-456", claims);
    expect(session.userId).toBe("user-456");
    expect(session.orgId).toBe("org-123");
    expect(session.orgRole).toBe("owner");
    expect(session.plan).toBe("pro");
    expect(session.featureFlags).toEqual({ ai_enabled: true });
  });

  it("should default orgRole to interviewer when missing", () => {
    const session = extractSession("user-1", {});
    expect(session.orgRole).toBe("interviewer");
  });

  it("should default plan to starter when missing", () => {
    const session = extractSession("user-1", {});
    expect(session.plan).toBe("starter");
  });

  it("should default orgId to empty string when missing", () => {
    const session = extractSession("user-1", {});
    expect(session.orgId).toBe("");
  });

  it("should default featureFlags to empty object when missing", () => {
    const session = extractSession("user-1", {});
    expect(session.featureFlags).toEqual({});
  });

  it("should handle all 5 roles correctly", () => {
    const roles = ["owner", "admin", "recruiter", "hiring_manager", "interviewer"] as const;
    for (const role of roles) {
      const session = extractSession("user-1", { org_role: role });
      expect(session.orgRole).toBe(role);
    }
  });
});
