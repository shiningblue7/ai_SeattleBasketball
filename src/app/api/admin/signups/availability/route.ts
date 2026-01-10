import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

const allowedStatuses = new Set(["FULL", "LATE", "LEAVE_EARLY", "PARTIAL"] as const);

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        signUpId?: string;
        attendanceStatus?: "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";
        attendanceNote?: string | null;
      }
    | null;

  const signUpId = body?.signUpId;
  const attendanceStatus = body?.attendanceStatus;
  const attendanceNoteRaw = body?.attendanceNote ?? null;
  const attendanceNote = attendanceNoteRaw ? attendanceNoteRaw.trim() : null;

  if (!signUpId || !attendanceStatus) {
    return NextResponse.json(
      { error: "signUpId and attendanceStatus are required" },
      { status: 400 }
    );
  }

  if (!allowedStatuses.has(attendanceStatus)) {
    return NextResponse.json({ error: "Invalid attendanceStatus" }, { status: 400 });
  }

  const existing = await prisma.signUp.findUnique({
    where: { id: signUpId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  await prisma.signUp.update({
    where: { id: signUpId },
    data: {
      attendanceStatus,
      attendanceNote: attendanceNote || null,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
