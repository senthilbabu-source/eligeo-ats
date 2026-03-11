"use client";

import { useRouter } from "next/navigation";

/**
 * R13 — Mine mode toggle with cookie persistence.
 *
 * Sets a `mine_mode` cookie (7-day, sameSite=strict) on click so the
 * preference survives page reloads without requiring a URL param.
 * The server component reads the cookie as the default; URL param overrides.
 */
export function MineToggle({ mineMode }: { mineMode: boolean }) {
  const router = useRouter();

  function toggle(toMine: boolean) {
    document.cookie = `mine_mode=${toMine ? "1" : "0"};path=/;max-age=${7 * 24 * 60 * 60};samesite=strict`;
    router.push(toMine ? "/dashboard?mine=1" : "/dashboard");
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1 text-sm">
      <button
        type="button"
        onClick={() => toggle(false)}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!mineMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
      >
        All Jobs
      </button>
      <button
        type="button"
        onClick={() => toggle(true)}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${mineMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
      >
        My Jobs
      </button>
    </div>
  );
}
