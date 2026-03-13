import crypto from "crypto";
import * as DropboxSign from "@dropbox/sign";
import logger from "@/lib/utils/logger";

// ── Client ─────────────────────────────────────────────────

let _client: DropboxSign.SignatureRequestApi | null = null;

export function getDropboxSignClient(): DropboxSign.SignatureRequestApi {
  if (!_client) {
    _client = new DropboxSign.SignatureRequestApi();
    _client.username = process.env.DROPBOX_SIGN_API_KEY!;
  }
  return _client;
}

// ── Webhook HMAC Verification ──────────────────────────────

/**
 * Verify a Dropbox Sign webhook signature using HMAC-SHA256.
 * Returns true if the signature is valid.
 */
export function verifyDropboxSignWebhook(
  payload: string,
  signature: string,
): boolean {
  const secret = process.env.DROPBOX_SIGN_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("DROPBOX_SIGN_WEBHOOK_SECRET not configured");
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (expected.length !== signature.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex"),
  );
}

// ── Envelope Creation ──────────────────────────────────────

export interface CreateEnvelopeParams {
  templateId: string;
  candidateEmail: string;
  candidateName: string;
  subject: string;
  message: string;
  customFields: Array<{ name: string; value: string }>;
  metadata: Record<string, string>;
  testMode?: boolean;
}

/**
 * Create a Dropbox Sign signature request using a template.
 * Returns the signature_request_id (stored as esign_envelope_id).
 */
export async function createSignatureEnvelope(
  params: CreateEnvelopeParams,
): Promise<{ signatureRequestId: string; signingUrl?: string }> {
  const client = getDropboxSignClient();

  const request = DropboxSign.SignatureRequestSendWithTemplateRequest.init({
    templateIds: [params.templateId],
    subject: params.subject,
    message: params.message,
    signers: [
      DropboxSign.SubSignatureRequestTemplateSigner.init({
        emailAddress: params.candidateEmail,
        name: params.candidateName,
        role: "Candidate",
      }),
    ],
    customFields: params.customFields.map((f) =>
      DropboxSign.SubCustomField.init({
        name: f.name,
        value: f.value,
      }),
    ),
    metadata: params.metadata,
    testMode: params.testMode ?? process.env.NODE_ENV !== "production",
  });

  const { body } = await client.signatureRequestSendWithTemplate(request);
  const sr = body.signatureRequest;

  if (!sr?.signatureRequestId) {
    throw new Error("Dropbox Sign did not return a signature_request_id");
  }

  return {
    signatureRequestId: sr.signatureRequestId,
    signingUrl: sr.signingUrl ?? undefined,
  };
}

// ── Envelope Cancellation ──────────────────────────────────

/**
 * Cancel (void) a Dropbox Sign signature request.
 */
export async function cancelSignatureEnvelope(
  signatureRequestId: string,
): Promise<void> {
  const client = getDropboxSignClient();
  await client.signatureRequestCancel(signatureRequestId);
}

// ── Webhook Event Mapping ──────────────────────────────────

/**
 * Map Dropbox Sign webhook event types to offer status transitions.
 */
export const DROPBOX_SIGN_EVENT_MAP: Record<
  string,
  { offerStatus: string; inngestEvent: string }
> = {
  signature_request_signed: {
    offerStatus: "signed",
    inngestEvent: "dropboxsign/webhook.received",
  },
  signature_request_declined: {
    offerStatus: "declined",
    inngestEvent: "dropboxsign/webhook.received",
  },
  signature_request_canceled: {
    offerStatus: "withdrawn",
    inngestEvent: "dropboxsign/webhook.received",
  },
};
