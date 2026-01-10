import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { AdminDashboard } from "@/app/admin/_components/AdminDashboard";
import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="text-lg font-semibold text-zinc-950">Admin</div>
          <div className="mt-2 text-sm text-zinc-600">Please sign in.</div>
        </div>
      </div>
    );
  }

  if (!isAdmin(session.user.roles ?? null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="text-lg font-semibold text-zinc-950">Admin</div>
          <div className="mt-2 text-sm text-zinc-600">
            You don’t have access to this page.
          </div>
        </div>
      </div>
    );
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
    where: {
      OR: [{ active: true }, { date: { gte: weekAgo } }, { archivedAt: { not: null } }],
    },
    orderBy: [{ date: "asc" }, { active: "desc" }],
  });

  type ScheduleRow = Awaited<ReturnType<typeof prisma.schedule.findMany>>[number];
  type UserRow = Prisma.UserGetPayload<{
    select: {
      id: true;
      email: true;
      name: true;
      roles: true;
      member: true;
    };
  }>;

  const activeSchedule: ScheduleRow | null =
    schedules.find((s: ScheduleRow) => s.active && !s.archivedAt) ?? null;

  const fmtHHMM = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const defaultArriveAt = activeSchedule ? fmtHHMM(activeSchedule.date) : "";
  const defaultLeaveAt = activeSchedule
    ? fmtHHMM(new Date(activeSchedule.date.getTime() + 2 * 60 * 60 * 1000))
    : "";

  const signUps = activeSchedule
    ? await prisma.signUp.findMany({
        where: { scheduleId: activeSchedule.id },
        include: { user: { select: { email: true, name: true, member: true } } },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      })
    : [];

  type SignUpRow = Prisma.SignUpGetPayload<{
    include: { user: { select: { email: true; name: true; member: true } } };
  }>;

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-5xl flex-col gap-8 py-16 px-6 bg-white dark:bg-black">
        <div className="flex flex-col gap-2">
          <div className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Admin
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {session.user.email ?? session.user.id}
          </div>
        </div>

        <AdminDashboard
          schedules={schedules.map((s: ScheduleRow) => ({
            id: s.id,
            title: s.title,
            date: s.date.toISOString(),
            active: s.active,
            archivedAt: s.archivedAt ? s.archivedAt.toISOString() : null,
            limit: s.limit,
          }))}
          activeSchedule={
            activeSchedule
              ? {
                  id: activeSchedule.id,
                  title: activeSchedule.title,
                  date: activeSchedule.date.toISOString(),
                  active: activeSchedule.active,
                  archivedAt: activeSchedule.archivedAt
                    ? activeSchedule.archivedAt.toISOString()
                    : null,
                  limit: activeSchedule.limit,
                }
              : null
          }
          defaultArriveAt={defaultArriveAt}
          defaultLeaveAt={defaultLeaveAt}
          signUps={(signUps as SignUpRow[]).map((s: SignUpRow) => ({
            id: s.id,
            userId: s.userId,
            position: s.position,
            attendanceStatus: s.attendanceStatus,
            attendanceNote: s.attendanceNote,
            arriveAt: getArriveAt(s),
            leaveAt: getLeaveAt(s),
            user: { email: s.user.email, name: s.user.name, member: s.user.member },
          }))}
          users={users.map((u: UserRow) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            roles: u.roles,
            member: u.member,
          }))}
        />
      </main>
    </div>
  );
}
