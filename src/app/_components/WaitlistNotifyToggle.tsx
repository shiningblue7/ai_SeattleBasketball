"use client";

import { useEffect, useState } from "react";

export function WaitlistNotifyToggle({ scheduleId }: { scheduleId: string }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch(
        `/api/waitlist-notifications?scheduleId=${encodeURIComponent(scheduleId)}`,
        { method: "GET" }
      );

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to load notification status");
        return;
      }

      const data = (await resp.json().catch(() => null)) as
        | { enabled?: boolean; isEligibleToEnable?: boolean }
        | null;

      setEnabled(Boolean(data?.enabled));
      setEligible(Boolean(data?.isEligibleToEnable));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  const toggle = async (nextEnabled: boolean) => {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/waitlist-notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, enabled: nextEnabled }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to update notification setting");
        return;
      }

      const data = (await resp.json().catch(() => null)) as { enabled?: boolean } | null;
      setEnabled(Boolean(data?.enabled));
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const visible = eligible || enabled;
  if (loading && !visible) return null;
  if (!visible) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        className={
          enabled
            ? "inline-flex h-11 items-center justify-center rounded-full bg-emerald-600 px-6 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
            : "inline-flex h-11 items-center justify-center rounded-full border border-indigo-300 bg-indigo-50 px-6 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60"
        }
        disabled={loading}
        onClick={() => toggle(!enabled)}
      >
        {enabled ? "Notifications ON" : "Notify me if I get a spot"}
      </button>

      {enabled && !eligible ? (
        <div className="text-xs text-zinc-600">
          Enabled for this schedule. It will only send if you’re on the waitlist.
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
