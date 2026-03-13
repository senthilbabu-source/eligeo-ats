import { verifyScreeningToken } from "@/lib/utils/candidate-token";
import { createServiceClient } from "@/lib/supabase/server";
import { ScreeningPortal } from "./screening-portal";
import type { ScreeningQuestion, ScreeningTurn } from "@/lib/types/ground-truth";

/**
 * D32 §7.5 — Candidate screening portal page.
 * /careers/[slug]/screen/[sessionId]?token=xxx
 */
export default async function ScreeningPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, sessionId } = await params;
  const resolvedParams = await searchParams;
  const token = (resolvedParams.token as string) ?? "";

  // Verify token
  const result = verifyScreeningToken(token);
  if (!result.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Invalid Link</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This screening link is invalid or has expired. Please contact the recruiter
            for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (result.payload.sessionId !== sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link does not match the screening session.
          </p>
        </div>
      </div>
    );
  }

  const supabase = createServiceClient();
  const { organizationId } = result.payload;

  // Load session
  const { data: session } = await supabase
    .from("screening_sessions")
    .select("*, screening_configs!inner(questions, instructions, max_duration_min)")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .single();

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This screening session could not be found.
          </p>
        </div>
      </div>
    );
  }

  // Get org and job info
  const { data: org } = await supabase
    .from("organizations")
    .select("name, subscription_tier")
    .eq("id", organizationId)
    .single();

  const { data: app } = await supabase
    .from("applications")
    .select("job_opening_id")
    .eq("id", session.application_id)
    .single();

  let jobTitle = "this position";
  if (app) {
    const { data: job } = await supabase
      .from("job_openings")
      .select("title")
      .eq("id", app.job_opening_id)
      .single();
    if (job) jobTitle = job.title;
  }

  const config = session.screening_configs as unknown as {
    questions: ScreeningQuestion[];
    instructions: string | null;
    max_duration_min: number;
  };

  const isGrowthPlus = ["growth", "pro", "enterprise"].includes(
    org?.subscription_tier ?? "starter",
  );

  return (
    <div className="min-h-screen bg-background">
      <ScreeningPortal
        sessionId={sessionId}
        token={token}
        status={session.status}
        questions={config.questions}
        existingTurns={(session.turns ?? []) as ScreeningTurn[]}
        jobTitle={jobTitle}
        orgName={org?.name ?? "the company"}
        maxDurationMin={config.max_duration_min}
        isGrowthPlus={isGrowthPlus}
        humanReviewRequested={session.human_review_requested}
      />
    </div>
  );
}
