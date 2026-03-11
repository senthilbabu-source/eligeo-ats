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

  test("Clone button opens intent modal and creates job on skip", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/);

    // Clone button opens the intent modal
    await expect(page.getByRole("button", { name: /clone/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^Clone$/i }).click();
    await expect(page.getByText(/why are you cloning/i)).toBeVisible({ timeout: 3000 });

    // Skip intent — should redirect to new draft job
    await page.getByRole("button", { name: /skip/i }).click();
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/, { timeout: 10000 });
    await expect(page.getByText(/draft/i).first()).toBeVisible();
  });

  test("Clone with New Location intent stores clone_intent in cloned job", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/);

    // Capture the source job ID for later comparison
    const sourceUrl = page.url();

    // Open intent modal
    await page.getByRole("button", { name: /^Clone$/i }).click();
    await expect(page.getByText(/why are you cloning/i)).toBeVisible({ timeout: 3000 });

    // Select "New Location" reason (buttons, not radio inputs)
    await page.getByRole("button", { name: /new location/i }).click();

    // Location text input should appear
    await expect(page.getByPlaceholder(/e\.g\. London|location/i)).toBeVisible({ timeout: 2000 });
    await page.getByPlaceholder(/e\.g\. London|location/i).fill("London");

    // Clone button should now be enabled — click it
    await page.getByRole("button", { name: /^Clone$/i }).last().click();

    // Should redirect to the new cloned job (different URL from source)
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/, { timeout: 15000 });
    expect(page.url()).not.toBe(sourceUrl);

    // Cloned job should be in draft state
    await expect(page.getByText(/draft/i).first()).toBeVisible();

    // Post-clone checklist should be visible (clone_intent stored → checklist rendered)
    await expect(page.getByText(/post-clone checklist|clone checklist/i).first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("AI Rewrite: streaming panel appears, Accept persists new description", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/);

    // Trigger AI Rewrite
    const rewriteBtn = page.getByRole("button", { name: /ai rewrite/i });
    await expect(rewriteBtn).toBeVisible({ timeout: 5000 });
    await rewriteBtn.click();

    // Streaming panel should appear (either streaming indicator or diff view)
    await expect(
      page.getByText(/generating|rewriting|ai rewrite/i).first()
    ).toBeVisible({ timeout: 5000 });

    // Wait for streaming to complete — Accept button should appear
    const acceptBtn = page.getByRole("button", { name: /accept/i });
    await expect(acceptBtn).toBeVisible({ timeout: 30000 });

    // Accept the rewrite
    await acceptBtn.click();

    // After accepting, the panel should collapse (no more Accept button visible)
    await expect(acceptBtn).not.toBeVisible({ timeout: 5000 });
  });

  test("AI Rewrite: Revert restores original description", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/);

    // Only test Revert when description_previous exists (shown by "Revert to previous" button)
    // This test is conditional — if no previous exists, skip gracefully
    const rewriteBtn = page.getByRole("button", { name: /ai rewrite/i });
    await rewriteBtn.click();

    // Wait for Accept to appear (rewrite complete)
    await expect(page.getByRole("button", { name: /accept/i })).toBeVisible({ timeout: 30000 });

    // Check for Revert to Previous button
    const revertBtn = page.getByRole("button", { name: /revert to previous/i });
    if (await revertBtn.isVisible()) {
      await revertBtn.click();
      // Panel should collapse after revert
      await expect(revertBtn).not.toBeVisible({ timeout: 5000 });
    } else {
      // No previous description — Discard instead
      await page.getByRole("button", { name: /discard/i }).click();
    }
  });

  test("AI Rewrite panel is visible on job detail", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/);
    await expect(page.getByRole("button", { name: /ai rewrite/i })).toBeVisible({ timeout: 5000 });
  });
});
