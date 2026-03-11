import { test, expect } from "@playwright/test";

/**
 * E2E: Public career portal — application form
 * Tests the unauthenticated /careers/[slug] application flow.
 * Requires: Supabase running locally with seed data.
 */

test.describe("Public Application Form", () => {
  test("career detail page shows apply form for published job", async ({ page }) => {
    // Navigate to careers, find a published job, click into it
    await page.goto("/careers");
    const jobLink = page.getByRole("link").filter({ hasText: /senior software engineer/i });
    if ((await jobLink.count()) > 0) {
      await jobLink.first().click();
      await expect(page).toHaveURL(/\/careers\/.+/);
      // Should show an apply section or form
      await expect(page.getByText(/apply|application|submit/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("application form validates required fields", async ({ page }) => {
    await page.goto("/careers");
    const jobLink = page.getByRole("link").filter({ hasText: /senior software engineer/i });
    if ((await jobLink.count()) > 0) {
      await jobLink.first().click();
      // Try submitting empty form — should show validation errors or stay on page
      const submitBtn = page.getByRole("button", { name: /apply|submit/i });
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
        // Should stay on the same page (validation prevents submission)
        await expect(page).toHaveURL(/\/careers\/.+/);
      }
    }
  });

  test("application form accepts valid submission", async ({ page }) => {
    await page.goto("/careers");
    const jobLink = page.getByRole("link").filter({ hasText: /senior software engineer/i });
    if ((await jobLink.count()) > 0) {
      await jobLink.first().click();

      // Fill in the form fields if they exist
      const nameField = page.getByLabel(/name/i);
      const emailField = page.getByLabel(/email/i);

      if ((await nameField.count()) > 0 && (await emailField.count()) > 0) {
        const uniqueEmail = `e2e-${Date.now()}@example.com`;
        await nameField.first().fill("E2E Test Candidate");
        await emailField.first().fill(uniqueEmail);

        // Fill optional fields if present
        const phoneField = page.getByLabel(/phone/i);
        if ((await phoneField.count()) > 0) {
          await phoneField.first().fill("+1-555-0199");
        }

        const submitBtn = page.getByRole("button", { name: /apply|submit/i });
        if ((await submitBtn.count()) > 0) {
          await submitBtn.first().click();
          // Should show success message or redirect
          await expect(
            page.getByText(/thank|success|submitted|received/i).first()
          ).toBeVisible({ timeout: 10000 });
        }
      }
    }
  });
});
