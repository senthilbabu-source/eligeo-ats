"use client";

import { useState, useEffect, useCallback } from "react";
import {
  mergeCandidate,
  getDuplicateCandidates,
} from "@/lib/actions/candidates";
import { aiScoreMergeCandidates } from "@/lib/actions/ai";

interface CandidateRecord {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  linkedin_url?: string | null;
  current_company?: string | null;
  current_title?: string | null;
}

interface MergeScore {
  confidence: number;
  reasoning: string;
  signals: string[];
}

/**
 * D32 §5.4 — Candidate Merge Modal.
 *
 * Side-by-side comparison of primary vs secondary candidate.
 * AI confidence badge (Growth+), signal list, "Keep this record" selector.
 * Triggered from the duplicate warning banner on candidate detail page.
 */
export function MergeModal({
  candidateId,
  organizationId: _organizationId,
  isGrowthPlus,
  onClose,
  onMerged,
}: {
  candidateId: string;
  organizationId: string;
  isGrowthPlus: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [primary, setPrimary] = useState<CandidateRecord | null>(null);
  const [duplicates, setDuplicates] = useState<CandidateRecord[]>([]);
  const [selectedDupe, setSelectedDupe] = useState<CandidateRecord | null>(
    null,
  );
  const [keepPrimary, setKeepPrimary] = useState(true);
  const [mergeScore, setMergeScore] = useState<MergeScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Score a candidate pair (Growth+ only)
  const runScore = useCallback(async (primaryCandidate: CandidateRecord, dupe: CandidateRecord) => {
    if (!isGrowthPlus) return;
    setScoring(true);
    setMergeScore(null);
    const result = await aiScoreMergeCandidates({
      candidateA: {
        full_name: primaryCandidate.full_name,
        email: primaryCandidate.email,
        phone: primaryCandidate.phone ?? undefined,
        linkedin_url: primaryCandidate.linkedin_url ?? undefined,
        current_company: primaryCandidate.current_company ?? undefined,
      },
      candidateB: {
        full_name: dupe.full_name,
        email: dupe.email,
        phone: dupe.phone ?? undefined,
        linkedin_url: dupe.linkedin_url ?? undefined,
        current_company: dupe.current_company ?? undefined,
      },
    });
    if (!result.error) {
      setMergeScore({
        confidence: result.confidence,
        reasoning: result.reasoning,
        signals: result.signals,
      });
    }
    setScoring(false);
  }, [isGrowthPlus]);

  // Load duplicates on mount + trigger initial score
  useEffect(() => {
    async function load() {
      const result = await getDuplicateCandidates(candidateId);
      if (result.error) {
        setError(result.error);
      } else if (result.candidate) {
        const loadedPrimary = result.candidate as CandidateRecord;
        setPrimary(loadedPrimary);
        setDuplicates((result.duplicates ?? []) as CandidateRecord[]);
        if (result.duplicates && result.duplicates.length > 0) {
          const firstDupe = result.duplicates[0] as CandidateRecord;
          setSelectedDupe(firstDupe);
          runScore(loadedPrimary, firstDupe);
        }
      }
      setLoading(false);
    }
    load();
  }, [candidateId, runScore]);

  // Handle duplicate selection change
  function handleSelectDupe(dupe: CandidateRecord) {
    setSelectedDupe(dupe);
    if (primary) {
      runScore(primary, dupe);
    }
  }

  async function handleMerge() {
    if (!primary || !selectedDupe) return;
    setMerging(true);
    setError(null);

    const keepId = keepPrimary ? primary.id : selectedDupe.id;
    const removeId = keepPrimary ? selectedDupe.id : primary.id;

    const result = await mergeCandidate(
      keepId,
      removeId,
      mergeScore?.confidence,
      mergeScore?.reasoning ?? "Manual merge from duplicate review",
    );

    setMerging(false);
    if (result.error) {
      setError(result.error);
    } else {
      onMerged();
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-card p-8 shadow-lg">
          <p className="text-sm text-muted-foreground">
            Loading duplicate candidates...
          </p>
        </div>
      </div>
    );
  }

  if (!primary || duplicates.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-lg bg-card p-8 shadow-lg">
          <p className="text-sm">No duplicate candidates found.</p>
          <button
            onClick={onClose}
            className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-3xl rounded-lg bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">Review Duplicate Candidates</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            &times;
          </button>
        </div>

        {/* AI Confidence Badge */}
        {isGrowthPlus && (
          <div className="border-b border-border px-6 py-3">
            {scoring ? (
              <p className="text-sm text-muted-foreground">
                Analyzing similarity...
              </p>
            ) : mergeScore ? (
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    mergeScore.confidence >= 0.8
                      ? "bg-green-100 text-green-700"
                      : mergeScore.confidence >= 0.5
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {Math.round(mergeScore.confidence * 100)}% confident — same
                  person
                </span>
                <p className="text-xs text-muted-foreground">
                  AI-assisted analysis
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Possible match — review manually.
              </p>
            )}
            {mergeScore && mergeScore.signals.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {mergeScore.signals.map((signal, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!isGrowthPlus && (
          <div className="border-b border-border px-6 py-3">
            <p className="text-sm text-muted-foreground">
              Possible match — review manually.
            </p>
          </div>
        )}

        {/* Duplicate selector (if multiple) */}
        {duplicates.length > 1 && (
          <div className="border-b border-border px-6 py-3">
            <label className="text-xs font-medium text-muted-foreground">
              Select duplicate to compare:
            </label>
            <select
              className="ml-2 rounded border border-border px-2 py-1 text-sm"
              value={selectedDupe?.id ?? ""}
              onChange={(e) => {
                const dupe = duplicates.find((d) => d.id === e.target.value);
                if (dupe) handleSelectDupe(dupe);
              }}
            >
              {duplicates.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} ({d.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Side-by-side comparison */}
        {selectedDupe && (
          <div className="grid grid-cols-2 gap-4 p-6">
            <CandidateCard
              candidate={primary}
              label="Current Record"
              selected={keepPrimary}
              onSelect={() => setKeepPrimary(true)}
            />
            <CandidateCard
              candidate={selectedDupe}
              label="Possible Duplicate"
              selected={!keepPrimary}
              onSelect={() => setKeepPrimary(false)}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-6 pb-2">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            disabled={merging}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={merging || !selectedDupe}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {merging
              ? "Merging..."
              : `Keep ${keepPrimary ? "current" : "duplicate"} record`}
          </button>
        </div>
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  label,
  selected,
  onSelect,
}: {
  candidate: CandidateRecord;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border-2 p-4 text-left transition-colors ${
        selected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
          : "border-border hover:border-gray-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {label}
        </p>
        {selected && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            Keep
          </span>
        )}
      </div>
      <p className="mt-2 font-medium">{candidate.full_name}</p>
      <p className="text-sm text-muted-foreground">{candidate.email}</p>
      {candidate.phone && (
        <p className="text-sm text-muted-foreground">{candidate.phone}</p>
      )}
      {candidate.current_title && (
        <p className="mt-1 text-sm">
          {candidate.current_title}
          {candidate.current_company && ` at ${candidate.current_company}`}
        </p>
      )}
      {candidate.linkedin_url && (
        <p className="mt-1 truncate text-xs text-blue-600">
          {candidate.linkedin_url}
        </p>
      )}
    </button>
  );
}
