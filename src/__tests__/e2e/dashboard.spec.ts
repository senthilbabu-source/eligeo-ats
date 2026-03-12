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

  test("dashboard shows current stage distribution section (renamed from pipeline funnel)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/current stage distribution/i)).toBeVisible({ timeout: 5000 });
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

  // E2E-18: Recent apps navigation
  test("recent application rows link to candidate profile", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/recent applications/i)).toBeVisible({ timeout: 5000 });
    // Click first application row — should navigate to /candidates/<id>
    const firstRow = page.locator("ul li a").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    await expect(page).toHaveURL(/\/candidates\/.+/, { timeout: 8000 });
  });

  // E2E-17: At-risk widget renders (always — green empty state when seed jobs have recent activity)
  test("at-risk jobs widget always renders on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/at-risk jobs/i)).toBeVisible({ timeout: 5000 });
    // Widget always renders — seed data has recently-active jobs so green empty state is shown
    await expect(page.getByText(/all open roles have active pipeline activity/i)).toBeVisible({ timeout: 5000 });
  });

  // E2E-19: Daily Briefing card renders with seed data (R11)
  test("daily briefing card renders on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/daily briefing/i)).toBeVisible({ timeout: 8000 });
    // Seed has today's briefing — all three blocks should render
    await expect(page.getByText(/win/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/blocker/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/action/i).first()).toBeVisible({ timeout: 5000 });
  });

  // E2E-16: Mine mode cookie persistence (R13)
  test("mine mode toggle persists via cookie across reload", async ({ page }) => {
    await page.goto("/dashboard");
    // Click "My Jobs" toggle
    await page.getByRole("button", { name: /my jobs/i }).click();
    await expect(page).toHaveURL(/mine=1/, { timeout: 5000 });
    // Reload — cookie should restore mine mode without URL param
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /my jobs/i })).toHaveClass(/bg-background/, { timeout: 5000 });
  });
});
