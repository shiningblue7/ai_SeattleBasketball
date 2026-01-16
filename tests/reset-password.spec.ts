import { expect, test, type Page } from "@playwright/test";

import {
  createPasswordResetToken,
  disconnectDb,
  resetDb,
  seedUser,
} from "./helpers/db";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Sign in to view schedules and sign up")
  ).toHaveCount(0);
}

test.describe("password reset", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("user can reset password with valid token", async ({ page }) => {
    const user = await seedUser({
      email: "reset@example.com",
      password: "oldpassword",
      name: "Reset User",
    });
    const token = "valid-reset-token";
    await createPasswordResetToken({ userId: user.id, token });

    await page.goto(`/reset-password?token=${token}&email=reset@example.com`);

    await page.getByPlaceholder("New password").fill("newpassword123");
    await page.getByPlaceholder("Confirm password").fill("newpassword123");
    await page.getByRole("button", { name: "Set new password" }).click();

    await expect(
      page.getByText("Password updated. You can now sign in.")
    ).toBeVisible();

    await signIn(page, "reset@example.com", "newpassword123");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("invalid reset token shows error", async ({ page }) => {
    await seedUser({
      email: "invalid@example.com",
      password: "oldpassword",
      name: "Invalid User",
    });

    await page.goto(
      "/reset-password?token=bad-token&email=invalid@example.com"
    );

    await page.getByPlaceholder("New password").fill("newpassword123");
    await page.getByPlaceholder("Confirm password").fill("newpassword123");
    await page.getByRole("button", { name: "Set new password" }).click();

    await expect(
      page.getByText("Invalid or expired reset link")
    ).toBeVisible();
  });
});
