import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { canAccessPermission, getAdminGrantForUser } from "@/lib/admin/access";
import AdminSupportCenter from "@/components/admin/AdminSupportCenter";

export default async function SupportPage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin%2Fsupport");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || !canAccessPermission(grant, "support.tickets.read")) redirect("/admin");
  return <AdminSupportCenter userId={user.id} canManage={canAccessPermission(grant, "support.tickets.manage")} canRespond={canAccessPermission(grant, "support.tickets.respond")} />;
}
