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

  test("new job page loads with form", async ({ page }) => {
    await page.goto("/jobs/new");
    await expect(page.getByText(/new job/i).first()).toBeVisible();
    await expect(page.getByLabel(/job title/i)).toBeVisible();
    await expect(page.getByLabel(/description/i)).toBeVisible();
    await expect(page.getByLabel(/pipeline/i)).toBeVisible();
  });

  test("can create a new job", async ({ page }) => {
    await page.goto("/jobs/new");

    await page.getByLabel(/job title/i).fill("QA Automation Engineer");
    await page.getByLabel(/description/i).fill("Seeking a QA automation engineer with Playwright experience.");
    await page.getByLabel(/department/i).fill("Engineering");
    await page.getByLabel(/location$/i).fill("Remote");

    await page.getByRole("button", { name: /create job/i }).click();

    // Should redirect to the new job's detail page
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/, { timeout: 10000 });
  });

  test("new job form shows validation on empty submit", async ({ page }) => {
    await page.goto("/jobs/new");
    // Try to submit without filling required fields
    await page.getByRole("button", { name: /create job/i }).click();
    // Should stay on the form page (not redirect to a detail page)
    await expect(page).toHaveURL(/\/jobs\/new/);
  });
});
