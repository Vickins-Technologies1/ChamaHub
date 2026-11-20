"use client";

import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Activity, Banknote, LayoutDashboard, ScrollText, Settings2, ShieldCheck, Users, UsersRound } from "lucide-react";
import AdminLteShell, { type DashboardNavSection } from "@/components/dashboard/AdminLteShell";
import type { AdminPermission, AdminRole } from "@/lib/admin/access";

export default function AdminShell({
  userName,
  userEmail,
  role,
  permissions,
  children,
}: {
  userName: string;
  userEmail: string;
  role: AdminRole;
  permissions: AdminPermission[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { signOut } = useClerk();
  const available = (permission: AdminPermission) => role === "SUPER_ADMIN" || permissions.includes(permission);
  const sections: DashboardNavSection[] = [
    { label: "Platform", items: [
      ...(available("dashboard.read") ? [{ href: "/admin", label: "Overview", icon: LayoutDashboard }] : []),
      ...(available("users.read") ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
      ...(available("groups.read") ? [{ href: "/admin/groups", label: "Savings groups", icon: UsersRound }] : []),
      ...(available("finance.read") ? [{ href: "/admin/finance", label: "Financial records", icon: Banknote }] : []),
    ] },
    { label: "Governance", items: [
      ...(available("staff.read") ? [{ href: "/admin/staff", label: "Admin staff", icon: ShieldCheck }] : []),
      ...(available("audit.read") ? [{ href: "/admin/audit", label: "Audit log", icon: ScrollText }] : []),
      ...(available("system.read") ? [{ href: "/admin/system", label: "System status", icon: Settings2 }] : []),
    ] },
  ];

  const handleSignOut = async () => {
    await signOut();
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
      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--muted)]"><Activity size={14} /> Secure platform workspace <span className="mx-1">·</span> {userEmail}</div>
      {children}
    </AdminLteShell>
  );
}
