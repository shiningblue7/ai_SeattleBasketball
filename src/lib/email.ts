import { prisma } from "@/lib/prisma";

type EmailPayload = {
  to: string[];
  subject: string;
  text: string;
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
