"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useClerk } from "@clerk/nextjs";
import { PremiumDashboardShellLoader } from "@/components/dashboard/DashboardLoaders";
import AdminLteShell from "@/components/dashboard/AdminLteShell";
import { LayoutDashboard, Users, CalendarCheck, ClipboardList, Wallet, Sparkles, Bell, LifeBuoy } from "lucide-react";
import { PlatformFeatureProvider } from "@/lib/platform/feature-context";

export default function ChamaLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const { signOut } = useClerk();
  const router = useRouter();
  const [rolePanels, setRolePanels] = useState({
    hasGroupAdmin: false,
    hasSecretary: false,
    hasTreasurer: false,
  });
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadRolePanels = async () => {
      if (!session?.user) return;
      try {
        const [response, featureResponse] = await Promise.all([
          fetch("/api/chama/groups", { cache: "no-store" }),
          fetch("/api/chama/features", { cache: "no-store" }),
        ]);
        const data = await response.json();
        const featureData = await featureResponse.json();
        if (!isActive) return;
        if (featureResponse.ok) setFeatureFlags(featureData.flags ?? {});
        if (!response.ok) return;
        const roles = (data.groups ?? []).map(
          (group: { membership?: { role?: string | null } | null }) => group.membership?.role
        );
        if (!isActive) return;
        setRolePanels({
          hasGroupAdmin: roles.includes("admin"),
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
    return <PremiumDashboardShellLoader tone="emerald" label="Loading your ChamaPulse space..." />;
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-panel p-6 sm:p-8 max-w-lg text-center space-y-4">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--accent-2)]">
            <Sparkles size={16} />
            ChamaPulse Access
          </div>
          <h2 className="text-2xl font-semibold">Sign in to manage your ChamaPulse group</h2>
          <p className="text-sm text-[var(--muted)]">
            Please log in to view your ChamaPulse dashboard and member activity.
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
  const canViewGroups =
    isModerator || rolePanels.hasGroupAdmin || rolePanels.hasSecretary || rolePanels.hasTreasurer;
  const featureEnabled = (key: string) => featureFlags?.[key] !== false;

  const workspaceItems = [
    { href: "/chama", label: "Overview", icon: LayoutDashboard },
    ...(canViewGroups ? [{ href: "/chama/groups", label: "Groups", icon: Users }] : []),
    ...(featureEnabled("contributions") ? [{ href: "/chama/ledger", label: "Contributions", icon: CalendarCheck }] : []),
    ...(featureEnabled("notifications") ? [{ href: "/chama/notifications", label: "Notifications", icon: Bell }] : []),
    { href: "/chama/support", label: "Support", icon: LifeBuoy },
  ];
  const groupTools = [
    ...(rolePanels.hasSecretary ? [{ href: "/chama/secretary", label: "Secretary", icon: ClipboardList }] : []),
    ...(rolePanels.hasTreasurer ? [{ href: "/chama/treasurer", label: "Treasurer", icon: Wallet }] : []),
  ];

  const handleSignOut = async () => {
    await signOut();
    const role = session.user.role ?? "";
    const moderator = role.split(",").map((value) => value.trim()).includes("moderator");
    router.replace(moderator ? "/moderator-login" : "/member-login");
    router.refresh();
  };

  return (
    <PlatformFeatureProvider flags={featureFlags}>
    <AdminLteShell
      appName="ChamaPulse"
      appHref="/chama"
      headerKicker="ChamaPulse Workspace"
      navSections={[
        { label: "Workspace", items: workspaceItems },
        ...(groupTools.length ? [{ label: "Group tools", items: groupTools }] : []),
      ]}
      quickActions={
        isModerator
          ? [
              ...(featureEnabled("group_creation") ? [{ href: "/chama/groups", label: "Create group" }] : []),
              ...(featureEnabled("contributions") ? [{ href: "/chama/ledger", label: "Review contributions" }] : []),
            ]
          : rolePanels.hasTreasurer
            ? [
                ...(featureEnabled("contributions") ? [{ href: "/chama/treasurer", label: "Record contribution" }] : []),
                ...(featureEnabled("contributions") ? [{ href: "/chama/ledger", label: "View contributions" }] : []),
              ]
            : (featureEnabled("contributions") ? [{ href: "/chama/ledger", label: "View contributions" }] : [])
      }
      user={{
        primary: session.user.name || session.user.email || "ChamaPulse user",
        secondary: isModerator ? "Moderator" : "Member",
      }}
      onSignOut={handleSignOut}
    >
      {children}
    </AdminLteShell>
    </PlatformFeatureProvider>
  );
}

