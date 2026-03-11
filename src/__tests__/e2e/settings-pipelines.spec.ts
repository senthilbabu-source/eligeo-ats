import { test, expect } from "@playwright/test";

/**
 * E2E: Settings > Pipeline Builder (W1)
 *
 * Prerequisites: Logged in as owner (seeded via TENANT_A).
 * Seed data includes "Standard Engineering Pipeline" with 6 stages.
 */

test.describe("Settings — Pipeline Management", () => {
  test.beforeEach(async ({ page }) => {
    // Login as owner
    await page.goto("/login");
    await page.fill('input[name="email"]', "senthil@itecbrains.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|jobs|candidates)/);
  });

  test("should navigate to settings via nav link", async ({ page }) => {
    await page.click('a[href="/settings"]');
    await page.waitForURL("/settings/pipelines");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.locator("h2")).toContainText("Pipeline Templates");
  });

  test("should display seeded pipeline template", async ({ page }) => {
    await page.goto("/settings/pipelines");
    await expect(
      page.locator("text=Standard Engineering Pipeline"),
    ).toBeVisible();
    await expect(page.locator("text=6 stages")).toBeVisible();
    await expect(page.locator("text=Default")).toBeVisible();
  });

  test("should navigate to pipeline editor and see stages", async ({
    page,
  }) => {
    await page.goto("/settings/pipelines");
    await page.click("text=Standard Engineering Pipeline");
    await expect(page.locator("text=Applied")).toBeVisible();
    await expect(page.locator("text=Screening")).toBeVisible();
    await expect(page.locator("text=Technical")).toBeVisible();
    await expect(page.locator("text=Onsite")).toBeVisible();
    await expect(page.locator("text=Offer")).toBeVisible();
    await expect(page.locator("text=Hired")).toBeVisible();
  });
});
