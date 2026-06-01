import { test, expect } from "@playwright/test";

import {
  deleteQueueEntryForSignup,
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

    // Start from a valid DB state, then intentionally make it messy (duplicates/gaps) via helper.
    await seedSignup({ scheduleId: schedule.id, userId: u1.id, position: 1 });
    await seedSignup({ scheduleId: schedule.id, userId: u2.id, position: 2 });
    await seedGuestSignup({
      scheduleId: schedule.id,
      guestName: "Guest1",
      guestOfUserId: u1.id,
      addedByUserId: u1.id,
      position: 3,
    });

    await forceMessyPositionsForSchedule({ scheduleId: schedule.id });

    // Admin reorder should normalize and still succeed.
    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${encodeURIComponent(schedule.id)}`);
    await expect(page.getByLabel("Schedule", { exact: true })).toHaveValue(schedule.id);
    // Swap the last two rows via "Up" on the last one (any reorder triggers normalization).
    const upButtons = page.getByRole("button", { name: "Up" });
    await upButtons.last().click();

    await expectQueueConsecutive(schedule.id);
  });

  test("rebuilds partial queue entries before admin reorder", async ({ page }) => {
    await seedUser({
      email: "admin@example.com",
      password: "password123",
      name: "Admin",
      roles: "admin",
    });
    const u1 = await seedUser({
      email: "partial1@example.com",
      password: "password123",
      name: "Partial 1",
    });
    const u2 = await seedUser({
      email: "partial2@example.com",
      password: "password123",
      name: "Partial 2",
    });
    const u3 = await seedUser({
      email: "partial3@example.com",
      password: "password123",
      name: "Partial 3",
    });
    const schedule = await seedSchedule({
      title: "Partial QueueEntry Test",
      date: new Date(Date.now() + 1000 * 60 * 60),
      active: true,
      limit: 15,
    });

    const signup1 = await seedSignup({
      scheduleId: schedule.id,
      userId: u1.id,
      position: 1,
    });
    const signup2 = await seedSignup({
      scheduleId: schedule.id,
      userId: u2.id,
      position: 2,
    });
    const signup3 = await seedSignup({
      scheduleId: schedule.id,
      userId: u3.id,
      position: 3,
    });

    // Regression setup: this is the mixed migration/new-schedule state that used to fail.
    // Active signup rows existed, but one of their QueueEntry rows was missing.
    await deleteQueueEntryForSignup(signup3.id);

    await signInAsAdmin(page);
    const response = await page.request.post("/api/admin/signups/swap", {
      data: {
        scheduleId: schedule.id,
        id1: signup3.id,
        id2: signup2.id,
      },
    });

    expect(response.ok()).toBe(true);
    await expectQueueConsecutive(schedule.id);
    await expect
      .poll(async () => {
        const rows = await listCombinedQueueForSchedule({ scheduleId: schedule.id });
        return rows.map((row) => row.id);
      })
      .toEqual([signup1.id, signup3.id, signup2.id]);
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
    await expect(page.getByLabel("Schedule", { exact: true })).toHaveValue(schedule.id);

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
