"use client";

import { useState, useTransition } from "react";
import { sendOffer } from "@/lib/actions/offers";
import { aiGenerateOfferTerms } from "@/lib/actions/offers";

/**
 * D32 §6.4 — AI Offer Letter Preview Modal.
 * Pro+ users see AI-generated letter before sending.
 * Growth users skip to direct send.
 */
export function OfferLetterPreviewModal({
  offerId,
  candidateName,
  jobTitle,
  department,
  compensation,
  startDate,
  organizationName,
  existingTerms,
  isProPlus,
  onClose,
  onSent,
}: {
  offerId: string;
  candidateName: string;
  jobTitle: string;
  department?: string;
  compensation: {
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
  organizationName: string;
  existingTerms?: string;
  isProPlus: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [letterContent, setLetterContent] = useState(existingTerms ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const result = await aiGenerateOfferTerms({
        candidateName,
        jobTitle,
        department,
        compensation,
        startDate,
        organizationName,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.text) {
        setLetterContent(result.text);
      }
    } catch {
      setError("Failed to generate offer letter.");
    } finally {
      setGenerating(false);
    }
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendOffer(offerId);
      if (result.error) {
        setError(result.error);
      } else {
        onSent();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Send Offer for E-Sign</h2>
            <p className="text-sm text-muted-foreground">
              {candidateName} — {jobTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {isProPlus && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium">
                  Offer Letter Content
                  <span className="ml-2 text-xs text-muted-foreground">(AI-generated, editable)</span>
                </label>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                >
                  {generating ? "Generating..." : letterContent ? "Regenerate" : "AI Generate Letter"}
                </button>
              </div>
              <textarea
                value={letterContent}
                onChange={(e) => setLetterContent(e.target.value)}
                rows={10}
                placeholder="Click 'AI Generate Letter' or type your offer letter content..."
                className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {!isProPlus && (
            <div className="mb-4 rounded-md border border-border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                The offer will be sent using your organization&apos;s Dropbox Sign template
                with pre-filled compensation details. Upgrade to Pro for AI-generated
                offer letter content.
              </p>
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Summary</p>
            <p className="mt-1 text-sm">
              <strong>{compensation.currency} {compensation.base_salary.toLocaleString()}</strong>
              {" "}{compensation.period}
              {compensation.bonus_pct ? ` + ${compensation.bonus_pct}% bonus` : ""}
              {compensation.sign_on_bonus ? ` + ${compensation.currency} ${compensation.sign_on_bonus.toLocaleString()} sign-on` : ""}
            </p>
            {startDate && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Start: {new Date(startDate).toLocaleDateString()}
              </p>
            )}
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Sending..." : "Send for E-Sign"}
          </button>
        </div>
      </div>
    </div>
  );
}
