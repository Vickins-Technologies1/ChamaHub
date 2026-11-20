import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/chama-access";
import AccountSecurityClient from "@/components/AccountSecurityClient";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/member-login?callbackUrl=%2Faccount%2Fsecurity");
  return <main className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6"><AccountSecurityClient /></main>;
}
