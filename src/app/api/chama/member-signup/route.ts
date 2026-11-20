import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { clerkClient, syncAppUser } from "@/lib/auth";
import { linkMemberToUser } from "@/lib/chama-access";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to finish creating your account." }, { status: 401 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Your Clerk account could not be loaded." }, { status: 401 });

  const existingRole = typeof user.publicMetadata.role === "string" ? user.publicMetadata.role : "member";
  if (existingRole.split(",").map((role) => role.trim()).some((role) => ["admin", "moderator"].includes(role))) {
    return NextResponse.json({ error: "This account already has moderator access." }, { status: 409 });
  }

  const client = await clerkClient();
  await client.users.updateUser(user.id, {
    publicMetadata: { ...user.publicMetadata, role: "member" },
  });

  const member = await syncAppUser(user, "member");
  await linkMemberToUser(member);
  return NextResponse.json({ user: member });
}
