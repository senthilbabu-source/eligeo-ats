/**
 * Unit tests: cn() — Tailwind class merge utility
 */

import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn()", () => {
  it("merges multiple class strings", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional classes via clsx", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  it("handles object syntax", () => {
    expect(cn({ "text-red-500": true, "text-blue-500": false })).toBe(
      "text-red-500",
    );
  });

  it("handles array inputs", () => {
    expect(cn(["flex", "items-center"])).toBe("flex items-center");
  });

  it("returns empty string for no inputs", () => {
    expect(cn()).toBe("");
  });

  it("filters out falsy values", () => {
    expect(cn("a", null, undefined, "", "b")).toBe("a b");
  });
});
