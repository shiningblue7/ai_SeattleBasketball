import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { hash } from "bcryptjs";

type SeedUserInput = {
  email: string;
  password: string;
  name?: string | null;
  roles?: string | null;
  member?: boolean;
};

type SeedScheduleInput = {
  title: string;
  date: Date;
  active?: boolean;
  limit?: number;
};

type SeedSignupInput = {
  scheduleId: string;
  userId: string;
  position: number;
  attendanceStatus?: "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";
};

type SeedGuestSignupInput = {
  scheduleId: string;
  guestName: string;
  guestOfUserId?: string | null;
  addedByUserId: string;
  position: number;
};

type WaitlistLookup = {
  scheduleId: string;
  userId: string;
};

type ScheduleLookup = {
  title: string;
};

type UserLookup = {
  email: string;
};

type SignupsLookup = {
  scheduleId: string;
};

export type CombinedQueueRow =
  | { kind: "user"; id: string; userId: string; position: number; createdAt: Date }
  | { kind: "guest"; id: string; position: number; createdAt: Date };

type PasswordResetTokenInput = {
  userId: string;
  token: string;
  expiresAt?: Date;
};

const prisma = new PrismaClient();

export async function resetDb() {
  await prisma.$transaction([
    prisma.scheduleEvent.deleteMany(),
    prisma.waitlistNotification.deleteMany(),
    prisma.guestSignUp.deleteMany(),
    prisma.signUp.deleteMany(),
    prisma.schedule.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function seedUser(input: SeedUserInput) {
  const passwordHash = await hash(input.password, 12);
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name ?? null,
      passwordHash,
      roles: input.roles ?? null,
      member: input.member ?? false,
    },
  });
}

export async function seedSchedule(input: SeedScheduleInput) {
  return prisma.schedule.create({
    data: {
      title: input.title,
      date: input.date,
      active: input.active ?? true,
      limit: input.limit ?? 1,
    },
  });
}

export async function seedSignup(input: SeedSignupInput) {
  return prisma.signUp.create({
    data: {
      scheduleId: input.scheduleId,
      userId: input.userId,
      position: input.position,
      attendanceStatus: input.attendanceStatus ?? "FULL",
    },
  });
}

export async function seedGuestSignup(input: SeedGuestSignupInput) {
  return prisma.guestSignUp.create({
    data: {
      scheduleId: input.scheduleId,
      guestName: input.guestName,
      guestOfUserId: input.guestOfUserId ?? null,
      addedByUserId: input.addedByUserId,
      position: input.position,
    },
  });
}

export async function getSignupForUser(scheduleId: string, userId: string) {
  const row = await prisma.signUp.findUnique({
    where: { scheduleId_userId: { scheduleId, userId } },
  });
  return row?.withdrawnAt ? null : row;
}

export async function getWaitlistNotification({ scheduleId, userId }: WaitlistLookup) {
  return prisma.waitlistNotification.findUnique({
    where: { userId_scheduleId: { userId, scheduleId } },
  });
}

export async function getScheduleByTitle({ title }: ScheduleLookup) {
  return prisma.schedule.findFirst({
    where: { title },
    orderBy: { createdAt: "desc" },
  });
}

export async function listSchedules() {
  return prisma.schedule.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getUserByEmail({ email }: UserLookup) {
  return prisma.user.findUnique({ where: { email } });
}

export async function listSignupsForSchedule({ scheduleId }: SignupsLookup) {
  return prisma.signUp.findMany({
    where: { scheduleId, withdrawnAt: null },
    orderBy: { position: "asc" },
  });
}

export async function listGuestSignupsForSchedule({ scheduleId }: SignupsLookup) {
  return prisma.guestSignUp.findMany({
    where: { scheduleId, removedAt: null },
    orderBy: { position: "asc" },
  });
}

export async function listCombinedQueueForSchedule({ scheduleId }: SignupsLookup) {
  const [users, guests] = await Promise.all([
    prisma.signUp.findMany({
      where: { scheduleId, withdrawnAt: null },
      select: { id: true, userId: true, position: true, createdAt: true },
    }),
    prisma.guestSignUp.findMany({
      where: { scheduleId, removedAt: null },
      select: { id: true, position: true, createdAt: true },
    }),
  ]);

  const combined: CombinedQueueRow[] = [
    ...users.map((s) => ({
      kind: "user" as const,
      id: s.id,
      userId: s.userId,
      position: s.position,
      createdAt: s.createdAt,
    })),
    ...guests.map((g) => ({
      kind: "guest" as const,
      id: g.id,
      position: g.position,
      createdAt: g.createdAt,
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return combined;
}

export async function forceMessyPositionsForSchedule({ scheduleId }: SignupsLookup) {
  // Intentionally create duplicates/gaps to validate that server-side normalization fixes it.
  const users = await prisma.signUp.findMany({
    where: { scheduleId, withdrawnAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const guests = await prisma.guestSignUp.findMany({
    where: { scheduleId, removedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const ops = [
    ...users.map((u, idx) =>
      prisma.signUp.update({
        where: { id: u.id },
        data: { position: idx % 2 === 0 ? 10 : 10 }, // duplicates on purpose
      })
    ),
    ...guests.map((g, idx) =>
      prisma.guestSignUp.update({
        where: { id: g.id },
        data: { position: idx % 2 === 0 ? 11 : 11 }, // duplicates on purpose
      })
    ),
  ];
  await prisma.$transaction(ops);
}

export async function createPasswordResetToken({
  userId,
  token,
  expiresAt,
}: PasswordResetTokenInput) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: expiresAt ?? new Date(Date.now() + 1000 * 60 * 60),
    },
  });
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
