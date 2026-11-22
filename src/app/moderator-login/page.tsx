"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";
import { safeInternalPath } from "@/lib/auth-navigation";

function ModeratorLoginContent() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const callback = params.get("callbackUrl") ?? params.get("redirect_url");
  const safeCallback = safeInternalPath(callback);
  const redirect = `/auth/continue?role=moderator&callbackUrl=${encodeURIComponent(safeCallback)}`;
  return <AuthShell eyebrow="Moderator Login" title="Run your ChamaPulse group with confidence." subtitle="Manage members, contributions, and payouts from your moderator command center." brandTitle="ChamaPulse Moderators" brandSubtitle="Coordinate group savings with total visibility." brandPoints={["Track rotations, payouts, and member activity.", "Send reminders before every due date.", "Stay ahead with clear group insights."]}>
    {reason === "session-expired" ? <p role="status" className="auth-alert auth-alert--info mb-4">Your session ended. Sign in again to continue.</p> : null}
    {reason === "unauthorized" ? <p role="alert" className="auth-alert auth-alert--error mb-4">This account does not have moderator access. Sign in with your moderator account or contact support.</p> : null}
    <AuthForm mode="sign-in" role="moderator" nextPath={redirect} />
    <p className="mt-5 text-center text-sm text-[var(--muted)]">Starting a group? <Link className="font-semibold text-[var(--button-bg)] underline" href="/moderator-signup">Create a moderator account</Link></p>
  </AuthShell>;
}

export default function ModeratorLoginPage() {
  return <Suspense fallback={<AuthShell eyebrow="Moderator sign in" title="Manage your ChamaPulse group." subtitle="Securely sign in to manage members, contributions, and payouts." brandTitle="ChamaPulse Moderators" brandSubtitle="Coordinate group savings with total visibility." brandPoints={["Manage members and contributions.", "Track payouts and reminders.", "View clear group records."]}><p role="status" className="auth-alert auth-alert--info">Loading moderator sign in…</p></AuthShell>}><ModeratorLoginContent /></Suspense>;
}
