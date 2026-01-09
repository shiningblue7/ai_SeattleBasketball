import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

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
    select: { id: true },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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
