import AdminGroupDetail from "@/components/admin/AdminGroupDetail";
export default async function Page({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <AdminGroupDetail groupId={groupId} />;
}
