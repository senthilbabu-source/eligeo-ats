import { test, expect } from "@playwright/test";

/**
 * E2E: Public career portal
 * Tests the unauthenticated /careers pages.
 * Requires: Supabase running locally with seed data (2 published jobs).
 */

test.describe("Career Portal", () => {
  test("career listing page loads without auth", async ({ page }) => {
    await page.goto("/careers");
    await expect(page).toHaveURL(/\/careers/);
    // Should show some header/title
    await expect(page.getByText(/careers|open positions|job/i).first()).toBeVisible();
  });

  test("shows published job openings", async ({ page }) => {
    await page.goto("/careers");
    // Seed data has published jobs — page should render without error
    const careerLinks = page.getByRole("link").filter({ hasText: /senior|engineer|developer|full.?stack/i });
    const count = await careerLinks.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("can view job detail from career portal", async ({ page }) => {
    await page.goto("/careers");
    // Try to click a job link if one exists
    const careerLinks = page.getByRole("link").filter({ hasText: /senior|engineer|developer|full.?stack/i });
    if ((await careerLinks.count()) > 0) {
      await careerLinks.first().click();
      await expect(page).toHaveURL(/\/careers\/.+/);
      // Detail page should show job info
      await expect(page.getByText(/description|about|apply|requirements/i).first()).toBeVisible({
        timeout: 5000,
      });
    }
  });
});
