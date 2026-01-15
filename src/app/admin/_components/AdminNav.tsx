"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-sky-600"
          : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
      }`}
    >
      {label}
    </Link>
  );
}

export function AdminNav() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NavLink href="/admin/signups" label="Signups" />
      <NavLink href="/admin/schedules" label="Schedules" />
      <NavLink href="/admin/users" label="Users" />
    </div>
  );
}
