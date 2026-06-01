import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { getPlayingKeysForSchedule, notifyWaitlistPromotionsForSchedule } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createScheduleEvent } from "@/lib/scheduleEvents";
import { ScheduleEventType } from "@prisma/client";
import { withScheduleQueueTx } from "@/lib/queueTx";
import { normalizeSchedulePositions } from "@/lib/schedulePositions";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const gate = requireAdmin(session);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = (await req.json().catch(() => null)) as
      | {
          scheduleId?: string;
          id1?: string;
          id2?: string;
          signUpId1?: string;
          signUpId2?: string;
          guestSignUpId1?: string;
          guestSignUpId2?: string;
        }
      | null;

    const scheduleId = body?.scheduleId;
    const id1 = body?.id1 ?? body?.signUpId1 ?? body?.guestSignUpId1;
    const id2 = body?.id2 ?? body?.signUpId2 ?? body?.guestSignUpId2;

    if (!scheduleId || !id1 || !id2) {
      return NextResponse.json(
        { error: "scheduleId, id1, id2 are required" },
        { status: 400 }
      );
    }

    if (id1 === id2) {
      return NextResponse.json({ ok: true });
    }

  const lookupItem = async (id: string) => {
    const signUp = await prisma.signUp.findUnique({
      where: { id },
      select: { id: true, scheduleId: true, position: true, withdrawnAt: true },
    });
    if (signUp && !signUp.withdrawnAt)
      return { kind: "user" as const, id: signUp.id, scheduleId: signUp.scheduleId, position: signUp.position };

    const guest = await prisma.guestSignUp.findUnique({
      where: { id },
      select: { id: true, scheduleId: true, position: true, removedAt: true },
    });
    if (guest && !guest.removedAt)
      return { kind: "guest" as const, id: guest.id, scheduleId: guest.scheduleId, position: guest.position };

    return null;
  };

    const [a, b] = await Promise.all([lookupItem(id1), lookupItem(id2)]);

    if (!a || !b) {
      return NextResponse.json({ error: "Signup not found" }, { status: 404 });
    }

    if (a.scheduleId !== scheduleId || b.scheduleId !== scheduleId) {
      return NextResponse.json(
        { error: "Signups do not belong to this schedule" },
        { status: 400 }
      );
    }

    const beforePlayingKeys = await getPlayingKeysForSchedule(scheduleId).catch(
      () => []
    );

    await withScheduleQueueTx(scheduleId, async (tx) => {
      // Ensure queue entries exist (older schedules may not have been backfilled yet).
      await normalizeSchedulePositions(scheduleId, tx);

      const [qa, qb] = await Promise.all([
        tx.queueEntry.findFirst({
          where: {
            scheduleId,
            ...(a.kind === "guest"
              ? { guestSignUpId: a.id }
              : { signUpId: a.id }),
          },
          select: { id: true, position: true },
        }),
        tx.queueEntry.findFirst({
          where: {
            scheduleId,
            ...(b.kind === "guest"
              ? { guestSignUpId: b.id }
              : { signUpId: b.id }),
          },
          select: { id: true, position: true },
        }),
      ]);

      if (!qa || !qb) {
        throw new Error(
          `Queue entry not found (a=${a.kind}:${a.id} b=${b.kind}:${b.id})`
        );
      }

      // Swap without violating the unique(scheduleId, position) constraint by using a temporary position.
      const tmp = -1;
      await tx.queueEntry.update({ where: { id: qa.id }, data: { position: tmp } });
      await tx.queueEntry.update({
        where: { id: qb.id },
        data: { position: qa.position },
      });
      await tx.queueEntry.update({
        where: { id: qa.id },
        data: { position: qb.position },
      });
    });

    await createScheduleEvent({
      scheduleId,
      type: ScheduleEventType.SIGNUP_SWAP,
      actorUserId: session!.user!.id,
      ...(a.kind === "guest" ? { guestSignUpId: a.id } : { signUpId: a.id }),
      metadata: {
        item1Kind: a.kind,
        item2Kind: b.kind,
        item1Id: a.id,
        item2Id: b.id,
        from1: a.position,
        to1: b.position,
        from2: b.position,
        to2: a.position,
      },
    }).catch((e) => console.error("[events] createScheduleEvent failed", e));

    await notifyWaitlistPromotionsForSchedule({
      scheduleId,
      beforePlayingKeys,
    }).catch((e) =>
      console.error("[email] notifyWaitlistPromotionsForSchedule failed", e)
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/signups/swap] POST failed", e);
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return NextResponse.json(
      { error: `Reorder failed: ${message}` },
      { status: 500 }
    );
  }
}
