/* eslint-disable no-console */
const { PrismaClient, QueueEntryKind } = require("@prisma/client");

const prisma = new PrismaClient();

async function backfillSchedule(scheduleId) {
  const [signUps, guests] = await Promise.all([
    prisma.signUp.findMany({
      where: { scheduleId, withdrawnAt: null },
      select: { id: true, position: true, createdAt: true },
    }),
    prisma.guestSignUp.findMany({
      where: { scheduleId, removedAt: null },
      select: { id: true, position: true, createdAt: true },
    }),
  ]);

  const combined = [
    ...signUps.map((x) => ({
      kind: "user",
      id: x.id,
      position: x.position,
      createdAt: x.createdAt,
    })),
    ...guests.map((x) => ({
      kind: "guest",
      id: x.id,
      position: x.position,
      createdAt: x.createdAt,
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  await prisma.$transaction(async (tx) => {
    await tx.queueEntry.deleteMany({ where: { scheduleId } });

    for (let i = 0; i < combined.length; i++) {
      const row = combined[i];
      const pos = i + 1;
      if (row.kind === "user") {
        await tx.queueEntry.create({
          data: {
            scheduleId,
            position: pos,
            kind: QueueEntryKind.USER,
            signUpId: row.id,
          },
        });
        await tx.signUp.updateMany({
          where: { id: row.id, position: { not: pos } },
          data: { position: pos },
        });
      } else {
        await tx.queueEntry.create({
          data: {
            scheduleId,
            position: pos,
            kind: QueueEntryKind.GUEST,
            guestSignUpId: row.id,
          },
        });
        await tx.guestSignUp.updateMany({
          where: { id: row.id, position: { not: pos } },
          data: { position: pos },
        });
      }
    }
  });

  console.log(`[backfill] schedule ${scheduleId}: ${combined.length} queue entries`);
}

async function main() {
  const schedules = await prisma.schedule.findMany({ select: { id: true } });
  for (const s of schedules) {
    await backfillSchedule(s.id);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

