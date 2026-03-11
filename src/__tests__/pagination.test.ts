import { describe, it, expect } from "vitest";
import {
  parsePagination,
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
} from "@/lib/utils/pagination";

describe("parsePagination", () => {
  it("returns defaults when no searchParams", () => {
    const result = parsePagination({});
    expect(result).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      from: 0,
      to: DEFAULT_PAGE_SIZE - 1,
    });
  });

  it("parses valid page and pageSize", () => {
    const result = parsePagination({ page: "3", pageSize: "10" });
    expect(result).toEqual({ page: 3, pageSize: 10, from: 20, to: 29 });
  });

  it("clamps page to minimum 1", () => {
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "-5" }).page).toBe(1);
  });

  it("clamps pageSize to max 100", () => {
    expect(parsePagination({ pageSize: "500" }).pageSize).toBe(100);
  });

  it("clamps pageSize to min 1", () => {
    expect(parsePagination({ pageSize: "0" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
    // parseInt("-10") = -10 (truthy), Math.max(1, -10) = 1
    expect(parsePagination({ pageSize: "-10" }).pageSize).toBe(1);
  });

  it("handles non-numeric strings gracefully", () => {
    const result = parsePagination({ page: "abc", pageSize: "xyz" });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("handles array values (uses default)", () => {
    const result = parsePagination({ page: ["1", "2"] });
    expect(result.page).toBe(1);
  });

  it("accepts custom default page size", () => {
    const result = parsePagination({}, 50);
    expect(result.pageSize).toBe(50);
  });

  it("calculates correct from/to for page 2", () => {
    const result = parsePagination({ page: "2", pageSize: "25" });
    expect(result.from).toBe(25);
    expect(result.to).toBe(49);
  });
});

describe("buildPaginationMeta", () => {
  it("builds correct meta for first page", () => {
    const meta = buildPaginationMeta(100, { page: 1, pageSize: 25, from: 0, to: 24 });
    expect(meta).toEqual({
      page: 1,
      pageSize: 25,
      totalCount: 100,
      totalPages: 4,
      hasNext: true,
      hasPrev: false,
    });
  });

  it("builds correct meta for last page", () => {
    const meta = buildPaginationMeta(100, { page: 4, pageSize: 25, from: 75, to: 99 });
    expect(meta).toEqual({
      page: 4,
      pageSize: 25,
      totalCount: 100,
      totalPages: 4,
      hasNext: false,
      hasPrev: true,
    });
  });

  it("builds correct meta for middle page", () => {
    const meta = buildPaginationMeta(100, { page: 2, pageSize: 25, from: 25, to: 49 });
    expect(meta.hasNext).toBe(true);
    expect(meta.hasPrev).toBe(true);
  });

  it("handles zero results", () => {
    const meta = buildPaginationMeta(0, { page: 1, pageSize: 25, from: 0, to: 24 });
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNext).toBe(false);
    expect(meta.hasPrev).toBe(false);
  });

  it("handles exact page boundary (50 items, 25/page = 2 pages)", () => {
    const meta = buildPaginationMeta(50, { page: 1, pageSize: 25, from: 0, to: 24 });
    expect(meta.totalPages).toBe(2);
    expect(meta.hasNext).toBe(true);
  });

  it("rounds up partial pages (51 items, 25/page = 3 pages)", () => {
    const meta = buildPaginationMeta(51, { page: 1, pageSize: 25, from: 0, to: 24 });
    expect(meta.totalPages).toBe(3);
  });
});
