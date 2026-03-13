"use client";

import { useState } from "react";
import { withdrawApplication } from "@/lib/actions/portal-status";

/**
 * D32 §5.1 / D09 §6.4 — Withdrawal button for the candidate status portal.
 * Shows a confirmation dialog before withdrawing.
 */
export function WithdrawButton({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (withdrawn) {
    return (
      <p className="text-sm text-muted-foreground">
        Your application has been withdrawn.
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-red-600 hover:text-red-700 underline"
      >
        Withdraw application
      </button>
    );
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-medium text-red-800">
        Are you sure you want to withdraw your application? This action cannot
        be undone.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button
          onClick={async () => {
            setLoading(true);
            setError(null);
            const result = await withdrawApplication(token);
            setLoading(false);
            if ("error" in result && result.error) {
              setError(result.error);
            } else {
              setWithdrawn(true);
            }
          }}
          disabled={loading}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "Withdrawing..." : "Yes, withdraw"}
        </button>
        <button
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
