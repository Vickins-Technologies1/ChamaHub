"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

function MemberLoginContent() {
  const params = useSearchParams();
  const callback = params.get("callbackUrl") ?? params.get("redirect_url") ?? "/chama";
  const safeCallback = callback.startsWith("/") && !callback.startsWith("//") ? callback : "/chama";
  const redirect = `/auth/continue?role=member&callbackUrl=${encodeURIComponent(safeCallback)}`;
  return <AuthShell eyebrow="Member Login" title="Access your ChamaPulse member wallet." subtitle="Check contributions, upcoming payouts, and member updates in one secure place." brandTitle="ChamaPulse Members" brandSubtitle="Stay synced with your group, anytime." brandPoints={["Track your savings contributions in real time.", "Get payout timelines and group updates instantly.", "Secure access for every member."]}>
    <AuthForm mode="sign-in" role="member" nextPath={redirect} />
    <p className="mt-5 text-center text-sm text-[var(--muted)]">New to ChamaPulse? <Link className="font-semibold text-[var(--button-bg)] underline" href="/member-signup">Create an account</Link></p>
  </AuthShell>;
}

export default function MemberLoginPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><MemberLoginContent /></Suspense>;
}
