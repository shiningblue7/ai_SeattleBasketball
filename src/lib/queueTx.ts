import { prisma } from "@/lib/prisma";
import { normalizeSchedulePositions } from "@/lib/schedulePositions";
import type { Prisma } from "@prisma/client";

// Phase A: keep queue ordering robust under concurrency by:
// 1) taking a per-schedule advisory lock (scoped to the transaction)
// 2) performing the mutation
// 3) normalizing positions
//
// This keeps positions consecutive even if multiple requests hit at once.
export async function withScheduleQueueTx<T>(
  scheduleId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Use a transaction-level advisory lock. This serializes queue edits per schedule.
    // We hash the scheduleId string down to a 64-bit key using Postgres' hashtextextended.
    // Note: Neon/Postgres supports advisory locks; lock is released automatically at tx end.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scheduleId}, 0))`;

    const result = await fn(tx);

    // Normalize at the end of every queue mutation to prevent drift/duplicates.
    // normalizeSchedulePositions uses the global prisma client; that's fine, but it would be
    // nicer to use the same tx. We keep it simple and run it after the mutation while the
    // lock is still held by this transaction.
    await normalizeSchedulePositions(scheduleId, tx);

    return result;
  });
}
