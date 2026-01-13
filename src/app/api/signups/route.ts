import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import {
  getPlayingKeysForSchedule,
  getSignupSlotForUser,
  notifyAdminsOfSignupChange,
  notifyWaitlistPromotionsForSchedule,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { normalizeSchedulePositions } from "@/lib/schedulePositions";
import { createScheduleEvent } from "@/lib/scheduleEvents";
import { ScheduleEventType } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const beforePlayingKeys = await getPlayingKeysForSchedule(scheduleId).catch(() => []);
    const slot = await getSignupSlotForUser(scheduleId, userId).catch(() => null);
    const res = await prisma.signUp.deleteMany({
      where: { scheduleId, userId },
    });

    if (res.count > 0) {
      await normalizeSchedulePositions(scheduleId).catch((e) =>
        console.error("[positions] normalizeSchedulePositions failed", e)
      );

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
      }).catch((e) => console.error("[email] notifyAdminsOfSignupChange failed", e));

      void notifyWaitlistPromotionsForSchedule({
        scheduleId,
        beforePlayingKeys,
      }).catch((e) => console.error("[email] notifyWaitlistPromotionsForSchedule failed", e));
    }

    return NextResponse.json({ ok: true });
  }

  const existing = await prisma.signUp.findUnique({
    where: { scheduleId_userId: { scheduleId, userId } },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ ok: true });
  }

  const [lastUser, lastGuest] = await prisma.$transaction([
    prisma.signUp.findFirst({
      where: { scheduleId },
      orderBy: [{ position: "desc" }, { createdAt: "desc" }],
      select: { position: true },
    }),
    prisma.guestSignUp.findFirst({
      where: { scheduleId },
      orderBy: [{ position: "desc" }, { createdAt: "desc" }],
      select: { position: true },
    }),
  ]);

  const nextPosition =
    Math.max(lastUser?.position ?? 0, lastGuest?.position ?? 0) + 1;

  await prisma.signUp.create({
    data: {
      scheduleId,
      userId,
      position: nextPosition,
    },
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
    }).catch((e) => console.error("[email] notifyAdminsOfSignupChange failed", e));
  }

  return NextResponse.json({ ok: true });
}
