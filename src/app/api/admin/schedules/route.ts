import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  await prisma.schedule.updateMany({
    where: {
      archivedAt: null,
      active: false,
      date: { lt: weekAgo },
    },
    data: { archivedAt: new Date() },
  });

  const schedules = await prisma.schedule.findMany({
    orderBy: [{ date: "asc" }, { active: "desc" }],
  });

  return NextResponse.json({ schedules });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        title?: string;
        date?: string;
        active?: boolean;
        limit?: number;
        repeatWeeks?: number;
      }
    | null;

  const title = body?.title?.trim();
  const date = body?.date ? new Date(body.date) : null;
  const active = Boolean(body?.active);
  const limit = typeof body?.limit === "number" ? body.limit : 15;
  const repeatWeeksRaw = typeof body?.repeatWeeks === "number" ? body.repeatWeeks : 1;
  const repeatWeeks = Math.max(1, Math.min(52, Math.floor(repeatWeeksRaw)));

  if (!title || !date || Number.isNaN(date.getTime())) {
    return NextResponse.json(
      { error: "title and valid date are required" },
      { status: 400 }
    );
  }

  const dates = Array.from({ length: repeatWeeks }, (_, i) => {
    const d = new Date(date);
    d.setDate(d.getDate() + i * 7);
    return d;
  });

  const firstActive = active;
  type TxOp =
    | ReturnType<typeof prisma.schedule.updateMany>
    | ReturnType<typeof prisma.schedule.create>;
  const ops: TxOp[] = [];

  if (firstActive) {
    ops.push(
      prisma.schedule.updateMany({
        where: { active: true },
        data: { active: false },
      })
    );
  }

  for (let i = 0; i < dates.length; i++) {
    ops.push(
      prisma.schedule.create({
        data: {
          title,
          date: dates[i],
          active: i === 0 ? firstActive : false,
          limit,
        },
      })
    );
  }

  const results = (await prisma.$transaction(ops)) as unknown[];
  const createdSchedules = results.filter((r) => r && typeof r === "object" && "id" in r) as Array<{
    id: string;
    title: string;
    date: Date;
    active: boolean;
    limit: number;
  }>;

  const createdFirst = createdSchedules[0] ?? null;

  if (createdFirst && firstActive) {
    const members = (await prisma.user.findMany({
      where: { member: true },
      orderBy: [{ roles: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    })) as Array<{ id: string }>;

    if (members.length) {
      await prisma.signUp.createMany({
        data: members.map((m, idx) => ({
          scheduleId: createdFirst.id,
          userId: m.id,
          position: idx + 1,
        })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({ schedules: createdSchedules, schedule: createdFirst });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        scheduleId?: string;
        active?: boolean;
        limit?: number;
        title?: string;
        date?: string;
        archived?: boolean;
      }
    | null;

  const scheduleId = body?.scheduleId;
  const active = body?.active;
  const limit = body?.limit;
  const title = body?.title;
  const date = body?.date;
  const archived = body?.archived;

  const hasActive = typeof active === "boolean";
  const hasLimit = typeof limit === "number";
  const hasTitle = typeof title === "string";
  const hasDate = typeof date === "string";
  const hasArchived = typeof archived === "boolean";

  if (!scheduleId || (!hasActive && !hasLimit && !hasTitle && !hasDate && !hasArchived)) {
    return NextResponse.json(
      { error: "scheduleId and at least one of active/limit/title/date/archived are required" },
      { status: 400 }
    );
  }

  if (hasLimit && (!Number.isFinite(limit) || limit < 1)) {
    return NextResponse.json(
      { error: "limit must be a number >= 1" },
      { status: 400 }
    );
  }

  const trimmedTitle = hasTitle ? title.trim() : null;
  if (hasTitle && !trimmedTitle) {
    return NextResponse.json(
      { error: "title must be a non-empty string" },
      { status: 400 }
    );
  }

  const parsedDate = hasDate ? new Date(date) : null;
  if (hasDate && (!parsedDate || Number.isNaN(parsedDate.getTime()))) {
    return NextResponse.json(
      { error: "date must be a valid ISO date string" },
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

  if (archived === true) {
    const updated = await prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        archivedAt: new Date(),
        active: false,
      },
    });

    return NextResponse.json({ schedule: updated });
  }

  if (archived === false) {
    const updated = await prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        archivedAt: null,
      },
    });

    return NextResponse.json({ schedule: updated });
  }

  if (active === true) {
    const [, updated] = await prisma.$transaction([
      prisma.schedule.updateMany({
        where: { active: true, id: { not: scheduleId } },
        data: { active: false },
      }),
      prisma.schedule.update({
        where: { id: scheduleId },
        data: {
          active: true,
          ...(hasLimit ? { limit } : {}),
          ...(trimmedTitle ? { title: trimmedTitle } : {}),
          ...(parsedDate ? { date: parsedDate } : {}),
          archivedAt: null,
        },
      }),
    ]);

    return NextResponse.json({ schedule: updated });
  }

  const updated = await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      ...(active === false ? { active: false } : {}),
      ...(hasLimit ? { limit } : {}),
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      ...(parsedDate ? { date: parsedDate } : {}),
    },
  });

  return NextResponse.json({ schedule: updated });
}
