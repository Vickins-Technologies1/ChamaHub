import { NextResponse } from "next/server";
import { getAuthSession, syncAppUser } from "@/lib/auth";
import { linkMemberToUser } from "@/lib/chama-access";
import connectToDatabase from "@/lib/mongodb";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host");
  if (origin && (!host || new URL(origin).host.toLowerCase() !== host.toLowerCase())) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const session = await getAuthSession(request.headers);
  if (!session?.user) return NextResponse.json({ error: "Sign in to finish creating your account." }, { status: 401 });
  if (session.user.emailVerified !== true) return NextResponse.json({ error: "Verify your email before finishing account setup." }, { status: 403 });
  const db = await connectToDatabase();
  const existing = await db.collection("user").findOne({ id: session.user.id }, { projection: { role: 1 } });
  const existingRole = typeof existing?.role === "string" ? existing.role : "member";
  if (existingRole.split(",").map((value: string) => value.trim()).includes("moderator")) {
    return NextResponse.json({ error: "This account already has moderator access." }, { status: 409 });
  }
  try {
    const member = await syncAppUser(session.user, "member");
    await linkMemberToUser(member);
    return NextResponse.json({ user: member });
  } catch (error) {
    console.error("Unable to complete member account setup", error);
    return NextResponse.json({ error: "We couldn't finish setting up your account. Please try again." }, { status: 500 });
  }
}
