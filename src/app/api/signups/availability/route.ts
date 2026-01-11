import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createScheduleEvent } from "@/lib/scheduleEvents";
import { ScheduleEventType } from "@prisma/client";

const allowedStatuses = new Set(["FULL", "LATE", "LEAVE_EARLY", "PARTIAL"] as const);

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        scheduleId?: string;
        attendanceStatus?: "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";
        attendanceNote?: string | null;
        arriveAt?: string | null;
        leaveAt?: string | null;
      }
    | null;

  const scheduleId = body?.scheduleId;
  const attendanceStatus = body?.attendanceStatus;
  const attendanceNoteRaw = body?.attendanceNote ?? null;
  const attendanceNote = attendanceNoteRaw ? attendanceNoteRaw.trim() : null;
  const arriveAtRaw = body?.arriveAt ?? null;
  const leaveAtRaw = body?.leaveAt ?? null;
  const arriveAt = arriveAtRaw ? arriveAtRaw.trim() : null;
  const leaveAt = leaveAtRaw ? leaveAtRaw.trim() : null;

  if (!scheduleId || !attendanceStatus) {
    return NextResponse.json(
      { error: "scheduleId and attendanceStatus are required" },
      { status: 400 }
    );
  }

  if (!allowedStatuses.has(attendanceStatus)) {
    return NextResponse.json({ error: "Invalid attendanceStatus" }, { status: 400 });
  }

  const timeRe = /^\d{2}:\d{2}$/;
  if (arriveAt && !timeRe.test(arriveAt)) {
    return NextResponse.json({ error: "Invalid arriveAt" }, { status: 400 });
  }
  if (leaveAt && !timeRe.test(leaveAt)) {
    return NextResponse.json({ error: "Invalid leaveAt" }, { status: 400 });
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, active: true },
  });

  if (!schedule || !schedule.active) {
    return NextResponse.json(
      { error: "Schedule not found or not active" },
      { status: 400 }
    );
  }

  const existing = await prisma.signUp.findUnique({
    where: { scheduleId_userId: { scheduleId, userId } },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "You must be signed up to set attendance" },
      { status: 403 }
    );
  }

  await prisma.signUp.update({
    where: { scheduleId_userId: { scheduleId, userId } },
    data: {
      attendanceStatus,
      attendanceNote: attendanceNote || null,
      arriveAt: arriveAt || null,
      leaveAt: leaveAt || null,
    },
    select: { id: true },
  } as Prisma.SignUpUpdateArgs);

  await createScheduleEvent({
    scheduleId,
    type: ScheduleEventType.AVAILABILITY_UPDATE,
    actorUserId: userId,
    targetUserId: userId,
    metadata: { attendanceStatus, arriveAt, leaveAt },
  }).catch((e) => console.error("[events] createScheduleEvent failed", e));

  return NextResponse.json({ ok: true });
}
