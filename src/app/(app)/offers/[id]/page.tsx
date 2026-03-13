import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/constants/roles";
import { validActions } from "@/lib/offers/state-machine";
import type { OfferStatus, OfferApprovalStatus } from "@/lib/types/ground-truth";
import { OfferActions } from "./offer-actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Offer ${id.slice(0, 8)}` };
}

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

const APPROVAL_STATUS_STYLES: Record<string, string> = {
  pending: "border-muted-foreground/30 text-muted-foreground",
  approved: "border-emerald-500 text-emerald-700",
  rejected: "border-red-500 text-red-700",
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

function formatDateTime(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();
  const supabase = await createClient();

  // Fetch offer
  const { data: offer } = await supabase
    .from("offers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.orgId)
    .is("deleted_at", null)
    .single();

  if (!offer) notFound();

  // Parallel fetches: approvals, candidate, job, org
  const [{ data: approvals }, { data: candidate }, { data: job }, { data: org }] = await Promise.all([
    supabase
      .from("offer_approvals")
      .select("id, approver_id, sequence_order, status, decided_at, notes")
      .eq("offer_id", id)
      .eq("organization_id", session.orgId)
      .is("deleted_at", null)
      .order("sequence_order", { ascending: true }),
    supabase
      .from("candidates")
      .select("id, full_name, email, current_title")
      .eq("id", offer.candidate_id)
      .single(),
    supabase
      .from("job_openings")
      .select("id, title, department")
      .eq("id", offer.job_id)
      .single(),
    supabase
      .from("organizations")
      .select("name, plan")
      .eq("id", session.orgId)
      .single(),
  ]);

  // Resolve approver names
  const approverIds = (approvals ?? []).map((a) => a.approver_id);
  const { data: approverProfiles } = approverIds.length
    ? await supabase.from("user_profiles").select("id, full_name, email").in("id", approverIds)
    : { data: [] };

  const approverMap = Object.fromEntries(
    (approverProfiles ?? []).map((p) => [p.id, { name: p.full_name ?? p.email, email: p.email }]),
  );

  const comp = offer.compensation as {
    base_salary?: number;
    currency?: string;
    period?: string;
    bonus_pct?: number;
    bonus_amount?: number;
    equity_shares?: number;
    equity_type?: string;
    equity_vesting?: string;
    sign_on_bonus?: number;
    relocation?: number;
    other_benefits?: string[];
  } | null;

  const status = offer.status as OfferStatus;
  const actions = validActions(status);
  const canCreate = can(session.orgRole, "offers:create");
  const canApprove = can(session.orgRole, "offers:approve");
  const canSubmit = can(session.orgRole, "offers:submit");
  const orgPlan = (org?.plan as string) ?? "starter";
  const isProPlus = orgPlan === "pro" || orgPlan === "enterprise";

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/offers" className="hover:text-foreground">
          Offers
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{candidate?.full_name ?? "Unknown"}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Offer for {candidate?.full_name ?? "Unknown"}
            </h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGES[status] ?? ""}`}
            >
              {STATUS_LABELS[status] ?? status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {job?.title ?? "Unknown"}{job?.department ? ` · ${job.department}` : ""}
          </p>
        </div>

        <OfferActions
          offerId={id}
          status={status}
          actions={actions}
          canCreate={canCreate}
          canApprove={canApprove}
          canSubmit={canSubmit}
          isCurrentApprover={
            approvals?.some(
              (a) =>
                a.approver_id === session.userId &&
                a.status === "pending" &&
                a.sequence_order ===
                  Math.min(
                    ...(approvals ?? [])
                      .filter((x) => x.status === "pending")
                      .map((x) => x.sequence_order),
                  ),
            ) ?? false
          }
          candidateName={candidate?.full_name ?? undefined}
          jobTitle={job?.title ?? undefined}
          department={job?.department ?? undefined}
          compensation={comp?.base_salary ? {
            base_salary: comp.base_salary,
            currency: comp.currency ?? "USD",
            period: (comp.period ?? "annual") as "annual" | "monthly" | "hourly",
            ...(comp.bonus_pct != null ? { bonus_pct: comp.bonus_pct } : {}),
            ...(comp.equity_shares != null ? { equity_shares: comp.equity_shares, equity_type: comp.equity_type as "options" | "rsu" | "phantom" | undefined } : {}),
            ...(comp.equity_vesting ? { equity_vesting: comp.equity_vesting } : {}),
            ...(comp.sign_on_bonus != null ? { sign_on_bonus: comp.sign_on_bonus } : {}),
          } : undefined}
          startDate={offer.start_date ?? undefined}
          organizationName={org?.name ?? undefined}
          isProPlus={isProPlus}
          existingTerms={typeof offer.terms === "string" ? offer.terms : undefined}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Compensation card */}
        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h2 className="text-lg font-medium">Compensation</h2>
          {comp ? (
            <div className="mt-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Base Salary</span>
                <span className="font-medium">
                  {formatCurrency(comp.base_salary ?? 0, comp.currency ?? "USD")}/{comp.period ?? "annual"}
                </span>
              </div>
              {comp.bonus_pct != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Bonus</span>
                  <span>{comp.bonus_pct}%</span>
                </div>
              )}
              {comp.bonus_amount != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Bonus Amount</span>
                  <span>{formatCurrency(comp.bonus_amount, comp.currency ?? "USD")}</span>
                </div>
              )}
              {comp.equity_shares != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Equity</span>
                  <span>
                    {comp.equity_shares.toLocaleString()} {comp.equity_type ?? "shares"}
                    {comp.equity_vesting ? ` (${comp.equity_vesting})` : ""}
                  </span>
                </div>
              )}
              {comp.sign_on_bonus != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Sign-On Bonus</span>
                  <span>{formatCurrency(comp.sign_on_bonus, comp.currency ?? "USD")}</span>
                </div>
              )}
              {comp.relocation != null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Relocation</span>
                  <span>{formatCurrency(comp.relocation, comp.currency ?? "USD")}</span>
                </div>
              )}
              {comp.other_benefits && comp.other_benefits.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">Other Benefits</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {comp.other_benefits.map((b) => (
                      <span
                        key={b}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No compensation data</p>
          )}
        </div>

        {/* Details card */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-medium">Details</h2>
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Candidate</span>
                <p>
                  <Link
                    href={`/candidates/${offer.candidate_id}`}
                    className="text-primary hover:underline"
                  >
                    {candidate?.full_name ?? "Unknown"}
                  </Link>
                </p>
                {candidate?.email && (
                  <p className="text-muted-foreground">{candidate.email}</p>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Position</span>
                <p>
                  <Link
                    href={`/jobs/${offer.job_id}`}
                    className="text-primary hover:underline"
                  >
                    {job?.title ?? "Unknown"}
                  </Link>
                </p>
              </div>
              {offer.start_date && (
                <div>
                  <span className="text-muted-foreground">Start Date</span>
                  <p>{formatDate(offer.start_date)}</p>
                </div>
              )}
              {offer.expiry_date && (
                <div>
                  <span className="text-muted-foreground">Expires</span>
                  <p>{formatDate(offer.expiry_date)}</p>
                </div>
              )}
              {offer.sent_at && (
                <div>
                  <span className="text-muted-foreground">Sent</span>
                  <p>{formatDateTime(offer.sent_at)}</p>
                </div>
              )}
              {offer.signed_at && (
                <div>
                  <span className="text-muted-foreground">Signed</span>
                  <p>{formatDateTime(offer.signed_at)}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Created</span>
                <p>{formatDateTime(offer.created_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terms */}
      {offer.terms && (
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-medium">Terms</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {offer.terms}
          </p>
        </div>
      )}

      {/* Approval Timeline */}
      {approvals && approvals.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-medium">Approval Chain</h2>
          <div className="mt-4 space-y-0">
            {approvals.map((approval, idx) => {
              const approver = approverMap[approval.approver_id];
              const approvalStatus = approval.status as OfferApprovalStatus;
              const isLast = idx === approvals.length - 1;

              return (
                <div key={approval.id} className="flex gap-3">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-3 w-3 rounded-full border-2 ${APPROVAL_STATUS_STYLES[approvalStatus] ?? ""} ${
                        approvalStatus === "approved"
                          ? "bg-emerald-500"
                          : approvalStatus === "rejected"
                            ? "bg-red-500"
                            : "bg-card"
                      }`}
                    />
                    {!isLast && (
                      <div className="w-0.5 flex-1 bg-border" />
                    )}
                  </div>

                  {/* Content */}
                  <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {approver?.name ?? "Unknown"}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          approvalStatus === "approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : approvalStatus === "rejected"
                              ? "bg-red-100 text-red-700"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {approvalStatus}
                      </span>
                    </div>
                    {approval.decided_at && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(approval.decided_at)}
                      </p>
                    )}
                    {approval.notes && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {approval.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
