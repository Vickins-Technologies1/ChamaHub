"use client";

import { useRouter } from "next/navigation";
import { LayoutDashboard, Users, WalletCards } from "lucide-react";
import AdminLteShell from "@/components/dashboard/AdminLteShell";
import { authClient } from "@/lib/auth-client";

export default function AdminWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut();
    router.replace("/moderator-login");
    router.refresh();
  };

  return (
    <AdminLteShell
      appName="ChamaPulse"
      appHref="/admin/chamahub"
      headerKicker="Platform administration"
      navSections={[
        { label: "Platform", items: [{ href: "/admin/chamahub", label: "Overview", icon: LayoutDashboard }] },
        { label: "Workspace", items: [
          { href: "/chama/groups", label: "Groups", icon: Users },
          { href: "/chama/ledger", label: "Contributions", icon: WalletCards },
        ] },
      ]}
      quickActions={[{ href: "/chama/groups", label: "Manage groups" }]}
      user={{
        primary: session?.user?.name || session?.user?.email || "ChamaPulse admin",
        secondary: "Platform admin",
      }}
      onSignOut={handleSignOut}
    >
      {children}
    </AdminLteShell>
  );
}
