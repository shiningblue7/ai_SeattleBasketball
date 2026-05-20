"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ActiveScheduleActions({
  scheduleId,
  signedIn,
  alreadySignedUp,
}: {
  scheduleId: string;
  signedIn: boolean;
  alreadySignedUp: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (action: "join" | "leave") => {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/signups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, action }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Request failed");
        return;
      }

      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (!signedIn) {
    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        Sign in to join.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {alreadySignedUp ? (
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center rounded-full border border-rose-700 bg-rose-600 px-7 text-base font-semibold text-white shadow-sm shadow-rose-950/10 hover:bg-rose-700 disabled:opacity-60 dark:border-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400"
          disabled={loading}
          onClick={() => mutate("leave")}
        >
          Withdraw
        </button>
      ) : (
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center rounded-full bg-sky-600 px-7 text-base font-semibold text-white shadow-sm shadow-sky-950/10 hover:bg-sky-700 disabled:opacity-60"
          disabled={loading}
          onClick={() => mutate("join")}
        >
          Sign up
        </button>
      )}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
