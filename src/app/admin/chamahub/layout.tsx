import AdminWorkspaceLayout from "@/components/dashboard/AdminWorkspaceLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminWorkspaceLayout>{children}</AdminWorkspaceLayout>;
}
