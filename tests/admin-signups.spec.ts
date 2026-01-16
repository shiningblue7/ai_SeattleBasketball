import { expect, test, type Page } from "@playwright/test";

import {
  disconnectDb,
  listSignupsForSchedule,
  resetDb,
  seedSchedule,
  seedSignup,
  seedUser,
} from "./helpers/db";

async function signInAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill("admin@example.com");
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Sign in to view schedules and sign up")
  ).toHaveCount(0);
}

test.describe("admin signups", () => {
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

  test("admin can remove a signup", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Run Day",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 12,
    });
    const userA = await seedUser({
      email: "player1@example.com",
      password: "password123",
      name: "Player One",
    });
    const userB = await seedUser({
      email: "player2@example.com",
      password: "password123",
      name: "Player Two",
    });
    await seedSignup({ scheduleId: schedule.id, userId: userA.id, position: 1 });
    await seedSignup({ scheduleId: schedule.id, userId: userB.id, position: 2 });

    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${schedule.id}`);

    const card = page
      .locator("div.rounded-xl")
      .filter({ hasText: "Player Two" })
      .first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Remove" }).click();

    await expect.poll(async () => {
      const signups = await listSignupsForSchedule({ scheduleId: schedule.id });
      return signups.map((s) => s.userId);
    }).toEqual([userA.id]);
  });

  test("admin can reorder signups", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Reorder Run",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 12,
    });
    const userA = await seedUser({
      email: "swap1@example.com",
      password: "password123",
      name: "Swap One",
    });
    const userB = await seedUser({
      email: "swap2@example.com",
      password: "password123",
      name: "Swap Two",
    });
    await seedSignup({ scheduleId: schedule.id, userId: userA.id, position: 1 });
    await seedSignup({ scheduleId: schedule.id, userId: userB.id, position: 2 });

    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${schedule.id}`);

    const card = page
      .locator("div.rounded-xl")
      .filter({ hasText: "Swap One" })
      .first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Down" }).click();

    await expect.poll(async () => {
      const signups = await listSignupsForSchedule({ scheduleId: schedule.id });
      return signups.map((s) => s.userId);
    }).toEqual([userB.id, userA.id]);
  });
});
