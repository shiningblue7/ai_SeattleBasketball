import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

function hasRole(roles: string | null | undefined, role: string): boolean {
  const needle = role.trim().toLowerCase();
  return (roles ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

function addRole(roles: string | null | undefined, role: string): string {
  const r = role.trim().toLowerCase();
  const parts = (roles ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === r)) return roles ?? "";
  return [...parts, role].join(",");
}

function removeRole(roles: string | null | undefined, role: string): string {
  const r = role.trim().toLowerCase();
  const parts = (roles ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => p.toLowerCase() !== r);
  return parts.join(",");
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      roles: true,
      member: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ users });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | { userId?: string; setAdmin?: boolean; adminNotify?: boolean; member?: boolean; name?: string }
    | null;

  const userId = body?.userId;
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const data: { roles?: string; member?: boolean; name?: string } = {};

  if (typeof body?.setAdmin === "boolean") {
    if (body.setAdmin) {
      const withAdmin = addRole(existing.roles, "admin");
      data.roles = addRole(withAdmin, "admin_notify");
    } else {
      const withoutAdmin = removeRole(existing.roles, "admin");
      data.roles = removeRole(withoutAdmin, "admin_notify");
    }
  }

  if (typeof body?.adminNotify === "boolean") {
    if (body.adminNotify) {
      data.roles = addRole(data.roles ?? existing.roles, "admin_notify");
    } else {
      data.roles = removeRole(data.roles ?? existing.roles, "admin_notify");
    }
  }

  if (typeof body?.member === "boolean") {
    data.member = body.member;
  }

  if (typeof body?.name === "string") {
    data.name = body.name.trim();
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      roles: true,
      member: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const gate = requireAdmin(session);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await req.json().catch(() => null)) as
    | { userId?: string }
    | null;

  const userId = body?.userId;
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const actorId = session?.user?.id ?? null;
  if (actorId && userId === actorId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, roles: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (hasRole(target.roles, "admin")) {
    const otherAdmins = await prisma.user.count({
      where: {
        id: { not: target.id },
        roles: { contains: "admin" },
      },
    });

    if (otherAdmins === 0) {
      return NextResponse.json(
        { error: "Cannot delete the last admin user." },
        { status: 400 }
      );
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ ok: true });
}
