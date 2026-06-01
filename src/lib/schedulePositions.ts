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

  const [activeSignUps, activeGuests] = await Promise.all([
    db.signUp.findMany({
      where: { scheduleId, withdrawnAt: null },
      select: { id: true, position: true, createdAt: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    db.guestSignUp.findMany({
      where: { scheduleId, removedAt: null },
      select: { id: true, position: true, createdAt: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  let entries = await db.queueEntry.findMany({
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

  const activeSignUpIds = new Set(activeSignUps.map((s) => s.id));
  const activeGuestIds = new Set(activeGuests.map((g) => g.id));
  const entrySignUpIds = new Set(entries.map((e) => e.signUpId).filter((id): id is string => Boolean(id)));
  const entryGuestIds = new Set(entries.map((e) => e.guestSignUpId).filter((id): id is string => Boolean(id)));
  const hasMissingEntries =
    activeSignUps.some((s) => !entrySignUpIds.has(s.id)) ||
    activeGuests.some((g) => !entryGuestIds.has(g.id));
  const hasStaleEntries = entries.some((e) => {
    if (e.signUpId) return !activeSignUpIds.has(e.signUpId);
    if (e.guestSignUpId) return !activeGuestIds.has(e.guestSignUpId);
    return true;
  });
  const hasWrongCount = entries.length !== activeSignUps.length + activeGuests.length;

  // If QueueEntry rows are missing/stale for a schedule (e.g. partial backfill or older data),
  // rebuild them from the active SignUp/GuestSignUp rows so admin reorder keeps working.
  if (hasMissingEntries || hasStaleEntries || hasWrongCount) {
    const combined = [
      ...activeSignUps.map((s) => ({ kind: "USER" as const, id: s.id, position: s.position, createdAt: s.createdAt })),
      ...activeGuests.map((g) => ({ kind: "GUEST" as const, id: g.id, position: g.position, createdAt: g.createdAt })),
    ].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    await db.queueEntry.deleteMany({ where: { scheduleId } });
    await Promise.all(
      combined.map((row, idx) => {
        const pos = idx + 1;
        if (row.kind === "USER") {
          return db.queueEntry.create({
            data: { scheduleId, position: pos, kind: "USER", signUpId: row.id },
            select: { id: true },
          });
        }
        return db.queueEntry.create({
          data: { scheduleId, position: pos, kind: "GUEST", guestSignUpId: row.id },
          select: { id: true },
        });
      })
    );

    entries = await db.queueEntry.findMany({
      where: { scheduleId },
      select: { id: true, position: true, createdAt: true, signUpId: true, guestSignUpId: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });

    if (entries.length === 0) return;
  }

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
