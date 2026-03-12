import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Settings > Scorecard Templates (P3-W4)
 *
 * Prerequisites: Logged in as owner (seeded via TENANT_A).
 * Seed data includes "Engineering Interview" scorecard template
 * with 2 categories (Technical Skills, Communication) and 3 attributes.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Settings — Scorecard Templates", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("should navigate to scorecard templates settings", async ({ page }) => {
    await page.goto("/settings/scorecards");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.locator("h2")).toContainText("Scorecard Templates");
  });

  test("should display seeded scorecard template", async ({ page }) => {
    await page.goto("/settings/scorecards");
    await expect(
      page.getByText("Engineering Interview"),
    ).toBeVisible();
    await expect(page.getByText(/2 categor/)).toBeVisible();
  });

  test("should navigate to template editor and see categories", async ({ page }) => {
    await page.goto("/settings/scorecards");
    await page.getByText("Engineering Interview").click();
    await expect(page).toHaveURL(/\/settings\/scorecards\/.+/);
    await expect(page.getByText("Technical Skills")).toBeVisible();
    await expect(page.getByText("Communication")).toBeVisible();
  });

  test("should navigate to new template form", async ({ page }) => {
    await page.goto("/settings/scorecards");
    await page.getByRole("link", { name: /new template/i }).click();
    await expect(page).toHaveURL("/settings/scorecards/new");
    await expect(page.getByText("New Scorecard Template")).toBeVisible();
    await expect(page.getByText("Categories")).toBeVisible();
  });
});
