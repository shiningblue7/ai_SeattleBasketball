import { test, expect } from "@playwright/test";

import {
  disconnectDb,
  getSignupForUser,
  getWaitlistNotification,
  resetDb,
  seedSchedule,
  seedSignup,
  seedUser,
} from "./helpers/db";

test.describe("core signup flow", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("user can sign up and withdraw", async ({ page }) => {
    const user = await seedUser({
      email: "player1@example.com",
      password: "password123",
      name: "Player One",
    });
    const schedule = await seedSchedule({
      title: "Wednesday Run",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 2,
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(user.email ?? "");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Wednesday Run")).toBeVisible();

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();

    await expect.poll(async () => {
      const signup = await getSignupForUser(schedule.id, user.id);
      return signup?.id ?? null;
    }).not.toBeNull();

    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();

    await expect.poll(async () => {
      const signup = await getSignupForUser(schedule.id, user.id);
      return signup ?? null;
    }).toBeNull();
  });

  test("availability updates persist", async ({ page }) => {
    const user = await seedUser({
      email: "player2@example.com",
      password: "password123",
      name: "Player Two",
    });
    const schedule = await seedSchedule({
      title: "Friday Run",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 2,
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(user.email ?? "");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Availability")).toBeVisible();

    await page.getByRole("combobox").selectOption("LATE");
    await page
      .getByPlaceholder('Optional note (e.g. "arrive 7:30" / "leave at half")')
      .fill("Running late due to traffic");
    await page.getByRole("button", { name: "Save" }).click();

    await expect.poll(async () => {
      const signup = await getSignupForUser(schedule.id, user.id);
      return signup?.attendanceStatus ?? null;
    }).toBe("LATE");

    await expect.poll(async () => {
      const signup = await getSignupForUser(schedule.id, user.id);
      return signup?.attendanceNote ?? null;
    }).toBe("Running late due to traffic");
  });

  test("waitlist notification can be enabled", async ({ page }) => {
    const existing = await seedUser({
      email: "starter@example.com",
      password: "password123",
      name: "Starter",
    });
    const user = await seedUser({
      email: "waitlist@example.com",
      password: "password123",
      name: "Waitlist User",
    });
    const schedule = await seedSchedule({
      title: "Saturday Run",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 1,
    });

    await seedSignup({
      scheduleId: schedule.id,
      userId: existing.id,
      position: 1,
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(user.email ?? "");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByRole("button", { name: "Sign up" }).click();

    const notifyButton = page.getByRole("button", { name: "Notify me if I get a spot" });
    await expect(notifyButton).toBeVisible();
    await notifyButton.click();

    await expect(page.getByRole("button", { name: "Notifications ON" })).toBeVisible();

    await expect.poll(async () => {
      const row = await getWaitlistNotification({
        scheduleId: schedule.id,
        userId: user.id,
      });
      return row?.id ?? null;
    }).not.toBeNull();
  });

  test("signed up user can add and remove a guest", async ({ page }) => {
    const user = await seedUser({
      email: "host@example.com",
      password: "password123",
      name: "Host User",
    });
    await seedSchedule({
      title: "Guest Run",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 3,
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(user.email ?? "");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByRole("button", { name: "Sign up" }).click();
    await page.getByPlaceholder("Guest name").fill("Guest One");
    await page.getByRole("button", { name: "Add guest" }).click();

    const guestRow = page.getByText("Guest One (guest)");
    await expect(guestRow).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(guestRow).toHaveCount(0);
  });

  test("waitlist status displays when user is waitlisted", async ({ page }) => {
    const existing = await seedUser({
      email: "starter2@example.com",
      password: "password123",
      name: "Starter Two",
    });
    const user = await seedUser({
      email: "waitlist2@example.com",
      password: "password123",
      name: "Waitlist Two",
    });
    const schedule = await seedSchedule({
      title: "Waitlist Run",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 1,
    });

    await seedSignup({
      scheduleId: schedule.id,
      userId: existing.id,
      position: 1,
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(user.email ?? "");
    await page.getByPlaceholder("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Your status")).toBeVisible();
    await expect(
      page.getByText("Waitlist #", { exact: false }).first()
    ).toBeVisible();
  });
});
