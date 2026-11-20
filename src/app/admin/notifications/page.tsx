import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { getAdminGrantForUser } from "@/lib/admin/access";
import AdminNotifications from "@/components/admin/AdminNotifications";

export default async function NotificationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin%2Fnotifications");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant) redirect("/member-login");
  return <AdminNotifications canWrite={grant.role === "SUPER_ADMIN" || grant.permissions.includes("notifications.write")} />;
}
