"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

interface Props {
  sources: Array<{ id: string; name: string }>;
  openJobs: Array<{ id: string; title: string }>;
  query: string;
  sourceId: string;
  jobId: string;
}

export function CandidateFilterBar({ sources, openJobs, query, sourceId, jobId }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const update = useCallback(
    (key: string, value: string) => {
      const sp = new URLSearchParams();
      // Carry over existing filters, reset page
      if (key !== "q" && query) sp.set("q", query);
      if (key !== "source" && sourceId) sp.set("source", sourceId);
      if (key !== "job" && jobId) sp.set("job", jobId);
      if (value) sp.set(key, value);
      router.push(`${pathname}?${sp.toString()}`);
    },
    [router, pathname, query, sourceId, jobId],
  );

  const hasFilters = query || sourceId || jobId;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {/* Search */}
      <input
        type="search"
        placeholder="Search name, email, title…"
        defaultValue={query}
        className="h-8 w-56 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            update("q", (e.target as HTMLInputElement).value.trim());
          }
        }}
        onBlur={(e) => {
          const val = e.target.value.trim();
          if (val !== query) update("q", val);
        }}
      />

      {/* Source filter */}
      {sources.length > 0 && (
        <select
          value={sourceId}
          onChange={(e) => update("source", e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {/* Job filter */}
      {openJobs.length > 0 && (
        <select
          value={jobId}
          onChange={(e) => update("job", e.target.value)}
          className="h-8 max-w-[200px] rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Jobs</option>
          {openJobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      )}

      {/* Clear filters */}
      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
