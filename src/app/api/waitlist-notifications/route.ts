import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

type WaitlistNotificationDelegate = {
  findUnique: (args: unknown) => Promise<unknown>;
  upsert: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
};

const waitlistNotification = (prisma as unknown as { waitlistNotification: WaitlistNotificationDelegate })
  .waitlistNotification;

type CombinedItem =
  | {
      kind: "user";
      key: string;
      ownerUserId: string;
      position: number;
      createdAt: Date;
    }
  | {
      kind: "guest";
      key: string;
      ownerUserId: string | null;
      position: number;
      createdAt: Date;
    };

async function getWaitlistStatus(scheduleId: string, userId: string) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      active: true,
      archivedAt: true,
      limit: true,
      signUps: { select: { userId: true, position: true, createdAt: true } },
      guestSignUps: {
        select: {
          id: true,
          guestOfUserId: true,
          position: true,
          createdAt: true,
        },
      },
    },
  });

  if (!schedule || !schedule.active || schedule.archivedAt) {
    return { ok: false as const, error: "Schedule not found or not active" };
  }

  const combined: CombinedItem[] = [
    ...schedule.signUps.map((s) => ({
      kind: "user" as const,
      key: `u:${s.userId}`,
      ownerUserId: s.userId,
      position: s.position,
      createdAt: s.createdAt,
    })),
    ...schedule.guestSignUps.map((g) => ({
      kind: "guest" as const,
      key: `g:${g.id}`,
      ownerUserId: g.guestOfUserId ?? null,
      position: g.position,
      createdAt: g.createdAt,
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const limit = schedule.limit;

  const userOverall = combined.findIndex((x) => x.kind === "user" && x.ownerUserId === userId);
  const userIsWaitlisted = userOverall >= 0 && userOverall + 1 > limit;

  const guestIsWaitlisted = combined.some(
    (x, idx) => x.kind === "guest" && x.ownerUserId === userId && idx + 1 > limit
  );

  const isEligibleToEnable = userIsWaitlisted || guestIsWaitlisted;

  const enabled =
    (await waitlistNotification.findUnique({
      where: { userId_scheduleId: { userId, scheduleId } },
      select: { id: true },
    })) != null;

  return {
    ok: true as const,
    enabled,
    isEligibleToEnable,
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const scheduleId = url.searchParams.get("scheduleId") ?? "";
  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId is required" }, { status: 400 });
  }

  const status = await getWaitlistStatus(scheduleId, userId);
  if (!status.ok) {
    return NextResponse.json({ error: status.error }, { status: 400 });
  }

  return NextResponse.json({ enabled: status.enabled, isEligibleToEnable: status.isEligibleToEnable });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { scheduleId?: string; enabled?: boolean }
    | null;

  const scheduleId = body?.scheduleId;
  const enabled = body?.enabled;

  if (!scheduleId || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "scheduleId and enabled are required" },
      { status: 400 }
    );
  }

  if (enabled) {
    const status = await getWaitlistStatus(scheduleId, userId);
    if (!status.ok) {
      return NextResponse.json({ error: status.error }, { status: 400 });
    }

    if (!status.isEligibleToEnable) {
      return NextResponse.json(
        { error: "You can only enable notifications while you or your guest is on the waitlist" },
        { status: 400 }
      );
    }

    await waitlistNotification.upsert({
      where: { userId_scheduleId: { userId, scheduleId } },
      create: { userId, scheduleId },
      update: {},
      select: { id: true },
    });

    return NextResponse.json({ enabled: true });
  }

  await waitlistNotification.deleteMany({
    where: { userId, scheduleId },
  });

  return NextResponse.json({ enabled: false });
}
