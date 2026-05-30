import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { ActiveScheduleActions } from "@/app/_components/ActiveScheduleActions";
import { WaitlistNotifyToggle } from "@/app/_components/WaitlistNotifyToggle";
import { AuthButtons } from "@/app/_components/AuthButtons";
import { GuestLineItem } from "@/app/_components/GuestLineItem";
import { GuestSignUps } from "@/app/_components/GuestSignUps";
import { SignupAvailability } from "@/app/_components/SignupAvailability";
import { InlineWithdrawButton } from "@/app/_components/InlineWithdrawButton";
import { RecentActivity, type ActivityItem } from "@/app/_components/RecentActivity";
import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatScheduleDateTime, formatScheduleTimeHHMM } from "@/lib/time";
import { ScheduleEventType } from "@prisma/client";

type ActiveSchedule = Prisma.ScheduleGetPayload<{
  include: {
    signUps: { include: { user: true } };
    guestSignUps: {
      include: {
        guestOf: {
          select: {
            id: true;
            name: true;
            email: true;
          };
        };
        addedBy: {
          select: {
            id: true;
            name: true;
            email: true;
          };
        };
      };
    };
  };
}> | null;
type SignUpRow = NonNullable<ActiveSchedule>["signUps"][number];
type GuestRow = NonNullable<ActiveSchedule>["guestSignUps"][number];

type LineItem =
  | {
      kind: "user";
      id: string;
      position: number;
      createdAt: Date;
      name: string;
      member: boolean;
      attendanceStatus: "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";
      attendanceNote: string | null;
      arriveAt: string | null;
      leaveAt: string | null;
    }
  | {
      kind: "guest";
      id: string;
      position: number;
      createdAt: Date;
      guestName: string;
      guestOfLabel: string;
      guestOfUserId: string | null;
      guestSignUpId: string;
      addedByUserId: string;
    };

type UserLineItem = Extract<LineItem, { kind: "user" }>;

type GuestUiRow = {
  id: string;
  guestName: string;
  position: number;
  guestOfUserId: string | null;
  guestOfLabel: string;
  addedByUserId: string;
  addedByLabel: string;
};

type ActivityRow = {
  id: string;
  createdAt: Date;
  type: ScheduleEventType;
  actorName: string | null;
  targetName: string | null;
  metadata: unknown;
};

export default async function Home() {
  const session = await getServerSession(authOptions);

  const activeSchedule: ActiveSchedule = await prisma.schedule.findFirst({
    where: { active: true },
    include: {
      signUps: {
        where: { withdrawnAt: null },
        include: { user: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      guestSignUps: {
        where: { removedAt: null },
        include: {
          guestOf: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          addedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  const userId = session?.user?.id;
  const signUps: SignUpRow[] = activeSchedule?.signUps ?? [];
  const guestSignUps: GuestRow[] = activeSchedule?.guestSignUps ?? [];
  const alreadySignedUp = Boolean(
    userId && signUps.some((s: SignUpRow) => s.userId === userId)
  );
  const limit = activeSchedule?.limit ?? 0;

  const admin = isAdmin(session?.user?.roles ?? null);

  const currentUserSignup = userId
    ? signUps.find((s: SignUpRow) => s.userId === userId) ?? null
    : null;

  const defaultArriveAt = activeSchedule
    ? formatScheduleTimeHHMM(activeSchedule.date)
    : "";
  const defaultLeaveAt = activeSchedule
    ? formatScheduleTimeHHMM(
        new Date(activeSchedule.date.getTime() + 2 * 60 * 60 * 1000)
      )
    : "";

  const getAttendanceBadge = (status: UserLineItem["attendanceStatus"]) => {
    if (status === "FULL") return null;
    if (status === "LATE") {
      return (
        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          LATE
        </span>
      );
    }
    if (status === "LEAVE_EARLY") {
      return (
        <span className="ml-2 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
          LEAVE EARLY
        </span>
      );
    }
    return (
      <span className="ml-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
        PARTIAL
      </span>
    );
  };

  const getArriveAt = (s: SignUpRow): string | null => {
    return ((s as unknown as { arriveAt?: string | null }).arriveAt ?? null) || null;
  };

  const getLeaveAt = (s: SignUpRow): string | null => {
    return ((s as unknown as { leaveAt?: string | null }).leaveAt ?? null) || null;
  };

  const buildDetailsText = (it: Extract<LineItem, { kind: "user" }>) => {
    const parts: string[] = [];
    if (it.arriveAt) parts.push(`Arrive ${it.arriveAt}`);
    if (it.leaveAt) parts.push(`Leave ${it.leaveAt}`);
    const note = it.attendanceNote?.trim() ? it.attendanceNote.trim() : null;
    if (note) parts.push(note);
    return parts.join(" · ");
  };

  const renderLineItem = (it: LineItem, index: number) => {
    const isCurrentUser = it.kind === "user" && currentUserSignup?.id === it.id;
    const waitlistRank = it.kind === "user" && index >= limit ? index - limit + 1 : null;

    if (it.kind === "guest") {
      return (
        <GuestLineItem
          label={it.guestName}
          guestOfLabel={it.guestOfLabel}
          guestSignUpId={it.guestSignUpId}
          canWithdraw={Boolean(userId && it.guestOfUserId === userId)}
        />
      );
    }

    const details = buildDetailsText(it);

    return (
      <div
        className={
          isCurrentUser
            ? "rounded-xl border border-sky-500 bg-sky-50 px-3 py-2 shadow-sm dark:border-sky-400 dark:bg-sky-950/30"
            : "-ml-1"
        }
      >
        <div className="flex flex-wrap items-center">
          <span className="ml-1 text-zinc-800 dark:text-zinc-200">{it.name}</span>
          {isCurrentUser ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white">
              YOU
            </span>
          ) : null}
          {admin && it.member ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
              MEMBER
            </span>
          ) : null}
          {getAttendanceBadge(it.attendanceStatus)}
        </div>

        {isCurrentUser ? (
          <div className="ml-1 mt-2 flex flex-wrap gap-2 text-xs">
            <a
              href="#signup-availability"
              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              Edit time
            </a>
            <InlineWithdrawButton
              scheduleId={activeSchedule?.id ?? ""}
              className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100 dark:hover:bg-rose-950/35"
            />
          </div>
        ) : null}

        {waitlistRank ? (
          <div className="ml-1 mt-2">
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">
              #{waitlistRank} on waitlist
            </span>
          </div>
        ) : null}

        {details ? (
          <>
            <div className="ml-1 mt-0.5 hidden text-xs text-zinc-600 dark:text-zinc-400 sm:block">
              {details}
            </div>
            <details className="ml-1 mt-0.5 sm:hidden">
              <summary className="cursor-pointer select-none text-xs text-zinc-500 dark:text-zinc-400">
                details
              </summary>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{details}</div>
            </details>
          </>
        ) : null}
      </div>
    );
  };

  const items: LineItem[] = [
    ...signUps.map((s: SignUpRow) => ({
      kind: "user" as const,
      id: s.id,
      position: s.position,
      createdAt: s.createdAt,
      name: s.user.name ?? s.user.email ?? "User",
      member: s.user.member,
      attendanceStatus: s.attendanceStatus,
      attendanceNote: s.attendanceNote,
      arriveAt: getArriveAt(s),
      leaveAt: getLeaveAt(s),
    })),
    ...guestSignUps.map((g: GuestRow) => ({
      kind: "guest" as const,
      id: g.id,
      position: g.position,
      createdAt: g.createdAt,
      guestOfUserId: g.guestOfUserId,
      guestSignUpId: g.id,
      addedByUserId: g.addedByUserId,
      guestOfLabel: g.guestOf?.name ?? g.guestOf?.email ?? g.addedBy.name ?? g.addedBy.email ?? "unknown",
      guestName: g.guestName,
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const signedIn = Boolean(session?.user);

  const playingCount = activeSchedule ? Math.min(limit, items.length) : 0;
  const waitlistCount = activeSchedule ? Math.max(0, items.length - limit) : 0;
  const waitlistSpotsRemaining = activeSchedule ? Math.max(0, limit - items.length) : 0;
  const isFull = Boolean(activeSchedule && items.length >= limit);

  const guestUiRows: GuestUiRow[] = guestSignUps.map((g: GuestRow) => {
    const guestOfLabel = g.guestOf?.name ?? g.guestOf?.email ?? "unknown";
    const addedByLabel = g.addedBy.name ?? g.addedBy.email ?? "unknown";
    return {
      id: g.id,
      guestName: g.guestName,
      position: g.position,
      guestOfUserId: g.guestOfUserId,
      guestOfLabel,
      addedByUserId: g.addedByUserId,
      addedByLabel,
    };
  });

  const activityRaw: ActivityRow[] =
    activeSchedule?.id
      ? await prisma.scheduleEvent.findMany({
          where: {
            scheduleId: activeSchedule.id,
            type: {
              in: [
                ScheduleEventType.SIGNUP_JOIN,
                ScheduleEventType.SIGNUP_LEAVE,
                ScheduleEventType.ADMIN_SIGNUP_JOIN,
                ScheduleEventType.ADMIN_SIGNUP_LEAVE,
                ScheduleEventType.GUEST_ADD,
                ScheduleEventType.GUEST_REMOVE,
                ScheduleEventType.SIGNUP_PROMOTED,
              ],
            },
          },
          select: {
            id: true,
            createdAt: true,
            type: true,
            metadata: true,
            actor: { select: { name: true } },
            target: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }).then((rows) =>
          rows.map((r) => ({
            id: r.id,
            createdAt: r.createdAt,
            type: r.type,
            actorName: r.actor?.name ?? null,
            targetName: r.target?.name ?? null,
            metadata: r.metadata,
          }))
        )
      : [];

  const formatActivityTime = (d: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  };

  const label = (name: string | null) => name ?? "Someone";

  const activityLine = (row: ActivityRow) => {
    const md = (row.metadata ?? null) as null | { guestName?: unknown };
    const guestName = typeof md?.guestName === "string" ? md.guestName : null;

    if (row.type === ScheduleEventType.SIGNUP_JOIN) {
      const who = label(row.targetName ?? row.actorName);
      return `${who} signed up`;
    }
    if (row.type === ScheduleEventType.SIGNUP_LEAVE) {
      const who = label(row.targetName ?? row.actorName);
      return `${who} withdrew`;
    }
    if (row.type === ScheduleEventType.ADMIN_SIGNUP_JOIN) {
      const who = label(row.targetName);
      return `Admin added ${who}`;
    }
    if (row.type === ScheduleEventType.ADMIN_SIGNUP_LEAVE) {
      const who = label(row.targetName);
      return `Admin removed ${who}`;
    }
    if (row.type === ScheduleEventType.GUEST_ADD) {
      if (guestName) return `Guest added: ${guestName}`;
      return "Guest added";
    }
    if (row.type === ScheduleEventType.GUEST_REMOVE) {
      return "Guest removed";
    }
    if (row.type === ScheduleEventType.SIGNUP_PROMOTED) {
      const who = label(row.targetName);
      return `${who} promoted to playing`;
    }
    return "Activity";
  };

  const activity: ActivityItem[] = activityRaw.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    line: activityLine(row),
    timeLabel: formatActivityTime(row.createdAt),
  }));

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-slate-900">
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
          {signedIn ? (
            <div className="flex flex-col gap-2">
              <div className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                {activeSchedule ? activeSchedule.title : "No active schedule"}
              </div>
              {activeSchedule ? (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  {formatScheduleDateTime(activeSchedule.date)} · Limit {limit}
                </div>
              ) : (
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  An admin needs to create and activate a schedule.
                </div>
              )}
              {activeSchedule ? (
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  {items.length === 0
                    ? "No one has signed up yet."
                    : isFull
                      ? "This schedule is full, so new signups go to the waitlist."
                      : `${waitlistSpotsRemaining} spot${waitlistSpotsRemaining === 1 ? "" : "s"} left before the waitlist starts.`}
                </div>
              ) : null}

            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">Seattle Basketball</div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Sign in to view schedules and sign up
                </div>
              </div>
              <AuthButtons signedIn={false} />
            </div>
          )}

          {activeSchedule && signedIn ? (
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div id="signup-actions">
                  <div className="sm:hidden">
                    <div className="sticky top-20 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                      <ActiveScheduleActions
                        scheduleId={activeSchedule.id}
                        signedIn={signedIn}
                        alreadySignedUp={alreadySignedUp}
                      />
                    </div>
                  </div>

                  <div className="hidden sm:block">
                    <ActiveScheduleActions
                      scheduleId={activeSchedule.id}
                      signedIn={signedIn}
                      alreadySignedUp={alreadySignedUp}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Playing ({playingCount})</div>
                {playingCount > 0 ? (
                  <ol className="list-decimal pl-5 text-sm text-zinc-800 dark:text-zinc-200">
                    {items.slice(0, limit).map((it, idx) => (
                      <li key={it.id}>{renderLineItem(it, idx)}</li>
                    ))}
                  </ol>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-slate-700 dark:bg-slate-800 dark:text-zinc-400">
                    No one has signed up yet.
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Waitlist ({waitlistCount})</div>
                {waitlistCount > 0 ? (
                  <ol className="list-decimal pl-5 text-sm text-zinc-800 dark:text-zinc-200">
                    {items.slice(limit).map((it, idx) => (
                      <li key={it.id}>{renderLineItem(it, limit + idx)}</li>
                    ))}
                  </ol>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-slate-700 dark:bg-slate-800 dark:text-zinc-400">
                    No waitlist yet.
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <RecentActivity items={activity} />
              </div>

              <div className="sm:col-span-2">
                {session?.user?.id ? (
                  <WaitlistNotifyToggle
                    key={`${activeSchedule.id}:${items.length}:${limit}`}
                    scheduleId={activeSchedule.id}
                  />
                ) : null}

                {alreadySignedUp && currentUserSignup ? (
                  <div id="signup-availability">
                    <SignupAvailability
                      scheduleId={activeSchedule.id}
                      defaultArriveAt={defaultArriveAt}
                      defaultLeaveAt={defaultLeaveAt}
                      initialStatus={currentUserSignup.attendanceStatus}
                      initialNote={currentUserSignup.attendanceNote}
                      initialArriveAt={getArriveAt(currentUserSignup)}
                      initialLeaveAt={getLeaveAt(currentUserSignup)}
                    />
                  </div>
                ) : null}

                <div className="mt-4">
                <GuestSignUps
                  scheduleId={activeSchedule.id}
                  signedIn={signedIn}
                  alreadySignedUp={alreadySignedUp}
                  currentUserId={userId ?? null}
                  guests={guestUiRows}
                />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
