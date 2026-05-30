"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InlineWithdrawButton({
  scheduleId,
  className,
}: {
  scheduleId: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onWithdraw = async () => {
    if (!scheduleId) return;
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/signups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduleId, action: "leave" }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      disabled={loading}
      onClick={onWithdraw}
      className={className}
    >
      Withdraw
    </button>
  );
}
