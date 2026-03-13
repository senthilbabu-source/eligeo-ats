import { describe, it, expect, vi } from "vitest";
import {
  createStatusToken,
  verifyStatusToken,
} from "@/lib/utils/candidate-token";

/**
 * P6-2a: Candidate Status Token Tests
 *
 * Tests for HMAC-signed status tokens used by the candidate portal.
 * D32 §5.1 — 30-day expiry, scope: status, encodes application+candidate+org IDs.
 */

const MOCK_PAYLOAD = {
  applicationId: "11111111-5001-4000-a000-000000000001",
  candidateId: "11111111-4001-4000-a000-000000000001",
  organizationId: "11111111-2001-4000-a000-000000000001",
};

describe("P6-2a: createStatusToken", () => {
  it("should create a base64url-encoded token", () => {
    const token = createStatusToken(MOCK_PAYLOAD);

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    // Should be base64url safe (no +, /, or =)
    expect(token).not.toMatch(/[+/=]/);
  });

  it("should produce different tokens for different payloads", () => {
    const token1 = createStatusToken(MOCK_PAYLOAD);
    const token2 = createStatusToken({
      ...MOCK_PAYLOAD,
      applicationId: "22222222-5001-4000-a000-000000000001",
    });

    expect(token1).not.toBe(token2);
  });
});

describe("P6-2a: verifyStatusToken", () => {
  it("should verify a valid token and return the payload", () => {
    const token = createStatusToken(MOCK_PAYLOAD);
    const result = verifyStatusToken(token);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.applicationId).toBe(MOCK_PAYLOAD.applicationId);
      expect(result.payload.candidateId).toBe(MOCK_PAYLOAD.candidateId);
      expect(result.payload.organizationId).toBe(MOCK_PAYLOAD.organizationId);
    }
  });

  it("should reject a tampered token", () => {
    const token = createStatusToken(MOCK_PAYLOAD);
    // Tamper with the token by flipping a character
    const tampered = token.slice(0, -2) + "XX";
    const result = verifyStatusToken(tampered);

    expect(result.valid).toBe(false);
  });

  it("should reject a completely invalid token", () => {
    const result = verifyStatusToken("not-a-valid-token");

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBeDefined();
    }
  });

  it("should reject an empty string token", () => {
    const result = verifyStatusToken("");

    expect(result.valid).toBe(false);
  });

  it("should reject an expired token", () => {
    // Advance time past 30-day expiry
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now);
    const token = createStatusToken(MOCK_PAYLOAD);

    // Fast-forward 31 days
    vi.spyOn(Date, "now").mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
    const result = verifyStatusToken(token);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("Token has expired");
    }

    vi.restoreAllMocks();
  });

  it("should accept a token within the 30-day window", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValueOnce(now);
    const token = createStatusToken(MOCK_PAYLOAD);

    // 29 days later — still valid
    vi.spyOn(Date, "now").mockReturnValue(now + 29 * 24 * 60 * 60 * 1000);
    const result = verifyStatusToken(token);

    expect(result.valid).toBe(true);

    vi.restoreAllMocks();
  });
});
