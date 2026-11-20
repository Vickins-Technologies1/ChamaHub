import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { canAccessPermission, getAdminGrantForUser } from "@/lib/admin/access";
import MaintenanceCenter from "@/components/admin/MaintenanceCenter";

export default async function MaintenancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin%2Fmaintenance");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant) redirect("/member-login");
  return <MaintenanceCenter canManage={canAccessPermission(grant, "system.settings.write")} />;
}
