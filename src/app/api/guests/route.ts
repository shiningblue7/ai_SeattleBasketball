import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";
import { getPlayingKeysForSchedule, notifyWaitlistPromotionsForSchedule } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { normalizeSchedulePositions } from "@/lib/schedulePositions";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(session.user?.roles ?? null);

  const body = (await req.json().catch(() => null)) as
    | { scheduleId?: string; guestName?: string; guestOfUserId?: string }
    | null;

  const scheduleId = body?.scheduleId;
  const guestName = body?.guestName?.trim();
  const guestOfUserIdRaw = body?.guestOfUserId;
  const guestOfUserId = admin && guestOfUserIdRaw ? guestOfUserIdRaw : userId;

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

  const signedUp = await prisma.signUp.findUnique({
    where: { scheduleId_userId: { scheduleId, userId: guestOfUserId } },
    select: { id: true },
  });

  if (!signedUp) {
    return NextResponse.json(
      { error: "User must be signed up to add a guest" },
      { status: admin ? 400 : 403 }
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
      guestOfUserId,
      addedByUserId: userId,
      position: nextPosition,
    },
    select: { id: true },
  } as Prisma.GuestSignUpCreateArgs);

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
    select: { id: true, scheduleId: true, addedByUserId: true, guestOfUserId: true },
  });

  if (!guest) {
    return NextResponse.json({ error: "Guest not found" }, { status: 404 });
  }

  const admin = isAdmin(session.user?.roles ?? null);
  if (!admin && guest.addedByUserId !== userId && guest.guestOfUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const beforePlayingKeys = await getPlayingKeysForSchedule(guest.scheduleId).catch(() => []);

  await prisma.guestSignUp.delete({ where: { id: guestSignUpId } });

  await normalizeSchedulePositions(guest.scheduleId).catch((e) =>
    console.error("[positions] normalizeSchedulePositions failed", e)
  );

  await notifyWaitlistPromotionsForSchedule({
    scheduleId: guest.scheduleId,
    beforePlayingKeys,
  }).catch((e) => console.error("[email] notifyWaitlistPromotionsForSchedule failed", e));

  return NextResponse.json({ ok: true });
}
