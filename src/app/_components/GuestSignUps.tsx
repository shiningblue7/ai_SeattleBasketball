"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type GuestRow = {
  id: string;
  guestName: string;
  position: number;
  addedByUserId: string;
  addedByLabel: string;
};

export function GuestSignUps({
  scheduleId,
  signedIn,
  isAdmin,
  currentUserId,
  guests,
}: {
  scheduleId: string;
  signedIn: boolean;
  isAdmin: boolean;
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
    <div className="w-full rounded-2xl border border-zinc-200 p-6">
      <div className="text-base font-semibold text-zinc-950">Guests</div>

      {signedIn ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
            placeholder="Guest name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={busy || !guestName.trim()}
            onClick={addGuest}
          >
            Add guest
          </button>
        </div>
      ) : (
        <div className="mt-2 text-sm text-zinc-600">Sign in to add a guest.</div>
      )}

      <div className="mt-4 grid gap-2">
        {guests
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((g) => {
            const canRemove =
              isAdmin || (currentUserId && g.addedByUserId === currentUserId);

            return (
              <div
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-950">
                    {g.guestName} (guest)
                  </div>
                  <div className="text-xs text-zinc-600">
                    Added by {g.addedByLabel} · position {g.position}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                  disabled={busy || !canRemove}
                  onClick={() => removeGuest(g.id)}
                >
                  Remove
                </button>
              </div>
            );
          })}
      </div>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
