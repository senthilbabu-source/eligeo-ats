import logger from "@/lib/utils/logger";

export type InteractionType =
  | "email_sent"
  | "resume_parsed"
  | "stage_changed"
  | "offer_created"
  | "offer_approved"
  | "offer_sent"
  | "offer_signed"
  | "offer_rejected"
  | "offer_withdrawn"
  | "scorecard_submitted"
  | "interview_scheduled"
  | "ai_match_scored";

/**
 * H3-1: Records an interaction on the candidate timeline.
 *
 * Creates a `candidate_notes` entry for automated actions so that
 * recruiters see a complete activity history — not just manual notes.
 *
 * Accepts any Supabase client (user-scoped or service role) so it can
 * be called from both Server Actions and Inngest background functions.
 *
 * For Inngest calls: pass the service client + a system user ID as actorId.
 * For Server Action calls: pass the user client + session.userId as actorId.
 */
export async function recordInteraction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    candidateId: string;
    organizationId: string;
    actorId: string;
    type: InteractionType;
    summary: string;
  },
): Promise<void> {
  const { candidateId, organizationId, actorId, type, summary } = params;

  const content = `[${type}] ${summary}`;

  const { error } = await supabase.from("candidate_notes").insert({
    organization_id: organizationId,
    candidate_id: candidateId,
    content,
    created_by: actorId,
  });

  if (error) {
    // Log but don't throw — interaction recording should not block the primary action
    logger.warn(
      { error, candidateId, type },
      "Failed to record interaction on candidate timeline",
    );
  }
}
