import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateDailyBriefing } from "@/inngest/functions/analytics/generate-briefing";
import { generateCandidateEmbedding } from "@/inngest/functions/ai/generate-candidate-embedding";
import { refreshStaleEmbedding } from "@/inngest/functions/ai/refresh-stale-embedding";
import { refreshJobEmbedding } from "@/inngest/functions/ai/refresh-job-embedding";
import { dispatchNotification } from "@/inngest/functions/notifications/dispatch";
import { sendEmailNotification } from "@/inngest/functions/notifications/send-email";
import { interviewReminder } from "@/inngest/functions/notifications/interview-reminder";
import { offerApprovalNotify } from "@/inngest/functions/offers/approval-notify";
import { offerApprovalAdvanced } from "@/inngest/functions/offers/approval-advanced";
import { offerCheckExpiry } from "@/inngest/functions/offers/check-expiry";
import { offerWithdraw } from "@/inngest/functions/offers/withdraw";
import { offerSendEsign } from "@/inngest/functions/offers/send-esign";
import { interviewAutoSummarize } from "@/inngest/functions/interviews/auto-summarize";
import { billingCheckoutCompleted } from "@/inngest/functions/billing/checkout-completed";
import { billingSubscriptionUpdated } from "@/inngest/functions/billing/subscription-updated";
import { billingSubscriptionCanceled } from "@/inngest/functions/billing/subscription-canceled";
import { billingInvoicePaid } from "@/inngest/functions/billing/invoice-paid";
import { billingPaymentFailed } from "@/inngest/functions/billing/payment-failed";
import { billingTrialEnding } from "@/inngest/functions/billing/trial-ending";
import { billingReportOverage } from "@/inngest/functions/billing/report-overage";
import { portalResumeParse } from "@/inngest/functions/portal/resume-parse";
import { processEsignWebhook } from "@/inngest/functions/offers/process-esign-webhook";
import { batchShortlist } from "@/inngest/functions/jobs/batch-shortlist";
import { screeningInviteCandidate } from "@/inngest/functions/screening/invite-candidate";
import { screeningGenerateSummary } from "@/inngest/functions/screening/generate-summary";
import { screeningSendReminder } from "@/inngest/functions/screening/send-reminder";
import { computeAnalyticsSnapshots } from "@/inngest/functions/analytics/compute-snapshots";

/**
 * Inngest endpoint — serves all registered background functions.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateDailyBriefing,
    generateCandidateEmbedding,
    refreshStaleEmbedding,
    refreshJobEmbedding,
    dispatchNotification,
    sendEmailNotification,
    interviewReminder,
    offerApprovalNotify,
    offerApprovalAdvanced,
    offerCheckExpiry,
    offerWithdraw,
    offerSendEsign,
    processEsignWebhook,
    interviewAutoSummarize,
    billingCheckoutCompleted,
    billingSubscriptionUpdated,
    billingSubscriptionCanceled,
    billingInvoicePaid,
    billingPaymentFailed,
    billingTrialEnding,
    billingReportOverage,
    portalResumeParse,
    batchShortlist,
    screeningInviteCandidate,
    screeningGenerateSummary,
    screeningSendReminder,
    computeAnalyticsSnapshots,
  ],
});
