/**
 * Unit Tests: Dropbox Sign HMAC verification + event mapping
 * D32 §6.2 — webhook signature verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  verifyDropboxSignWebhook,
  DROPBOX_SIGN_EVENT_MAP,
} from "@/lib/esign/dropbox-sign";

describe("verifyDropboxSignWebhook", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("should return true for valid HMAC signature", () => {
    const secret = "test-webhook-secret";
    process.env.DROPBOX_SIGN_WEBHOOK_SECRET = secret;

    const payload = '{"event": {"event_type": "signature_request_signed"}}';
    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    expect(verifyDropboxSignWebhook(payload, signature)).toBe(true);
  });

  it("should return false for invalid signature", () => {
    process.env.DROPBOX_SIGN_WEBHOOK_SECRET = "test-webhook-secret";

    const payload = '{"event": {"event_type": "signature_request_signed"}}';
    const badSignature = "0".repeat(64); // wrong sig

    expect(verifyDropboxSignWebhook(payload, badSignature)).toBe(false);
  });

  it("should return false when secret is not configured", () => {
    delete process.env.DROPBOX_SIGN_WEBHOOK_SECRET;

    const payload = '{"data": "test"}';
    const signature = "abc123";

    expect(verifyDropboxSignWebhook(payload, signature)).toBe(false);
  });

  it("should return false for tampered payload", () => {
    const secret = "test-webhook-secret";
    process.env.DROPBOX_SIGN_WEBHOOK_SECRET = secret;

    const originalPayload = '{"original": true}';
    const signature = crypto
      .createHmac("sha256", secret)
      .update(originalPayload)
      .digest("hex");

    const tamperedPayload = '{"tampered": true}';
    expect(verifyDropboxSignWebhook(tamperedPayload, signature)).toBe(false);
  });
});

describe("DROPBOX_SIGN_EVENT_MAP", () => {
  it("should map signature_request_signed to signed status", () => {
    const mapping = DROPBOX_SIGN_EVENT_MAP["signature_request_signed"]!;
    expect(mapping).toBeDefined();
    expect(mapping.offerStatus).toBe("signed");
    expect(mapping.inngestEvent).toBe("dropboxsign/webhook.received");
  });

  it("should map signature_request_declined to declined status", () => {
    const mapping = DROPBOX_SIGN_EVENT_MAP["signature_request_declined"]!;
    expect(mapping).toBeDefined();
    expect(mapping.offerStatus).toBe("declined");
  });

  it("should map signature_request_canceled to withdrawn status", () => {
    const mapping = DROPBOX_SIGN_EVENT_MAP["signature_request_canceled"]!;
    expect(mapping).toBeDefined();
    expect(mapping.offerStatus).toBe("withdrawn");
  });

  it("should not map unknown events", () => {
    const mapping = DROPBOX_SIGN_EVENT_MAP["unknown_event"];
    expect(mapping).toBeUndefined();
  });
});
