import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { getAdminGrantForUser, isSuperAdmin } from "@/lib/admin/access";
import AdminStaffCenter from "@/components/admin/AdminStaffCenter";

export default async function StaffPage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin%2Fstaff");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant) redirect("/member-login");
  return <AdminStaffCenter canManage={isSuperAdmin(grant)} />;
}
