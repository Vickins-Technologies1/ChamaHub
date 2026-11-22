import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth-server";
import connectToDatabase from "@/lib/mongodb";
import { checkSameOrigin, enforceUserRateLimit, ensureAdminIndexes } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

const invalidInvitation = "This invitation could not be accepted. Check that it is still valid, or sign in with the invited email address.";

export async function POST(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await enforceUserRateLimit({ userId: `invite:${ip}`, request, action: "admin-invitation-register", limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token : "";
  const inviteId = typeof body.inviteId === "string" && /^[0-9a-f-]{36}$/i.test(body.inviteId) ? body.inviteId : "";
  const isInspect = body.action === "inspect";
  const validToken = token.length >= 32 && token.length <= 256;
  if (isInspect ? !validToken && !inviteId : !validToken) {
    return NextResponse.json({ error: invalidInvitation }, { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }

  try {
    const db = await connectToDatabase();
    await ensureAdminIndexes(db);
    const tokenHash = token ? createHash("sha256").update(token).digest("hex") : "";
    const lookup = isInspect && !token ? { inviteId } : { inviteTokenHash: tokenHash };
    const invite = await db.collection<{ email: string; inviteId: string }>("admin_access_invites").findOne({ ...lookup, status: "pending", expiresAt: { $gt: new Date() } }, { projection: { email: 1, inviteId: 1 } });
    if (!invite) return NextResponse.json({ error: invalidInvitation }, { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

    if (isInspect) {
      const [local, domain] = invite.email.split("@");
      const visible = local.length < 3 ? local.slice(0, 1) : local.slice(0, 2);
      const emailHint = domain ? `${visible}${"•".repeat(Math.max(2, Math.min(6, local.length - visible.length)))}@${domain}` : "your invited email address";
      return NextResponse.json({ ok: true, emailHint, inviteId: invite.inviteId }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!name || name.length > 120 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: "Check your details and invitation, then try again." }, { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
    if (invite.email.toLowerCase() !== email) return NextResponse.json({ error: invalidInvitation }, { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

    const callbackURL = `/auth/admin-invite?verified=1#inviteId=${encodeURIComponent(invite.inviteId)}`;
    const auth = await getAuth();
    await auth.api.signUpEmail({ body: { name, email, password, callbackURL }, headers: request.headers });
    return NextResponse.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch {
    // Keep account existence and internal auth errors out of this public invitation endpoint.
    return NextResponse.json({ error: invalidInvitation }, { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
