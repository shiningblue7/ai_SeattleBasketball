import { expect, test, type Page } from "@playwright/test";

import {
  disconnectDb,
  listCombinedQueueForSchedule,
  listGuestSignupsForSchedule,
  listSignupsForSchedule,
  resetDb,
  seedSchedule,
  seedGuestSignup,
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

  test("admin can add a user at a specific queue position", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Insert User Run",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 12,
    });
    const userA = await seedUser({
      email: "insert1@example.com",
      password: "password123",
      name: "Insert One",
    });
    const userB = await seedUser({
      email: "insert2@example.com",
      password: "password123",
      name: "Insert Two",
    });
    const userC = await seedUser({
      email: "insert3@example.com",
      password: "password123",
      name: "Insert Three",
    });
    await seedSignup({ scheduleId: schedule.id, userId: userA.id, position: 1 });
    await seedSignup({ scheduleId: schedule.id, userId: userB.id, position: 2 });

    await signInAsAdmin(page);
    const response = await page.request.post("/api/admin/signups", {
      data: {
        scheduleId: schedule.id,
        userId: userC.id,
        action: "join",
        position: 2,
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      position: 2,
      status: "playing",
      userLabel: "Insert Three",
    });
    await expect.poll(async () => {
      const rows = await listCombinedQueueForSchedule({ scheduleId: schedule.id });
      return rows.map((row) => row.kind === "user" ? row.userId : row.id);
    }).toEqual([userA.id, userC.id, userB.id]);
  });

  test("admin add user UI clears selection and shows inserted position", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Inline Add Run",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 12,
    });
    const userA = await seedUser({
      email: "inline1@example.com",
      password: "password123",
      name: "Inline One",
    });
    await seedUser({
      email: "inline2@example.com",
      password: "password123",
      name: "Inline Two",
    });
    await seedSignup({ scheduleId: schedule.id, userId: userA.id, position: 1 });

    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${schedule.id}`);

    const addUserSection = page.getByRole("region", { name: "Add user to schedule" });
    const search = addUserSection.getByPlaceholder("Type a name or email…");
    await search.fill("Inline Two");
    await addUserSection.getByRole("button", { name: /Inline Two/ }).click();
    await addUserSection.getByRole("button", { name: "Add" }).click();

    await expect(addUserSection.getByText("Added Inline Two at #2 (playing).")).toBeVisible();
    await expect(search).toHaveValue("");
  });

  test("admin add user search hides users already signed up", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Hidden Signed Up Run",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 12,
    });
    const signedUp = await seedUser({
      email: "hidden-signed-up@example.com",
      password: "password123",
      name: "Hidden Signed Up",
    });
    await seedSignup({ scheduleId: schedule.id, userId: signedUp.id, position: 1 });

    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${schedule.id}`);

    const addUserSection = page.getByRole("region", { name: "Add user to schedule" });
    await expect(
      addUserSection.getByText("Already signed-up users are hidden from search results.")
    ).toBeVisible();
    await addUserSection.getByPlaceholder("Type a name or email…").fill("Hidden Signed Up");
    await expect(addUserSection.getByRole("button", { name: /Hidden Signed Up/ })).toHaveCount(0);
  });

  test("admin can add a guest at a specific queue position", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Insert Guest Run",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 12,
    });
    const userA = await seedUser({
      email: "guest-insert1@example.com",
      password: "password123",
      name: "Guest Insert One",
    });
    const userB = await seedUser({
      email: "guest-insert2@example.com",
      password: "password123",
      name: "Guest Insert Two",
    });
    await seedSignup({ scheduleId: schedule.id, userId: userA.id, position: 1 });
    await seedSignup({ scheduleId: schedule.id, userId: userB.id, position: 2 });

    await signInAsAdmin(page);
    const response = await page.request.post("/api/guests", {
      data: {
        scheduleId: schedule.id,
        guestName: "Inserted Guest",
        guestOfUserId: userA.id,
        position: 2,
      },
    });

    expect(response.ok()).toBe(true);
    await expect(response.json()).resolves.toMatchObject({
      position: 2,
      status: "playing",
      guestName: "Inserted Guest",
    });
    await expect.poll(async () => {
      const rows = await listCombinedQueueForSchedule({ scheduleId: schedule.id });
      return rows.map((row) => row.kind === "user" ? row.userId : "guest");
    }).toEqual([userA.id, "guest", userB.id]);
  });

  test("admin can promote a waitlist guest into playing", async ({ page }) => {
    const schedule = await seedSchedule({
      title: "Boundary Run",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24),
      active: true,
      limit: 2,
    });
    const userA = await seedUser({
      email: "boundary1@example.com",
      password: "password123",
      name: "Boundary One",
    });
    const userB = await seedUser({
      email: "boundary2@example.com",
      password: "password123",
      name: "Boundary Two",
    });
    const guestOwner = await seedUser({
      email: "guest-owner@example.com",
      password: "password123",
      name: "Guest Owner",
    });
    await seedSignup({ scheduleId: schedule.id, userId: userA.id, position: 1 });
    await seedSignup({ scheduleId: schedule.id, userId: userB.id, position: 2 });
    await seedGuestSignup({
      scheduleId: schedule.id,
      guestName: "Waitlist Guest",
      guestOfUserId: guestOwner.id,
      addedByUserId: guestOwner.id,
      position: 3,
    });

    await signInAsAdmin(page);
    await page.goto(`/admin/signups?scheduleId=${schedule.id}`);

    await expect(page.getByText("Waitlist starts here")).toBeVisible();

    const guestCard = page
      .locator("div.rounded-xl")
      .filter({ hasText: "Waitlist Guest" })
      .first();
    await expect(guestCard).toBeVisible();
    await guestCard.getByRole("button", { name: "Promote" }).click();

    await expect.poll(async () => {
      const users = await listSignupsForSchedule({ scheduleId: schedule.id });
      return users.map((s) => s.userId);
    }).toEqual([userA.id, userB.id]);

    await expect.poll(async () => {
      const guests = await listGuestSignupsForSchedule({ scheduleId: schedule.id });
      return guests.map((g) => g.position);
    }).toEqual([2]);
  });
});
