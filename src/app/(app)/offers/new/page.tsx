import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { createClient } from "@/lib/supabase/server";
import { OfferForm } from "./offer-form";

export const metadata: Metadata = {
  title: "Create Offer",
};

export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  assertCan(session.orgRole, "offers:create");

  const sp = await searchParams;
  const applicationId = typeof sp.applicationId === "string" ? sp.applicationId : null;

  if (!applicationId) {
    notFound();
  }

  const supabase = await createClient();

  // Fetch application with candidate and job info
  const { data: application } = await supabase
    .from("applications")
    .select("id, candidate_id, job_opening_id")
    .eq("id", applicationId)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!application) notFound();

  // Parallel: candidate, job, org members (for approver selection), org currency
  const [
    { data: candidate },
    { data: job },
    { data: members },
    { data: org },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, email")
      .eq("id", application.candidate_id)
      .single(),
    supabase
      .from("job_openings")
      .select("id, title, department")
      .eq("id", application.job_opening_id)
      .single(),
    supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", session.orgId)
      .is("deleted_at", null),
    supabase
      .from("organizations")
      .select("name, default_currency")
      .eq("id", session.orgId)
      .single(),
  ]);

  if (!candidate || !job) notFound();

  // Resolve member names for approver picker
  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase.from("user_profiles").select("id, full_name, email").in("id", memberIds)
    : { data: [] };

  const approverOptions = (members ?? [])
    .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "hiring_manager")
    .map((m) => {
      const profile = (profiles ?? []).find((p) => p.id === m.user_id);
      return {
        id: m.user_id,
        name: profile?.full_name ?? profile?.email ?? m.user_id,
        role: m.role,
      };
    })
    .filter((a) => a.id !== session.userId); // Exclude self from approvers

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Create Offer</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {candidate.full_name} &middot; {job.title}
        {job.department ? ` · ${job.department}` : ""}
      </p>

      <OfferForm
        applicationId={applicationId}
        candidateName={candidate.full_name}
        jobTitle={job.title}
        department={job.department ?? undefined}
        defaultCurrency={org?.default_currency ?? "USD"}
        approverOptions={approverOptions}
        organizationName={org?.name ?? undefined}
      />
    </div>
  );
}
