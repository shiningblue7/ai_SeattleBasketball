"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string | null;
  member: boolean;
};

export function AdminAddToSchedule({
  scheduleId,
  signedUpUserIds,
}: {
  scheduleId: string;
  signedUpUserIds: string[];
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

      {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
