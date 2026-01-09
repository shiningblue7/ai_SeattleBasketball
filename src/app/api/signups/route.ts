import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

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
    select: { id: true, active: true },
  });

  if (!schedule || !schedule.active) {
    return NextResponse.json(
      { error: "Schedule not found or not active" },
      { status: 400 }
    );
  }

  if (action === "leave") {
    await prisma.signUp.deleteMany({
      where: { scheduleId, userId },
    });

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

  return NextResponse.json({ ok: true });
}
