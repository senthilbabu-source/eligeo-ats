import Link from "next/link";
import type { PaginationMeta } from "@/lib/utils/pagination";

interface PaginationProps {
  meta: PaginationMeta;
  basePath: string;
  /** Preserve existing query params (e.g., filters) */
  searchParams?: Record<string, string>;
}

export function Pagination({ meta, basePath, searchParams = {} }: PaginationProps) {
  if (meta.totalPages <= 1) return null;

  function buildHref(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    return `${basePath}?${params.toString()}`;
  }

  // Show up to 5 page numbers centered on current
  const windowSize = 5;
  let start = Math.max(1, meta.page - Math.floor(windowSize / 2));
  const end = Math.min(meta.totalPages, start + windowSize - 1);
  if (end - start < windowSize - 1) {
    start = Math.max(1, end - windowSize + 1);
  }

  const pages: number[] = [];
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <nav
      className="mt-6 flex items-center justify-between border-t border-border pt-4"
      aria-label="Pagination"
    >
      <p className="text-sm text-muted-foreground">
        {meta.totalCount} result{meta.totalCount !== 1 ? "s" : ""}
        {meta.totalPages > 1 && (
          <span>
            {" "}
            · Page {meta.page} of {meta.totalPages}
          </span>
        )}
      </p>

      <div className="flex items-center gap-1">
        {meta.hasPrev ? (
          <Link
            href={buildHref(meta.page - 1)}
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
          >
            Prev
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm text-muted-foreground opacity-50">
            Prev
          </span>
        )}

        {pages.map((p) => (
          <Link
            key={p}
            href={buildHref(p)}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm ${
              p === meta.page
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted"
            }`}
          >
            {p}
          </Link>
        ))}

        {meta.hasNext ? (
          <Link
            href={buildHref(meta.page + 1)}
            className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
          >
            Next
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm text-muted-foreground opacity-50">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
