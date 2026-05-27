import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ScheduleEventType } from "@prisma/client";

type WindowKey = "90d" | "all";

const PACIFIC_TZ = "America/Los_Angeles";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function clampWindow(input: unknown): WindowKey {
  return input === "all" ? "all" : "90d";
}

function formatDuration(ms: number) {
  const mins = Math.round(ms / (60 * 1000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round((mins / 60) * 10) / 10;
  if (hours < 48) return `${hours}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

function labelForUser(u: { name: string | null; email: string | null } | null | undefined) {
  return u?.name ?? u?.email ?? "Unknown";
}

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  // Next can provide searchParams as either an object or a Promise (depends on version/runtime).
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await Promise.resolve(searchParams ?? {});
  const windowKey = clampWindow(Array.isArray(sp.window) ? sp.window[0] : sp.window);
  const since = windowKey === "all" ? null : new Date(Date.now() - NINETY_DAYS_MS);

  const eventTypes = [
    ScheduleEventType.SIGNUP_JOIN,
    ScheduleEventType.SIGNUP_LEAVE,
    ScheduleEventType.ADMIN_SIGNUP_JOIN,
    ScheduleEventType.ADMIN_SIGNUP_LEAVE,
    ScheduleEventType.GUEST_ADD,
    ScheduleEventType.GUEST_REMOVE,
    ScheduleEventType.SIGNUP_SWAP,
  ] as const;

  const events = await prisma.scheduleEvent.findMany({
    where: {
      type: { in: [...eventTypes] },
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      scheduleId: true,
      type: true,
      actorUserId: true,
      targetUserId: true,
      guestSignUpId: true,
      signUpId: true,
      metadata: true,
      schedule: { select: { id: true, title: true, date: true, createdAt: true, limit: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const scheduleIds = Array.from(new Set(events.map((e) => e.scheduleId)));
  const schedules = await prisma.schedule.findMany({
    where: {
      id: { in: scheduleIds.length ? scheduleIds : ["__none__"] },
      ...(since ? { date: { gte: since } } : {}),
    },
    select: { id: true, title: true, date: true, createdAt: true, limit: true },
  });
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));

  const userIds = new Set<string>();
  for (const e of events) {
    if (e.actorUserId) userIds.add(e.actorUserId);
    if (e.targetUserId) userIds.add(e.targetUserId);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, name: true, email: true, member: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  const guestSignUps = await prisma.guestSignUp.findMany({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      scheduleId: true,
      guestOfUserId: true,
      addedByUserId: true,
    },
  });

  const joinTypes = new Set<ScheduleEventType>([
    ScheduleEventType.SIGNUP_JOIN,
    ScheduleEventType.ADMIN_SIGNUP_JOIN,
  ]);
  const leaveTypes = new Set<ScheduleEventType>([
    ScheduleEventType.SIGNUP_LEAVE,
    ScheduleEventType.ADMIN_SIGNUP_LEAVE,
  ]);

  // Leaderboards
  const joinedSchedulesByUser = new Map<string, Set<string>>();
  const bailedSchedulesByUser = new Map<string, Set<string>>();
  const clutchSchedulesByUser = new Map<string, Set<string>>();

  // Trends
  const peakHourCounts = new Array<number>(7 * 24).fill(0);

  // Schedule fill speed: filledAt = time of the Nth join event (ignores guests/leaves; good v1 approximation).
  const joinTimesBySchedule = new Map<string, Date[]>();

  for (const e of events) {
    const schedule = scheduleById.get(e.scheduleId) ?? e.schedule;
    if (!schedule) continue;
    if (since && schedule.date < since) continue;

    const targetUserId = e.targetUserId ?? e.actorUserId;
    const isJoin = joinTypes.has(e.type);
    const isLeave = leaveTypes.has(e.type);

    if (isJoin && targetUserId) {
      const joined = joinedSchedulesByUser.get(targetUserId) ?? new Set<string>();
      joined.add(e.scheduleId);
      joinedSchedulesByUser.set(targetUserId, joined);

      const hoursBeforeStart = (schedule.date.getTime() - e.createdAt.getTime()) / (60 * 60 * 1000);
      if (hoursBeforeStart >= 0 && hoursBeforeStart <= 24) {
        const clutch = clutchSchedulesByUser.get(targetUserId) ?? new Set<string>();
        clutch.add(e.scheduleId);
        clutchSchedulesByUser.set(targetUserId, clutch);
      }

      const dt = new Date(e.createdAt);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: PACIFIC_TZ,
        weekday: "short",
        hour: "numeric",
        hour12: false,
      }).formatToParts(dt);
      const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
      const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
      if (weekdayIndex >= 0 && hour >= 0 && hour <= 23) {
        peakHourCounts[weekdayIndex * 24 + hour] += 1;
      }

      const arr = joinTimesBySchedule.get(e.scheduleId) ?? [];
      arr.push(e.createdAt);
      joinTimesBySchedule.set(e.scheduleId, arr);
    }

    if (isLeave && targetUserId) {
      const bailed = bailedSchedulesByUser.get(targetUserId) ?? new Set<string>();
      bailed.add(e.scheduleId);
      bailedSchedulesByUser.set(targetUserId, bailed);
    }
  }

  const signupJoinsByUser = new Map<string, number>();
  for (const [userId, set] of joinedSchedulesByUser) signupJoinsByUser.set(userId, set.size);
  const bailoutsByUser = new Map<string, number>();
  for (const [userId, set] of bailedSchedulesByUser) bailoutsByUser.set(userId, set.size);
  const clutchByUser = new Map<string, number>();
  for (const [userId, set] of clutchSchedulesByUser) clutchByUser.set(userId, set.size);

  const guestsByUser = new Map<string, number>();
  for (const g of guestSignUps) {
    if (!g.guestOfUserId) continue;
    guestsByUser.set(g.guestOfUserId, (guestsByUser.get(g.guestOfUserId) ?? 0) + 1);
  }

  // Promotions: count SIGNUP_SWAP events where item1 moved from waitlist to playing, based on positions.
  // Note: item IDs may not be resolvable for withdrawn users; this is a "best effort" stat.
  const promotionsByUser = new Map<string, number>();
  const promotedSignUpIds: string[] = [];
  for (const e of events) {
    if (e.type !== ScheduleEventType.SIGNUP_SWAP) continue;
    const schedule = scheduleById.get(e.scheduleId) ?? e.schedule;
    if (!schedule) continue;
    if (since && schedule.date < since) continue;

    const md = (e.metadata ?? null) as
      | null
      | {
          item1Kind?: "user" | "guest";
          item2Kind?: "user" | "guest";
          item1Id?: string;
          item2Id?: string;
          from1?: number;
          to1?: number;
          from2?: number;
          to2?: number;
        };
    if (!md) continue;

    const limit = schedule.limit ?? 15;
    const movedIntoPlaying =
      typeof md.from1 === "number" &&
      typeof md.to1 === "number" &&
      md.from1 > limit &&
      md.to1 <= limit;
    if (!movedIntoPlaying) continue;

    if (md.item1Kind === "user" && md.item1Id) {
      promotedSignUpIds.push(md.item1Id);
    }
  }

  if (promotedSignUpIds.length) {
    const promoted = await prisma.signUp.findMany({
      where: { id: { in: promotedSignUpIds } },
      select: { id: true, userId: true },
    });
    const userIdBySignUpId = new Map(promoted.map((r) => [r.id, r.userId]));
    for (const signUpId of promotedSignUpIds) {
      const userId = userIdBySignUpId.get(signUpId);
      if (!userId) continue;
      promotionsByUser.set(userId, (promotionsByUser.get(userId) ?? 0) + 1);
    }
  }

  const fillDurations: Array<{ scheduleId: string; ms: number }> = [];
  for (const [scheduleId, joinTimes] of joinTimesBySchedule) {
    const schedule = scheduleById.get(scheduleId);
    if (!schedule) continue;
    const limit = schedule.limit ?? 15;
    if (joinTimes.length < limit) continue;
    const sorted = joinTimes.slice().sort((a, b) => a.getTime() - b.getTime());
    const filledAt = sorted[limit - 1];
    const ms = filledAt.getTime() - schedule.createdAt.getTime();
    if (ms >= 0) fillDurations.push({ scheduleId, ms });
  }
  fillDurations.sort((a, b) => a.ms - b.ms);
  const fillMedianMs =
    fillDurations.length === 0
      ? null
      : fillDurations[Math.floor(fillDurations.length / 2)].ms;

  function topN(map: Map<string, number>, n: number) {
    const rows = Array.from(map.entries())
      .map(([userId, value]) => ({ userId, value, user: userById.get(userId) ?? null }))
      .filter((r) => r.userId)
      .sort((a, b) => b.value - a.value)
      .slice(0, n);
    return rows;
  }

  const topSignups = topN(signupJoinsByUser, 10);
  const topGuests = topN(guestsByUser, 10);
  const topBailouts = topN(bailoutsByUser, 10);
  const topClutch = topN(clutchByUser, 10);
  const topPromotions = topN(promotionsByUser, 10);

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const maxPeak = Math.max(1, ...peakHourCounts);

  const toggleHref = (wk: WindowKey) => `/stats?window=${wk}`;
  const isAll = windowKey === "all";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Stats</h1>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Public signup stats ({isAll ? "all time" : "last 90 days"}). Times shown in Pacific time.
          </div>
        </div>
        <div className="inline-flex w-fit rounded-full border border-zinc-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
          <Link
            href={toggleHref("90d")}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              !isAll
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-slate-700"
            }`}
          >
            Last 90 days
          </Link>
          <Link
            href={toggleHref("all")}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              isAll
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-950"
                : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-slate-700"
            }`}
          >
            All time
          </Link>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Leaderboards</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <StatCard title="Most signups" subtitle="Unique schedules joined">
            <Leaderboard rows={topSignups} />
          </StatCard>
          <StatCard title="Most guests" subtitle="Guests attributed to member">
            <Leaderboard rows={topGuests} />
          </StatCard>
          <StatCard title="Most bailouts" subtitle="Unique schedules left after joining">
            <Leaderboard rows={topBailouts} />
          </StatCard>
          <StatCard title="Most clutch signups" subtitle="Unique schedules joined within 24h of start">
            <Leaderboard rows={topClutch} />
          </StatCard>
          <StatCard title="Most promotions" subtitle="Best effort from reorder events">
            <Leaderboard rows={topPromotions} />
          </StatCard>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Trends</h2>
        <div className="mt-3 grid gap-4">
          <StatCard
            title="Peak signup hours"
            subtitle="Heatmap of join times (Pacific)"
          >
            <div className="grid gap-2">
              {weekdayLabels.map((wd, wi) => (
                <div key={wd} className="flex items-center gap-2">
                  <div className="w-10 shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {wd}
                  </div>
                  <div className="grid flex-1 grid-cols-[repeat(24,minmax(0,1fr))] gap-1">
                    {new Array(24).fill(0).map((_, hi) => {
                      const v = peakHourCounts[wi * 24 + hi];
                      const alpha = v === 0 ? 0 : 0.15 + 0.75 * (v / maxPeak);
                      return (
                        <div
                          key={hi}
                          title={`${wd} ${hi}:00: ${v}`}
                          className="h-4 rounded-sm bg-sky-600 dark:bg-sky-500"
                          style={{ opacity: alpha }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <div>0:00</div>
                <div>12:00</div>
                <div>23:00</div>
              </div>
            </div>
          </StatCard>

          <StatCard
            title="Fill speed"
            subtitle="Time from schedule creation to reaching the limit (approx.)"
          >
            <div className="flex flex-col gap-2">
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                Median:{" "}
                <span className="font-semibold">
                  {fillMedianMs == null ? "—" : formatDuration(fillMedianMs)}
                </span>
                <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                  ({fillDurations.length} schedules filled)
                </span>
              </div>
              {fillDurations.length ? (
                <div className="grid gap-2">
                  {fillDurations.slice(0, 8).map((d) => {
                    const s = scheduleById.get(d.scheduleId);
                    if (!s) return null;
                    return (
                      <div
                        key={d.scheduleId}
                        className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/30"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-zinc-950 dark:text-zinc-50">
                            {s.title}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                            {new Intl.DateTimeFormat("en-US", {
                              timeZone: PACIFIC_TZ,
                              year: "numeric",
                              month: "short",
                              day: "2-digit",
                            }).format(s.date)}
                          </div>
                        </div>
                        <div className="shrink-0 font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatDuration(d.ms)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Not enough data yet.
                </div>
              )}
            </div>
          </StatCard>
        </div>
      </section>

      <div className="mt-10 text-xs text-zinc-500 dark:text-zinc-400">
        Notes: Some stats are computed from event history. Promotions are best-effort because withdrawn signups may not be resolvable.
      </div>
    </main>
  );
}

function StatCard(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
      <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{props.title}</div>
      {props.subtitle ? (
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{props.subtitle}</div>
      ) : null}
      <div className="mt-4">{props.children}</div>
    </div>
  );
}

function Leaderboard(props: {
  rows: Array<{ userId: string; value: number; user: { name: string | null; email: string | null; member: boolean } | null }>;
}) {
  if (!props.rows.length) {
    return <div className="text-sm text-zinc-600 dark:text-zinc-400">Not enough data yet.</div>;
  }
  return (
    <ol className="space-y-2">
      {props.rows.map((r, idx) => (
        <li
          key={r.userId}
          className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/30"
        >
          <div className="min-w-0">
            <div className="truncate font-medium text-zinc-950 dark:text-zinc-50">
              {idx + 1}. {labelForUser(r.user)}
            </div>
          </div>
          <div className="shrink-0 font-semibold text-zinc-900 dark:text-zinc-100">
            {r.value}
          </div>
        </li>
      ))}
    </ol>
  );
}
