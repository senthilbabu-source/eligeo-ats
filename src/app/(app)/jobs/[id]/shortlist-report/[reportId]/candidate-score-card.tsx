"use client";

import { useState } from "react";
import Link from "next/link";

interface ShortlistCandidate {
  id: string;
  candidate_id: string;
  candidateName: string;
  candidateTitle: string | null;
  ai_tier: string;
  recruiter_tier: string | null;
  composite_score: number | null;
  skills_score: number | null;
  experience_score: number | null;
  education_score: number | null;
  domain_score: number | null;
  trajectory_score: number | null;
  strengths: string[];
  gaps: string[];
  clarifying_question: string | null;
  reject_reason: string | null;
  eeoc_flags: string[];
}

const TIER_STYLES = {
  shortlist: { bg: "bg-green-50", border: "border-green-200", badge: "bg-green-100 text-green-700", label: "Shortlist" },
  hold: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", label: "Hold" },
  reject: { bg: "bg-red-50", border: "border-red-200", badge: "bg-red-100 text-red-700", label: "Reject" },
  insufficient_data: { bg: "bg-gray-50", border: "border-gray-200", badge: "bg-gray-100 text-gray-600", label: "Insufficient Data" },
} as const;

/**
 * D32 §17 — Candidate score card for shortlist report.
 * Shows composite score, 5-dimension bars, strengths/gaps, EEOC flags.
 */
export function CandidateScoreCard({
  candidate,
  canOverride,
  onOverride,
}: {
  candidate: ShortlistCandidate;
  canOverride: boolean;
  onOverride: (candidateRowId: string, newTier: string) => void;
}) {
  const [overriding, setOverriding] = useState(false);
  const effectiveTier = (candidate.recruiter_tier ?? candidate.ai_tier) as keyof typeof TIER_STYLES;
  const style = TIER_STYLES[effectiveTier] ?? TIER_STYLES.insufficient_data;
  const compositePercent = candidate.composite_score != null
    ? Math.round(candidate.composite_score * 100)
    : null;

  function handleOverride(newTier: string) {
    setOverriding(false);
    onOverride(candidate.id, newTier);
  }

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <Link
            href={`/candidates/${candidate.candidate_id}`}
            className="font-medium text-foreground hover:underline"
          >
            {candidate.candidateName}
          </Link>
          {candidate.candidateTitle && (
            <p className="text-xs text-muted-foreground">{candidate.candidateTitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}>
            {candidate.recruiter_tier ? "Override: " : "AI: "}{style.label}
          </span>
          {compositePercent !== null && (
            <span className="text-lg font-semibold tabular-nums">{compositePercent}%</span>
          )}
        </div>
      </div>

      {/* Dimension bars */}
      {compositePercent !== null && (
        <div className="mt-3 space-y-1.5">
          <DimensionBar label="Skills" score={candidate.skills_score} />
          <DimensionBar label="Experience" score={candidate.experience_score} />
          <DimensionBar label="Education" score={candidate.education_score} />
          <DimensionBar label="Domain" score={candidate.domain_score} />
          <DimensionBar label="Trajectory" score={candidate.trajectory_score} />
        </div>
      )}

      {/* Strengths */}
      {candidate.strengths.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-green-700">Strengths</p>
          <ul className="mt-1 space-y-0.5">
            {candidate.strengths.map((s, i) => (
              <li key={i} className="text-xs text-muted-foreground">+ {s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Gaps / Hold reason / Reject reason */}
      {candidate.clarifying_question && (
        <div className="mt-2">
          <p className="text-xs font-medium text-amber-700">Clarifying Question</p>
          <p className="text-xs text-muted-foreground">{candidate.clarifying_question}</p>
        </div>
      )}
      {candidate.reject_reason && (
        <div className="mt-2">
          <p className="text-xs font-medium text-red-700">Rejection Reason</p>
          <p className="text-xs text-muted-foreground">{candidate.reject_reason}</p>
        </div>
      )}
      {candidate.gaps.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">Gaps</p>
          <ul className="mt-0.5 space-y-0.5">
            {candidate.gaps.map((g, i) => (
              <li key={i} className="text-xs text-muted-foreground">- {g}</li>
            ))}
          </ul>
        </div>
      )}

      {/* EEOC flags */}
      {candidate.eeoc_flags.length > 0 && (
        <div className="mt-2 rounded-md bg-amber-100/50 px-2 py-1">
          <p className="text-xs font-medium text-amber-800">EEOC Flag</p>
          {candidate.eeoc_flags.map((f, i) => (
            <p key={i} className="text-xs text-amber-700">{f}</p>
          ))}
        </div>
      )}

      {/* Tier override */}
      {canOverride && (
        <div className="mt-3 flex items-center gap-2">
          {overriding ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Move to:</span>
              {(["shortlist", "hold", "reject"] as const)
                .filter((t) => t !== effectiveTier)
                .map((t) => (
                  <button
                    key={t}
                    onClick={() => handleOverride(t)}
                    className={`rounded px-2 py-0.5 text-xs font-medium ${TIER_STYLES[t].badge} hover:opacity-80`}
                  >
                    {TIER_STYLES[t].label}
                  </button>
                ))}
              <button
                onClick={() => setOverriding(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setOverriding(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Override tier
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DimensionBar({ label, score }: { label: string; score: number | null }) {
  if (score == null) return null;
  const percent = Math.round(score * 100);
  const color = percent >= 70 ? "bg-green-500" : percent >= 45 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  );
}
