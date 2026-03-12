import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parsePagination, buildPaginationMeta } from "@/lib/utils/pagination";
import { Pagination } from "@/components/pagination";
import type { OfferStatus } from "@/lib/types/ground-truth";

export const metadata: Metadata = {
  title: "Offers",
};

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  sent: "bg-cyan-100 text-cyan-700",
  signed: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-orange-100 text-orange-700",
  withdrawn: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  sent: "Sent",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const supabase = await createClient();
  const sp = await searchParams;
  const params = parsePagination(sp);
  const statusFilter = typeof sp.status === "string" ? sp.status : undefined;

  let query = supabase
    .from("offers")
    .select(
      "id, status, compensation, start_date, expiry_date, sent_at, signed_at, candidate_id, job_id, created_at",
      { count: "exact" },
    )
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(params.from, params.to);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data: offers, count } = await query;

  // Pre-fetch candidate and job names
  const candidateIds = [...new Set((offers ?? []).map((o) => o.candidate_id))];
  const jobIds = [...new Set((offers ?? []).map((o) => o.job_id))];

  const [{ data: candidates }, { data: jobs }] = await Promise.all([
    candidateIds.length
      ? supabase.from("candidates").select("id, full_name").in("id", candidateIds)
      : { data: [] },
    jobIds.length
      ? supabase.from("job_openings").select("id, title").in("id", jobIds)
      : { data: [] },
  ]);

  const candidateMap = Object.fromEntries(
    (candidates ?? []).map((c) => [c.id, c.full_name]),
  );
  const jobMap = Object.fromEntries(
    (jobs ?? []).map((j) => [j.id, j.title]),
  );

  const meta = buildPaginationMeta(count ?? 0, params);
  const statuses: OfferStatus[] = [
    "draft",
    "pending_approval",
    "approved",
    "sent",
    "signed",
    "declined",
    "expired",
    "withdrawn",
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Offers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.totalCount} offer{meta.totalCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="mt-4 flex gap-1 overflow-x-auto">
        <Link
          href="/offers"
          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            !statusFilter
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          All
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/offers?status=${s}`}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {(offers ?? []).map((offer) => {
          const comp = offer.compensation as { base_salary?: number; currency?: string; period?: string } | null;
          const candidateName = candidateMap[offer.candidate_id] ?? "Unknown";
          const jobTitle = jobMap[offer.job_id] ?? "Unknown";

          return (
            <Link
              key={offer.id}
              href={`/offers/${offer.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium">{candidateName}</h3>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[offer.status] ?? ""}`}
                  >
                    {STATUS_LABELS[offer.status] ?? offer.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>{jobTitle}</span>
                  {comp?.base_salary && comp.currency && (
                    <span>
                      {formatCurrency(comp.base_salary, comp.currency)}/{comp.period ?? "annual"}
                    </span>
                  )}
                  {offer.start_date && <span>Starts {formatDate(offer.start_date)}</span>}
                  <span>Created {formatDate(offer.created_at)}</span>
                </div>
              </div>
            </Link>
          );
        })}

        {(!offers || offers.length === 0) && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            <p>No offers{statusFilter ? ` with status "${STATUS_LABELS[statusFilter]}"` : ""} yet.</p>
            <p className="mt-1 text-sm">
              Create offers from the{" "}
              <Link href="/candidates" className="text-primary hover:underline">
                candidate profile
              </Link>
            </p>
          </div>
        )}
      </div>

      <Pagination meta={meta} basePath="/offers" />
    </div>
  );
}
