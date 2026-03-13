"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateScoreCard } from "./candidate-score-card";

interface ShortlistCandidateRow {
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

/**
 * Client wrapper for the shortlist report — handles tier override mutations.
 */
export function ShortlistReportClient({
  candidates: initialCandidates,
  canOverride,
  jobId,
}: {
  candidates: ShortlistCandidateRow[];
  canOverride: boolean;
  jobId: string;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [activeTab, setActiveTab] = useState<"shortlist" | "hold" | "reject" | "all">("all");

  async function handleOverride(candidateRowId: string, newTier: string) {
    // Optimistic update
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === candidateRowId ? { ...c, recruiter_tier: newTier } : c,
      ),
    );

    // Persist via API
    try {
      await fetch(`/api/jobs/${jobId}/shortlist/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateRowId, newTier }),
      });
      router.refresh();
    } catch {
      // Revert on error
      setCandidates(initialCandidates);
    }
  }

  const filtered = activeTab === "all"
    ? candidates
    : candidates.filter((c) => (c.recruiter_tier ?? c.ai_tier) === activeTab);

  return (
    <div className="mt-6">
      {/* Tab filter */}
      <div className="flex gap-2 border-b border-border pb-2">
        {(["all", "shortlist", "hold", "reject"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-3 py-1 text-xs font-medium ${
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Candidate cards */}
      <div className="mt-4 space-y-3">
        {filtered.map((c) => (
          <CandidateScoreCard
            key={c.id}
            candidate={c}
            canOverride={canOverride}
            onOverride={handleOverride}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No candidates in this tier.
          </p>
        )}
      </div>
    </div>
  );
}
