import type { Session } from "next-auth";

export function isAdmin(roles: string | null | undefined): boolean {
  if (!roles) return false;
  return roles
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .includes("admin");
}

export function requireAdmin(session: Session | null) {
  if (!session?.user?.id) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }

  if (!isAdmin(session.user.roles ?? null)) {
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  }

  return { ok: true as const };
}
