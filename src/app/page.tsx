import Image from "next/image";

import { getServerSession } from "next-auth/next";
import type { Prisma } from "@prisma/client";

import { ActiveScheduleActions } from "@/app/_components/ActiveScheduleActions";
import { AdminAddToSchedule } from "@/app/_components/AdminAddToSchedule";
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Seattle Basketball
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            {session?.user ? (
              <>
                Signed in as{" "}
                <span className="font-medium text-zinc-950 dark:text-zinc-50">
                  {session.user.name ?? session.user.email ?? "User"}
                </span>
                .
              </>
            ) : (
              "You are not signed in."
            )}
          </p>
        </div>

        <div className="w-full rounded-2xl border border-zinc-200 p-6">
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

          {activeSchedule ? (
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-zinc-950">Playing</div>
                <ol className="list-decimal pl-5 text-sm text-zinc-800">
                  {items.slice(0, limit).map((it) => (
                    <li key={it.id}>{renderLineItem(it)}</li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-zinc-950">Waitlist</div>
                <ol className="list-decimal pl-5 text-sm text-zinc-800">
                  {items.slice(limit).map((it) => (
                    <li key={it.id}>{renderLineItem(it)}</li>
                  ))}
                </ol>
              </div>

              <div className="sm:col-span-2">
                <ActiveScheduleActions
                  scheduleId={activeSchedule.id}
                  signedIn={Boolean(session?.user)}
                  alreadySignedUp={alreadySignedUp}
                />

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
              </div>
            </div>
          ) : null}
        </div>

        {admin && activeSchedule ? (
          <AdminAddToSchedule
            scheduleId={activeSchedule.id}
            defaultArriveAt={defaultArriveAt}
            defaultLeaveAt={defaultLeaveAt}
            signedUpUserIds={signUps.map((s: SignUpRow) => s.userId)}
            currentSignUps={signUps
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((s: SignUpRow) => ({
                id: s.id,
                userId: s.userId,
                label: s.user.name ?? s.user.email ?? "User",
                position: s.position,
                attendanceStatus: s.attendanceStatus,
                attendanceNote: s.attendanceNote,
                arriveAt: getArriveAt(s),
                leaveAt: getLeaveAt(s),
              }))}
          />
        ) : null}

        {activeSchedule && alreadySignedUp ? (
          <GuestSignUps
            scheduleId={activeSchedule.id}
            signedIn={Boolean(session?.user)}
            alreadySignedUp={alreadySignedUp}
            isAdmin={admin}
            currentUserId={userId ?? null}
            guests={guestSignUps.map((g: GuestRow) => ({
              id: g.id,
              guestName: g.guestName,
              position: g.position,
              guestOfUserId: g.guestOfUserId ?? null,
              guestOfLabel:
                g.guestOf?.name ??
                g.guestOf?.email ??
                g.addedBy.name ??
                g.addedBy.email ??
                "unknown",
              addedByUserId: g.addedByUserId,
              addedByLabel: g.addedBy.name ?? g.addedBy.email ?? "unknown",
            }))}
          />
        ) : null}

        <AuthButtons signedIn={Boolean(session?.user)} />
      </main>
    </div>
  );
}
