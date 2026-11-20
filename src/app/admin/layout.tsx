import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { getAdminGrantForUser } from "@/lib/admin/access";
import AdminShell from "@/components/admin/AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?redirect_url=%2Fadmin");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || grant.status !== "active" || (grant.expiresAt && grant.expiresAt <= new Date())) notFound();
  return (
    <AdminShell
      userName={user.name || user.email || "ChamaPulse administrator"}
      userEmail={user.email ?? ""}
      role={grant.role}
      permissions={grant.permissions}
    >
      {children}
    </AdminShell>
  );
}
