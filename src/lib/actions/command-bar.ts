"use server";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseIntent, type ParsedIntent } from "@/lib/ai/intent";

export async function executeCommand(
  input: string,
): Promise<{
  intent: ParsedIntent;
  results?: Array<{ id: string; title: string; subtitle?: string; href: string }>;
}> {
  const session = await requireAuth();

  const intent = await parseIntent({
    input,
    organizationId: session.orgId,
    userId: session.userId,
  });

  // For search intents, execute the search and return results
  if (
    intent.action === "search_candidates" ||
    intent.action === "search_jobs"
  ) {
    const supabase = await createClient();
    const query = intent.params.query ?? "";

    if (intent.action === "search_candidates" && query) {
      const { data } = await supabase
        .from("candidates")
        .select("id, full_name, email, current_title")
        .or(
          `full_name.ilike.%${query}%,email.ilike.%${query}%,current_title.ilike.%${query}%`,
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
      const { data } = await supabase
        .from("job_openings")
        .select("id, title, department, status")
        .or(`title.ilike.%${query}%,department.ilike.%${query}%`)
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

  return { intent };
}
