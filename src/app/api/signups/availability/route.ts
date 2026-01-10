import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

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
      }
    | null;

  const scheduleId = body?.scheduleId;
  const attendanceStatus = body?.attendanceStatus;
  const attendanceNoteRaw = body?.attendanceNote ?? null;
  const attendanceNote = attendanceNoteRaw ? attendanceNoteRaw.trim() : null;

  if (!scheduleId || !attendanceStatus) {
    return NextResponse.json(
      { error: "scheduleId and attendanceStatus are required" },
      { status: 400 }
    );
  }

  if (!allowedStatuses.has(attendanceStatus)) {
    return NextResponse.json({ error: "Invalid attendanceStatus" }, { status: 400 });
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
    },
    select: { id: true },
  } as Prisma.SignUpUpdateArgs);

  return NextResponse.json({ ok: true });
}
