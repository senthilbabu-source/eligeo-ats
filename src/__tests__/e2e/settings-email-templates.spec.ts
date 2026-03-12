import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Settings > Email Templates (Wave F4)
 *
 * Prerequisites: Logged in as owner (seeded via TENANT_A).
 * Seed data includes 5 system templates + 1 custom template.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Settings — Email Templates", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("should navigate to email templates settings", async ({ page }) => {
    await page.goto("/settings/email-templates");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.locator("h2")).toContainText("Email Templates");
  });

  test("should display seeded email templates", async ({ page }) => {
    await page.goto("/settings/email-templates");
    await expect(page.getByText("Interview Invitation")).toBeVisible();
    await expect(page.getByText("Application Rejection")).toBeVisible();
    // System badge should be visible
    await expect(page.getByText("System").first()).toBeVisible();
  });

  test("should navigate to template editor", async ({ page }) => {
    await page.goto("/settings/email-templates");
    await page.getByText("Interview Invitation").click();
    await expect(page).toHaveURL(/\/settings\/email-templates\/.+/);
    await expect(page.getByText("Back to Email Templates")).toBeVisible();
  });

  test("should navigate to new template form", async ({ page }) => {
    await page.goto("/settings/email-templates");
    await page.getByRole("link", { name: /new template/i }).click();
    await expect(page).toHaveURL("/settings/email-templates/new");
    await expect(page.getByText("New Email Template")).toBeVisible();
  });
});

test.describe("Settings — Notification Preferences", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("should display notification preferences page", async ({ page }) => {
    await page.goto("/settings/notifications");
    await expect(page.locator("h2")).toContainText("Notification Preferences");
    await expect(page.getByText("New Application")).toBeVisible();
    await expect(page.getByText("Interview Scheduled")).toBeVisible();
  });

  test("should show channel dropdowns for each event type", async ({ page }) => {
    await page.goto("/settings/notifications");
    const selects = page.locator("select");
    // Should have one dropdown per event type (8 event types)
    await expect(selects).toHaveCount(8);
  });
});
