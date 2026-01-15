"use client";

import { signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AuthButtons({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestPasswordReset = async (normalizedEmail: string) => {
    const resp = await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    if (!resp.ok) {
      const data = (await resp.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(data?.error ?? "Failed to request password reset");
    }
  };

  const onLocalSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        if (res.error === "RESET_REQUIRED") {
          setError("This account must reset its password before signing in.");

          const normalized = email.trim().toLowerCase();
          if (!normalized) return;

          await requestPasswordReset(normalized)
            .then(() => {
              setInfo(
                "We emailed you a password reset link. Please check your inbox."
              );
            })
            .catch((e) => {
              setError(
                e instanceof Error
                  ? e.message
                  : "Failed to request password reset"
              );
            });
          return;
        } else {
          setError("Invalid email or password");
        }
        return;
      }

      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Enter your email first.");
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await requestPasswordReset(normalized);
      setInfo("If an account exists for that email, a reset link has been sent.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to request password reset"
      );
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async () => {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Registration failed");
        return;
      }

      await onLocalSignIn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {signedIn ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            Link Google
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            onClick={() => signIn("github", { callbackUrl: "/" })}
          >
            Link GitHub
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            onClick={() => signIn("discord", { callbackUrl: "/" })}
          >
            Link Discord
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => signOut({ callbackUrl: "/" })}
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-4">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => signIn("google")}
          >
            Continue with Google
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => signIn("github")}
          >
            Continue with GitHub
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-indigo-600 px-6 text-sm font-medium text-white hover:bg-indigo-700"
            onClick={() => signIn("discord")}
          >
            Continue with Discord
          </button>

          <div className="w-full rounded-2xl border border-zinc-200 p-4">
            <div className="grid gap-3">
              <input
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                placeholder="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm"
                placeholder="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {error ? (
                <div className="text-sm text-red-600">{error}</div>
              ) : null}

              {info ? (
                <div className="text-sm text-zinc-700">{info}</div>
              ) : null}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-700"
                  disabled={loading}
                  onClick={onLocalSignIn}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                  disabled={loading}
                  onClick={onForgotPassword}
                >
                  Forgot password
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-zinc-300 bg-white px-6 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-zinc-100 dark:hover:bg-slate-600"
                  disabled={loading}
                  onClick={onRegister}
                >
                  Register
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
