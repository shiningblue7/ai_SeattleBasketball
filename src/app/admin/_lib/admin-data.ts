import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ScheduleRow = Awaited<ReturnType<typeof prisma.schedule.findMany>>[number];

type SignUpRow = Prisma.SignUpGetPayload<{
  include: { user: { select: { email: true; name: true; member: true } } };
}>;

type UserRow = Prisma.UserGetPayload<{
  select: {
    id: true;
    email: true;
    name: true;
    roles: true;
    member: true;
  };
}>;

export async function getAdminData(opts?: { signupsScheduleId?: string }) {
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
    where: {
      OR: [{ active: true }, { date: { gte: weekAgo } }, { archivedAt: { not: null } }],
    },
    orderBy: [{ date: "asc" }, { active: "desc" }],
  });

  const activeSchedule: ScheduleRow | null =
    schedules.find((s: ScheduleRow) => s.active && !s.archivedAt) ?? null;

  const defaultNonArchivedSchedule: ScheduleRow | null =
    schedules.find((s: ScheduleRow) => !s.archivedAt) ?? null;

  const signupsSchedule: ScheduleRow | null =
    (opts?.signupsScheduleId
      ? schedules.find((s) => s.id === opts.signupsScheduleId && !s.archivedAt) ?? null
      : null) ??
    activeSchedule ??
    defaultNonArchivedSchedule ??
    null;

  const fmtHHMM = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const defaultArriveAt = signupsSchedule ? fmtHHMM(signupsSchedule.date) : "";
  const defaultLeaveAt = signupsSchedule
    ? fmtHHMM(new Date(signupsSchedule.date.getTime() + 2 * 60 * 60 * 1000))
    : "";

  const signUps = signupsSchedule
    ? await prisma.signUp.findMany({
        where: { scheduleId: signupsSchedule.id },
        include: { user: { select: { email: true, name: true, member: true } } },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const getArriveAt = (s: SignUpRow): string | null => {
    return ((s as unknown as { arriveAt?: string | null }).arriveAt ?? null) || null;
  };

  const getLeaveAt = (s: SignUpRow): string | null => {
    return ((s as unknown as { leaveAt?: string | null }).leaveAt ?? null) || null;
  };

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      roles: true,
      member: true,
    },
  });

  return {
    schedules: schedules.map((s: ScheduleRow) => ({
      id: s.id,
      title: s.title,
      date: s.date.toISOString(),
      active: s.active,
      archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
      limit: s.limit,
    })),
    activeSchedule: activeSchedule
      ? {
          id: activeSchedule.id,
          title: activeSchedule.title,
          date: activeSchedule.date.toISOString(),
          active: activeSchedule.active,
          archivedAt: activeSchedule.archivedAt ? activeSchedule.archivedAt.toISOString() : null,
          limit: activeSchedule.limit,
        }
      : null,
    signupsSchedule: signupsSchedule
      ? {
          id: signupsSchedule.id,
          title: signupsSchedule.title,
          date: signupsSchedule.date.toISOString(),
          active: signupsSchedule.active,
          archivedAt: signupsSchedule.archivedAt ? signupsSchedule.archivedAt.toISOString() : null,
          limit: signupsSchedule.limit,
        }
      : null,
    defaultArriveAt,
    defaultLeaveAt,
    signUps: (signUps as SignUpRow[]).map((s: SignUpRow) => ({
      id: s.id,
      userId: s.userId,
      position: s.position,
      attendanceStatus: s.attendanceStatus,
      attendanceNote: s.attendanceNote,
      arriveAt: getArriveAt(s),
      leaveAt: getLeaveAt(s),
      user: { email: s.user.email, name: s.user.name, member: s.user.member },
    })),
    users: users.map((u: UserRow) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      roles: u.roles,
      member: u.member,
    })),
  };
}
