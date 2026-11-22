import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import { getAdminGrantForUser } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export default async function AdminContinuePage() {
  const user = await getSessionUser();
  if (!user) redirect("/admin-login?reason=session-expired");
  const grant = await getAdminGrantForUser(user.id);
  if (!grant || grant.status !== "active" || (grant.expiresAt && grant.expiresAt <= new Date())) {
    redirect("/admin-login?reason=unauthorized");
  }
  redirect("/admin");
}
