"use server";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseIntent, type ParsedIntent } from "@/lib/ai/intent";

/** Escape SQL LIKE wildcards to prevent enumeration via % and _ */
function escapeLikeQuery(input: string): string {
  return input.replace(/[%_\\]/g, "\\$&");
}

export interface ConfirmMove {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  targetStageId: string;
  targetStageName: string;
  preview: string;
}

export async function executeCommand(
  input: string,
): Promise<{
  intent: ParsedIntent;
  results?: Array<{ id: string; title: string; subtitle?: string; href: string }>;
  /** Present when move_stage resolved to one or more unambiguous candidate/stage combos */
  confirmMove?: ConfirmMove;
}> {
  const session = await requireAuth();

  const intent = await parseIntent({
    input,
    organizationId: session.orgId,
    userId: session.userId,
  });

  // clone_job: return intent for frontend to open CloneIntentModal pre-filled
  // (frontend must search for job by title and open the modal)
  if (intent.action === "clone_job") {
    const supabase = await createClient();
    const titleQuery = intent.params.title ?? "";
    if (titleQuery) {
      const escaped = titleQuery.replace(/[%_\\]/g, "\\$&");
      const { data } = await supabase
        .from("job_openings")
        .select("id, title, status")
        .eq("organization_id", session.orgId)
        .ilike("title", `%${escaped}%`)
        .is("deleted_at", null)
        .limit(5);

      return {
        intent,
        results: (data ?? []).map((j) => ({
          id: j.id,
          title: j.title,
          subtitle: `Clone → ${j.status}`,
          href: `/jobs/${j.id}`,
        })),
      };
    }
    return { intent };
  }

  // For search intents, execute the search and return results
  if (
    intent.action === "search_candidates" ||
    intent.action === "search_jobs"
  ) {
    const supabase = await createClient();
    const query = intent.params.query ?? "";

    if (intent.action === "search_candidates" && query) {
      const escaped = escapeLikeQuery(query);
      const { data } = await supabase
        .from("candidates")
        .select("id, full_name, email, current_title")
        .eq("organization_id", session.orgId)
        .or(
          `full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,current_title.ilike.%${escaped}%`,
        )
        .is("deleted_at", null)
        .limit(10);

      return {
        intent,
        results: (data ?? []).map((c) => ({
          id: c.id,
          title: c.full_name,
          subtitle: c.current_title ?? c.email,
          href: `/candidates/${c.id}`,
        })),
      };
    }

    if (intent.action === "search_jobs" && query) {
      const escaped = escapeLikeQuery(query);
      const { data } = await supabase
        .from("job_openings")
        .select("id, title, department, status")
        .eq("organization_id", session.orgId)
        .or(`title.ilike.%${escaped}%,department.ilike.%${escaped}%`)
        .is("deleted_at", null)
        .limit(10);

      return {
        intent,
        results: (data ?? []).map((j) => ({
          id: j.id,
          title: j.title,
          subtitle: [j.department, j.status].filter(Boolean).join(" · "),
          href: `/jobs/${j.id}`,
        })),
      };
    }
  }

  // move_stage: resolve candidate → active application → target stage → confirmMove
  if (intent.action === "move_stage") {
    const candidateName = intent.params.candidate ?? "";
    const stageName = intent.params.stage ?? "";

    if (!candidateName || !stageName) return { intent };

    const supabase = await createClient();

    // 1. Find candidates by name (org-scoped)
    const escapedCandidate = escapeLikeQuery(candidateName);
    const { data: candidates } = await supabase
      .from("candidates")
      .select("id, full_name")
      .eq("organization_id", session.orgId)
      .ilike("full_name", `%${escapedCandidate}%`)
      .is("deleted_at", null)
      .limit(5);

    if (!candidates?.length) return { intent };

    const candidateIds = candidates.map((c) => c.id);

    // 2. Get their active applications
    const { data: applications } = await supabase
      .from("applications")
      .select("id, candidate_id, current_stage_id")
      .eq("organization_id", session.orgId)
      .in("candidate_id", candidateIds)
      .eq("status", "active")
      .is("deleted_at", null);

    if (!applications?.length) return { intent };

    // 3. Get current stages to derive pipeline template IDs (pre-fetch + .in() pattern)
    const currentStageIds = [
      ...new Set(
        applications.map((a) => a.current_stage_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: currentStages } = await supabase
      .from("pipeline_stages")
      .select("id, pipeline_template_id")
      .in("id", currentStageIds)
      .is("deleted_at", null);

    const stageToTemplate: Record<string, string> = {};
    for (const s of currentStages ?? []) {
      stageToTemplate[s.id] = s.pipeline_template_id;
    }

    const templateIds = [...new Set(Object.values(stageToTemplate))];
    if (!templateIds.length) return { intent };

    // 4. Find target stage(s) by name in those templates
    const escapedStage = escapeLikeQuery(stageName);
    const { data: targetStages } = await supabase
      .from("pipeline_stages")
      .select("id, name, pipeline_template_id")
      .in("pipeline_template_id", templateIds)
      .ilike("name", `%${escapedStage}%`)
      .is("deleted_at", null);

    if (!targetStages?.length) return { intent };

    const templateToTargetStage: Record<string, { id: string; name: string }> = {};
    for (const s of targetStages) {
      // Prefer exact match over partial; first match wins per template
      if (!templateToTargetStage[s.pipeline_template_id]) {
        templateToTargetStage[s.pipeline_template_id] = { id: s.id, name: s.name };
      }
    }

    // 5. Build move items — one per resolvable application
    const candidateMap = Object.fromEntries(candidates.map((c) => [c.id, c.full_name]));
    const moves: ConfirmMove[] = [];

    for (const app of applications) {
      const templateId = stageToTemplate[app.current_stage_id ?? ""];
      const targetStage = templateId ? templateToTargetStage[templateId] : undefined;
      if (!targetStage) continue;

      const name = candidateMap[app.candidate_id] ?? "Unknown";
      moves.push({
        applicationId: app.id,
        candidateId: app.candidate_id,
        candidateName: name,
        targetStageId: targetStage.id,
        targetStageName: targetStage.name,
        preview: `Move ${name} → ${targetStage.name}`,
      });
    }

    if (!moves.length) return { intent };

    // Single unambiguous match — return confirmMove directly
    if (moves.length === 1) {
      return { intent, confirmMove: moves[0] };
    }

    // Multiple matches — return as navigable results (user picks from list)
    return {
      intent,
      results: moves.map((m) => ({
        id: m.applicationId,
        title: m.candidateName,
        subtitle: `Move → ${m.targetStageName}`,
        href: `/candidates/${m.candidateId}`,
      })),
    };
  }

  // create_offer: search for candidate by name, return results for offer creation
  if (intent.action === "create_offer") {
    const candidateName = intent.params.candidate ?? "";
    if (candidateName) {
      const supabase = await createClient();
      const escaped = escapeLikeQuery(candidateName);
      const { data } = await supabase
        .from("candidates")
        .select("id, full_name, email, current_title")
        .eq("organization_id", session.orgId)
        .ilike("full_name", `%${escaped}%`)
        .is("deleted_at", null)
        .limit(5);

      return {
        intent,
        results: (data ?? []).map((c) => ({
          id: c.id,
          title: c.full_name,
          subtitle: c.current_title ?? c.email,
          href: `/candidates/${c.id}?action=offer`,
        })),
      };
    }
    return { intent };
  }

  // check_offer: search offers, optionally filtered by candidate name
  if (intent.action === "check_offer") {
    const candidateName = intent.params.candidate ?? "";
    const supabase = await createClient();

    if (candidateName) {
      const escaped = escapeLikeQuery(candidateName);
      const { data: candidates } = await supabase
        .from("candidates")
        .select("id, full_name")
        .eq("organization_id", session.orgId)
        .ilike("full_name", `%${escaped}%`)
        .is("deleted_at", null)
        .limit(5);

      if (candidates?.length) {
        const candidateIds = candidates.map((c) => c.id);
        const { data: offers } = await supabase
          .from("offers")
          .select("id, status, candidate_id")
          .eq("organization_id", session.orgId)
          .in("candidate_id", candidateIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(10);

        const nameMap = Object.fromEntries(candidates.map((c) => [c.id, c.full_name]));

        return {
          intent,
          results: (offers ?? []).map((o) => ({
            id: o.id,
            title: nameMap[o.candidate_id] ?? "Unknown",
            subtitle: `Offer: ${o.status}`,
            href: `/offers/${o.id}`,
          })),
        };
      }
    }

    // No candidate filter — show recent offers
    const { data: offers } = await supabase
      .from("offers")
      .select("id, status, candidate_id")
      .eq("organization_id", session.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    const candidateIds = [...new Set((offers ?? []).map((o) => o.candidate_id))];
    const { data: candidateRows } = candidateIds.length
      ? await supabase
          .from("candidates")
          .select("id, full_name")
          .in("id", candidateIds)
      : { data: [] };
    const nameMap = Object.fromEntries((candidateRows ?? []).map((c) => [c.id, c.full_name]));

    return {
      intent,
      results: (offers ?? []).map((o) => ({
        id: o.id,
        title: nameMap[o.candidate_id] ?? "Unknown",
        subtitle: `Offer: ${o.status}`,
        href: `/offers/${o.id}`,
      })),
    };
  }

  return { intent };
}
