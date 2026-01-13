import { NextResponse } from "next/server";
import crypto from "crypto";
import { hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; token?: string; password?: string }
    | null;

  const email = body?.email?.toLowerCase().trim();
  const token = body?.token;
  const password = body?.password;

  if (!email || !token || !password) {
    return NextResponse.json(
      { error: "email, token, and password are required" },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  // Do not reveal whether the user exists.
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const match = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      tokenHash,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  const passwordHash = await hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustResetPassword: false },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
