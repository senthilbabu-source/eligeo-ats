import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/constants/roles";
import { PoolActions } from "./pool-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("talent_pools").select("name").eq("id", id).single();
  return { title: `${data?.name ?? "Pool"} — Eligeo` };
}

export default async function TalentPoolDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const session = await requireAuth();
  const supabase = await createClient();

  // Fetch pool
  const { data: pool } = await supabase
    .from("talent_pools")
    .select("id, name, description")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!pool) notFound();

  // Fetch members with candidate details
  const membersQuery = supabase
    .from("talent_pool_members")
    .select(`
      id, notes, created_at,
      candidates!inner(id, full_name, current_title, current_company, email, source)
    `)
    .eq("talent_pool_id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: members } = await membersQuery;

  // Client-side search filter (name/title/company)
  const search = q?.toLowerCase() ?? "";
  const filtered = (members ?? []).filter((m) => {
    const c = (Array.isArray(m.candidates) ? m.candidates[0] : m.candidates) as {
      full_name: string;
      current_title?: string | null;
      current_company?: string | null;
    } | null;
    if (!c) return false;
    if (!search) return true;
    return (
      c.full_name.toLowerCase().includes(search) ||
      c.current_title?.toLowerCase().includes(search) ||
      c.current_company?.toLowerCase().includes(search)
    );
  });

  // Fetch all non-member candidates for "Add Candidate" dropdown
  const memberCandidateIds = (members ?? []).map((m) => {
    const c = (Array.isArray(m.candidates) ? m.candidates[0] : m.candidates) as { id: string } | null;
    return c?.id;
  }).filter(Boolean) as string[];

  const { data: allCandidates } = await supabase
    .from("candidates")
    .select("id, full_name, current_title")
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .not("id", "in", memberCandidateIds.length > 0 ? `(${memberCandidateIds.join(",")})` : "(00000000-0000-0000-0000-000000000000)")
    .order("full_name");

  const canManage = can(session.orgRole, "candidates:create");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href="/talent-pools"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Talent Pools
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{pool.name}</h1>
          {pool.description && (
            <p className="mt-1 text-sm text-muted-foreground">{pool.description}</p>
          )}
        </div>
        <span className="mt-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {(members ?? []).length} candidates
        </span>
      </div>

      {/* PoolActions — Add candidate + Delete pool (client component) */}
      <PoolActions
        poolId={pool.id}
        availableCandidates={allCandidates ?? []}
        canManage={canManage}
      />

      {/* Search filter */}
      <form method="GET" className="mt-4">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by name, title, or company…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </form>

      {/* Member list */}
      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? "No candidates match your search." : "No candidates in this pool yet."}
            </p>
          </div>
        ) : (
          filtered.map((member) => {
            const candidate = (Array.isArray(member.candidates) ? member.candidates[0] : member.candidates) as {
              id: string;
              full_name: string;
              current_title?: string | null;
              current_company?: string | null;
              source?: string | null;
            } | null;

            return (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/candidates/${candidate?.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {candidate?.full_name ?? "Unknown"}
                  </Link>
                  {candidate?.current_title && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {candidate.current_title}
                      {candidate.current_company && ` at ${candidate.current_company}`}
                    </p>
                  )}
                  {member.notes && (
                    <p className="mt-1 text-xs italic text-muted-foreground">{member.notes}</p>
                  )}
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-3">
                  {candidate?.source && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {candidate.source}
                    </span>
                  )}
                  {canManage && (
                    <PoolActions
                      poolId={pool.id}
                      memberId={member.id}
                      mode="remove"
                      availableCandidates={[]}
                      canManage={canManage}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
