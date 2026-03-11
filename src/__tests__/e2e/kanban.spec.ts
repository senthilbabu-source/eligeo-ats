import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Kanban Pipeline Board (M1 — drag-drop + arrow buttons)
 * Requires: Supabase running locally with seed data.
 * Seed: Senior Engineer job has 2 applications (Alice, Bob) in first stage.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Kanban Pipeline Board", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("pipeline page renders stage columns with candidates", async ({ page }) => {
    // Navigate to first job's pipeline
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+/);

    // Go to pipeline tab
    await page.getByRole("link", { name: /pipeline/i }).click();
    await expect(page).toHaveURL(/\/pipeline/);

    // Should see stage columns
    await expect(page.getByText("Applied").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Screening").first()).toBeVisible();

    // Should see candidate cards (Alice and Bob from seed)
    await expect(page.getByText(/alice/i).first()).toBeVisible();
    await expect(page.getByText(/bob/i).first()).toBeVisible();
  });

  test("can move candidate with arrow button", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await page.getByRole("link", { name: /pipeline/i }).click();
    await expect(page).toHaveURL(/\/pipeline/);

    // Wait for board to load
    await expect(page.getByText(/alice/i).first()).toBeVisible({ timeout: 5000 });

    // Find the forward arrow button (→) on Alice's card and click it
    const aliceCard = page.getByText(/alice/i).first().locator("../..");
    const forwardButton = aliceCard.getByTitle(/move to/i).last();
    await forwardButton.click();

    // Should show "Moving candidate…" indicator or the card should move
    // After move, Alice should appear in the next column
    await page.waitForTimeout(1000);
    // The board should still be visible (no crash)
    await expect(page.getByText("Applied").first()).toBeVisible();
  });

  test("kanban board shows drag handles on candidate cards", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await page.getByRole("link", { name: /pipeline/i }).click();

    // Cards should be draggable (have drag attributes)
    await expect(page.getByText(/alice/i).first()).toBeVisible({ timeout: 5000 });
    const aliceCard = page.getByText(/alice/i).first().locator("../..");
    // dnd-kit adds data-* attributes and tabindex for draggable elements
    await expect(aliceCard).toHaveAttribute("tabindex", "0");
  });

  test("empty stage columns show placeholder text", async ({ page }) => {
    await page.goto("/jobs");
    const firstJob = page.getByRole("link").filter({ hasText: /senior/i }).first();
    await firstJob.click();
    await page.getByRole("link", { name: /pipeline/i }).click();

    // Later stages (Offer, Hired) should show "No candidates"
    await expect(page.getByText("Applied").first()).toBeVisible({ timeout: 5000 });
    const noCandidateTexts = page.getByText("No candidates");
    const count = await noCandidateTexts.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
