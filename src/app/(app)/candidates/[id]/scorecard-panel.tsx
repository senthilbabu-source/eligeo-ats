"use client";

import { useActionState, useEffect, useState } from "react";
import { submitScorecard } from "@/lib/actions/scorecards";
import { getScorecardTemplateDetail } from "@/lib/actions/scorecards";
import { getScorecardSummary } from "@/lib/actions/scorecards";
import type { OverallRecommendation, ScorecardSummary } from "@/lib/types/ground-truth";

interface ScorecardPanelProps {
  interviewId: string;
  applicationId: string;
  scorecardTemplateId: string | null;
  hasSubmission: boolean;
  currentUserId: string;
  onClose: () => void;
}

interface TemplateData {
  id: string;
  name: string;
  categories: Array<{
    id: string;
    name: string;
    weight: number;
    position: number;
    attributes: Array<{
      id: string;
      name: string;
      description: string | null;
      position: number;
    }>;
  }>;
}

const RECOMMENDATION_OPTIONS: { value: OverallRecommendation; label: string; color: string }[] = [
  { value: "strong_yes", label: "Strong Yes", color: "bg-green-100 text-green-700 border-green-300" },
  { value: "yes", label: "Yes", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "no", label: "No", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "strong_no", label: "Strong No", color: "bg-red-100 text-red-700 border-red-300" },
];

function StarRating({
  value,
  onChange,
  attributeId,
}: {
  value: number;
  onChange: (v: number) => void;
  attributeId: string;
}) {
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`h-6 w-6 rounded text-sm font-medium transition-colors ${
            star <= value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-primary/20"
          }`}
          aria-label={`${star} star${star !== 1 ? "s" : ""} for ${attributeId}`}
        >
          {star}
        </button>
      ))}
    </div>
  );
}

export function ScorecardPanel({
  interviewId,
  applicationId,
  scorecardTemplateId,
  hasSubmission,
  currentUserId: _currentUserId,
  onClose,
}: ScorecardPanelProps) {
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [summary, setSummary] = useState<ScorecardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [ratingNotes, setRatingNotes] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState<OverallRecommendation | "">("");
  const [overallNotes, setOverallNotes] = useState("");

  // Load template and/or summary
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Always load summary (shows existing submissions)
        const summaryResult = await getScorecardSummary(applicationId);
        if (!cancelled && "success" in summaryResult) {
          setSummary(summaryResult.data);
        }

        // Load template for fresh submission
        if (scorecardTemplateId && !hasSubmission) {
          const tplResult = await getScorecardTemplateDetail(scorecardTemplateId);
          if (!cancelled && "success" in tplResult) {
            setTemplate(tplResult.data as TemplateData);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [applicationId, scorecardTemplateId, hasSubmission]);

  const [submitState, submitAction, isSubmitting] = useActionState(
    async (_prev: unknown) => {
      if (!recommendation) return { error: "Please select a recommendation." };

      const ratingsArray = Object.entries(ratings).map(([attribute_id, rating]) => ({
        attribute_id,
        rating,
        notes: ratingNotes[attribute_id] || undefined,
      }));

      if (ratingsArray.length === 0) return { error: "Please rate at least one attribute." };

      const result = await submitScorecard({
        interviewId,
        applicationId,
        overallRecommendation: recommendation,
        overallNotes: overallNotes || undefined,
        ratings: ratingsArray,
      });

      return result;
    },
    null,
  );

  const submitted = submitState && "success" in submitState && submitState.success;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {hasSubmission || submitted ? "Scorecard Summary" : "Submit Scorecard"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {loading && (
          <div className="mt-8 text-center text-sm text-muted-foreground">Loading...</div>
        )}

        {/* Summary View — show when there are existing submissions */}
        {!loading && summary && summary.total_submissions > 0 && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {summary.total_submissions} submission{summary.total_submissions !== 1 ? "s" : ""}
                </span>
                {summary.weighted_overall !== null && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    {summary.weighted_overall.toFixed(1)} / 5.0
                  </span>
                )}
              </div>

              {/* Recommendation tally */}
              <div className="mt-3 flex gap-2">
                {RECOMMENDATION_OPTIONS.map((opt) => {
                  const count = summary.recommendations[opt.value] ?? 0;
                  return (
                    <div
                      key={opt.value}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-center text-xs font-medium ${opt.color}`}
                    >
                      <div className="text-lg font-bold">{count}</div>
                      <div>{opt.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Category breakdowns */}
            {summary.categories.map((cat) => (
              <div key={cat.category_id} className="rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{cat.category_name}</span>
                  <span className="text-sm text-muted-foreground">
                    {cat.avg_rating.toFixed(1)} avg (w: {cat.weight})
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {cat.attributes.map((attr) => (
                    <div key={attr.attribute_id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{attr.attribute_name}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${(attr.avg_rating / 5) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 text-right font-medium">{attr.avg_rating.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submission Form — show when template exists and no prior submission */}
        {!loading && !hasSubmission && !submitted && template && (
          <form action={submitAction} className="mt-4 space-y-5">
            {template.categories.map((cat) => (
              <div key={cat.id} className="rounded-lg border border-border p-4">
                <h4 className="text-sm font-medium">
                  {cat.name}
                  <span className="ml-2 text-xs text-muted-foreground">weight: {cat.weight}</span>
                </h4>
                <div className="mt-3 space-y-3">
                  {cat.attributes.map((attr) => (
                    <div key={attr.id}>
                      <div className="flex items-center justify-between">
                        <label className="text-sm">{attr.name}</label>
                        <StarRating
                          value={ratings[attr.id] ?? 0}
                          onChange={(v) => setRatings((prev) => ({ ...prev, [attr.id]: v }))}
                          attributeId={attr.id}
                        />
                      </div>
                      {attr.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{attr.description}</p>
                      )}
                      <input
                        type="text"
                        placeholder="Notes (optional)"
                        value={ratingNotes[attr.id] ?? ""}
                        onChange={(e) => setRatingNotes((prev) => ({ ...prev, [attr.id]: e.target.value }))}
                        className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Overall Recommendation */}
            <div>
              <label className="block text-sm font-medium">Overall Recommendation</label>
              <div className="mt-2 flex gap-2">
                {RECOMMENDATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecommendation(opt.value)}
                    className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                      recommendation === opt.value
                        ? opt.color + " ring-2 ring-primary/30"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Overall Notes */}
            <div>
              <label htmlFor="overallNotes" className="block text-sm font-medium">
                Overall Notes
              </label>
              <textarea
                id="overallNotes"
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="Summary of your assessment..."
                className="mt-1 block w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {submitState && "error" in submitState && (
              <p className="text-sm text-destructive">{submitState.error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit Scorecard"}
              </button>
            </div>
          </form>
        )}

        {/* No template assigned */}
        {!loading && !hasSubmission && !submitted && !template && !scorecardTemplateId && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            No scorecard template assigned to this interview.
          </div>
        )}

        {/* Submitted confirmation */}
        {submitted && (
          <div className="mt-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
              <span className="text-lg">&#10003;</span>
            </div>
            <p className="text-sm font-medium">Scorecard submitted successfully</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
