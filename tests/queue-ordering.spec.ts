import { test, expect } from "@playwright/test";

import {
  disconnectDb,
  forceMessyPositionsForSchedule,
  listCombinedQueueForSchedule,
  resetDb,
  seedGuestSignup,
  seedSchedule,
  seedSignup,
  seedUser,
} from "./helpers/db";

async function signInAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill("admin@example.com");
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Sign in to view schedules and sign up")).toHaveCount(0);
}

async function expectQueueConsecutive(scheduleId: string) {
  await expect.poll(async () => {
    const rows = await listCombinedQueueForSchedule({ scheduleId });
    const positions = rows.map((r) => r.position);
    const unique = new Set(positions);
    const expected = positions.length ? Array.from({ length: positions.length }, (_, i) => i + 1) : [];
    const okUnique = unique.size === positions.length;
    const okConsecutive = positions.join(",") === expected.join(",");
    return { count: positions.length, okUnique, okConsecutive, positions };
  }).toEqual(
    expect.objectContaining({
      okUnique: true,
      okConsecutive: true,
    })
  );
}

test.describe("queue ordering invariants", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test.afterAll(async () => {
    await disconnectDb();
  });

  test("normalizes positions after basic mutations", async ({ page }) => {
    await seedUser({
      email: "admin@example.com",
      password: "password123",
      name: "Admin",
      roles: "admin",
    });
    const u1 = await seedUser({ email: "u1@example.com", password: "password123", name: "U1" });
    const u2 = await seedUser({ email: "u2@example.com", password: "password123", name: "U2" });
    const schedule = await seedSchedule({
      title: "Ordering Test",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 1,
    });

    // Start from a deliberately messy DB state (duplicates/gaps).
    await seedSignup({ scheduleId: schedule.id, userId: u1.id, position: 10 });
    await seedSignup({ scheduleId: schedule.id, userId: u2.id, position: 10 });
    await seedGuestSignup({
      scheduleId: schedule.id,
      guestName: "Guest1",
      guestOfUserId: u1.id,
      addedByUserId: u1.id,
      position: 11,
    });

    await forceMessyPositionsForSchedule({ scheduleId: schedule.id });

    // Admin reorder should normalize and still succeed.
    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${encodeURIComponent(schedule.id)}`);
    await expect(page.getByRole("combobox").first()).toHaveValue(schedule.id);
    // Swap the last two rows via "Up" on the last one (any reorder triggers normalization).
    const upButtons = page.getByRole("button", { name: "Up" });
    await upButtons.last().click();

    await expectQueueConsecutive(schedule.id);
  });

  test("serializes admin adds under concurrency (no duplicate/gapped positions)", async ({ page }) => {
    await seedUser({
      email: "admin@example.com",
      password: "password123",
      name: "Admin2",
      roles: "admin",
    });
    const schedule = await seedSchedule({
      title: "Concurrency Test",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 15,
    });

    const users = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        seedUser({
          email: `c${i}@example.com`,
          password: "password123",
          name: `C${i}`,
        })
      )
    );

    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${encodeURIComponent(schedule.id)}`);
    await expect(page.getByRole("combobox").first()).toHaveValue(schedule.id);

    // Fire many admin-join requests at once. They should serialize via advisory lock + normalize.
    await Promise.all(
      users.map((u) =>
        page.request.post("/api/admin/signups", {
          data: { scheduleId: schedule.id, userId: u.id, action: "join" },
        })
      )
    );

    await expectQueueConsecutive(schedule.id);
  });
});
