import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import {
  getPlayingKeysForSchedule,
  getSignupSlotForUser,
  notifyAdminsOfSignupChange,
  notifyWaitlistPromotionsForSchedule,
  recordWaitlistPromotionsForSchedule,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createScheduleEvent } from "@/lib/scheduleEvents";
import { ScheduleEventType } from "@prisma/client";
import { withScheduleQueueTx } from "@/lib/queueTx";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Guard against stale sessions pointing to a user that doesn't exist anymore (e.g. local DB restore).
    const userExists = await prisma.user
      .findUnique({ where: { id: userId }, select: { id: true } })
      .catch(() => null);
    if (!userExists) {
      return NextResponse.json(
        { error: "Your session is out of date. Please sign out and sign in again." },
        { status: 401 }
      );
    }

    const body = (await req.json().catch(() => null)) as
      | { scheduleId?: string; action?: "join" | "leave" }
      | null;

    const scheduleId = body?.scheduleId;
    const action = body?.action;

    if (!scheduleId || !action) {
      return NextResponse.json(
        { error: "scheduleId and action are required" },
        { status: 400 }
      );
    }

    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { id: true, active: true, title: true, date: true },
    });

    if (!schedule || !schedule.active) {
      return NextResponse.json(
        { error: "Schedule not found or not active" },
        { status: 400 }
      );
    }

    if (action === "leave") {
      const beforePlayingKeys = await getPlayingKeysForSchedule(scheduleId).catch(
        () => []
      );
      const slot = await getSignupSlotForUser(scheduleId, userId).catch(() => null);
      const res = await withScheduleQueueTx(scheduleId, async (tx) => {
        const updateRes = await tx.signUp.updateMany({
          where: { scheduleId, userId, withdrawnAt: null },
          data: { withdrawnAt: new Date() },
        });

        // Remove the active queue entry (if any).
        const s = await tx.signUp.findUnique({
          where: { scheduleId_userId: { scheduleId, userId } },
          select: { id: true },
        });
        if (s?.id) {
          await tx.queueEntry.deleteMany({ where: { scheduleId, signUpId: s.id } });
        }

        return updateRes;
      });

      if (res.count > 0) {
        await createScheduleEvent({
          scheduleId,
          type: ScheduleEventType.SIGNUP_LEAVE,
          actorUserId: userId,
          targetUserId: userId,
          metadata: slot ? ({ slot } as const) : null,
        }).catch((e) => console.error("[events] createScheduleEvent failed", e));

        const actorLabel = session?.user?.name ?? session?.user?.email ?? userId;
        void notifyAdminsOfSignupChange({
          action: "leave",
          schedule: { id: schedule.id, title: schedule.title, date: schedule.date },
          actor: { id: userId, label: actorLabel },
          target: { id: userId, label: actorLabel },
          slot,
        }).catch((e) =>
          console.error("[email] notifyAdminsOfSignupChange failed", e)
        );

        void notifyWaitlistPromotionsForSchedule({
          scheduleId,
          beforePlayingKeys,
        }).catch((e) =>
          console.error("[email] notifyWaitlistPromotionsForSchedule failed", e)
        );

        void recordWaitlistPromotionsForSchedule({
          scheduleId,
          beforePlayingKeys,
          actorUserId: userId,
        }).catch((e) =>
          console.error("[events] recordWaitlistPromotionsForSchedule failed", e)
        );
      }

      return NextResponse.json({ ok: true });
    }

    const existing = await prisma.signUp.findUnique({
      where: { scheduleId_userId: { scheduleId, userId } },
      select: { id: true, withdrawnAt: true },
    });

    if (existing && !existing.withdrawnAt) {
      return NextResponse.json({ ok: true });
    }

    await withScheduleQueueTx(scheduleId, async (tx) => {
      const last = await tx.queueEntry.findFirst({
        where: { scheduleId },
        orderBy: [{ position: "desc" }, { createdAt: "desc" }],
        select: { position: true },
      });
      const nextPosition = (last?.position ?? 0) + 1;

      const signUpId =
        existing && existing.withdrawnAt
          ? (
              await tx.signUp.update({
                where: { scheduleId_userId: { scheduleId, userId } },
                data: { withdrawnAt: null, position: nextPosition },
                select: { id: true },
              })
            ).id
          : (
              await tx.signUp.create({
                data: {
                  scheduleId,
                  userId,
                  position: nextPosition,
                },
                select: { id: true },
              })
            ).id;

      await tx.queueEntry.upsert({
        where: { signUpId },
        create: {
          scheduleId,
          position: nextPosition,
          kind: "USER",
          signUpId,
        },
        update: {
          scheduleId,
          position: nextPosition,
          kind: "USER",
        },
      });
    });

    await createScheduleEvent({
      scheduleId,
      type: ScheduleEventType.SIGNUP_JOIN,
      actorUserId: userId,
      targetUserId: userId,
    }).catch((e) => console.error("[events] createScheduleEvent failed", e));

    {
      const actorLabel = session?.user?.name ?? session?.user?.email ?? userId;
      void notifyAdminsOfSignupChange({
        action: "join",
        schedule: { id: schedule.id, title: schedule.title, date: schedule.date },
        actor: { id: userId, label: actorLabel },
        target: { id: userId, label: actorLabel },
      }).catch((e) =>
        console.error("[email] notifyAdminsOfSignupChange failed", e)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Ensure the client gets something actionable (and not HTML) so it can display the error.
    console.error("[api/signups] POST failed", e);
    const message =
      e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
    return NextResponse.json(
      { error: `Sign up failed: ${message}` },
      { status: 500 }
    );
  }
}
