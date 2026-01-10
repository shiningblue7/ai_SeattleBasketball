"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminSignupAvailability } from "@/app/_components/AdminSignupAvailability";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string | null;
  member: boolean;
};

type CurrentSignUp = {
  id: string;
  userId: string;
  label: string;
  position: number;
  attendanceStatus: "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";
  attendanceNote: string | null;
  arriveAt: string | null;
  leaveAt: string | null;
};

export function AdminAddToSchedule({
  scheduleId,
  defaultArriveAt,
  defaultLeaveAt,
  signedUpUserIds,
  currentSignUps,
}: {
  scheduleId: string;
  defaultArriveAt: string;
  defaultLeaveAt: string;
  signedUpUserIds: string[];
  currentSignUps: CurrentSignUp[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const resp = await fetch("/api/admin/users");
      if (!resp.ok) return;
      const data = (await resp.json()) as { users: UserRow[] };
      if (!cancelled) setUsers(data.users);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const alreadyInSchedule = Boolean(
    selectedUserId && signedUpUserIds.includes(selectedUserId)
  );

  const mutate = async (action: "join" | "leave") => {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/signups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, userId: selectedUserId, action }),
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
      setBusy(false);
    }
  };

  const swapExisting = async (id1: string, id2: string) => {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/signups/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, signUpId1: id1, signUpId2: id2 }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to reorder");
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const removeExisting = async (userId: string) => {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/signups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, userId, action: "leave" }),
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
      setBusy(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-zinc-200 p-6">
      <div className="text-base font-semibold text-zinc-950">Admin</div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-medium text-zinc-950">Add user to schedule</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <select
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {(u.name || u.email || u.id) + (u.member ? " (member)" : "")}
              </option>
            ))}
          </select>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={busy || !selectedUserId || alreadyInSchedule}
              onClick={() => mutate("join")}
            >
              Add
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
              disabled={busy || !selectedUserId || !alreadyInSchedule}
              onClick={() => mutate("leave")}
            >
              Remove
            </button>
          </div>
        </div>

        {selectedUser ? (
          <div className="mt-3 text-xs text-zinc-600">
            Selected: {selectedUser.name ?? selectedUser.email ?? selectedUser.id}
          </div>
        ) : null}
      </div>

      <details className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <summary className="cursor-pointer select-none text-sm font-semibold text-indigo-950">
          Reorder
        </summary>
        <div className="mt-3 grid gap-2">
          {currentSignUps
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((s, idx, arr) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 truncate text-sm text-zinc-900">{s.label}</div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                  <div className="w-full sm:w-56">
                    <AdminSignupAvailability
                      signUpId={s.id}
                      defaultArriveAt={defaultArriveAt}
                      defaultLeaveAt={defaultLeaveAt}
                      initialStatus={s.attendanceStatus}
                      initialNote={s.attendanceNote}
                      initialArriveAt={s.arriveAt}
                      initialLeaveAt={s.leaveAt}
                    />
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 sm:w-auto"
                    disabled={busy}
                    onClick={() => removeExisting(s.userId)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 sm:w-auto"
                    disabled={busy || idx === 0}
                    onClick={() => swapExisting(arr[idx - 1].id, s.id)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 sm:w-auto"
                    disabled={busy || idx === arr.length - 1}
                    onClick={() => swapExisting(s.id, arr[idx + 1].id)}
                  >
                    Down
                  </button>
                </div>
              </div>
            ))}
        </div>
      </details>

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
