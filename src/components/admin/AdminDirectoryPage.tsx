import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { canAccessPermission, getAdminGrantForUser, type AdminPermission } from "@/lib/admin/access";
import AdminDirectory, { type AdminDirectoryKind } from "@/components/admin/AdminDirectory";

const writePermission: Partial<Record<AdminDirectoryKind, AdminPermission>> = {
  users: "users.suspend",
  groups: "groups.write",
};

export default async function AdminDirectoryPage({ kind }: { kind: AdminDirectoryKind }) {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || grant.status !== "active") redirect("/member-login");
  return <AdminDirectory kind={kind} canWrite={writePermission[kind] ? canAccessPermission(grant, writePermission[kind]) : false} isSuperAdmin={grant.role === "SUPER_ADMIN"} />;
}
