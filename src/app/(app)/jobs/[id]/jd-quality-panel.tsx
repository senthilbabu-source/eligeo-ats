"use client";

import { useEffect, useState } from "react";
import { checkJobBias } from "@/lib/actions/jobs";
import {
  analyzeGenderBalance,
  checkCompleteness,
  computeQualityScore,
  type GenderBalance,
  type CompletenessCheck,
  type QualityScore,
} from "@/lib/utils/jd-quality";

interface Props {
  jobId: string;
  description: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  location: string | null;
  canEdit: boolean;
}

function ScoreRing({ score, label }: { score: number; label: QualityScore["label"] }) {
  const color =
    label === "excellent" ? "text-green-600 dark:text-green-400" :
    label === "good" ? "text-blue-600 dark:text-blue-400" :
    label === "needs work" ? "text-amber-600 dark:text-amber-400" :
    "text-red-600 dark:text-red-400";

  return (
    <div className="flex flex-col items-center">
      <div className={`text-3xl font-bold tabular-nums ${color}`}>{score}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">/100</div>
      <div className={`mt-0.5 text-xs font-medium capitalize ${color}`}>{label}</div>
    </div>
  );
}

function MiniBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-1.5 rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${Math.round((value / max) * 100)}%` }}
      />
    </div>
  );
}

export function JdQualityPanel({ jobId, description, salaryMin, salaryMax, location, canEdit }: Props) {
  const [flaggedTerms, setFlaggedTerms] = useState<string[]>([]);
  const [biasLoading, setBiasLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showBiasDetails, setShowBiasDetails] = useState(false);
  const [showGenderDetails, setShowGenderDetails] = useState(false);

  // Rule-based checks (pure, instant)
  const completeness: CompletenessCheck = checkCompleteness({ description, salaryMin, salaryMax, location });
  const genderBalance: GenderBalance = analyzeGenderBalance(description ?? "");

  // AI bias check (Growth+ — runs async)
  useEffect(() => {
    if (!description || !canEdit) return;
    setBiasLoading(true);
    checkJobBias(jobId, description)
      .then((r) => { if (!r.error) setFlaggedTerms(r.flaggedTerms ?? []); })
      .finally(() => setBiasLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const quality: QualityScore = computeQualityScore({
    completeness,
    genderBalance,
    flaggedTermsCount: biasLoading ? 0 : flaggedTerms.length,
  });

  if (!description || dismissed) return null;

  return (
    <div data-jd-quality-panel="" className="mt-6 rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Job Description Quality</h3>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-4">
        {/* JD1 — Composite score */}
        <div className="flex items-center justify-center sm:col-span-1">
          <ScoreRing score={quality.total} label={quality.label} />
        </div>

        {/* JD3 — Completeness */}
        <div className="space-y-1 sm:col-span-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completeness</p>
          <MiniBar value={completeness.passCount} max={completeness.totalCount} colorClass="bg-blue-500" />
          <p className="text-xs text-muted-foreground">{completeness.passCount}/{completeness.totalCount} checks pass</p>
          <ul className="mt-1 space-y-0.5">
            {[
              { key: "hasSalary", label: "Salary range" },
              { key: "hasLocation", label: "Location" },
              { key: "hasReportingLine", label: "Reporting line" },
              { key: "hasMinLength", label: "Min. length (100 words)" },
            ].map((c) => (
              <li key={c.key} className="flex items-center gap-1 text-[11px]">
                <span className={completeness[c.key as keyof CompletenessCheck] ? "text-green-600" : "text-muted-foreground/50"}>
                  {completeness[c.key as keyof CompletenessCheck] ? "✓" : "○"}
                </span>
                <span className={completeness[c.key as keyof CompletenessCheck] ? "text-foreground" : "text-muted-foreground"}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* JD4 — Gender balance */}
        <div className="space-y-1 sm:col-span-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gender language</p>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {genderBalance.masculineCount + genderBalance.feminineCount > 0 ? (
              <>
                <div
                  className="h-2 bg-blue-400 transition-all duration-500"
                  style={{ width: `${Math.round((genderBalance.masculineCount / (genderBalance.masculineCount + genderBalance.feminineCount)) * 100)}%` }}
                />
                <div className="h-2 flex-1 bg-pink-400 transition-all duration-500" />
              </>
            ) : (
              <div className="h-2 w-full bg-muted" />
            )}
          </div>
          <p className={`text-xs capitalize ${genderBalance.label === "balanced" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
            {genderBalance.label}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {genderBalance.masculineCount}m · {genderBalance.feminineCount}f coded words
          </p>
          {(genderBalance.masculineWords.length > 0 || genderBalance.feminineWords.length > 0) && (
            <button
              type="button"
              onClick={() => setShowGenderDetails((v) => !v)}
              className="text-[10px] text-primary underline"
            >
              {showGenderDetails ? "Hide" : "Show"} words
            </button>
          )}
          {showGenderDetails && (
            <div className="mt-1 space-y-1">
              {genderBalance.masculineWords.length > 0 && (
                <p className="text-[10px] text-blue-600 dark:text-blue-400">
                  ♂ {genderBalance.masculineWords.join(", ")}
                </p>
              )}
              {genderBalance.feminineWords.length > 0 && (
                <p className="text-[10px] text-pink-600 dark:text-pink-400">
                  ♀ {genderBalance.feminineWords.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* JD2 — Bias signals */}
        <div className="space-y-1 sm:col-span-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bias signals</p>
          {biasLoading ? (
            <p className="text-xs text-muted-foreground animate-pulse">Checking…</p>
          ) : flaggedTerms.length === 0 ? (
            <p className="text-xs text-green-600 dark:text-green-400">✓ No biased language</p>
          ) : (
            <>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {flaggedTerms.length} term{flaggedTerms.length !== 1 ? "s" : ""} flagged
              </p>
              <button
                type="button"
                onClick={() => setShowBiasDetails((v) => !v)}
                className="text-[10px] text-primary underline"
              >
                {showBiasDetails ? "Hide" : "Show"} terms
              </button>
              {showBiasDetails && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {flaggedTerms.map((term) => (
                    <span
                      key={term}
                      className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">Use AI Rewrite to fix</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
