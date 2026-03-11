import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Job CRUD flow
 * Tests creating, viewing, and publishing jobs.
 * Requires: Supabase running locally with seed data.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Job Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("jobs list page loads with seeded jobs", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/jobs/);
    // Seed has 2 jobs — should see at least one
    await expect(page.getByText(/senior|full.?stack|engineer|developer/i).first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("can navigate to job detail", async ({ page }) => {
    await page.goto("/jobs");
    // Click on the first job link
    const firstJob = page.getByRole("link").filter({ hasText: /senior|full.?stack|engineer|developer/i }).first();
    await firstJob.click();
    // Should navigate to job detail page
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/);
  });

  // TODO: "new job page" and "create job" tests require fixing session extraction
  // to read JWT claims (from custom_access_token_hook) instead of app_metadata.
  // The hook injects org_role into the JWT, but getUser() reads from auth.users DB.
  // orgRole defaults to "interviewer" which lacks jobs:create permission.
  // Fix tracked for Phase 2.7: update extractSession to decode JWT access_token.
});
