import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="text-lg font-semibold text-zinc-950">Admin</div>
          <div className="mt-2 text-sm text-zinc-600">Please sign in.</div>
        </div>
      </div>
    );
  }

  if (!isAdmin(session.user.roles ?? null)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="text-lg font-semibold text-zinc-950">Admin</div>
          <div className="mt-2 text-sm text-zinc-600">
            You don’t have access to this page.
          </div>
        </div>
      </div>
    );
  }

  redirect("/admin/signups");
}
