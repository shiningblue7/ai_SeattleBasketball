"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type AttendanceStatus = "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";

export function AdminSignupAvailability({
  signUpId,
  defaultArriveAt,
  defaultLeaveAt,
  initialStatus,
  initialNote,
  initialArriveAt,
  initialLeaveAt,
}: {
  signUpId: string;
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
      const resp = await fetch("/api/admin/signups/availability", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signUpId,
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
        setError(data?.error ?? "Failed to update attendance");
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="time"
          className="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs"
          value={arriveAt}
          onChange={(e) => setArriveAt(e.target.value)}
        />
        <input
          type="time"
          className="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs"
          value={leaveAt}
          onChange={(e) => setLeaveAt(e.target.value)}
        />
      </div>

      <select
        className="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs"
        value={status}
        onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
      >
        <option value="FULL">Full game</option>
        <option value="LATE">Running late</option>
        <option value="LEAVE_EARLY">Leaving early</option>
        <option value="PARTIAL">Partial / unsure</option>
      </select>

      <input
        className="h-9 w-full rounded-xl border border-zinc-300 px-3 text-xs"
        placeholder="Optional note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      <button
        type="button"
        className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        disabled={busy || !changed}
        onClick={save}
      >
        Save
      </button>

      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
