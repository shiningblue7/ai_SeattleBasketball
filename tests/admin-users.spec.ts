import { expect, test, type Page } from "@playwright/test";

import { disconnectDb, getUserByEmail, resetDb, seedUser } from "./helpers/db";

async function signInAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill("admin@example.com");
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Sign in to view schedules and sign up")
  ).toHaveCount(0);
}

function rolesInclude(roles: string | null | undefined, role: string) {
  return (roles ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .includes(role.toLowerCase());
}

test.describe("admin user management", () => {
  test.beforeEach(async () => {
    await resetDb();
    await seedUser({
      email: "admin@example.com",
      password: "password123",
      name: "Admin User",
      roles: "admin,admin_notify",
    });
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("admin can toggle admin and member roles", async ({ page }) => {
    await seedUser({
      email: "player@example.com",
      password: "password123",
      name: "Player One",
      member: false,
    });

    await signInAsAdmin(page);
    await page.goto("/admin/users");
    const card = page
      .locator("div.rounded-xl")
      .filter({ hasText: "Player One" })
      .first();
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Make admin" }).click();

    await expect.poll(async () => {
      const user = await getUserByEmail({ email: "player@example.com" });
      return {
        admin: rolesInclude(user?.roles, "admin"),
        notify: rolesInclude(user?.roles, "admin_notify"),
      };
    }).toEqual({ admin: true, notify: true });

    await card.getByRole("button", { name: "Set member" }).click();

    await expect.poll(async () => {
      const user = await getUserByEmail({ email: "player@example.com" });
      return user?.member ?? null;
    }).toBe(true);
  });

  test("admin can delete a user", async ({ page }) => {
    await seedUser({
      email: "remove@example.com",
      password: "password123",
      name: "Remove Me",
    });

    await signInAsAdmin(page);
    await page.goto("/admin/users");
    const card = page
      .locator("div.rounded-xl")
      .filter({ hasText: "Remove Me" })
      .first();
    await expect(card).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Delete" }).click();

    await expect.poll(async () => {
      const user = await getUserByEmail({ email: "remove@example.com" });
      return user ? "exists" : "deleted";
    }).toBe("deleted");
  });

  test("admin can toggle admin notify", async ({ page }) => {
    await seedUser({
      email: "notify@example.com",
      password: "password123",
      name: "Notify User",
    });

    await signInAsAdmin(page);
    await page.goto("/admin/users");
    const card = page
      .locator("div.rounded-xl")
      .filter({ hasText: "Notify User" })
      .first();
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Make admin" }).click();
    await card.getByRole("button", { name: "Notify: on" }).click();

    await expect.poll(async () => {
      const user = await getUserByEmail({ email: "notify@example.com" });
      return {
        admin: rolesInclude(user?.roles, "admin"),
        notify: rolesInclude(user?.roles, "admin_notify"),
      };
    }).toEqual({ admin: true, notify: false });
  });
});
