import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import {
  getPlayingKeysForSchedule,
  getSignupSlotForUser,
  notifyAdminsOfSignupChange,
  notifyWaitlistPromotionsForSchedule,
} from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { normalizeSchedulePositions } from "@/lib/schedulePositions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | { scheduleId?: string; userId?: string; action?: "join" | "leave" }
    | null;

  const scheduleId = body?.scheduleId;
  const userId = body?.userId;
  const action = body?.action;

  if (!scheduleId || !userId || !action) {
    return NextResponse.json(
      { error: "scheduleId, userId, action are required" },
      { status: 400 }
    );
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, title: true, date: true },
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
    const res = await prisma.signUp.deleteMany({
      where: { scheduleId, userId },
    });

    if (res.count > 0) {
      await normalizeSchedulePositions(scheduleId).catch((e) =>
        console.error("[positions] normalizeSchedulePositions failed", e)
      );

      const actorId = session!.user!.id;
      const actorLabel = session!.user!.name ?? session!.user!.email ?? actorId;
      const targetLabel = user.name ?? user.email ?? user.id;
      await notifyAdminsOfSignupChange({
        action: "leave",
        schedule: { id: schedule.id, title: schedule.title, date: schedule.date },
        actor: { id: actorId, label: actorLabel },
        target: { id: user.id, label: targetLabel },
        slot,
      }).catch((e) => console.error("[email] notifyAdminsOfSignupChange failed", e));

      await notifyWaitlistPromotionsForSchedule({
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

  const last = await prisma.signUp.findFirst({
    where: { scheduleId },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });

  const nextPosition = (last?.position ?? 0) + 1;

  await prisma.signUp.create({
    data: {
      scheduleId,
      userId,
      position: nextPosition,
    },
  });

  {
    const actorId = session!.user!.id;
    const actorLabel = session!.user!.name ?? session!.user!.email ?? actorId;
    const targetLabel = user.name ?? user.email ?? user.id;
    await notifyAdminsOfSignupChange({
      action: "join",
      schedule: { id: schedule.id, title: schedule.title, date: schedule.date },
      actor: { id: actorId, label: actorLabel },
      target: { id: user.id, label: targetLabel },
    }).catch((e) => console.error("[email] notifyAdminsOfSignupChange failed", e));
  }

  return NextResponse.json({ ok: true });
}
