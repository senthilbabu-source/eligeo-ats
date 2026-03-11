import { requireAuthAPI } from "@/lib/auth/api";
import { can } from "@/lib/constants/roles";
import { streamJobDescription, buildIntentContext } from "@/lib/ai/generate";
import { problemResponse } from "@/lib/utils/problem";
import { checkCsrf } from "@/lib/utils/csrf";
import { createClient } from "@/lib/supabase/server";
import type { JobMetadata } from "@/lib/types/ground-truth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  const { session, error } = await requireAuthAPI();
  if (error) return error;

  if (!can(session.orgRole, "jobs:edit")) {
    return problemResponse(403, "ATS-AU04", "Insufficient permissions");
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("job_openings")
    .select("title, department, description, metadata")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!job) {
    return problemResponse(404, "ATS-J01", "Job not found");
  }

  // B2: inject clone intent context into the rewrite prompt when available
  const meta = (job.metadata ?? {}) as JobMetadata;
  const cloneIntent = meta.clone_intent ?? null;
  const intentContext = cloneIntent ? buildIntentContext(cloneIntent) : null;

  const keyPoints = [
    job.description
      ? `Existing description (improve and expand on this):\n${job.description.slice(0, 800)}`
      : null,
    intentContext ? `Context for this rewrite: ${intentContext}` : null,
  ]
    .filter(Boolean)
    .join("\n\n") || undefined;

  const result = await streamJobDescription({
    title: job.title,
    department: job.department ?? undefined,
    keyPoints,
    organizationId: session.orgId,
    userId: session.userId,
  });

  if (!result) {
    return problemResponse(402, "ATS-AI02", "Insufficient AI credits");
  }

  return result.toTextStreamResponse();
}
