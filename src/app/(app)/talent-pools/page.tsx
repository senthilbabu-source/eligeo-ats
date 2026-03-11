import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";

export const metadata: Metadata = { title: "Talent Pools — Eligeo" };

export default async function TalentPoolsPage() {
  const session = await requireAuth();
  const supabase = await createClient();

  const { data: pools } = await supabase
    .from("talent_pools")
    .select(`
      id, name, description, created_at,
      talent_pool_members(count)
    `)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const canCreate = can(session.orgRole, "candidates:create");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Talent Pools</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated candidate lists for future roles
          </p>
        </div>
        {canCreate && (
          <Link
            href="/talent-pools/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New Pool
          </Link>
        )}
      </div>

      <div className="mt-8 space-y-3">
        {(pools ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">No talent pools yet.</p>
            {canCreate && (
              <Link
                href="/talent-pools/new"
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                Create your first pool →
              </Link>
            )}
          </div>
        ) : (
          (pools ?? []).map((pool) => {
            const memberCount =
              (pool.talent_pool_members as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <Link
                key={pool.id}
                href={`/talent-pools/${pool.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="font-medium">{pool.name}</p>
                  {pool.description && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {pool.description}
                    </p>
                  )}
                </div>
                <span className="ml-4 shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  {memberCount} {memberCount === 1 ? "candidate" : "candidates"}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
