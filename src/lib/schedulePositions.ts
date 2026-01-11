import { prisma } from "@/lib/prisma";

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

export async function normalizeSchedulePositions(scheduleId: string) {
  const [users, guests] = await prisma.$transaction([
    prisma.signUp.findMany({
      where: { scheduleId },
      select: { id: true, position: true, createdAt: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
    prisma.guestSignUp.findMany({
      where: { scheduleId },
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
        return prisma.signUp.update({
          where: { id: row.id },
          data: { position: desired },
          select: { id: true },
        });
      }
      return prisma.guestSignUp.update({
        where: { id: row.id },
        data: { position: desired },
        select: { id: true },
      });
    });

  if (updates.length === 0) return;

  await prisma.$transaction(updates);
}
