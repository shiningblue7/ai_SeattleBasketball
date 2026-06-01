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
    prisma.queueEntry.deleteMany(),
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
  const signUp = await prisma.signUp.create({
    data: {
      scheduleId: input.scheduleId,
      userId: input.userId,
      position: input.position,
      attendanceStatus: input.attendanceStatus ?? "FULL",
    },
  });
  await prisma.queueEntry.create({
    data: {
      scheduleId: input.scheduleId,
      position: input.position,
      kind: "USER",
      signUpId: signUp.id,
    },
  });
  return signUp;
}

export async function seedGuestSignup(input: SeedGuestSignupInput) {
  const guest = await prisma.guestSignUp.create({
    data: {
      scheduleId: input.scheduleId,
      guestName: input.guestName,
      guestOfUserId: input.guestOfUserId ?? null,
      addedByUserId: input.addedByUserId,
      position: input.position,
    },
  });
  await prisma.queueEntry.create({
    data: {
      scheduleId: input.scheduleId,
      position: input.position,
      kind: "GUEST",
      guestSignUpId: guest.id,
    },
  });
  return guest;
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
  const entries = await prisma.queueEntry.findMany({
    where: { scheduleId },
    select: {
      kind: true,
      position: true,
      createdAt: true,
      signUpId: true,
      guestSignUpId: true,
      signUp: { select: { id: true, userId: true } },
      guestSignUp: { select: { id: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return entries.map((e) => {
    if (e.kind === "USER" && e.signUp) {
      return {
        kind: "user",
        id: e.signUp.id,
        userId: e.signUp.userId,
        position: e.position,
        createdAt: e.createdAt,
      } as const;
    }
    return {
      kind: "guest",
      id: e.guestSignUp?.id ?? e.guestSignUpId ?? e.signUpId ?? e.signUp?.id ?? "unknown",
      position: e.position,
      createdAt: e.createdAt,
    } as const;
  }) as CombinedQueueRow[];
}

export async function forceMessyPositionsForSchedule({ scheduleId }: SignupsLookup) {
  // Intentionally create gaps/out-of-range positions (but keep them unique) to validate normalization.
  const entries = await prisma.queueEntry.findMany({
    where: { scheduleId },
    select: { id: true, kind: true },
    orderBy: { createdAt: "asc" },
  });
  await prisma.$transaction(
    entries.map((e, idx) =>
      prisma.queueEntry.update({
        where: { id: e.id },
        data: { position: 100 + idx * 10 }, // gaps on purpose, still unique
      })
    )
  );
}

export async function deleteQueueEntryForSignup(signUpId: string) {
  return prisma.queueEntry.deleteMany({ where: { signUpId } });
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
