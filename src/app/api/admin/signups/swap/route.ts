import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | { scheduleId?: string; signUpId1?: string; signUpId2?: string }
    | null;

  const scheduleId = body?.scheduleId;
  const signUpId1 = body?.signUpId1;
  const signUpId2 = body?.signUpId2;

  if (!scheduleId || !signUpId1 || !signUpId2) {
    return NextResponse.json(
      { error: "scheduleId, signUpId1, signUpId2 are required" },
      { status: 400 }
    );
  }

  if (signUpId1 === signUpId2) {
    return NextResponse.json({ ok: true });
  }

  const [a, b] = await Promise.all([
    prisma.signUp.findUnique({
      where: { id: signUpId1 },
      select: { id: true, scheduleId: true, position: true },
    }),
    prisma.signUp.findUnique({
      where: { id: signUpId2 },
      select: { id: true, scheduleId: true, position: true },
    }),
  ]);

  if (!a || !b) {
    return NextResponse.json({ error: "Signup not found" }, { status: 404 });
  }

  if (a.scheduleId !== scheduleId || b.scheduleId !== scheduleId) {
    return NextResponse.json(
      { error: "Signups do not belong to this schedule" },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.signUp.update({
      where: { id: a.id },
      data: { position: b.position },
    }),
    prisma.signUp.update({
      where: { id: b.id },
      data: { position: a.position },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
