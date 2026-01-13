"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminSignupAvailability } from "@/app/_components/AdminSignupAvailability";
import { AdminAddToSchedule } from "@/app/_components/AdminAddToSchedule";

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function formatScheduleDateLong(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function nextWednesdayAt7pmLocal(now: Date = new Date()) {
  const targetDow = 3;
  const candidate = new Date(now);
  candidate.setHours(19, 0, 0, 0);

  const day = candidate.getDay();
  const daysUntil = (targetDow - day + 7) % 7;
  candidate.setDate(candidate.getDate() + daysUntil);

  if (daysUntil === 0 && now.getTime() > candidate.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }

  const tzOffsetMs = candidate.getTimezoneOffset() * 60_000;
  return new Date(candidate.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

const SCHEDULES_PAGE_SIZE = 4;

type ScheduleRow = {
  id: string;
  title: string;
  date: string;
  active: boolean;
  archivedAt: string | null;
  limit: number;
};

type SignUpRow = {
  id: string;
  userId: string;
  position: number;
  attendanceStatus: "FULL" | "LATE" | "LEAVE_EARLY" | "PARTIAL";
  attendanceNote: string | null;
  arriveAt: string | null;
  leaveAt: string | null;
  user: { email: string | null; name: string | null; member: boolean };
};

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string | null;
  member: boolean;
};

type EventRow = {
  id: string;
  createdAt: string;
  type:
    | "SIGNUP_JOIN"
    | "SIGNUP_LEAVE"
    | "ADMIN_SIGNUP_JOIN"
    | "ADMIN_SIGNUP_LEAVE"
    | "GUEST_ADD"
    | "GUEST_REMOVE"
    | "SIGNUP_SWAP"
    | "AVAILABILITY_UPDATE"
    | "ADMIN_AVAILABILITY_UPDATE";
  actorLabel: string | null;
  targetLabel: string | null;
  metadata: unknown;
};

function hasRole(roles: string | null, role: string) {
  const needle = role.trim().toLowerCase();
  return (roles ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

function isAdmin(roles: string | null) {
  return (roles ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .includes("admin");
}

export function AdminDashboard({
  mode,
  schedules,
  activeSchedule,
  signupsSchedule,
  defaultArriveAt,
  defaultLeaveAt,
  signUps,
  users,
  events,
}: {
  mode: "schedules" | "signups" | "users";
  schedules: ScheduleRow[];
  activeSchedule: ScheduleRow | null;
  signupsSchedule?: ScheduleRow | null;
  defaultArriveAt: string;
  defaultLeaveAt: string;
  signUps: SignUpRow[];
  users: UserRow[];
  events?: EventRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => nextWednesdayAt7pmLocal());
  const [limit, setLimit] = useState(15);
  const [active, setActive] = useState(true);
  const [repeatWeeksInput, setRepeatWeeksInput] = useState("1");
  const [limitEdits, setLimitEdits] = useState<Record<string, number>>({});
  const [titleEdits, setTitleEdits] = useState<Record<string, string>>({});
  const [dateEdits, setDateEdits] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [schedulePage, setSchedulePage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [guestOfUserId, setGuestOfUserId] = useState<string>("");
  const [guestName, setGuestName] = useState<string>("");

  const selectedSignupsSchedule = signupsSchedule ?? activeSchedule;
  const activeScheduleId = selectedSignupsSchedule?.id ?? null;

  const signupsScheduleOptions = schedules
    .slice()
    .filter((s) => !s.archivedAt)
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  const repeatWeeks = Math.max(
    1,
    Math.min(52, Number.parseInt(repeatWeeksInput || "1", 10) || 1)
  );

  const refresh = () => router.refresh();

  const formatEventType = (t: EventRow["type"]) => {
    if (t === "SIGNUP_JOIN") return "User signed up";
    if (t === "SIGNUP_LEAVE") return "User withdrew";
    if (t === "ADMIN_SIGNUP_JOIN") return "Admin added signup";
    if (t === "ADMIN_SIGNUP_LEAVE") return "Admin removed signup";
    if (t === "GUEST_ADD") return "Guest added";
    if (t === "GUEST_REMOVE") return "Guest removed";
    if (t === "SIGNUP_SWAP") return "Reordered signups";
    if (t === "AVAILABILITY_UPDATE") return "Availability updated";
    return "Admin updated availability";
  };

  const formatEventTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const addGuestForUser = async () => {
    if (!activeScheduleId) return;
    if (!guestOfUserId || !guestName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/guests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId: activeScheduleId,
          guestName,
          guestOfUserId,
        }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to add guest");
        return;
      }

      setGuestName("");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async (userId: string, label: string) => {
    const ok = window.confirm(`Delete user: ${label}? This cannot be undone.`);
    if (!ok) return;

    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to delete user");
        return;
      }

      refresh();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setLimitEdits((prev) => {
      const next: Record<string, number> = { ...prev };
      for (const s of schedules) {
        if (typeof next[s.id] !== "number") next[s.id] = s.limit;
      }
      return next;
    });

    setTitleEdits((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const s of schedules) {
        if (typeof next[s.id] !== "string") next[s.id] = s.title;
      }
      return next;
    });

    setDateEdits((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const s of schedules) {
        if (typeof next[s.id] !== "string") next[s.id] = toDatetimeLocalValue(s.date);
      }
      return next;
    });
  }, [schedules]);

  useEffect(() => {
    const filteredCount = schedules.filter((s) => (showArchived ? true : !s.archivedAt)).length;
    const maxPage = Math.max(0, Math.ceil(filteredCount / SCHEDULES_PAGE_SIZE) - 1);
    setSchedulePage((p) => (p > maxPage ? maxPage : p));
  }, [schedules, showArchived]);

  useEffect(() => {
    setEditingScheduleId(null);
  }, [schedulePage]);

  const filteredSchedules = schedules.filter((s) => (showArchived ? true : !s.archivedAt));
  const totalSchedulePages = Math.max(
    1,
    Math.ceil(filteredSchedules.length / SCHEDULES_PAGE_SIZE)
  );
  const schedulePageClamped = Math.min(schedulePage, totalSchedulePages - 1);
  const schedulePageItems = filteredSchedules.slice(
    schedulePageClamped * SCHEDULES_PAGE_SIZE,
    schedulePageClamped * SCHEDULES_PAGE_SIZE + SCHEDULES_PAGE_SIZE
  );

  const updateSchedule = async (
    scheduleId: string,
    patch: {
      active?: boolean;
      limit?: number;
      title?: string;
      date?: string;
      archived?: boolean;
    }
  ) => {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/schedules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, ...patch }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to update schedule");
        return;
      }

      refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelEditSchedule = (s: ScheduleRow) => {
    setTitleEdits((prev) => ({ ...prev, [s.id]: s.title }));
    setDateEdits((prev) => ({ ...prev, [s.id]: toDatetimeLocalValue(s.date) }));
    setLimitEdits((prev) => ({ ...prev, [s.id]: s.limit }));
    setEditingScheduleId(null);
  };

  const setScheduleActive = async (scheduleId: string, active: boolean) => {
    await updateSchedule(scheduleId, { active });
  };

  const createSchedule = async () => {
    setError(null);
    setBusy(true);
    try {
      const dateIso = date ? new Date(date).toISOString() : "";

      const resp = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, date: dateIso, limit, active, repeatWeeks }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to create schedule");
        return;
      }

      setTitle("");
      setDate("");
      setLimit(15);
      setActive(true);
      setRepeatWeeksInput("1");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const removeSignup = async (userId: string) => {
    if (!activeScheduleId) return;
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/signups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId: activeScheduleId, userId, action: "leave" }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to remove signup");
        return;
      }

      refresh();
    } finally {
      setBusy(false);
    }
  };

  const swap = async (id1: string, id2: string) => {
    if (!activeScheduleId) return;
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/signups/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId: activeScheduleId, signUpId1: id1, signUpId2: id2 }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to reorder");
        return;
      }

      refresh();
    } finally {
      setBusy(false);
    }
  };

  const setUser = async (
    userId: string,
    patch: { setAdmin?: boolean; adminNotify?: boolean; member?: boolean }
  ) => {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, ...patch }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Failed to update user");
        return;
      }

      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-8">
      {mode === "schedules" ? (
        <div className="rounded-2xl border border-zinc-200 p-6">
          <div className="text-lg font-semibold text-zinc-950">Create schedule</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-title" className="text-xs font-medium text-zinc-700">
                Title
              </label>
              <input
                id="schedule-title"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-datetime" className="text-xs font-medium text-zinc-700">
                Date & time
              </label>
              <input
                id="schedule-datetime"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-limit" className="text-xs font-medium text-zinc-700">
                Player limit
              </label>
              <input
                id="schedule-limit"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-repeat-weeks" className="text-xs font-medium text-zinc-700">
                Weeks to create
              </label>
              <input
                id="schedule-repeat-weeks"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                type="number"
                min={1}
                max={52}
                value={repeatWeeksInput}
                onChange={(e) => setRepeatWeeksInput(e.target.value)}
                onBlur={() => setRepeatWeeksInput(String(repeatWeeks))}
              />
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <div className="text-xs font-medium text-zinc-700">Active</div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Make the first created schedule active
              </label>
            </div>
            <div className="text-xs text-zinc-600 sm:col-span-2">
              Create weekly schedules ahead: sets the first one active (if checked) and creates the rest inactive.
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={busy}
              onClick={createSchedule}
            >
              Create
            </button>
            {error ? <div className="text-sm text-red-600">{error}</div> : null}
          </div>
        </div>
      ) : null}

      {mode === "signups" ? (
        <details className="rounded-2xl border border-zinc-200 p-6">
          <summary className="cursor-pointer select-none text-lg font-semibold text-zinc-950">
            History
          </summary>
          <div className="mt-4 grid gap-2">
            {(events ?? []).length === 0 ? (
              <div className="text-sm text-zinc-600">No history yet.</div>
            ) : (
              (events ?? []).map((e) => (
                <div key={e.id} className="rounded-xl border border-zinc-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-zinc-950">{formatEventType(e.type)}</div>
                    <div className="text-xs text-zinc-600">{formatEventTime(e.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {e.actorLabel ? `By ${e.actorLabel}` : ""}
                    {e.targetLabel ? ` · Target ${e.targetLabel}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </details>
      ) : null}

      {mode === "signups" && activeScheduleId ? (
        <AdminAddToSchedule
          scheduleId={activeScheduleId}
          signedUpUserIds={signUps.map((s) => s.userId)}
        />
      ) : null}

      {mode === "schedules" ? (
        <div className="rounded-2xl border border-zinc-200 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-zinc-950">Schedules</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                disabled={busy}
                onClick={() => {
                  setShowArchived((v) => !v);
                  setSchedulePage(0);
                  setEditingScheduleId(null);
                }}
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
                Page {schedulePageClamped + 1} of {totalSchedulePages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:shadow-none"
                  disabled={busy || schedulePageClamped <= 0}
                  onClick={() => setSchedulePage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:shadow-none"
                  disabled={busy || schedulePageClamped >= totalSchedulePages - 1}
                  onClick={() =>
                    setSchedulePage((p) => Math.min(totalSchedulePages - 1, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            </div>

            {schedulePageItems.map((s) => {
              const isEditing = editingScheduleId === s.id;
              const isArchived = Boolean(s.archivedAt);
              const editsDisabled = busy || isArchived || !isEditing;

              return (
                <div
                  key={s.id}
                  className={`flex flex-col gap-1 rounded-xl border p-3 ${
                    s.archivedAt
                      ? "border-zinc-200 bg-zinc-50"
                      : s.active
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-zinc-100 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-2">
                      {isEditing ? (
                        <>
                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`schedule-title-${s.id}`}
                              className="text-[11px] font-medium text-zinc-700"
                            >
                              Title
                            </label>
                            <input
                              id={`schedule-title-${s.id}`}
                              className="h-9 w-full min-w-[220px] rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                              value={titleEdits[s.id] ?? s.title}
                              disabled={editsDisabled}
                              onChange={(e) =>
                                setTitleEdits((prev) => ({
                                  ...prev,
                                  [s.id]: e.target.value,
                                }))
                              }
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`schedule-date-${s.id}`}
                              className="text-[11px] font-medium text-zinc-700"
                            >
                              Date & time
                            </label>
                            <input
                              id={`schedule-date-${s.id}`}
                              className="h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
                              type="datetime-local"
                              value={dateEdits[s.id] ?? toDatetimeLocalValue(s.date)}
                              disabled={editsDisabled}
                              onChange={(e) =>
                                setDateEdits((prev) => ({
                                  ...prev,
                                  [s.id]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="truncate text-sm font-semibold text-zinc-950">
                            {s.title}
                          </div>
                          <div className="text-sm text-zinc-600">
                            {formatScheduleDateLong(s.date)}
                          </div>
                          <div className="text-xs text-zinc-600">Limit {s.limit}</div>
                        </>
                      )}
                    </div>

                    {s.archivedAt ? (
                      <div className="mt-5 inline-flex shrink-0 items-center rounded-full bg-zinc-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                        Archived
                      </div>
                    ) : s.active ? (
                      <div className="mt-5 inline-flex shrink-0 items-center rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                        Active
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex items-end gap-2">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`schedule-limit-${s.id}`}
                            className="text-[11px] font-medium text-zinc-700"
                          >
                            Player limit
                          </label>
                          <input
                            id={`schedule-limit-${s.id}`}
                            className="h-9 w-24 rounded-xl border border-zinc-300 px-3 text-sm"
                            type="number"
                            min={1}
                            value={limitEdits[s.id] ?? s.limit}
                            disabled={editsDisabled}
                            onChange={(e) =>
                              setLimitEdits((prev) => ({
                                ...prev,
                                [s.id]: Math.max(1, Number(e.target.value)),
                              }))
                            }
                          />
                        </div>
                      ) : null}

                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                            disabled={
                              busy ||
                              ((limitEdits[s.id] ?? s.limit) === s.limit &&
                                (titleEdits[s.id] ?? s.title) === s.title &&
                                (dateEdits[s.id] ?? toDatetimeLocalValue(s.date)) ===
                                  toDatetimeLocalValue(s.date))
                            }
                            onClick={async () => {
                              await updateSchedule(s.id, {
                                limit: limitEdits[s.id] ?? s.limit,
                                title: titleEdits[s.id] ?? s.title,
                                date: dateEdits[s.id]
                                  ? new Date(dateEdits[s.id]).toISOString()
                                  : s.date,
                              });
                              setEditingScheduleId(null);
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                            disabled={busy}
                            onClick={() => cancelEditSchedule(s)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy || isArchived}
                          onClick={() => setEditingScheduleId(s.id)}
                        >
                          Edit
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {s.archivedAt ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => updateSchedule(s.id, { archived: false })}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => updateSchedule(s.id, { archived: true })}
                        >
                          Archive
                        </button>
                      )}

                      {s.active ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => setScheduleActive(s.id, false)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                          disabled={busy || Boolean(s.archivedAt)}
                          onClick={() => setScheduleActive(s.id, true)}
                        >
                          Set active
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === "signups" ? (
        <div className="rounded-2xl border border-zinc-200 p-6">
          <div className="text-lg font-semibold text-zinc-950">Schedule</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm"
              value={selectedSignupsSchedule?.id ?? ""}
              onChange={(e) => {
                const nextId = e.target.value;
                const url = nextId ? `/admin/signups?scheduleId=${encodeURIComponent(nextId)}` : "/admin/signups";
                router.push(url);
              }}
            >
              {signupsScheduleOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.active ? "(Active) " : ""}
                  {s.title} · {formatScheduleDateLong(s.date)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {mode === "signups" ? (
        <div className="rounded-2xl border border-zinc-200 p-6">
          <div className="text-lg font-semibold text-zinc-950">Active signups</div>
          {selectedSignupsSchedule ? (
            <>
              <div className="mt-1 text-sm text-zinc-600">
                {selectedSignupsSchedule.title} · {formatScheduleDateLong(selectedSignupsSchedule.date)} · Limit {selectedSignupsSchedule.limit}
              </div>
              <div className="mt-4 grid gap-2">
                {signUps
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((s, idx, arr) => (
                    <div
                      key={s.id}
                      className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-950">
                          {s.user.name ?? s.user.email ?? "User"}{s.user.member ? " (member)" : ""}
                        </div>
                        <div className="text-xs text-zinc-600">order {idx + 1}</div>
                      </div>
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
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy}
                          onClick={() => removeSignup(s.userId)}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy || idx === 0}
                          onClick={() => swap(arr[idx - 1].id, s.id)}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                          disabled={busy || idx === arr.length - 1}
                          onClick={() => swap(s.id, arr[idx + 1].id)}
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">No active schedule.</div>
          )}
        </div>
      ) : null}

      {mode === "signups" ? (
        <div className="rounded-2xl border border-zinc-200 p-6">
          <div className="text-lg font-semibold text-zinc-950">Add guest</div>
          {activeScheduleId ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                value={guestOfUserId}
                onChange={(e) => setGuestOfUserId(e.target.value)}
              >
                <option value="">Select a signed-up user…</option>
                {signUps
                  .slice()
                  .sort((a, b) => a.position - b.position)
                  .map((s) => (
                    <option key={s.userId} value={s.userId}>
                      {s.user.name ?? s.user.email ?? "User"}
                    </option>
                  ))}
              </select>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                  placeholder="Guest name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                />
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  disabled={busy || !guestOfUserId || !guestName.trim()}
                  onClick={addGuestForUser}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">No active schedule.</div>
          )}
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}
        </div>
      ) : null}

      {mode === "users" ? (
        <div className="rounded-2xl border border-zinc-200 p-6">
          <div className="text-lg font-semibold text-zinc-950">Users</div>
          <div className="mt-4 grid gap-2">
            {users.map((u) => {
              const admin = isAdmin(u.roles);
              const adminNotify = hasRole(u.roles, "admin_notify");
              const userLabel = u.name ?? u.email ?? u.id;
              return (
                <div key={u.id} className="flex flex-col gap-2 rounded-xl border border-zinc-100 p-3">
                  <div className="text-sm font-medium text-zinc-950">
                    {userLabel}
                  </div>
                  <div className="text-xs text-zinc-600">{u.email ?? ""}</div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => setUser(u.id, { setAdmin: !admin })}
                    >
                      {admin ? "Remove admin" : "Make admin"}
                    </button>
                    {admin ? (
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                        disabled={busy}
                        onClick={() => setUser(u.id, { adminNotify: !adminNotify })}
                      >
                        {adminNotify ? "Notify: on" : "Notify: off"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => setUser(u.id, { member: !u.member })}
                    >
                      {u.member ? "Unset member" : "Set member"}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-full border border-red-300 bg-white px-4 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => deleteUser(u.id, userLabel)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === "users" ? (
        <div className="text-xs text-zinc-500">
          Tip: Set member=true for users that should be auto-signed up when you create a schedule.
        </div>
      ) : null}
    </div>
  );
}
