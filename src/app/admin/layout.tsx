import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { getAdminGrantForUser } from "@/lib/admin/access";
import AdminShell from "@/components/admin/AdminShell";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import connectToDatabase from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin-login?reason=session-expired");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || grant.status !== "active" || (grant.expiresAt && grant.expiresAt <= new Date())) redirect("/admin-login?reason=unauthorized");
  const token = (await cookies()).get("chp_admin_impersonation")?.value;
  let impersonation: { targetName: string; expiresAt: Date } | null = null;
  if (token) {
    const db = await connectToDatabase();
    const active = await db.collection<{ _id: string; targetName: string; expiresAt: Date }>("admin_impersonation_sessions").findOne({
      _id: createHash("sha256").update(token).digest("hex"),
      actorId: user.id,
      status: "active",
      expiresAt: { $gt: new Date() },
    }, { projection: { targetName: 1, expiresAt: 1 } });
    if (active) impersonation = { targetName: String(active.targetName), expiresAt: new Date(active.expiresAt) };
  }
  return (
    <AdminShell
      userName={user.name || user.email || "ChamaPulse administrator"}
      userEmail={user.email ?? ""}
      role={grant.role}
      permissions={grant.permissions}
      impersonation={impersonation}
    >
      {children}
    </AdminShell>
  );
}
