import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type PrismaLike = typeof prisma | Prisma.TransactionClient;

type CombinedRow =
  | {
      kind: "user";
      id: string;
      position: number;
      createdAt: Date;
    }
  | {
      kind: "guest";
      id: string;
      position: number;
      createdAt: Date;
    };

export async function normalizeSchedulePositions(scheduleId: string, db: PrismaLike = prisma) {
  // Phase B (option A): QueueEntry is the source of truth for ordering.
  // We normalize queue entries first, then mirror positions back to SignUp/GuestSignUp for compatibility.

  const entries = await db.queueEntry.findMany({
    where: { scheduleId },
    select: {
      id: true,
      position: true,
      createdAt: true,
      signUpId: true,
      guestSignUpId: true,
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  if (entries.length === 0) return;

  const entryPosUpdates = entries
    .map((e, idx) => ({ id: e.id, from: e.position, to: idx + 1 }))
    .filter((x) => x.from !== x.to)
    .map((x) =>
      db.queueEntry.update({ where: { id: x.id }, data: { position: x.to }, select: { id: true } })
    );

  if (entryPosUpdates.length) {
    await Promise.all(entryPosUpdates);
  }

  // Re-fetch after normalization so the mirrored positions match the final order.
  const normalized = entryPosUpdates.length
    ? await db.queueEntry.findMany({
        where: { scheduleId },
        select: { position: true, signUpId: true, guestSignUpId: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      })
    : entries.map((e, idx) => ({ position: idx + 1, signUpId: e.signUpId, guestSignUpId: e.guestSignUpId }));

  const mirrorOps: Array<Prisma.PrismaPromise<unknown>> = [];
  for (const e of normalized) {
    if (e.signUpId) {
      mirrorOps.push(
        db.signUp.updateMany({
          where: { id: e.signUpId, position: { not: e.position } },
          data: { position: e.position },
        })
      );
    } else if (e.guestSignUpId) {
      mirrorOps.push(
        db.guestSignUp.updateMany({
          where: { id: e.guestSignUpId, position: { not: e.position } },
          data: { position: e.position },
        })
      );
    }
  }

  if (mirrorOps.length) await Promise.all(mirrorOps);
}
