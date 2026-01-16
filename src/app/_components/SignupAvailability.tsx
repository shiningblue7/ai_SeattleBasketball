"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type AttendanceStatus = "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";

export function SignupAvailability({
  scheduleId,
  defaultArriveAt,
  defaultLeaveAt,
  initialStatus,
  initialNote,
  initialArriveAt,
  initialLeaveAt,
}: {
  scheduleId: string;
  defaultArriveAt: string;
  defaultLeaveAt: string;
  initialStatus: AttendanceStatus;
  initialNote: string | null;
  initialArriveAt: string | null;
  initialLeaveAt: string | null;
}) {
  const router = useRouter();

  const [status, setStatus] = useState<AttendanceStatus>(initialStatus);
  const [note, setNote] = useState(initialNote ?? "");
  const [arriveAt, setArriveAt] = useState(initialArriveAt ?? defaultArriveAt);
  const [leaveAt, setLeaveAt] = useState(initialLeaveAt ?? defaultLeaveAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = useMemo(() => {
    const noteTrimmed = note.trim();
    const initialTrimmed = (initialNote ?? "").trim();
    const arriveTrimmed = arriveAt.trim();
    const leaveTrimmed = leaveAt.trim();
    const initialArriveTrimmed = (initialArriveAt ?? defaultArriveAt).trim();
    const initialLeaveTrimmed = (initialLeaveAt ?? defaultLeaveAt).trim();
    return (
      status !== initialStatus ||
      noteTrimmed !== initialTrimmed ||
      arriveTrimmed !== initialArriveTrimmed ||
      leaveTrimmed !== initialLeaveTrimmed
    );
  }, [
    status,
    note,
    arriveAt,
    leaveAt,
    initialStatus,
    initialNote,
    initialArriveAt,
    initialLeaveAt,
    defaultArriveAt,
    defaultLeaveAt,
  ]);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/signups/availability", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId,
          attendanceStatus: status,
          attendanceNote: note.trim() || null,
          arriveAt: arriveAt.trim() || null,
          leaveAt: leaveAt.trim() || null,
        }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to update availability");
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="text-sm font-medium text-zinc-950">Availability</div>
      <div className="mt-2 text-xs text-zinc-600">
        Let others know if you’ll be late or can’t play the whole time.
      </div>

      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-700">Arrive at (optional)</div>
            <input
              type="time"
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
              value={arriveAt}
              onChange={(e) => setArriveAt(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-700">Leave at (optional)</div>
            <input
              type="time"
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
              value={leaveAt}
              onChange={(e) => setLeaveAt(e.target.value)}
            />
          </div>
        </div>

        <select
          className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
          value={status}
          onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
        >
          <option value="FULL">Full game</option>
          <option value="LATE">Running late</option>
          <option value="LEAVE_EARLY">Leaving early</option>
          <option value="PARTIAL">Partial / unsure</option>
        </select>

        <input
          className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
          placeholder='Optional note (e.g. "arrive 7:30" / "leave at half")'
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          disabled={busy || !changed}
          onClick={save}
        >
          Save
        </button>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </div>
    </div>
  );
}
