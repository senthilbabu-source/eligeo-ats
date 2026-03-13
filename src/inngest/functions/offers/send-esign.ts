import * as Sentry from "@sentry/nextjs";
import { inngest } from "@/inngest/client";
import { createServiceClient } from "@/lib/supabase/server";
import { createSignatureEnvelope } from "@/lib/esign/dropbox-sign";
import { generateOfferLetterDraft } from "@/lib/ai/generate";
import type { OfferCompensation } from "@/lib/types/ground-truth";
import logger from "@/lib/utils/logger";

/**
 * offers/send-esign
 *
 * Triggered when a recruiter sends an approved offer.
 * Steps:
 * 1. Fetch offer + candidate + org + compensation
 * 2. Generate AI offer letter (Pro+ only)
 * 3. Create Dropbox Sign envelope via template
 * 4. Update offer status to 'sent' with sent_at + esign_envelope_id
 * 5. Notify recruiter that offer was sent
 *
 * Per D06 §4.2: Retries 5 times with exponential backoff.
 * If all retries fail, offer stays 'approved' and recruiter is notified.
 *
 * Concurrency: 5 per org. Retries: 5 (for external API reliability).
 */
export const offerSendEsign = inngest.createFunction(
  {
    id: "offers-send-esign",
    name: "Offers: Send E-Sign",
    retries: 5,
    concurrency: [{ scope: "fn", key: "event.data.organizationId", limit: 5 }],
  },
  { event: "ats/offer.send-requested" },
  async ({ event, step }) => {
    const { offerId, organizationId, requestedBy: _requestedBy } = event.data as {
      offerId: string;
      organizationId: string;
      requestedBy: string;
    };

    // ── Step 1: Fetch offer details ──────────────────────
    const offer = await step.run("fetch-offer", async () => {
      const supabase = createServiceClient();

      const { data, error } = await supabase
        .from("offers")
        .select("id, candidate_id, job_id, created_by, compensation, terms, esign_provider, status")
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .single();

      if (error || !data) {
        Sentry.captureException(error);
        throw new Error(`Offer not found: ${offerId}`);
      }

      if (data.status !== "approved") {
        throw new Error(`Offer must be approved to send, current status: ${data.status}`);
      }

      return data;
    });

    // ── Step 2: Resolve candidate, job, and org info ─────
    const context = await step.run("resolve-context", async () => {
      const supabase = createServiceClient();

      const [candRes, jobRes, orgRes] = await Promise.all([
        supabase
          .from("candidates")
          .select("full_name, email")
          .eq("id", offer.candidate_id)
          .single(),
        supabase
          .from("job_openings")
          .select("title, department")
          .eq("id", offer.job_id)
          .single(),
        supabase
          .from("organizations")
          .select("name, plan, dropbox_sign_template_id")
          .eq("id", organizationId)
          .single(),
      ]);

      return {
        candidateName: candRes.data?.full_name ?? "Unknown",
        candidateEmail: candRes.data?.email ?? null,
        jobTitle: jobRes.data?.title ?? "Unknown",
        department: jobRes.data?.department ?? undefined,
        orgName: orgRes.data?.name ?? "Unknown",
        orgPlan: (orgRes.data?.plan as string) ?? "starter",
        orgTemplateId: (orgRes.data?.dropbox_sign_template_id as string) ?? null,
      };
    });

    if (!context.candidateEmail) {
      throw new Error(`Candidate ${offer.candidate_id} has no email address`);
    }

    // ── Step 3: Generate AI offer letter (Pro+ only) ─────
    const offerLetterBody = await step.run("generate-offer-letter", async () => {
      const isProPlus = context.orgPlan === "pro" || context.orgPlan === "enterprise";
      if (!isProPlus) return null;

      const comp = (offer.compensation ?? {}) as OfferCompensation;
      if (!comp.base_salary) return null;

      try {
        const result = await generateOfferLetterDraft({
          candidateName: context.candidateName,
          jobTitle: context.jobTitle,
          department: context.department,
          compensation: comp,
          startDate: (offer.terms as Record<string, string> | null)?.start_date ?? undefined,
          organizationName: context.orgName,
          organizationId,
        });

        return result.text ?? null;
      } catch (err) {
        logger.warn({ error: err, offerId }, "AI offer letter generation failed — using template only");
        Sentry.captureException(err);
        return null;
      }
    });

    // ── Step 4: Create Dropbox Sign envelope ─────────────
    const envelopeId = await step.run("create-esign-envelope", async () => {
      const templateId =
        context.orgTemplateId ??
        process.env.DROPBOX_SIGN_TEMPLATE_ID;

      if (!templateId) {
        throw new Error("No Dropbox Sign template ID configured (org or env)");
      }

      const comp = (offer.compensation ?? {}) as OfferCompensation;

      const customFields: Array<{ name: string; value: string }> = [
        { name: "candidate_name", value: context.candidateName },
        { name: "job_title", value: context.jobTitle },
      ];

      const termsObj = offer.terms as Record<string, string> | null;
      if (termsObj?.start_date) {
        customFields.push({
          name: "start_date",
          value: termsObj.start_date,
        });
      }

      if (comp.base_salary) {
        const formatted = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: comp.currency ?? "USD",
          maximumFractionDigits: 0,
        }).format(comp.base_salary);
        customFields.push({ name: "base_salary", value: `${formatted} ${comp.period ?? "annual"}` });
      }

      if (offerLetterBody) {
        customFields.push({ name: "offer_letter_body", value: offerLetterBody });
      }

      const result = await createSignatureEnvelope({
        templateId,
        candidateEmail: context.candidateEmail!,
        candidateName: context.candidateName,
        subject: `Offer Letter — ${context.jobTitle}`,
        message: `Please review and sign your offer letter from ${context.orgName}.`,
        customFields,
        metadata: {
          ats_offer_id: offer.id,
          ats_org_id: organizationId,
        },
      });

      return result.signatureRequestId;
    });

    // ── Step 5: Update offer to 'sent' ───────────────────
    await step.run("update-offer-sent", async () => {
      const supabase = createServiceClient();

      const { error } = await supabase
        .from("offers")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          esign_envelope_id: envelopeId,
        })
        .eq("id", offerId)
        .eq("organization_id", organizationId)
        .eq("status", "approved");

      if (error) {
        Sentry.captureException(error);
        throw new Error(`Failed to update offer status to sent: ${error.message}`);
      }
    });

    // ── Step 6: Notify recruiter ─────────────────────────
    const recruiterEmail = await step.run("resolve-recruiter-email", async () => {
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("user_profiles")
        .select("email")
        .eq("id", offer.created_by)
        .single();
      return data?.email ?? null;
    });

    if (recruiterEmail) {
      await step.sendEvent("notify-offer-sent", {
        name: "ats/notification.requested",
        data: {
          organizationId,
          userId: offer.created_by,
          eventType: "offer.sent",
          recipientEmail: recruiterEmail,
          variables: {
            offer: {
              id: offerId,
              candidateName: context.candidateName,
              candidateEmail: context.candidateEmail,
              jobTitle: context.jobTitle,
            },
          },
        },
      });
    }

    logger.info(
      { offerId, envelopeId, candidateEmail: context.candidateEmail },
      "Offer sent for e-signature via Dropbox Sign",
    );

    return {
      sent: true,
      envelopeId,
      candidateEmail: context.candidateEmail,
      aiLetterGenerated: !!offerLetterBody,
    };
  },
);
