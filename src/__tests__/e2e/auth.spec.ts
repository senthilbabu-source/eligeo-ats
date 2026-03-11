import { test, expect } from "@playwright/test";

/**
 * E2E: Authentication flow
 * Tests login, redirect to dashboard, and logout.
 * Requires: Supabase running locally with seed data.
 */

test.describe("Authentication", () => {
  test("redirects unauthenticated user to login", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to /login
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("login with valid credentials redirects to dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("senthil@itecbrains.com");
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to dashboard after successful login
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    await expect(page.getByText(/dashboard/i).first()).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("senthil@itecbrains.com");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should show an error message
    await expect(page.getByText(/invalid|error|failed/i).first()).toBeVisible({ timeout: 5000 });
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test("signup page is accessible", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create|sign up|get started/i })).toBeVisible();
  });

  test("redirects to login from protected routes", async ({ page }) => {
    // Try multiple protected routes — all should redirect to /login
    for (const route of ["/jobs", "/candidates", "/jobs/new"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    }
  });

  test("login form rejects empty email", async ({ page }) => {
    await page.goto("/login");
    // Leave email empty, fill password
    await page.getByLabel(/password/i).fill("password123");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Should stay on login page (HTML5 validation or custom error)
    await expect(page).toHaveURL(/\/login/);
  });

  test("login form rejects empty password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("senthil@itecbrains.com");
    // Leave password empty
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
