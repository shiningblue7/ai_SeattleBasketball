import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
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
import { insertQueueEntryAtPosition } from "@/lib/schedulePositions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | { scheduleId?: string; userId?: string; action?: "join" | "leave"; position?: number | null }
    | null;

  const scheduleId = body?.scheduleId;
  const userId = body?.userId;
  const action = body?.action;
  const requestedPosition =
    typeof body?.position === "number" && Number.isFinite(body.position)
      ? body.position
      : null;

  if (!scheduleId || !userId || !action) {
    return NextResponse.json(
      { error: "scheduleId, userId, action are required" },
      { status: 400 }
    );
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, title: true, date: true, limit: true },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (action === "leave") {
    const beforePlayingKeys = await getPlayingKeysForSchedule(scheduleId).catch(() => []);
    const slot = await getSignupSlotForUser(scheduleId, userId).catch(() => null);
    const res = await withScheduleQueueTx(scheduleId, async (tx) => {
      const updateRes = await tx.signUp.updateMany({
        where: { scheduleId, userId, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });
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
      const actorId = session!.user!.id;
      await createScheduleEvent({
        scheduleId,
        type: ScheduleEventType.ADMIN_SIGNUP_LEAVE,
        actorUserId: actorId,
        targetUserId: userId,
        metadata: slot ? ({ slot } as const) : null,
      }).catch((e) => console.error("[events] createScheduleEvent failed", e));

      const actorLabel = session!.user!.name ?? session!.user!.email ?? actorId;
      const targetLabel = user.name ?? user.email ?? user.id;
      void notifyAdminsOfSignupChange({
        action: "leave",
        schedule: { id: schedule.id, title: schedule.title, date: schedule.date },
        actor: { id: actorId, label: actorLabel },
        target: { id: user.id, label: targetLabel },
        slot,
      }).catch((e) => console.error("[email] notifyAdminsOfSignupChange failed", e));

      void notifyWaitlistPromotionsForSchedule({
        scheduleId,
        beforePlayingKeys,
      }).catch((e) => console.error("[email] notifyWaitlistPromotionsForSchedule failed", e));

      void recordWaitlistPromotionsForSchedule({
        scheduleId,
        beforePlayingKeys,
        actorUserId: actorId,
      }).catch((e) => console.error("[events] recordWaitlistPromotionsForSchedule failed", e));
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

  const assignedPosition = await withScheduleQueueTx(scheduleId, async (tx) => {
    if (existing && existing.withdrawnAt) {
      const updated = await tx.signUp.update({
        where: { scheduleId_userId: { scheduleId, userId } },
        data: { withdrawnAt: null },
        select: { id: true },
      });
      const position = await insertQueueEntryAtPosition({
        db: tx,
        scheduleId,
        kind: "USER",
        signUpId: updated.id,
        requestedPosition,
      });
      await tx.signUp.update({
        where: { id: updated.id },
        data: { position },
        select: { id: true },
      });
      return position;
    } else {
      const created = await tx.signUp.create({
        data: {
          scheduleId,
          userId,
          position: requestedPosition ?? 0,
        },
        select: { id: true },
      });
      const position = await insertQueueEntryAtPosition({
        db: tx,
        scheduleId,
        kind: "USER",
        signUpId: created.id,
        requestedPosition,
      });
      await tx.signUp.update({
        where: { id: created.id },
        data: { position },
        select: { id: true },
      });
      return position;
    }
  });

  {
    const actorId = session!.user!.id;
    await createScheduleEvent({
      scheduleId,
      type: ScheduleEventType.ADMIN_SIGNUP_JOIN,
      actorUserId: actorId,
      targetUserId: userId,
    }).catch((e) => console.error("[events] createScheduleEvent failed", e));
  }

  {
    const actorId = session!.user!.id;
    const actorLabel = session!.user!.name ?? session!.user!.email ?? actorId;
    const targetLabel = user.name ?? user.email ?? user.id;
    void notifyAdminsOfSignupChange({
      action: "join",
      schedule: { id: schedule.id, title: schedule.title, date: schedule.date },
      actor: { id: actorId, label: actorLabel },
      target: { id: user.id, label: targetLabel },
    }).catch((e) => console.error("[email] notifyAdminsOfSignupChange failed", e));
  }

  return NextResponse.json({
    ok: true,
    position: assignedPosition,
    status: assignedPosition <= schedule.limit ? "playing" : "waitlist",
    userLabel: user.name ?? user.email ?? user.id,
  });
}
