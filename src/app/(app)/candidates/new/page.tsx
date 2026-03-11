import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { assertCan } from "@/lib/constants/roles";
import { CandidateForm } from "./candidate-form";

export const metadata: Metadata = {
  title: "Add Candidate — Eligeo",
};

export default async function NewCandidatePage() {
  const session = await requireAuth();
  assertCan(session.orgRole, "candidates:create");

  const supabase = await createClient();

  const { data: sources } = await supabase
    .from("candidate_sources")
    .select("id, name, source_type")
    .order("name");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add Candidate</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manually add a candidate to the talent pool.
      </p>
      <div className="mt-8">
        <CandidateForm sources={sources ?? []} />
      </div>
    </div>
  );
}
