import { getServerSession } from "next-auth/next";

import { AdminDashboard } from "@/app/admin/_components/AdminDashboard";
import { AdminNav } from "@/app/admin/_components/AdminNav";
import { getAdminData } from "@/app/admin/_lib/admin-data";
import { authOptions } from "@/auth";
import { isAdmin } from "@/lib/authz";

export default async function AdminSchedulesPage() {
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
          <div className="mt-2 text-sm text-zinc-600">You don’t have access to this page.</div>
        </div>
      </div>
    );
  }

  const data = await getAdminData();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-5xl flex-col gap-6 py-16 px-6 bg-white dark:bg-black">
        <div className="flex flex-col gap-2">
          <div className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Admin
          </div>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {session.user.email ?? session.user.id}
          </div>
        </div>

        <AdminNav />

        <AdminDashboard
          mode="schedules"
          schedules={data.schedules}
          activeSchedule={data.activeSchedule}
          defaultArriveAt={data.defaultArriveAt}
          defaultLeaveAt={data.defaultLeaveAt}
          signUps={data.signUps}
          users={data.users}
        />
      </main>
    </div>
  );
}
