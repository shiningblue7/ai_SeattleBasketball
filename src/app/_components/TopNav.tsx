"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { useMemo, useState } from "react";

export function TopNav({
  signedIn,
  isAdmin,
  userLabel,
}: {
  signedIn: boolean;
  isAdmin: boolean;
  userLabel?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const base: Array<{ href: string; label: string; show: boolean }> = [
      { href: "/", label: "Home", show: true },
      { href: "/admin", label: "Admin", show: isAdmin },
    ];
    return base.filter((i) => i.show);
  }, [isAdmin]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname?.startsWith(href));

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-0.5 shadow-sm dark:border-zinc-700 dark:bg-black">
            <Image
              src="/brand/logo-shield-borderless.png"
              alt="Seattle Basketball logo"
              width={64}
              height={64}
              priority
            />
          </div>
          <div className="text-base font-bold bg-gradient-to-r from-zinc-900 to-zinc-700 bg-clip-text text-transparent dark:from-zinc-100 dark:to-zinc-300">
            Seattle Basketball
          </div>
        </Link>

        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
      </div>

      {open ? (
        <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-black">
          <div className="mx-auto w-full max-w-3xl">
            <nav className="flex flex-col gap-2">
              {signedIn && userLabel ? (
                <div className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  Signed in as <span className="font-medium text-zinc-900 dark:text-zinc-50">{userLabel}</span>
                </div>
              ) : null}

              {items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`rounded-xl px-3 py-2 text-sm font-medium ${
                    isActive(it.href)
                      ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {it.label}
                </Link>
              ))}

              <div className="mt-2 flex flex-col gap-2">
                {signedIn ? (
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
                    onClick={() => {
                      setOpen(false);
                      signOut({ callbackUrl: "/" });
                    }}
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
                    onClick={() => {
                      setOpen(false);
                      signIn("google", { callbackUrl: "/" });
                    }}
                  >
                    Sign in
                  </button>
                )}
              </div>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
