"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Activity, Banknote, Bell, ChartNoAxesCombined, KeyRound, LayoutDashboard, ScrollText, Settings2, ShieldAlert, ShieldCheck, SlidersHorizontal, Users, UsersRound } from "lucide-react";
import AdminLteShell, { type DashboardNavSection } from "@/components/dashboard/AdminLteShell";
import type { AdminPermission, AdminRole } from "@/lib/admin/access";
import ImpersonationWorkspace from "@/components/admin/ImpersonationWorkspace";

export default function AdminShell({
  userName,
  userEmail,
  role,
  permissions,
  impersonation,
  children,
}: {
  userName: string;
  userEmail: string;
  role: AdminRole;
  permissions: AdminPermission[];
  impersonation: { targetName: string; expiresAt: Date } | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const available = (permission: AdminPermission) => role === "SUPER_ADMIN" || permissions.includes(permission);
  const sections: DashboardNavSection[] = [
    { label: "Platform", items: [
      ...(available("dashboard.read") ? [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] : []),
      ...(available("users.read") ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
      ...(available("groups.read") ? [{ href: "/admin/groups", label: "Savings groups", icon: UsersRound }] : []),
      ...(available("finance.read") ? [{ href: "/admin/finance", label: "Financial records", icon: Banknote }] : []),
      ...(available("notifications.read") ? [{ href: "/admin/notifications", label: "Notifications", icon: Bell }] : []),
      ...(available("support.tickets.read") ? [{ href: "/admin/support", label: "Support tickets", icon: Users }] : []),
      ...(available("analytics.read") ? [{ href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesCombined }] : []),
    ] },
    { label: "Governance", items: [
      ...(available("staff.read") ? [{ href: "/admin/staff", label: "Admin staff", icon: ShieldCheck }] : []),
      ...(available("audit.read") ? [{ href: "/admin/audit", label: "Audit log", icon: ScrollText }] : []),
      ...(available("system.read") ? [{ href: "/admin/system", label: "System status", icon: Settings2 }] : []),
      ...(available("security.read") ? [{ href: "/admin/security", label: "Security centre", icon: ShieldAlert }] : []),
      ...(available("system.settings.write") ? [{ href: "/admin/maintenance", label: "Maintenance", icon: Settings2 }] : []),
      ...(available("features.write") ? [{ href: "/admin/features", label: "Feature management", icon: SlidersHorizontal }] : []),
    ] },
    { label: "Account", items: [{ href: "/account/security", label: "Security & devices", icon: KeyRound }] },
  ];

  const handleSignOut = async () => {
    await authClient.signOut();
    router.replace("/member-login");
    router.refresh();
  };

  return (
    <AdminLteShell
      appName="ChamaPulse"
      appHref="/admin"
      headerKicker="Super Admin Control Centre"
      navSections={sections}
      user={{ primary: userName, secondary: role.replaceAll("_", " ") }}
      onSignOut={handleSignOut}
    >
      {impersonation ? <div className="mb-4"><ImpersonationWorkspace /></div> : null}
      {!impersonation ? <><div className="mb-3 flex items-center gap-2 text-xs text-[var(--muted)]"><Activity size={14} /> Secure platform workspace <span className="mx-1">·</span> {userEmail}</div>{children}</> : null}
    </AdminLteShell>
  );
}
