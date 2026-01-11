import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { ActiveScheduleActions } from "@/app/_components/ActiveScheduleActions";
import { WaitlistNotifyToggle } from "@/app/_components/WaitlistNotifyToggle";
import { AuthButtons } from "@/app/_components/AuthButtons";
import { GuestSignUps } from "@/app/_components/GuestSignUps";
import { SignupAvailability } from "@/app/_components/SignupAvailability";
import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

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
      label: string;
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

export default async function Home() {
  const session = await getServerSession(authOptions);

  const activeSchedule: ActiveSchedule = await prisma.schedule.findFirst({
    where: { active: true },
    include: {
      signUps: {
        include: { user: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      guestSignUps: {
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

  const renderLineItem = (it: LineItem) => {
    if (it.kind === "guest") return it.label;

    const details = buildDetailsText(it);

    return (
      <div className="-ml-1">
        <div className="flex flex-wrap items-center">
          <span className="ml-1">{it.name}</span>
          {admin && it.member ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              MEMBER
            </span>
          ) : null}
          {getAttendanceBadge(it.attendanceStatus)}
        </div>

        {details ? (
          <>
            <div className="ml-1 mt-0.5 hidden text-xs text-zinc-600 sm:block">
              {details}
            </div>
            <details className="ml-1 mt-0.5 sm:hidden">
              <summary className="cursor-pointer select-none text-xs text-zinc-500">
                details
              </summary>
              <div className="mt-1 text-xs text-zinc-600">{details}</div>
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
      label: `${g.guestName} (guest of ${
        g.guestOf?.name ??
        g.guestOf?.email ??
        g.addedBy.name ??
        g.addedBy.email ??
        "unknown"
      })`,
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const signedIn = Boolean(session?.user);

  const currentUserIndex = userId
    ? items.findIndex((it) => it.kind === "user" && it.id === currentUserSignup?.id)
    : -1;

  const playingCount = activeSchedule ? Math.min(limit, items.length) : 0;
  const waitlistCount = activeSchedule ? Math.max(0, items.length - limit) : 0;

  const currentUserStatus = (() => {
    if (!activeSchedule || !signedIn || !alreadySignedUp || currentUserIndex < 0) return null;
    if (currentUserIndex < limit) {
      return { label: "Playing" as const, detail: null as string | null };
    }
    return {
      label: "Waitlist" as const,
      detail: `#${currentUserIndex - limit + 1}`,
    };
  })();

  const currentUserArriveAt = currentUserSignup ? getArriveAt(currentUserSignup) : null;

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

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto w-full max-w-3xl px-4 py-4">
        <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 dark:bg-black">
          {signedIn ? (
            <div className="flex flex-col gap-2">
              <div className="text-base font-semibold text-zinc-950">
                {activeSchedule ? activeSchedule.title : "No active schedule"}
              </div>
              {activeSchedule ? (
                <div className="text-sm text-zinc-600">
                  {activeSchedule.date.toLocaleString()} · Limit {limit}
                </div>
              ) : (
                <div className="text-sm text-zinc-600">
                  An admin needs to create and activate a schedule.
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <div className="text-2xl font-semibold text-zinc-950">Seattle Basketball</div>
                <div className="mt-1 text-sm text-zinc-600">
                  Sign in to view schedules and sign up
                </div>
              </div>
              <AuthButtons signedIn={false} />
            </div>
          )}

          {activeSchedule && signedIn ? (
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="sm:hidden">
                  <div className="sticky top-20 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
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

                {currentUserStatus ? (
                  <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
                    <div className="text-sm font-medium text-zinc-950">Your status</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-900">
                        {currentUserStatus.label}
                        {currentUserStatus.detail ? ` ${currentUserStatus.detail}` : ""}
                      </span>
                      {currentUserArriveAt ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                          Arrive {currentUserArriveAt}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-zinc-950">Playing ({playingCount})</div>
                <ol className="list-decimal pl-5 text-sm text-zinc-800">
                  {items.slice(0, limit).map((it) => (
                    <li key={it.id}>{renderLineItem(it)}</li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-zinc-950">Waitlist ({waitlistCount})</div>
                <ol className="list-decimal pl-5 text-sm text-zinc-800">
                  {items.slice(limit).map((it) => (
                    <li key={it.id}>{renderLineItem(it)}</li>
                  ))}
                </ol>
              </div>

              <div className="sm:col-span-2">
                {session?.user?.id ? <WaitlistNotifyToggle scheduleId={activeSchedule.id} /> : null}

                {alreadySignedUp && currentUserSignup ? (
                  <SignupAvailability
                    scheduleId={activeSchedule.id}
                    defaultArriveAt={defaultArriveAt}
                    defaultLeaveAt={defaultLeaveAt}
                    initialStatus={currentUserSignup.attendanceStatus}
                    initialNote={currentUserSignup.attendanceNote}
                    initialArriveAt={getArriveAt(currentUserSignup)}
                    initialLeaveAt={getLeaveAt(currentUserSignup)}
                  />
                ) : null}

                <div className="mt-4">
                  <GuestSignUps
                    scheduleId={activeSchedule.id}
                    signedIn={signedIn}
                    alreadySignedUp={alreadySignedUp}
                    isAdmin={admin}
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
