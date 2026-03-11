import { CONFIG } from "@/lib/constants/config";

/**
 * Server-side pagination utilities.
 * Used by list pages to compute offset/limit from searchParams.
 */

export const DEFAULT_PAGE_SIZE = CONFIG.PAGINATION.DEFAULT_PAGE_SIZE;

export interface PaginationParams {
  page: number;
  pageSize: number;
  from: number;
  to: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Parse page/pageSize from Next.js searchParams.
 * Returns validated offset range for Supabase `.range(from, to)`.
 */
export function parsePagination(
  searchParams: Record<string, string | string[] | undefined>,
  defaultPageSize: number = DEFAULT_PAGE_SIZE,
): PaginationParams {
  const rawPage = searchParams.page;
  const rawSize = searchParams.pageSize;

  const page = Math.max(1, parseInt(typeof rawPage === "string" ? rawPage : "1", 10) || 1);
  const pageSize = Math.min(
    CONFIG.PAGINATION.MAX_PAGE_SIZE,
    Math.max(1, parseInt(typeof rawSize === "string" ? rawSize : String(defaultPageSize), 10) || defaultPageSize),
  );

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return { page, pageSize, from, to };
}

/**
 * Build pagination metadata from Supabase count and current params.
 */
export function buildPaginationMeta(
  totalCount: number,
  params: PaginationParams,
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(totalCount / params.pageSize));
  return {
    page: params.page,
    pageSize: params.pageSize,
    totalCount,
    totalPages,
    hasNext: params.page < totalPages,
    hasPrev: params.page > 1,
  };
}
