"use client";

import { useRouter, useSearchParams } from "next/navigation";

const RANGES = [
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "This quarter", value: "quarter" },
  { label: "This year", value: "year" },
] as const;

/**
 * Date range selector for analytics views.
 * Writes ?range= to URL search params for server-side reading.
 */
export function DateRangeSelect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("range") ?? "30";

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", value);
    router.push(`?${params.toString()}`);
  }

  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
    >
      {RANGES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Parse ?range= param into a DateRange { from, to }.
 */
export function parseDateRangeParam(range: string | undefined): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);

  switch (range) {
    case "7": {
      const from = new Date(now.getTime() - 7 * 86400000);
      return { from: from.toISOString().slice(0, 10), to };
    }
    case "90": {
      const from = new Date(now.getTime() - 90 * 86400000);
      return { from: from.toISOString().slice(0, 10), to };
    }
    case "quarter": {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const from = new Date(now.getFullYear(), qMonth, 1);
      return { from: from.toISOString().slice(0, 10), to };
    }
    case "year": {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: from.toISOString().slice(0, 10), to };
    }
    default: {
      // 30 days
      const from = new Date(now.getTime() - 30 * 86400000);
      return { from: from.toISOString().slice(0, 10), to };
    }
  }
}
