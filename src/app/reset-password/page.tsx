import { ResetPasswordClient } from "./ResetPasswordClient";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string; email?: string }> | { token?: string; email?: string };
}) {
  const resolved = await Promise.resolve(searchParams);
  const token = resolved?.token ?? "";
  const email = resolved?.email ?? "";

  return <ResetPasswordClient token={token} email={email} />;
}
