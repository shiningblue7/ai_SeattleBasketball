import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { scheduleId?: string; guestName?: string }
    | null;

  const scheduleId = body?.scheduleId;
  const guestName = body?.guestName?.trim();

  if (!scheduleId || !guestName) {
    return NextResponse.json(
      { error: "scheduleId and guestName are required" },
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

  const guest = await prisma.guestSignUp.create({
    data: {
      scheduleId,
      guestName,
      addedByUserId: userId,
      position: nextPosition,
    },
    select: { id: true },
  });

  return NextResponse.json({ guest });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { guestSignUpId?: string }
    | null;

  const guestSignUpId = body?.guestSignUpId;

  if (!guestSignUpId) {
    return NextResponse.json(
      { error: "guestSignUpId is required" },
      { status: 400 }
    );
  }

  const guest = await prisma.guestSignUp.findUnique({
    where: { id: guestSignUpId },
    select: { id: true, addedByUserId: true },
  });

  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  const admin = isAdmin(session.user?.roles ?? null);
  if (!admin && guest.addedByUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.guestSignUp.delete({ where: { id: guestSignUpId } });

  return NextResponse.json({ ok: true });
}
