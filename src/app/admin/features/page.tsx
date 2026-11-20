import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { canAccessPermission, getAdminGrantForUser } from "@/lib/admin/access";
import FeatureManagement from "@/components/admin/FeatureManagement";

export default async function FeaturesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin%2Ffeatures");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant) redirect("/member-login");
  return <FeatureManagement canManage={canAccessPermission(grant, "features.write")} />;
}
