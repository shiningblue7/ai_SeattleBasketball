import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { getPlayingKeysForSchedule, notifyWaitlistPromotionsForSchedule } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { createScheduleEvent } from "@/lib/scheduleEvents";
import { ScheduleEventType } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        scheduleId?: string;
        id1?: string;
        id2?: string;
        signUpId1?: string;
        signUpId2?: string;
        guestSignUpId1?: string;
        guestSignUpId2?: string;
      }
    | null;

  const scheduleId = body?.scheduleId;
  const id1 = body?.id1 ?? body?.signUpId1 ?? body?.guestSignUpId1;
  const id2 = body?.id2 ?? body?.signUpId2 ?? body?.guestSignUpId2;

  if (!scheduleId || !id1 || !id2) {
    return NextResponse.json(
      { error: "scheduleId, id1, id2 are required" },
      { status: 400 }
    );
  }

  if (id1 === id2) {
    return NextResponse.json({ ok: true });
  }

  const lookupItem = async (id: string) => {
    const signUp = await prisma.signUp.findUnique({
      where: { id },
      select: { id: true, scheduleId: true, position: true },
    });
    if (signUp) return { kind: "user" as const, ...signUp };

    const guest = await prisma.guestSignUp.findUnique({
      where: { id },
      select: { id: true, scheduleId: true, position: true },
    });
    if (guest) return { kind: "guest" as const, ...guest };

    return null;
  };

  const [a, b] = await Promise.all([lookupItem(id1), lookupItem(id2)]);

  if (!a || !b) {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  if (a.scheduleId !== scheduleId || b.scheduleId !== scheduleId) {
    return NextResponse.json(
      { error: "Signups do not belong to this schedule" },
      { status: 400 }
    );
  }

  const beforePlayingKeys = await getPlayingKeysForSchedule(scheduleId).catch(() => []);

  await prisma.$transaction([
    a.kind === "guest"
      ? prisma.guestSignUp.update({
          where: { id: a.id },
          data: { position: b.position },
        })
      : prisma.signUp.update({
          where: { id: a.id },
          data: { position: b.position },
        }),
    b.kind === "guest"
      ? prisma.guestSignUp.update({
          where: { id: b.id },
          data: { position: a.position },
        })
      : prisma.signUp.update({
          where: { id: b.id },
          data: { position: a.position },
        }),
  ]);

  await createScheduleEvent({
    scheduleId,
    type: ScheduleEventType.SIGNUP_SWAP,
    actorUserId: session!.user!.id,
    ...(a.kind === "guest" ? { guestSignUpId: a.id } : { signUpId: a.id }),
    metadata: {
      item1Kind: a.kind,
      item2Kind: b.kind,
      item1Id: a.id,
      item2Id: b.id,
      from1: a.position,
      to1: b.position,
      from2: b.position,
      to2: a.position,
    },
  }).catch((e) => console.error("[events] createScheduleEvent failed", e));

  await notifyWaitlistPromotionsForSchedule({
    scheduleId,
    beforePlayingKeys,
  }).catch((e) => console.error("[email] notifyWaitlistPromotionsForSchedule failed", e));

  return NextResponse.json({ ok: true });
}
