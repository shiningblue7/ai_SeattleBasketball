"use client";

import { useMemo, useState } from "react";

export type ActivityItem = {
  id: string;
  createdAt: string; // ISO
  line: string;
  timeLabel: string;
};

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  const [expanded, setExpanded] = useState(false);

  const visible = useMemo(() => {
    const limit = expanded ? 50 : 20;
    return items.slice(0, limit);
  }, [items, expanded]);

  const canExpand = items.length > 20;

  return (
    <details className="group rounded-2xl border border-zinc-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-zinc-950 outline-none dark:text-zinc-50">
        <span className="min-w-0 truncate">Recent activity</span>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 dark:border-slate-700 dark:bg-slate-900/30 dark:text-zinc-200">
          <span>
            {items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "none"}
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 transition-transform group-open:rotate-180"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </summary>

      {visible.length ? (
        <>
          <ol className="mt-3 space-y-2 text-sm">
            {visible.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/30"
              >
                <div className="min-w-0 text-zinc-900 dark:text-zinc-100">{row.line}</div>
                <div className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                  {row.timeLabel}
                </div>
              </li>
            ))}
          </ol>

          {canExpand ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                Showing {expanded ? Math.min(50, items.length) : Math.min(20, items.length)} of{" "}
                {items.length}
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No recent activity yet.</div>
      )}
    </details>
  );
}

