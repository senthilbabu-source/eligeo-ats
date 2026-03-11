import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Command bar (⌘K)
 * Tests opening the command bar and navigating via quick patterns.
 * Requires: Logged in user, Supabase running.
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Command Bar", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("opens with Cmd+K", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    // Command bar dialog should appear
    await expect(page.getByRole("dialog").or(page.locator("[data-command-bar]")).or(page.getByPlaceholder(/search|command|type/i))).toBeVisible({
      timeout: 3000,
    });
  });

  test("closes with Escape", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    await expect(page.getByPlaceholder(/search|command|type/i)).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("Escape");
    // Should be hidden
    await expect(page.getByPlaceholder(/search|command|type/i)).toBeHidden({ timeout: 3000 });
  });

  test("typing 'jobs' shows navigation suggestion", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder(/search|command|type/i);
    await expect(input).toBeVisible({ timeout: 3000 });

    await input.fill("jobs");
    // Should show a navigation option for jobs
    await expect(page.getByText(/navigate to jobs|go to jobs|jobs/i).first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("can navigate to jobs via command bar", async ({ page }) => {
    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder(/search|command|type/i);
    await expect(input).toBeVisible({ timeout: 3000 });

    await input.fill("jobs");
    // Wait for suggestion to appear, then press Enter
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");

    // Should navigate to /jobs
    await expect(page).toHaveURL(/\/jobs/, { timeout: 5000 });
  });
});
