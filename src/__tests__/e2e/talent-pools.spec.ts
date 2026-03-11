import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Talent Pools (P5)
 * Requires: Supabase running locally with seed data.
 * Seed: 1 pool "Strong Engineers" with 1 member (Carol).
 */

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe("Talent Pools", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "senthil@itecbrains.com");
  });

  test("talent pools list page loads with seeded pool", async ({ page }) => {
    await page.goto("/talent-pools");
    await expect(page.getByText("Talent Pools")).toBeVisible();
    await expect(page.getByText(/strong engineers/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/1 candidate/i)).toBeVisible();
  });

  test("talent pool detail page shows members", async ({ page }) => {
    await page.goto("/talent-pools");
    await page.getByText(/strong engineers/i).click();
    await expect(page).toHaveURL(/\/talent-pools\/[a-f0-9-]+/);
    // Carol is the seeded member
    await expect(page.getByText(/carol/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("search filter narrows member list", async ({ page }) => {
    await page.goto("/talent-pools");
    await page.getByText(/strong engineers/i).click();

    // Search for something that won't match Carol
    await page.getByPlaceholder(/search by name/i).fill("zzz-no-match");
    await page.getByPlaceholder(/search by name/i).press("Enter");
    await expect(page.getByText(/no candidates match/i)).toBeVisible({ timeout: 3000 });
  });

  test("new pool page has create form", async ({ page }) => {
    await page.goto("/talent-pools/new");
    await expect(page.getByText("New Talent Pool")).toBeVisible();
    await expect(page.getByLabel(/pool name/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /create pool/i })).toBeVisible();
  });

  test("Pools nav link is present in app nav", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /pools/i })).toBeVisible();
  });
});
