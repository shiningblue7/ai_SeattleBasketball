"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const [query, setQuery] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const selectedLabel = useMemo(() => {
    if (!selectedUser) return "";
    return (selectedUser.name || selectedUser.email || selectedUser.id) +
      (selectedUser.member ? " (member)" : "");
  }, [selectedUser]);

  const selectedSecondary = useMemo(() => {
    if (!selectedUser) return null;
    if (selectedUser.email && selectedUser.name) return selectedUser.email;
    return null;
  }, [selectedUser]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const scored = users
      .map((u) => {
        const name = (u.name ?? "").toLowerCase();
        const email = (u.email ?? "").toLowerCase();
        const label = (u.name || u.email || u.id).toLowerCase();
        const score =
          label === q ? 100 :
          name.startsWith(q) ? 80 :
          email.startsWith(q) ? 70 :
          label.includes(q) ? 60 :
          0;
        return { u, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 12).map((x) => x.u);
  }, [users, query]);

  const selectUser = (u: UserRow) => {
    const label = (u.name || u.email || u.id) + (u.member ? " (member)" : "");
    setSelectedUserId(u.id);
    setQuery(label);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.blur());
  };

  const clearSelection = () => {
    setSelectedUserId("");
    setQuery("");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

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
          <div className="relative">
            <input
              ref={inputRef}
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
              placeholder="Type a name or email…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                if (!e.target.value.trim()) setSelectedUserId("");
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                // Delay closing so taps/clicks on results can register first.
                window.setTimeout(() => setOpen(false), 120);
              }}
            />

            {selectedUserId ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-emerald-900">Selected</div>
                  <div className="truncate text-sm text-emerald-950">{selectedLabel}</div>
                  {selectedSecondary ? (
                    <div className="truncate text-xs text-emerald-900/80">{selectedSecondary}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                  disabled={busy}
                  onClick={clearSelection}
                >
                  Change
                </button>
              </div>
            ) : null}

            {open && query.trim() && filteredUsers.length ? (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow">
                {filteredUsers.map((u) => {
                  const label = (u.name || u.email || u.id) + (u.member ? " (member)" : "");
                  const secondary = u.email && u.name ? u.email : null;
                  const selected = u.id === selectedUserId;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                        selected ? "bg-zinc-50" : ""
                      }`}
                      onPointerDown={(e) => {
                        // Prevent input blur before we can select (important for mobile).
                        e.preventDefault();
                        selectUser(u);
                      }}
                    >
                      <div className="truncate font-medium text-zinc-950">{label}</div>
                      {secondary ? (
                        <div className="truncate text-xs text-zinc-600">{secondary}</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

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
