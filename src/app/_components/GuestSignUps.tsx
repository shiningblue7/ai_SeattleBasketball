"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type GuestRow = {
  id: string;
  guestName: string;
  position: number;
  guestOfUserId: string | null;
  guestOfLabel: string;
  addedByUserId: string;
  addedByLabel: string;
};

export function GuestSignUps({
  scheduleId,
  signedIn,
  alreadySignedUp,
  currentUserId,
  guests,
}: {
  scheduleId: string;
  signedIn: boolean;
  alreadySignedUp: boolean;
  currentUserId: string | null;
  guests: GuestRow[];
}) {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addGuest = async () => {
    if (!guestName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/guests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, guestName }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to add guest");
        return;
      }

      setGuestName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const removeGuest = async (guestSignUpId: string) => {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/guests", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guestSignUpId }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to remove guest");
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-zinc-200 p-6 dark:border-slate-700 dark:bg-slate-800">
      <div className="text-base font-semibold text-zinc-950 dark:text-zinc-50">Guests</div>

      {signedIn && alreadySignedUp ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
            placeholder="Guest name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-700"
            disabled={busy || !guestName.trim()}
            onClick={addGuest}
          >
            Add guest
          </button>
        </div>
      ) : signedIn ? (
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Sign up first to add a guest.
        </div>
      ) : (
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Sign in to add a guest.</div>
      )}

      <div className="mt-4 grid gap-2">
        {guests
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((g) => {
            const canWithdraw =
              Boolean(currentUserId && g.guestOfUserId === currentUserId);

            return (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/15"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">
                      {g.guestName} (guest)
                    </div>
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
                      Guest of {g.guestOfLabel}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    Guest of {g.guestOfLabel} · Added by {g.addedByLabel} · position {g.position}
                  </div>
                </div>
                {canWithdraw ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-4 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100 dark:hover:bg-rose-950/35"
                    disabled={busy}
                    onClick={() => removeGuest(g.id)}
                  >
                    Withdraw guest
                  </button>
                ) : null}
              </div>
            );
          })}
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
