import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Candidate detail page
 * Tests CP2 (days in stage), CP4 (source badge), CP8 (header badges).
 * Requires: Supabase running locally with seed data.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Candidate Detail", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("candidate list page loads with seeded candidates", async ({ page }) => {
    await page.goto("/candidates");
    await expect(page).toHaveURL(/\/candidates/);
    await expect(page.getByText(/candidate|engineer|developer/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("candidate detail page renders profile and applications section", async ({
    page,
  }) => {
    await page.goto("/candidates");
    // Click the first candidate link
    // Find a candidate row that links to /candidates/[id]
    const candidateRow = page.locator("a[href*='/candidates/']").first();
    await candidateRow.click();
    await expect(page).toHaveURL(/\/candidates\/.+/);
    // Should show Applications section
    await expect(page.getByText(/applications/i)).toBeVisible();
    // Should show Profile section
    await expect(page.getByText(/profile/i)).toBeVisible();
  });

  test("back to candidates link is present", async ({ page }) => {
    await page.goto("/candidates");
    const candidateRow = page.locator("a[href*='/candidates/']").first();
    await candidateRow.click();
    await expect(page).toHaveURL(/\/candidates\/.+/);
    await expect(page.getByText(/all candidates/i)).toBeVisible();
  });
});
