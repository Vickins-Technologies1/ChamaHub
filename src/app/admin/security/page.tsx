import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { canAccessPermission, getAdminGrantForUser, isSuperAdmin } from "@/lib/admin/access";
import AdminSecurityCenter from "@/components/admin/AdminSecurityCenter";

export default async function SecurityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin%2Fsecurity");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || !canAccessPermission(grant, "security.read")) redirect("/admin");
  return <AdminSecurityCenter canManage={canAccessPermission(grant, "security.write")} canRevokeSessions={isSuperAdmin(grant)} />;
}
