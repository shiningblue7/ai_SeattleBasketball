import { NextResponse } from "next/server";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";

async function sendResetEmail(to: string, url: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const from = process.env.RESEND_FROM;
  if (!from) throw new Error("RESEND_FROM is not set");

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Seattle Basketball password",
      text: `Reset your password: ${url}`,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Resend failed: ${resp.status} ${resp.statusText} ${body}`);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string }
    | null;

  const email = body?.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  // Always return 200 to avoid leaking which emails exist.
  if (!user?.email) {
    return NextResponse.json({ ok: true });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    return NextResponse.json(
      { error: "NEXTAUTH_URL is not set" },
      { status: 500 }
    );
  }

  const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;

  await sendResetEmail(user.email, resetUrl).catch((e) => {
    console.error("[email] password reset send failed", e);
  });

  return NextResponse.json({ ok: true });
}
