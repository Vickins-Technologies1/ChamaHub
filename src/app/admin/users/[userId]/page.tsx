import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { canAccessPermission, getAdminGrantForUser } from "@/lib/admin/access";
import AdminUserDetail from "@/components/admin/AdminUserDetail";

export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const current = await getSessionUser();
  if (!current) redirect("/member-login?redirect_url=%2Fadmin");
  const grant = await getAdminGrantForUser(current.id);
  if (!grant || grant.status !== "active") redirect("/member-login");
  return <AdminUserDetail
    userId={userId}
    canSuspend={canAccessPermission(grant, "users.suspend")}
    canWrite={canAccessPermission(grant, "users.write")}
    canRevokeSessions={canAccessPermission(grant, "users.sessions.revoke")}
  />;
}
