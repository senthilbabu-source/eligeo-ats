import { createHmac } from "crypto";

const SECRET = process.env.CANDIDATE_TOKEN_SECRET ?? "dev-fallback-secret";

/** Status tokens last 30 days — long enough for a typical hiring cycle */
const STATUS_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

interface StatusTokenPayload {
  applicationId: string;
  candidateId: string;
  organizationId: string;
}

/**
 * D32 §5.1 — Create an HMAC-signed status token for the candidate portal.
 * Encodes application + candidate + org IDs with 30-day expiry.
 * Scope is implicit ("status") — separate from email verification tokens.
 */
export function createStatusToken(payload: StatusTokenPayload): string {
  const { applicationId, candidateId, organizationId } = payload;
  const expiry = Date.now() + STATUS_TOKEN_EXPIRY_MS;
  const raw = `status:${applicationId}:${candidateId}:${organizationId}:${expiry}`;
  const signature = createHmac("sha256", SECRET).update(raw).digest("hex");
  return Buffer.from(`${raw}:${signature}`).toString("base64url");
}

/**
 * Verify and decode a status token. Returns payload if valid, error otherwise.
 */
export function verifyStatusToken(
  token: string,
): { valid: true; payload: StatusTokenPayload } | { valid: false; error: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    // Expected: scope:applicationId:candidateId:organizationId:expiry:signature
    if (parts.length !== 6 || parts[0] !== "status") {
      return { valid: false, error: "Malformed token" };
    }

    const applicationId = parts[1]!;
    const candidateId = parts[2]!;
    const organizationId = parts[3]!;
    const expiryStr = parts[4]!;
    const signature = parts[5]!;

    const raw = `status:${applicationId}:${candidateId}:${organizationId}:${expiryStr}`;
    const expectedSignature = createHmac("sha256", SECRET)
      .update(raw)
      .digest("hex");

    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid token signature" };
    }

    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) {
      return { valid: false, error: "Token has expired" };
    }

    return {
      valid: true,
      payload: { applicationId, candidateId, organizationId },
    };
  } catch {
    return { valid: false, error: "Invalid token" };
  }
}
