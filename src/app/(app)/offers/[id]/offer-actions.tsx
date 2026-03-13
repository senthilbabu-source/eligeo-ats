"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  submitForApproval,
  approveOffer,
  rejectOffer,
  withdrawOffer,
  markOfferSigned,
} from "@/lib/actions/offers";
import { OfferLetterPreviewModal } from "@/components/offers/offer-letter-preview-modal";
import type { OfferStatus } from "@/lib/types/ground-truth";
import type { TransitionAction } from "@/lib/offers/state-machine";

export function OfferActions({
  offerId,
  status,
  actions,
  canCreate,
  canApprove,
  canSubmit,
  isCurrentApprover,
  candidateName,
  jobTitle,
  department,
  compensation,
  startDate,
  organizationName,
  isProPlus,
  existingTerms,
}: {
  offerId: string;
  status: OfferStatus;
  actions: TransitionAction[];
  canCreate: boolean;
  canApprove: boolean;
  canSubmit: boolean;
  isCurrentApprover: boolean;
  candidateName?: string;
  jobTitle?: string;
  department?: string;
  compensation?: {
    base_salary: number;
    currency: string;
    period: "annual" | "monthly" | "hourly";
    bonus_pct?: number;
    equity_shares?: number;
    equity_type?: "options" | "rsu" | "phantom";
    equity_vesting?: string;
    sign_on_bonus?: number;
  };
  startDate?: string;
  organizationName?: string;
  isProPlus?: boolean;
  existingTerms?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [showSendModal, setShowSendModal] = useState(false);

  async function handleAction(action: string) {
    setError(null);
    startTransition(async () => {
      let result: { success?: boolean; error?: string };

      switch (action) {
        case "submit":
          result = await submitForApproval(offerId);
          break;
        case "approve_chain_complete":
          result = await approveOffer(offerId);
          break;
        case "withdraw":
          result = await withdrawOffer(offerId);
          break;
        case "mark_signed":
          result = await markOfferSigned(offerId);
          break;
        default:
          result = { error: `Unknown action: ${action}` };
      }

      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  async function handleReject() {
    if (!rejectNotes.trim()) {
      setError("Rejection notes are required");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await rejectOffer(offerId, rejectNotes);
      if (result.error) {
        setError(result.error);
      } else {
        setShowRejectInput(false);
        setRejectNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {/* Submit for Approval */}
        {status === "draft" && actions.includes("submit") && canSubmit && (
          <button
            onClick={() => handleAction("submit")}
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Submit for Approval
          </button>
        )}

        {/* Approve (only current approver) */}
        {status === "pending_approval" && isCurrentApprover && canApprove && (
          <>
            <button
              onClick={() => handleAction("approve_chain_complete")}
              disabled={isPending}
              className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => setShowRejectInput(!showRejectInput)}
              disabled={isPending}
              className="inline-flex h-9 items-center rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}

        {/* Send for E-Sign (approved → sent) */}
        {status === "approved" && actions.includes("send") && canCreate && (
          <button
            onClick={() => setShowSendModal(true)}
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            Send for E-Sign
          </button>
        )}

        {/* Mark Signed (manual fallback) */}
        {(status === "approved" || status === "sent") && canCreate && (
          <button
            onClick={() => handleAction("mark_signed")}
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Mark as Signed
          </button>
        )}

        {/* Withdraw */}
        {actions.includes("withdraw") && canCreate && (
          <button
            onClick={() => handleAction("withdraw")}
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Withdraw
          </button>
        )}
      </div>

      {/* Reject notes input */}
      {showRejectInput && (
        <div className="flex w-full max-w-sm gap-2">
          <input
            type="text"
            placeholder="Reason for rejection..."
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            className="h-9 flex-1 rounded-md border border-border px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleReject}
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Send for E-Sign Modal */}
      {showSendModal && compensation && (
        <OfferLetterPreviewModal
          offerId={offerId}
          candidateName={candidateName ?? "Unknown"}
          jobTitle={jobTitle ?? "Unknown"}
          department={department}
          compensation={compensation}
          startDate={startDate}
          organizationName={organizationName ?? ""}
          existingTerms={existingTerms}
          isProPlus={isProPlus ?? false}
          onClose={() => setShowSendModal(false)}
          onSent={() => {
            setShowSendModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
