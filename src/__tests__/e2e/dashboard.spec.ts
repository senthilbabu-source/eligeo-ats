import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Dashboard metrics page (R1/R3/R4)
 * Requires: Supabase running locally with seed data.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("dashboard loads with metric cards", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(page.getByText(/active jobs/i)).toBeVisible();
    await expect(page.getByText(/candidates/i).first()).toBeVisible();
    await expect(page.getByText(/active applications/i)).toBeVisible();
    await expect(page.getByText(/this week/i)).toBeVisible();
  });

  test("dashboard shows pipeline funnel section", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/pipeline funnel/i)).toBeVisible({ timeout: 5000 });
  });

  test("dashboard shows source attribution section", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/source attribution/i)).toBeVisible({ timeout: 5000 });
  });

  test("dashboard shows recent applications section", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/recent applications/i)).toBeVisible({ timeout: 5000 });
    // Seed has applications — Alice and Bob should appear
    await expect(page.getByText(/alice/i).first()).toBeVisible();
  });

  test("metric cards link to correct pages", async ({ page }) => {
    await page.goto("/dashboard");
    // Active jobs card links to /jobs
    await page.getByText(/active jobs/i).click();
    await expect(page).toHaveURL(/\/jobs/);
  });
});
