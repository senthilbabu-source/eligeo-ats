import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";
import { parsePagination, buildPaginationMeta } from "@/lib/utils/pagination";
import { Pagination } from "@/components/pagination";

export const metadata: Metadata = {
  title: "Candidates",
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const supabase = await createClient();
  const params = parsePagination(await searchParams);

  const { data: candidates, count } = await supabase
    .from("candidates")
    .select(
      "id, full_name, email, current_title, current_company, location, source, skills, tags, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(params.from, params.to);

  const meta = buildPaginationMeta(count ?? 0, params);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.totalCount} candidate{meta.totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        {can(session.orgRole, "candidates:create") && (
          <Link
            href="/candidates/new"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add Candidate
          </Link>
        )}
      </div>

      <div className="mt-6">
        <table className="w-full text-data-dense">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="pb-3 pr-4">Name</th>
              <th className="pb-3 pr-4">Title</th>
              <th className="pb-3 pr-4">Location</th>
              <th className="pb-3 pr-4">Source</th>
              <th className="pb-3 pr-4">Skills</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {candidates?.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="py-3 pr-4">
                  <Link
                    href={`/candidates/${c.id}`}
                    className="font-medium text-foreground hover:text-primary"
                  >
                    {c.full_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {c.current_title}
                  {c.current_company && (
                    <span className="text-xs"> at {c.current_company}</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {c.location}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{c.source}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {(c.skills as string[])?.slice(0, 3).map((skill) => (
                      <span
                        key={skill}
                        className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                      >
                        {skill}
                      </span>
                    ))}
                    {(c.skills as string[])?.length > 3 && (
                      <span className="text-xs text-muted-foreground">
                        +{(c.skills as string[]).length - 3}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!candidates || candidates.length === 0) && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            <p>No candidates yet.</p>
          </div>
        )}
      </div>

      <Pagination meta={meta} basePath="/candidates" />
    </div>
  );
}
