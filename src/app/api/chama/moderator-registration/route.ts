import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-server";
import { checkSameOrigin } from "@/lib/admin/access";

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter your name and a valid email address." }, { status: 400 });
  }
  if (password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: "Choose a password between 12 and 128 characters." }, { status: 400 });
  }
  try {
    const auth = await getAuth();
    await auth.api.signUpEmail({
      body: { name, email, password, callbackURL: "/auth/complete-signup?role=moderator&verified=1" },
      headers: request.headers,
    });
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const statusCode = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode
      : 400;
    const message = error instanceof Error && /already exists|already registered|already taken|conflict/i.test(error.message)
      ? "An account may already use this email. Sign in or reset the password instead."
      : "We couldn't create the moderator account. Check your details and try again.";
    return NextResponse.json({ error: message }, { status: statusCode >= 400 && statusCode < 500 ? statusCode : 400 });
  }
}
