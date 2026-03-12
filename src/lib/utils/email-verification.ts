import { createHmac } from "crypto";

const SECRET = process.env.CANDIDATE_TOKEN_SECRET ?? "dev-fallback-secret";
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * H1-4: Email verification for public apply flow.
 * Creates an HMAC-signed token that encodes candidateId + email + expiry.
 * Used to verify that the applicant controls the email they submitted.
 */
export function createVerificationToken(
  candidateId: string,
  email: string,
): string {
  const expiry = Date.now() + TOKEN_EXPIRY_MS;
  const payload = `${candidateId}:${email}:${expiry}`;
  const signature = createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");
  // Base64url encode the payload + signature for URL safety
  const token = Buffer.from(`${payload}:${signature}`).toString("base64url");
  return token;
}

export function verifyVerificationToken(
  token: string,
): { valid: true; candidateId: string; email: string } | { valid: false; error: string } {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 4) {
      return { valid: false, error: "Malformed token" };
    }

    const candidateId = parts[0]!;
    const email = parts[1]!;
    const expiryStr = parts[2]!;
    const signature = parts[3]!;
    const payload = `${candidateId}:${email}:${expiryStr}`;

    // Verify signature
    const expectedSignature = createHmac("sha256", SECRET)
      .update(payload)
      .digest("hex");
    if (signature !== expectedSignature) {
      return { valid: false, error: "Invalid token signature" };
    }

    // Check expiry
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) {
      return { valid: false, error: "Token has expired" };
    }

    return { valid: true, candidateId, email };
  } catch {
    return { valid: false, error: "Invalid token" };
  }
}
