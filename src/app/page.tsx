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
      label: string;
    }
  | {
      kind: "guest";
      id: string;
      position: number;
      createdAt: Date;
      label: string;
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

  const formatAttendanceSuffix = (
    s: SignUpRow
  ): string => {
    if (s.attendanceStatus === "FULL") return "";
    const label =
      s.attendanceStatus === "LATE"
        ? "late"
        : s.attendanceStatus === "LEAVE_EARLY"
          ? "leave early"
          : "partial";
    const note = s.attendanceNote?.trim() ? `: ${s.attendanceNote.trim()}` : "";
    return ` (${label}${note})`;
  };

  const items: LineItem[] = [
    ...signUps.map((s: SignUpRow) => ({
      kind: "user" as const,
      id: s.id,
      position: s.position,
      createdAt: s.createdAt,
      label:
        (s.user.name ?? s.user.email ?? "User") +
        formatAttendanceSuffix(s),
    })),
    ...guestSignUps.map((g: GuestRow) => ({
      kind: "guest" as const,
      id: g.id,
      position: g.position,
      createdAt: g.createdAt,
      label: `${g.guestName} (guest of ${
        g.addedBy.name ?? g.addedBy.email ?? "unknown"
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
                    <li key={it.id}>{it.label}</li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium text-zinc-950">Waitlist</div>
                <ol className="list-decimal pl-5 text-sm text-zinc-800">
                  {items.slice(limit).map((it) => (
                    <li key={it.id}>{it.label}</li>
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
                    initialStatus={currentUserSignup.attendanceStatus}
                    initialNote={currentUserSignup.attendanceNote}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {admin && activeSchedule ? (
          <AdminAddToSchedule
            scheduleId={activeSchedule.id}
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
