import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { canAccessPermission, getAdminGrantForUser } from "@/lib/admin/access";
import AdminAnalytics from "@/components/admin/AdminAnalytics";

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin%2Fanalytics");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || !canAccessPermission(grant, "analytics.read")) redirect("/admin");
  return <AdminAnalytics canExport={canAccessPermission(grant, "reports.export")} />;
}
