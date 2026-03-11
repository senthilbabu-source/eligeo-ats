"use client";

import { useState } from "react";
import type { CloneIntent } from "@/lib/types/ground-truth";

const REASONS: { value: CloneIntent["reason"]; label: string; description: string }[] = [
  {
    value: "new_location",
    label: "New Location",
    description: "Same role, different city or office",
  },
  {
    value: "new_level",
    label: "New Seniority Level",
    description: "e.g. Senior → Staff, Junior → Mid",
  },
  {
    value: "repost",
    label: "Seasonal Repost",
    description: "Reposting a previously closed role",
  },
  {
    value: "different_team",
    label: "Different Team",
    description: "Same function, different department or pod",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (intent: CloneIntent | null) => void;
  isPending: boolean;
  initialReason?: CloneIntent["reason"];
  initialLocation?: string;
  initialLevel?: string;
}

export function CloneIntentModal({ isOpen, onClose, onConfirm, isPending, initialReason, initialLocation, initialLevel }: Props) {
  const [reason, setReason] = useState<CloneIntent["reason"] | null>(initialReason ?? null);
  const [newLocation, setNewLocation] = useState(initialLocation ?? "");
  const [newLevel, setNewLevel] = useState(initialLevel ?? "");

  if (!isOpen) return null;

  function handleConfirm() {
    if (!reason) return;
    onConfirm({ reason, newLocation: newLocation.trim() || undefined, newLevel: newLevel.trim() || undefined });
  }

  function handleSkip() {
    onConfirm(null);
  }

  function handleClose() {
    setReason(null);
    setNewLocation("");
    setNewLevel("");
    onClose();
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      {/* Panel */}
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Why are you cloning this job?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This helps AI tailor the description and suggest skill changes.
        </p>

        {/* Reason options */}
        <div className="mt-4 space-y-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                reason === r.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              }`}
            >
              <span className="text-sm font-medium">{r.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{r.description}</span>
            </button>
          ))}
        </div>

        {/* Conditional detail inputs */}
        {reason === "new_location" && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground">
              New location <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="e.g. London, Remote — APAC"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
        )}

        {reason === "new_level" && (
          <div className="mt-4">
            <label className="block text-xs font-medium text-muted-foreground">
              New level <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              type="text"
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
              placeholder="e.g. Staff, Principal, Senior"
              className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            Skip — clone without context
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!reason || isPending}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Cloning…" : "Clone"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
