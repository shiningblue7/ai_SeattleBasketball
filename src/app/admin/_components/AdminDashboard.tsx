"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminSignupAvailability } from "@/app/_components/AdminSignupAvailability";
import { AdminAddToSchedule } from "@/app/_components/AdminAddToSchedule";
import {
  formatScheduleDateTimeLong,
  nextWednesdayAt7pmScheduleLocal,
  scheduleDatetimeLocalToIso,
  toScheduleDatetimeLocalValue,
} from "@/lib/time";

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
  createdAt: string;
  user: { email: string | null; name: string | null; member: boolean };
};

type GuestSignUpRow = {
  id: string;
  position: number;
  createdAt: string;
  guestName: string;
  guestOfUserId: string | null;
  guestOf: { email: string | null; name: string | null };
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
  guestSignUps,
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
  guestSignUps?: GuestSignUpRow[];
  users: UserRow[];
  events?: EventRow[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => nextWednesdayAt7pmScheduleLocal());
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
  const [selectedSignup, setSelectedSignup] = useState<SignUpRow | null>(null);

  const [guestOfUserId, setGuestOfUserId] = useState<string>("");
  const [guestName, setGuestName] = useState<string>("");
  const [userFilter, setUserFilter] = useState<"all" | "admins" | "members" | "regular">("all");

  const selectedSignupsSchedule = signupsSchedule ?? activeSchedule;
  const activeScheduleId = selectedSignupsSchedule?.id ?? null;

  const combinedSignUps = [
    ...signUps.map((s) => ({
      kind: "user" as const,
      id: s.id,
      userId: s.userId,
      position: s.position,
      createdAt: s.createdAt,
      user: s.user,
      attendanceStatus: s.attendanceStatus,
      attendanceNote: s.attendanceNote,
      arriveAt: s.arriveAt,
      leaveAt: s.leaveAt,
    })),
    ...(guestSignUps ?? []).map((g) => ({
      kind: "guest" as const,
      id: g.id,
      position: g.position,
      createdAt: g.createdAt,
      guestName: g.guestName,
      guestOfLabel: g.guestOf.name ?? g.guestOf.email ?? "unknown",
    })),
  ].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

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
        return false;
      }

      refresh();
      return true;
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
        if (typeof next[s.id] !== "string") next[s.id] = toScheduleDatetimeLocalValue(s.date);
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
  const waitlistStartIndex = selectedSignupsSchedule ? selectedSignupsSchedule.limit : 0;

  const filteredUsers = users.filter((u) => {
    const admin = isAdmin(u.roles);
    const member = u.member;
    if (userFilter === "admins") return admin;
    if (userFilter === "members") return member;
    if (userFilter === "regular") return !admin && !member;
    return true;
  });

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
    setDateEdits((prev) => ({ ...prev, [s.id]: toScheduleDatetimeLocalValue(s.date) }));
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
      const dateIso = date ? scheduleDatetimeLocalToIso(date) : "";

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

  const removeGuest = async (guestSignUpId: string) => {
    if (!activeScheduleId) return;
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
        body: JSON.stringify({ scheduleId: activeScheduleId, id1, id2 }),
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

  const swapGuests = async (id1: string, id2: string) => {
    return swap(id1, id2);
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
        return false;
      }

      refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const confirmUserRoleChange = (label: string, role: "admin" | "member", nextValue: boolean) => {
    const action = nextValue ? "set" : "unset";
    const roleLabel = role === "admin" ? "admin" : "member";
    return window.confirm(`Are you sure you want to ${action} ${roleLabel} for ${label}?`);
  };


  return (
    <div className="flex w-full flex-col gap-8">
      {mode === "schedules" ? (
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Create schedule</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-title" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Title
              </label>
              <input
                id="schedule-title"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-datetime" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Date & time
              </label>
              <input
                id="schedule-datetime"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-limit" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Player limit
              </label>
              <input
                id="schedule-limit"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="schedule-repeat-weeks" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Weeks to create
              </label>
              <input
                id="schedule-repeat-weeks"
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
                type="number"
                min={1}
                max={52}
                value={repeatWeeksInput}
                onChange={(e) => setRepeatWeeksInput(e.target.value)}
                onBlur={() => setRepeatWeeksInput(String(repeatWeeks))}
              />
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Active</div>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                Make the first created schedule active
              </label>
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 sm:col-span-2">
              Create weekly schedules ahead: sets the first one active (if checked) and creates the rest inactive.
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-700"
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
        <details className="rounded-2xl border border-zinc-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <summary className="cursor-pointer select-none text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            History
          </summary>
          <div className="mt-4 grid gap-2">
            {(events ?? []).length === 0 ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">No history yet.</div>
            ) : (
              (events ?? []).map((e) => (
                <div key={e.id} className="rounded-xl border border-zinc-100 p-3 dark:border-slate-600 dark:bg-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-zinc-950 dark:text-zinc-100">{formatEventType(e.type)}</div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">{formatEventTime(e.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
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
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Schedules</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
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
                              className="h-9 w-full min-w-[220px] rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 [color-scheme:light] dark:bg-white dark:text-zinc-900 dark:placeholder:text-zinc-500"
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
                              className="h-9 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 [color-scheme:light] dark:bg-white dark:text-zinc-900 dark:placeholder:text-zinc-500"
                              type="datetime-local"
                              value={dateEdits[s.id] ?? toScheduleDatetimeLocalValue(s.date)}
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
                            {formatScheduleDateTimeLong(s.date)}
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
                            className="h-9 w-24 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 [color-scheme:light] dark:bg-white dark:text-zinc-900 dark:placeholder:text-zinc-500"
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
                                (dateEdits[s.id] ?? toScheduleDatetimeLocalValue(s.date)) ===
                                  toScheduleDatetimeLocalValue(s.date))
                            }
                            onClick={async () => {
                              await updateSchedule(s.id, {
                                limit: limitEdits[s.id] ?? s.limit,
                                title: titleEdits[s.id] ?? s.title,
                                date: dateEdits[s.id]
                                  ? scheduleDatetimeLocalToIso(dateEdits[s.id])
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
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Schedule</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100"
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
                  {s.title} · {formatScheduleDateTimeLong(s.date)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {mode === "signups" ? (
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Active signups</div>
          {selectedSignupsSchedule ? (
            <>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {selectedSignupsSchedule.title} · {formatScheduleDateTimeLong(selectedSignupsSchedule.date)} · Limit {selectedSignupsSchedule.limit}
              </div>
              <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                First {selectedSignupsSchedule.limit} spots are playing. The rest are waitlist.
              </div>
              <div className="mt-4 grid gap-2">
                {combinedSignUps.map((item, idx, arr) => (
                  <div key={item.id} className="grid gap-2">
                    {idx === waitlistStartIndex && idx < arr.length ? (
                      <div className="flex items-center gap-3 px-1 py-1">
                        <div className="h-px flex-1 bg-zinc-200 dark:bg-slate-600" />
                        <div className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:border-slate-600 dark:bg-slate-800 dark:text-zinc-300">
                          Waitlist starts here
                        </div>
                        <div className="h-px flex-1 bg-zinc-200 dark:bg-slate-600" />
                      </div>
                    ) : null}
                    <div
                      className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${
                        idx >= waitlistStartIndex
                          ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20"
                          : "border-zinc-100 dark:border-slate-600 dark:bg-slate-700"
                      }`}
                    >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">
                        {item.kind === "user"
                          ? `${item.user.name ?? item.user.email ?? "User"}${item.user.member ? " (member)" : ""}`
                          : `${item.guestName} (guest of ${item.guestOfLabel})`}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                        <span>order {idx + 1}</span>
                        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-700 dark:bg-slate-600 dark:text-zinc-100">
                          {idx < waitlistStartIndex ? "Playing" : "Waitlist"}
                        </span>
                        {item.kind === "user" && (item.attendanceNote || item.arriveAt || item.leaveAt) ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-700 dark:bg-slate-600 dark:text-zinc-100">
                            Time / note set
                          </span>
                        ) : null}
                        {item.kind === "user" && item.attendanceStatus !== "FULL" ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-700 dark:bg-slate-600 dark:text-zinc-100">
                            {item.attendanceStatus === "LATE"
                              ? "Late"
                              : item.attendanceStatus === "LEAVE_EARLY"
                                ? "Leaving early"
                                : "Partial"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                      {item.kind === "user" ? (
                        <>
                          <button
                            type="button"
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-600 dark:text-zinc-100 dark:hover:bg-slate-500"
                            disabled={busy}
                            onClick={() => removeSignup(item.userId)}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-xs font-medium disabled:opacity-60 ${
                              idx === waitlistStartIndex
                                ? "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-500 dark:text-white dark:hover:bg-emerald-400"
                                : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-600 dark:text-zinc-100 dark:hover:bg-slate-500"
                            }`}
                            disabled={busy || idx === 0}
                            onClick={() => swap(arr[idx - 1].id, item.id)}
                          >
                            {idx === waitlistStartIndex ? "Promote" : "Up"}
                          </button>
                          <button
                            type="button"
                            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-xs font-medium disabled:opacity-60 ${
                              idx === waitlistStartIndex - 1
                                ? "border border-amber-600 bg-amber-600 text-white hover:bg-amber-700 dark:border-amber-500 dark:bg-amber-500 dark:text-white dark:hover:bg-amber-400"
                                : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-600 dark:text-zinc-100 dark:hover:bg-slate-500"
                            }`}
                            disabled={busy || idx === arr.length - 1}
                            onClick={() => swap(item.id, arr[idx + 1].id)}
                          >
                            {idx === waitlistStartIndex - 1 ? "Send to waitlist" : "Down"}
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-600 dark:text-zinc-100 dark:hover:bg-slate-500"
                            onClick={() =>
                              setSelectedSignup({
                                id: item.id,
                                userId: item.userId,
                                position: item.position,
                                attendanceStatus: item.attendanceStatus,
                                attendanceNote: item.attendanceNote,
                                arriveAt: item.arriveAt,
                                leaveAt: item.leaveAt,
                                createdAt: item.createdAt,
                                user: item.user,
                              })
                            }
                          >
                            Edit time
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-full sm:w-56" />
                          <button
                            type="button"
                            className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-600 dark:text-zinc-100 dark:hover:bg-slate-500"
                            disabled={busy}
                            onClick={() => removeGuest(item.id)}
                          >
                            Remove guest
                          </button>
                          <button
                            type="button"
                            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-xs font-medium disabled:opacity-60 ${
                              idx === waitlistStartIndex
                                ? "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-500 dark:text-white dark:hover:bg-emerald-400"
                                : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-600 dark:text-zinc-100 dark:hover:bg-slate-500"
                            }`}
                            disabled={busy || idx === 0}
                            onClick={() => swapGuests(arr[idx - 1].id, item.id)}
                          >
                            {idx === waitlistStartIndex ? "Promote" : "Up"}
                          </button>
                          <button
                            type="button"
                            className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-xs font-medium disabled:opacity-60 ${
                              idx === waitlistStartIndex - 1
                                ? "border border-amber-600 bg-amber-600 text-white hover:bg-amber-700 dark:border-amber-500 dark:bg-amber-500 dark:text-white dark:hover:bg-amber-400"
                                : "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-600 dark:text-zinc-100 dark:hover:bg-slate-500"
                            }`}
                            disabled={busy || idx === arr.length - 1}
                            onClick={() => swapGuests(item.id, arr[idx + 1].id)}
                          >
                            {idx === waitlistStartIndex - 1 ? "Send to waitlist" : "Down"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No active schedule.</div>
          )}
        </div>
      ) : null}

      {mode === "signups" ? (
        <div className="rounded-2xl border border-zinc-200 p-6 dark:border-slate-700 dark:bg-slate-800">
          <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Add guest</div>
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

      {mode === "signups" && selectedSignup ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSelectedSignup(null)} />
          <div
            className="relative z-10 ml-auto h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {selectedSignup.user.name ?? selectedSignup.user.email ?? "User"}
                </div>
                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  Edit time, note, and attendance status
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                onClick={() => setSelectedSignup(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4">
              <AdminSignupAvailability
                signUpId={selectedSignup.id}
                defaultArriveAt={defaultArriveAt}
                defaultLeaveAt={defaultLeaveAt}
                initialStatus={selectedSignup.attendanceStatus}
                initialNote={selectedSignup.attendanceNote}
                initialArriveAt={selectedSignup.arriveAt}
                initialLeaveAt={selectedSignup.leaveAt}
              />
            </div>
          </div>
        </div>
      ) : null}

      {mode === "users" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Users</div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "All" },
                { value: "admins", label: "Admins" },
                { value: "members", label: "Members" },
                { value: "regular", label: "Non-admin/member" },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-medium transition ${
                    userFilter === filter.value
                      ? "border-zinc-900 bg-zinc-950 text-white dark:border-slate-400 dark:bg-slate-300 dark:text-zinc-950"
                      : "border-zinc-300 bg-white text-zinc-900 hover:border-zinc-900 hover:bg-zinc-50 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:border-slate-400 dark:hover:bg-slate-600"
                  }`}
                  onClick={() => setUserFilter(filter.value as typeof userFilter)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Showing {filteredUsers.length} of {users.length} users
            </div>
          </div>
          <div className="mt-4 sm:hidden">
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
              {filteredUsers.map((u) => {
                const admin = isAdmin(u.roles);
                const adminNotify = hasRole(u.roles, "admin_notify");
                const userLabel = u.name ?? u.email ?? u.id;
                return (
                  <div
                    key={u.id}
                    className="border-b px-4 py-3 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-slate-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{userLabel}</div>
                        <div className="truncate text-xs text-zinc-600 dark:text-zinc-400">{u.email ?? ""}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {admin ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">Admin</span>
                        ) : null}
                        {adminNotify ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">Notify</span>
                        ) : null}
                        {u.member ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">Member</span>
                        ) : null}
                        {!admin && !u.member && !adminNotify ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">User</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                        disabled={busy}
                        onClick={() =>
                          confirmUserRoleChange(userLabel, "admin", !admin) &&
                          setUser(u.id, { setAdmin: !admin })
                        }
                      >
                        {admin ? "Remove admin" : "Make admin"}
                      </button>
                      {admin ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                          disabled={busy}
                          onClick={() => setUser(u.id, { adminNotify: !adminNotify })}
                        >
                          {adminNotify ? "Notify: on" : "Notify: off"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                        disabled={busy}
                        onClick={() =>
                          confirmUserRoleChange(userLabel, "member", !u.member) &&
                          setUser(u.id, { member: !u.member })
                        }
                      >
                        {u.member ? "Unset member" : "Set member"}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-full border border-red-300 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:bg-slate-700 dark:text-red-400 dark:hover:bg-slate-600"
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

          <div className="hidden sm:block mt-4 overflow-x-auto rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => {
                    const admin = isAdmin(u.roles);
                    const adminNotify = hasRole(u.roles, "admin_notify");
                    const userLabel = u.name ?? u.email ?? u.id;
                    return (
                      <tr key={u.id} className="border-t border-zinc-200 last:border-b dark:border-slate-700">
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-100">{userLabel}</div>
                          <div className="text-sm text-zinc-600 dark:text-zinc-400">{u.email ?? ""}</div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            {admin ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">
                                Admin
                              </span>
                            ) : null}
                            {adminNotify ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">
                                Notify
                              </span>
                            ) : null}
                            {u.member ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">
                                Member
                              </span>
                            ) : null}
                            {!admin && !u.member && !adminNotify ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-slate-700 dark:text-zinc-100">
                                User
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="text-sm text-zinc-700 dark:text-zinc-300">{u.member ? "Yes" : "No"}</div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                              disabled={busy}
                              onClick={() =>
                                confirmUserRoleChange(userLabel, "admin", !admin) &&
                                setUser(u.id, { setAdmin: !admin })
                              }
                            >
                              {admin ? "Remove admin" : "Make admin"}
                            </button>
                            {admin ? (
                              <button
                                type="button"
                                className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                                disabled={busy}
                                onClick={() => setUser(u.id, { adminNotify: !adminNotify })}
                              >
                                {adminNotify ? "Notify: on" : "Notify: off"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="inline-flex h-9 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                              disabled={busy}
                              onClick={() =>
                                confirmUserRoleChange(userLabel, "member", !u.member) &&
                                setUser(u.id, { member: !u.member })
                              }
                            >
                              {u.member ? "Unset member" : "Set member"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-9 items-center justify-center rounded-full border border-red-300 bg-white px-4 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:bg-slate-700 dark:text-red-400 dark:hover:bg-slate-600"
                              disabled={busy}
                              onClick={() => deleteUser(u.id, userLabel)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                      No users match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
