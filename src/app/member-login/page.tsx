"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";
import { safeInternalPath } from "@/lib/auth-navigation";

function MemberLoginContent() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const callback = params.get("callbackUrl") ?? params.get("redirect_url");
  const safeCallback = safeInternalPath(callback);
  const redirect = `/auth/continue?role=member&callbackUrl=${encodeURIComponent(safeCallback)}`;
  return <AuthShell eyebrow="Member Login" title="Access your ChamaPulse member wallet." subtitle="Check contributions, upcoming payouts, and member updates in one secure place." brandTitle="ChamaPulse Members" brandSubtitle="Stay synced with your group, anytime." brandPoints={["Track your savings contributions in real time.", "Get payout timelines and group updates instantly.", "Secure access for every member."]}>
    {reason === "session-expired" ? <p role="status" className="auth-alert auth-alert--info mb-4">Your session ended. Sign in again to continue.</p> : null}
    {reason === "unauthorized" ? <p role="alert" className="auth-alert auth-alert--error mb-4">This account does not have member access. Sign in with your member account or ask your moderator for help.</p> : null}
    <AuthForm mode="sign-in" role="member" nextPath={redirect} />
    <p className="mt-5 text-center text-sm text-[var(--muted)]">Need an account? Ask your group moderator to send you a secure setup link.</p>
  </AuthShell>;
}

export default function MemberLoginPage() {
  return <Suspense fallback={<AuthShell eyebrow="Member sign in" title="Access your member account." subtitle="Securely sign in to see group contributions and updates." brandTitle="ChamaPulse Members" brandSubtitle="Stay synced with your group, anytime." brandPoints={["Track group contributions.", "See upcoming payouts.", "Secure access for every member."]}><p role="status" className="auth-alert auth-alert--info">Loading member sign in…</p></AuthShell>}><MemberLoginContent /></Suspense>;
}
