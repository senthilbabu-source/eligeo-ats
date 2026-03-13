import { describe, it, expect, vi } from "vitest";
import {
  createScreeningToken,
  verifyScreeningToken,
  createStatusToken,
} from "@/lib/utils/candidate-token";

/**
 * P6-4: Screening Token Tests
 *
 * Tests for HMAC-signed screening tokens used by the candidate screening portal.
 * D32 §7.5 — 30-day expiry, scope: screening, encodes session+application+candidate+org IDs.
 */

const MOCK_PAYLOAD = {
  sessionId: "11111111-b002-4000-a000-000000000001",
  applicationId: "11111111-5001-4000-a000-000000000001",
  candidateId: "11111111-4001-4000-a000-000000000001",
  organizationId: "11111111-2001-4000-a000-000000000001",
};

describe("P6-4: createScreeningToken", () => {
  it("should create a base64url-encoded token", () => {
    const token = createScreeningToken(MOCK_PAYLOAD);

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    // base64url safe — no +, /, or =
    expect(token).not.toMatch(/[+/=]/);
  });

  it("should produce different tokens for different session IDs", () => {
    const token1 = createScreeningToken(MOCK_PAYLOAD);
    const token2 = createScreeningToken({
      ...MOCK_PAYLOAD,
      sessionId: "22222222-b002-4000-a000-000000000001",
    });

    expect(token1).not.toBe(token2);
  });

  it("should produce different tokens for different candidate IDs", () => {
    const token1 = createScreeningToken(MOCK_PAYLOAD);
    const token2 = createScreeningToken({
      ...MOCK_PAYLOAD,
      candidateId: "22222222-4001-4000-a000-000000000001",
    });

    expect(token1).not.toBe(token2);
  });
});

describe("P6-4: verifyScreeningToken", () => {
  it("should verify a valid token and return the full payload", () => {
    const token = createScreeningToken(MOCK_PAYLOAD);
    const result = verifyScreeningToken(token);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.sessionId).toBe(MOCK_PAYLOAD.sessionId);
      expect(result.payload.applicationId).toBe(MOCK_PAYLOAD.applicationId);
      expect(result.payload.candidateId).toBe(MOCK_PAYLOAD.candidateId);
      expect(result.payload.organizationId).toBe(MOCK_PAYLOAD.organizationId);
    }
  });

  it("should reject a tampered token", () => {
    const token = createScreeningToken(MOCK_PAYLOAD);
    const tampered = token.slice(0, -2) + "XX";
    const result = verifyScreeningToken(tampered);

    expect(result.valid).toBe(false);
  });

  it("should reject a completely invalid token", () => {
    const result = verifyScreeningToken("not-a-valid-token");

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  it("should reject an empty string token", () => {
    const result = verifyScreeningToken("");

    expect(result.valid).toBe(false);
  });

  it("should reject a status token (wrong scope)", () => {
    // A status-scope token should not verify as a screening token
    const statusToken = createStatusToken({
      applicationId: MOCK_PAYLOAD.applicationId,
      candidateId: MOCK_PAYLOAD.candidateId,
      organizationId: MOCK_PAYLOAD.organizationId,
    });
    const result = verifyScreeningToken(statusToken);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Malformed token");
    }
  });

  it("should reject an expired token", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now);
    const token = createScreeningToken(MOCK_PAYLOAD);

    // Fast-forward 31 days
    vi.spyOn(Date, "now").mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
    const result = verifyScreeningToken(token);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Token has expired");
    }

    vi.restoreAllMocks();
  });

  it("should accept a token within the 30-day window", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now);
    const token = createScreeningToken(MOCK_PAYLOAD);

    // 29 days later — still valid
    vi.spyOn(Date, "now").mockReturnValue(now + 29 * 24 * 60 * 60 * 1000);
    const result = verifyScreeningToken(token);

    expect(result.valid).toBe(true);

    vi.restoreAllMocks();
  });
});
