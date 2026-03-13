"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MergeModal } from "./merge-modal";

/**
 * D32 §5.4 — Interactive duplicate warning banner.
 * Replaces the static H6-4 banner with a "Review" button that opens the merge modal.
 */
export function DuplicateWarningBanner({
  candidateId,
  organizationId,
  isGrowthPlus,
}: {
  candidateId: string;
  organizationId: string;
  isGrowthPlus: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-medium">{"\u26A0"}</span>
          <p>Possible duplicate detected — review before proceeding.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="shrink-0 rounded-md border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
        >
          Review
        </button>
      </div>

      {showModal && (
        <MergeModal
          candidateId={candidateId}
          organizationId={organizationId}
          isGrowthPlus={isGrowthPlus}
          onClose={() => setShowModal(false)}
          onMerged={() => {
            setShowModal(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
