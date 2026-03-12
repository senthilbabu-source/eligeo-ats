import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Interview Scheduling + Scorecard Flow (P3-W4)
 *
 * Prerequisites: Supabase running locally with seed data.
 * Seed data includes:
 * - TENANT_A with 2 interviews (Alice screening=completed, Alice technical=scheduled)
 * - 1 scorecard submission for screening (Roshelle, strong_yes)
 * - Engineering Interview template with 2 categories
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Interviews — Schedule Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("should show interviews page via nav", async ({ page }) => {
    await page.getByRole("link", { name: /interviews/i }).click();
    await expect(page).toHaveURL(/\/interviews/);
    await expect(page.getByText(/upcoming/i)).toBeVisible();
  });

  test("should display seeded interviews on schedule page", async ({ page }) => {
    await page.goto("/interviews");
    // Should show at least the seeded interviews
    await expect(page.getByText(/phone screen|technical/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("should toggle between mine and all interviews", async ({ page }) => {
    await page.goto("/interviews");
    // Look for the filter toggle
    const allButton = page.getByRole("button", { name: /all/i });
    if (await allButton.isVisible()) {
      await allButton.click();
      // Should still show interviews (owner sees all)
      await expect(page.locator("[class*='rounded-lg border']").first()).toBeVisible({
        timeout: 5000,
      });
    }
  });
});

test.describe("Interviews — Candidate Detail Integration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("should show interview section on candidate detail", async ({ page }) => {
    // Navigate to Alice's candidate page (seeded candidate)
    await page.goto("/candidates");
    await page.getByText(/alice/i).first().click();
    await expect(page).toHaveURL(/\/candidates\/.+/);

    // Should show interview cards for her application
    await expect(page.getByText(/phone screen|technical/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("should show scorecard button on completed interview", async ({ page }) => {
    await page.goto("/candidates");
    await page.getByText(/alice/i).first().click();
    await expect(page).toHaveURL(/\/candidates\/.+/);

    // The completed interview should have a "View Scorecard" or "Submit Scorecard" button
    await expect(
      page.getByRole("button", { name: /scorecard/i }).first(),
    ).toBeVisible({ timeout: 5000 });
  });

  test("should open scorecard panel when clicking scorecard button", async ({ page }) => {
    await page.goto("/candidates");
    await page.getByText(/alice/i).first().click();
    await expect(page).toHaveURL(/\/candidates\/.+/);

    // Click scorecard button on the first interview that has one
    const scorecardBtn = page.getByRole("button", { name: /scorecard/i }).first();
    await scorecardBtn.click();

    // Scorecard panel should open (slide-over) with rating content
    await expect(
      page.getByText(/recommendation|rating|scorecard/i).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});
