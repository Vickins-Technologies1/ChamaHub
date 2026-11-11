"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PremiumDashboardShellLoader } from "@/components/dashboard/DashboardLoaders";
import AdminLteShell from "@/components/dashboard/AdminLteShell";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  ClipboardList,
  Wallet,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function ChamaLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [rolePanels, setRolePanels] = useState({ hasSecretary: false, hasTreasurer: false });

  useEffect(() => {
    let isActive = true;
    const loadRolePanels = async () => {
      if (!session?.user) return;
      try {
        const response = await fetch("/api/chama/groups", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) return;
        const roles = (data.groups ?? []).map(
          (group: { membership?: { role?: string | null } | null }) => group.membership?.role
        );
        if (!isActive) return;
        setRolePanels({
          hasSecretary: roles.includes("secretary"),
          hasTreasurer: roles.includes("treasurer"),
        });
      } catch {
        // Optional panels; ignore failures.
      }
    };
    loadRolePanels();
    return () => {
      isActive = false;
    };
  }, [session?.user]);

  if (isPending) {
    return <PremiumDashboardShellLoader tone="emerald" label="Loading your ChamaHub space..." />;
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-panel p-6 sm:p-8 max-w-lg text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--accent-2)]">
            <Sparkles size={16} />
            ChamaHub Access
          </div>
          <h2 className="text-2xl font-semibold">Sign in to manage your ChamaHub group</h2>
          <p className="text-sm text-[var(--muted)]">
            Please log in to view your ChamaHub dashboard and member activity.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/member-login"
              className="inline-flex items-center justify-center px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
            >
              Member login
            </Link>
            <Link
              href="/moderator-login"
              className="inline-flex items-center justify-center px-5 py-3 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold"
            >
              Moderator login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const roleList = session.user.role
    ? session.user.role.split(",").map((value: string) => value.trim())
    : [];
  const isModerator = roleList.includes("moderator") || roleList.includes("admin");

  const navItems = [
    { href: "/chama", label: "Dashboard", icon: LayoutDashboard },
    { href: "/chama/groups", label: "Groups", icon: Users },
    { href: "/chama/ledger", label: "Contributions", icon: CalendarCheck },
    ...(rolePanels.hasSecretary ? [{ href: "/chama/secretary", label: "Secretary", icon: ClipboardList }] : []),
    ...(rolePanels.hasTreasurer ? [{ href: "/chama/treasurer", label: "Treasurer", icon: Wallet }] : []),
  ];

  const filteredNav = isModerator ? navItems : navItems.filter((item) => item.href !== "/chama/groups");

  const handleSignOut = async () => {
    await authClient.signOut();
    const role = session.user.role ?? "";
    const moderator = role.split(",").map((value) => value.trim()).includes("moderator");
    router.replace(moderator ? "/moderator-login" : "/member-login");
    router.refresh();
  };

  return (
    <AdminLteShell
      appName="ChamaHub"
      appHref="/chama"
      headerKicker="ChamaHub Workspace"
      navSections={[{ label: "Workspace", items: filteredNav }]}
      quickActions={
        isModerator
          ? [
              { href: "/chama/groups", label: "Create group" },
              { href: "/chama/ledger", label: "Record contribution" },
            ]
          : [{ href: "/chama/ledger", label: "View contributions" }]
      }
      user={{
        primary: session.user.name || session.user.email,
        secondary: isModerator ? "Moderator" : "Member",
      }}
      onSignOut={handleSignOut}
    >
      {children}
    </AdminLteShell>
  );
}

