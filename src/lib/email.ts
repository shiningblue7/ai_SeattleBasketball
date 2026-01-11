import { prisma } from "@/lib/prisma";

type WaitlistNotificationDelegate = {
  findMany: (args: unknown) => Promise<unknown>;
};

const waitlistNotification = (prisma as unknown as { waitlistNotification?: WaitlistNotificationDelegate })
  .waitlistNotification;

type EmailPayload = {
  to: string[];
  subject: string;
  text: string;
};

type PlayingEntity =
  | {
      kind: "user";
      key: string;
      ownerUserId: string;
      label: string;
      overall: number;
    }
  | {
      kind: "guest";
      key: string;
      ownerUserId: string | null;
      label: string;
      overall: number;
    };

export type SignupSlot =
  | { kind: "playing"; overall: number; within: number; limit: number }
  | { kind: "waitlist"; overall: number; within: number; limit: number };

function hasRole(roles: string | null | undefined, role: string): boolean {
  const needle = role.trim().toLowerCase();
  return (roles ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

export async function getSignupSlotForUser(
  scheduleId: string,
  userId: string
): Promise<SignupSlot | null> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: {
      limit: true,
      signUps: { select: { userId: true, position: true, createdAt: true } },
      guestSignUps: { select: { position: true, createdAt: true } },
    },
  });

  if (!schedule) return null;

  const combined = [
    ...schedule.signUps.map((s) => ({
      kind: "user" as const,
      userId: s.userId,
      position: s.position,
      createdAt: s.createdAt,
    })),
    ...schedule.guestSignUps.map((g) => ({
      kind: "guest" as const,
      userId: null,
      position: g.position,
      createdAt: g.createdAt,
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const idx = combined.findIndex((x) => x.kind === "user" && x.userId === userId);
  if (idx < 0) return null;

  const overall = idx + 1;
  const limit = schedule.limit;
  if (overall <= limit) {
    return { kind: "playing", overall, within: overall, limit };
  }
  return { kind: "waitlist", overall, within: overall - limit, limit };
}

async function sendWithResend(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY is not set");
    throw new Error("RESEND_API_KEY is not set");
  }

  const from = process.env.RESEND_FROM;
  if (!from) {
    console.warn("[email] RESEND_FROM is not set");
    throw new Error("RESEND_FROM is not set");
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    console.error("[email] Resend failed", {
      status: resp.status,
      statusText: resp.statusText,
      body,
    });
    throw new Error(`Resend failed: ${resp.status} ${resp.statusText} ${body}`);
  }

  const okBody = await resp.text().catch(() => "");
  console.log("[email] Resend accepted", { toCount: payload.to.length, body: okBody });
}

async function getPlayingSet(scheduleId: string): Promise<{
  schedule: { id: string; title: string; date: Date; limit: number } | null;
  playing: PlayingEntity[];
}> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      title: true,
      date: true,
      limit: true,
      signUps: {
        select: {
          userId: true,
          position: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
      },
      guestSignUps: {
        select: {
          id: true,
          guestName: true,
          guestOfUserId: true,
          position: true,
          createdAt: true,
        },
      },
    },
  });

  if (!schedule) {
    return { schedule: null, playing: [] };
  }

  const combined = [
    ...schedule.signUps.map((s) => ({
      kind: "user" as const,
      key: `u:${s.userId}`,
      ownerUserId: s.userId,
      label: s.user.name ?? s.user.email ?? "User",
      position: s.position,
      createdAt: s.createdAt,
    })),
    ...schedule.guestSignUps.map((g) => ({
      kind: "guest" as const,
      key: `g:${g.id}`,
      ownerUserId: g.guestOfUserId ?? null,
      label: g.guestName,
      position: g.position,
      createdAt: g.createdAt,
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const playingRaw = combined.slice(0, schedule.limit);
  const playing: PlayingEntity[] = playingRaw.map((it, idx) => ({
    ...it,
    overall: idx + 1,
  }));

  return {
    schedule: { id: schedule.id, title: schedule.title, date: schedule.date, limit: schedule.limit },
    playing,
  };
}

export async function getPlayingKeysForSchedule(scheduleId: string): Promise<string[]> {
  const set = await getPlayingSet(scheduleId);
  return set.playing.map((p) => p.key);
}

export async function notifyWaitlistPromotionsForSchedule({
  scheduleId,
  beforePlayingKeys,
}: {
  scheduleId: string;
  beforePlayingKeys: string[];
}) {
  if (!waitlistNotification) {
    console.warn("[email] waitlistNotification model not available (run prisma migrate/generate)");
    return;
  }

  const after = await getPlayingSet(scheduleId);
  if (!after.schedule) return;
  const schedule = after.schedule;

  const beforeKeySet = new Set(beforePlayingKeys);
  const promoted = after.playing.filter((p) => !beforeKeySet.has(p.key));

  if (promoted.length === 0) return;

  const recipients = promoted
    .map((p) => p.ownerUserId)
    .filter((x): x is string => Boolean(x));

  if (recipients.length === 0) return;

  const optedInRaw = (await waitlistNotification.findMany({
    where: { scheduleId: after.schedule.id, userId: { in: recipients } },
    select: { userId: true },
  })) as Array<{ userId: string }>;

  const optedInUserIds = new Set(optedInRaw.map((r) => r.userId));
  const optedInRecipients = Array.from(new Set(recipients)).filter((id) => optedInUserIds.has(id));

  if (optedInRecipients.length === 0) return;

  const users = await prisma.user.findMany({
    where: { id: { in: optedInRecipients } },
    select: { id: true, email: true, name: true },
  });

  const byUser = new Map<string, PlayingEntity[]>();
  for (const p of promoted) {
    if (!p.ownerUserId) continue;
    if (!optedInUserIds.has(p.ownerUserId)) continue;
    const arr = byUser.get(p.ownerUserId) ?? [];
    arr.push(p);
    byUser.set(p.ownerUserId, arr);
  }

  const scheduleLine = `Schedule: ${schedule.title}`;
  const whenLine = `When: ${schedule.date.toLocaleString()}`;

  await Promise.all(
    users
      .filter((u) => u.email)
      .map(async (u) => {
        const items = byUser.get(u.id) ?? [];
        if (items.length === 0) return;

        const lines = items
          .slice()
          .sort((a, b) => a.overall - b.overall)
          .map((it) => {
            if (it.kind === "user") return `- You are now playing (spot #${it.overall}/${schedule.limit})`;
            return `- Guest: ${it.label} (spot #${it.overall}/${schedule.limit})`;
          });

        const subject = `[Seattle Basketball] You got a spot (${schedule.title})`;
        const text = [scheduleLine, whenLine, "", "Good news — you moved into a playing spot:", ...lines].join("\n");

        await sendWithResend({ to: [u.email as string], subject, text });
      })
  );
}

export async function notifyAdminsOfSignupChange({
  action,
  schedule,
  actor,
  target,
  slot,
}: {
  action: "join" | "leave";
  schedule: { id: string; title: string; date: Date };
  actor: { id: string; label: string };
  target: { id: string; label: string };
  slot?: SignupSlot | null;
}) {
  const computedSlot =
    slot === undefined ? await getSignupSlotForUser(schedule.id, target.id) : slot;

  const slotLine = computedSlot
    ? computedSlot.kind === "playing"
      ? `Spot: Playing ${computedSlot.within}/${computedSlot.limit} (overall #${computedSlot.overall})`
      : `Spot: Waitlist #${computedSlot.within} (overall #${computedSlot.overall}, limit ${computedSlot.limit})`
    : "Spot: (unknown)";

  const subjectBase = action === "join" ? "signed up" : "withdrew";
  const subject = `[Seattle Basketball] ${target.label} ${subjectBase} (${schedule.title})`;

  const text = [
    `Schedule: ${schedule.title}`,
    `When: ${schedule.date.toLocaleString()}`,
    "",
    slotLine,
    `Added by: ${actor.label}`,
  ].join("\n");

  const candidates = await prisma.user.findMany({
    where: {
      roles: { not: null },
    },
    select: { email: true, roles: true },
  });

  const to = candidates
    .filter((u) => u.email)
    .filter((u) => hasRole(u.roles, "admin") && hasRole(u.roles, "admin_notify"))
    .map((u) => u.email as string);

  if (to.length === 0) {
    console.log("[email] No admin recipients (admin + admin_notify)");
    return;
  }

  console.log("[email] Sending admin alert", {
    action,
    scheduleId: schedule.id,
    toCount: to.length,
  });

  await sendWithResend({ to, subject, text });
}
