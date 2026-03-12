import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Approvals",
};

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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

export default async function ApprovalsPage() {
  const session = await requireAuth();
  const supabase = await createClient();

  // Find all pending approvals for the current user
  const { data: myApprovals } = await supabase
    .from("offer_approvals")
    .select("id, offer_id, sequence_order, status, created_at")
    .eq("organization_id", session.orgId)
    .eq("approver_id", session.userId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  // Fetch the offers for these approvals
  const offerIds = [...new Set((myApprovals ?? []).map((a) => a.offer_id))];

  const { data: offers } = offerIds.length
    ? await supabase
        .from("offers")
        .select("id, status, compensation, candidate_id, job_id, created_at, expiry_date")
        .in("id", offerIds)
        .eq("organization_id", session.orgId)
        .eq("status", "pending_approval")
        .is("deleted_at", null)
    : { data: [] };

  // Filter approvals to only those whose offers are actually pending_approval
  const activeOfferIds = new Set((offers ?? []).map((o) => o.id));
  const activeApprovals = (myApprovals ?? []).filter((a) => activeOfferIds.has(a.offer_id));

  // Check if it's this user's turn (lowest pending sequence_order per offer)
  // We need all approvals per offer to determine ordering
  const allOfferApprovals: Record<
    string,
    Array<{ approver_id: string; sequence_order: number; status: string }>
  > = {};

  if (offerIds.length) {
    const { data: allApprovals } = await supabase
      .from("offer_approvals")
      .select("offer_id, approver_id, sequence_order, status")
      .in("offer_id", offerIds)
      .eq("organization_id", session.orgId)
      .is("deleted_at", null)
      .order("sequence_order", { ascending: true });

    for (const a of allApprovals ?? []) {
      if (!allOfferApprovals[a.offer_id]) allOfferApprovals[a.offer_id] = [];
      allOfferApprovals[a.offer_id]!.push(a);
    }
  }

  // Pre-fetch candidate/job names
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

  // Build display items
  const items = activeApprovals.map((approval) => {
    const offer = (offers ?? []).find((o) => o.id === approval.offer_id);
    const offerApprovals = allOfferApprovals[approval.offer_id] ?? [];
    const firstPending = offerApprovals.find((a) => a.status === "pending");
    const isMyTurn = firstPending?.approver_id === session.userId;
    const comp = offer?.compensation as {
      base_salary?: number;
      currency?: string;
      period?: string;
    } | null;

    return {
      approvalId: approval.id,
      offerId: approval.offer_id,
      candidateName: offer ? candidateMap[offer.candidate_id] ?? "Unknown" : "Unknown",
      jobTitle: offer ? jobMap[offer.job_id] ?? "Unknown" : "Unknown",
      compensation: comp,
      expiryDate: offer?.expiry_date,
      createdAt: offer?.created_at ?? approval.created_at,
      isMyTurn,
      sequenceOrder: approval.sequence_order,
      totalApprovers: offerApprovals.length,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length} pending approval{items.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="mt-6 space-y-2">
        {items.map((item) => (
          <Link
            key={item.approvalId}
            href={`/offers/${item.offerId}`}
            className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-medium">{item.candidateName}</h3>
                {item.isMyTurn ? (
                  <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Your turn
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Waiting ({item.sequenceOrder} of {item.totalApprovers})
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>{item.jobTitle}</span>
                {item.compensation?.base_salary && item.compensation.currency && (
                  <span>
                    {formatCurrency(
                      item.compensation.base_salary,
                      item.compensation.currency,
                    )}
                    /{item.compensation.period ?? "annual"}
                  </span>
                )}
                {item.expiryDate && (
                  <span>Expires {formatDate(item.expiryDate)}</span>
                )}
                <span>Created {formatDate(item.createdAt)}</span>
              </div>
            </div>
            {item.isMyTurn && (
              <span className="shrink-0 text-sm font-medium text-primary">
                Review &rarr;
              </span>
            )}
          </Link>
        ))}

        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
            <p>No pending approvals.</p>
            <p className="mt-1 text-sm">
              You&apos;ll see offers here when they need your approval.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
