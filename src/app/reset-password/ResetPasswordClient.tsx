"use client";

import { useMemo, useState } from "react";

export function ResetPasswordClient({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const canSubmit = useMemo(() => Boolean(token && email), [token, email]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!canSubmit) {
      setError("Missing token or email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });

      const data = (await resp.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!resp.ok) {
        setError(data?.error ?? "Failed to reset password");
        return;
      }

      setInfo("Password updated. You can now sign in.");
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="text-lg font-semibold text-zinc-950">Reset password</div>
        <div className="mt-2 text-sm text-zinc-600">{email || ""}</div>

        <div className="mt-4 grid gap-3">
          <input
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
            placeholder="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
            placeholder="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {info ? <div className="text-sm text-zinc-700">{info}</div> : null}

          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            disabled={busy || !canSubmit}
            onClick={onSubmit}
          >
            Set new password
          </button>
        </div>
      </div>
    </div>
  );
}
