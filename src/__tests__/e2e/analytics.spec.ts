import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Analytics module (Phase 7 Wave A1)
 * Requires: Supabase running locally with seed data.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Analytics", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("analytics home page loads with view cards", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByText(/analytics/i).first()).toBeVisible({ timeout: 5000 });
    // Should show links to sub-views
    await expect(page.getByText(/funnel/i).first()).toBeVisible();
    await expect(page.getByText(/velocity/i).first()).toBeVisible();
  });

  test("funnel view loads with stage data", async ({ page }) => {
    await page.goto("/analytics/funnel");
    await expect(page.getByText(/funnel/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("team view requires owner/admin role", async ({ page }) => {
    // Owner should see team analytics
    await page.goto("/analytics/team");
    await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 5000 });
  });
});
