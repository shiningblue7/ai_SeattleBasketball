"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GuestLineItem({
  label,
  guestOfLabel,
  guestSignUpId,
  canWithdraw,
}: {
  label: string;
  guestOfLabel: string;
  guestSignUpId: string;
  canWithdraw: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeGuest = async () => {
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
    <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-zinc-800 dark:border-violet-900/60 dark:bg-violet-950/25 dark:text-violet-100">
      <span>{label}</span>
      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-100">
        Guest of {guestOfLabel}
      </span>
      {canWithdraw ? (
        <button
          type="button"
          className="inline-flex h-7 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-100 dark:hover:bg-rose-950/35"
          disabled={busy}
          onClick={removeGuest}
        >
          Withdraw guest
        </button>
      ) : null}
      {error ? <span className="w-full text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
