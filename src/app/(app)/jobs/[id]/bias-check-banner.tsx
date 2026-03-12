"use client";

import { useState } from "react";

interface BiasCheckBannerProps {
  flaggedTerms: string[];
  suggestions: Record<string, string>;
  checkedAt: string;
}

export function BiasCheckBanner({
  flaggedTerms,
  suggestions,
  checkedAt,
}: BiasCheckBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || flaggedTerms.length === 0) return null;

  const checkedDate = new Date(checkedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-amber-600 dark:text-amber-400">&#9888;</span>
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Bias check flagged {flaggedTerms.length} term{flaggedTerms.length > 1 ? "s" : ""} at publish
            </p>
            <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
              Checked {checkedDate} &middot; Consider updating the job description
            </p>
            <ul className="mt-2 space-y-1">
              {flaggedTerms.map((term) => (
                <li key={term} className="text-sm text-amber-700 dark:text-amber-300">
                  <span className="font-medium">&ldquo;{term}&rdquo;</span>
                  {suggestions[term] && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {" "}&rarr; try &ldquo;{suggestions[term]}&rdquo;
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-amber-500 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900 dark:hover:text-amber-300"
          aria-label="Dismiss bias check"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
