import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";
import {
  getPlayingKeysForSchedule,
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
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(session.user?.roles ?? null);

  const body = (await req.json().catch(() => null)) as
    | { scheduleId?: string; guestName?: string; guestOfUserId?: string; position?: number | null }
    | null;

  const scheduleId = body?.scheduleId;
  const guestName = body?.guestName?.trim();
  const guestOfUserIdRaw = body?.guestOfUserId;
  const guestOfUserId = admin && guestOfUserIdRaw ? guestOfUserIdRaw : userId;
  const requestedPosition =
    admin && typeof body?.position === "number" && Number.isFinite(body.position)
      ? body.position
      : null;

  if (!scheduleId || !guestName) {
    return NextResponse.json(
      { error: "scheduleId and guestName are required" },
      { status: 400 }
    );
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, active: true, limit: true },
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

  const { guest, position } = await withScheduleQueueTx(scheduleId, async (tx) => {
    const created = await tx.guestSignUp.create({
      data: {
        scheduleId,
        guestName,
        guestOfUserId,
        addedByUserId: userId,
        position: requestedPosition ?? 0,
      },
      select: { id: true },
    } as Prisma.GuestSignUpCreateArgs);

    const position = await insertQueueEntryAtPosition({
      db: tx,
      scheduleId,
      kind: "GUEST",
      guestSignUpId: created.id,
      requestedPosition,
    });
    await tx.guestSignUp.update({
      where: { id: created.id },
      data: { position },
      select: { id: true },
    });

    return { guest: created, position };
  });

  await createScheduleEvent({
    scheduleId,
    type: ScheduleEventType.GUEST_ADD,
    actorUserId: userId,
    targetUserId: guestOfUserId,
    guestSignUpId: guest.id,
    metadata: { guestName },
  }).catch((e) => console.error("[events] createScheduleEvent failed", e));

  return NextResponse.json({
    guest,
    position,
    status: position <= schedule.limit ? "playing" : "waitlist",
    guestName,
  });
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

  const res = await withScheduleQueueTx(guest.scheduleId, async (tx) => {
    const updateRes = await tx.guestSignUp.updateMany({
      where: { id: guestSignUpId, removedAt: null },
      data: { removedAt: new Date() },
    });
    await tx.queueEntry.deleteMany({ where: { scheduleId: guest.scheduleId, guestSignUpId } });
    return updateRes;
  });

  if (res.count === 0) {
    return NextResponse.json({ ok: true });
  }

  await createScheduleEvent({
    scheduleId: guest.scheduleId,
    type: ScheduleEventType.GUEST_REMOVE,
    actorUserId: userId,
    targetUserId: guest.guestOfUserId,
    guestSignUpId: guest.id,
  }).catch((e) => console.error("[events] createScheduleEvent failed", e));

  await notifyWaitlistPromotionsForSchedule({
    scheduleId: guest.scheduleId,
    beforePlayingKeys,
  }).catch((e) => console.error("[email] notifyWaitlistPromotionsForSchedule failed", e));

  await recordWaitlistPromotionsForSchedule({
    scheduleId: guest.scheduleId,
    beforePlayingKeys,
    actorUserId: userId,
  }).catch((e) => console.error("[events] recordWaitlistPromotionsForSchedule failed", e));

  return NextResponse.json({ ok: true });
}
