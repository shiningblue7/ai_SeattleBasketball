import { test, expect, type Page } from "@playwright/test";

import {
  disconnectDb,
  getScheduleByTitle,
  listSchedules,
  resetDb,
  seedSchedule,
  seedUser,
} from "./helpers/db";

function toDatetimeLocalValue(date: Date) {
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

async function signInAsAdmin(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill("admin@example.com");
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("Sign in to view schedules and sign up")
  ).toHaveCount(0);
}

test.describe("admin schedule management", () => {
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

  test("admin can create a schedule", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/schedules");
    await expect(page.getByText("Create schedule")).toBeVisible();

    const date = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await page.getByLabel("Title").fill("New Run");
    await page.getByLabel("Date & time").fill(toDatetimeLocalValue(date));
    await page.getByLabel("Player limit").fill("10");
    await page.getByLabel("Weeks to create").fill("1");

    await page.getByRole("button", { name: "Create" }).click();

    await expect.poll(async () => {
      const sched = await getScheduleByTitle({ title: "New Run" });
      return sched?.title ?? null;
    }).toBe("New Run");
  });

  test("admin can edit schedule details", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Editable Run",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 12,
    });

    await signInAsAdmin(page);
    await page.goto("/admin/schedules");
    await expect(page.getByText("Create schedule")).toBeVisible();

    const card = page
      .locator("div.rounded-xl")
      .filter({ hasText: schedule.title })
      .filter({ has: page.getByRole("button", { name: "Edit" }) })
      .first();
    await card.getByRole("button", { name: "Edit" }).click();
    const limitInput = page.locator(`#schedule-limit-${schedule.id}`);
    await expect(limitInput).toBeVisible();
    await limitInput.fill("14");
    await page.getByRole("button", { name: "Save" }).first().click();

    await expect.poll(async () => {
      const updated = await getScheduleByTitle({ title: "Editable Run" });
      return updated?.limit ?? null;
    }).toBe(14);
  });

  test("admin can archive, restore, and set active", async ({ page }) => {
    const scheduleA = await seedSchedule({
      title: "Schedule A",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 10,
    });
    const scheduleB = await seedSchedule({
      title: "Schedule B",
      date: new Date(Date.now() + 1000 * 60 * 60 * 48),
      active: false,
      limit: 10,
    });

    await signInAsAdmin(page);
    await page.goto("/admin/schedules");
    await expect(page.getByText("Create schedule")).toBeVisible();

    const cardB = page
      .locator("div.rounded-xl")
      .filter({ hasText: scheduleB.title })
      .filter({ has: page.getByRole("button", { name: "Set active" }) })
      .first();
    await cardB.getByRole("button", { name: "Set active" }).click();

    await expect.poll(async () => {
      const all = await listSchedules();
      const active = all.filter((s) => s.active);
      return active.map((s) => s.title).sort().join(",");
    }).toBe("Schedule B");

    const cardA = page
      .locator("div.rounded-xl")
      .filter({ hasText: scheduleA.title })
      .filter({ has: page.getByRole("button", { name: "Archive" }) })
      .first();
    await cardA.getByRole("button", { name: "Archive" }).click();

    await expect.poll(async () => {
      const updated = await getScheduleByTitle({ title: scheduleA.title });
      return updated?.archivedAt ? "archived" : "not";
    }).toBe("archived");

    await page.getByRole("button", { name: "Show archived" }).click();
    const archivedCard = page
      .locator("div.rounded-xl")
      .filter({ hasText: scheduleA.title })
      .filter({ has: page.getByRole("button", { name: "Restore" }) })
      .first();
    await archivedCard.getByRole("button", { name: "Restore" }).click();

    await expect.poll(async () => {
      const updated = await getScheduleByTitle({ title: scheduleA.title });
      return updated?.archivedAt ? "archived" : "not";
    }).toBe("not");
  });
});
