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
  const [users, guests] = await Promise.all([
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

  const combined: CombinedRow[] = [
    ...users.map((s) => ({
      kind: "user" as const,
      id: s.id,
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

  const updates = combined
    .map((row, idx) => ({ row, desired: idx + 1 }))
    .filter(({ row, desired }) => row.position !== desired)
    .map(({ row, desired }) => {
      if (row.kind === "user") {
        return db.signUp.update({
          where: { id: row.id },
          data: { position: desired },
          select: { id: true },
        });
      }
      return db.guestSignUp.update({
        where: { id: row.id },
        data: { position: desired },
        select: { id: true },
      });
    });

  if (updates.length === 0) return;

  await Promise.all(updates);
}
