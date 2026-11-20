"use client";

import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";

function MemberLoginContent() {
  const params = useSearchParams();
  const callback = params.get("callbackUrl") ?? "/chama";
  const safeCallback = callback.startsWith("/") && !callback.startsWith("/admin") ? callback : "/chama";
  const redirect = `/auth/continue?role=member&callbackUrl=${encodeURIComponent(safeCallback)}`;

  return <AuthShell eyebrow="Member Login" title="Access your ChamaPulse member wallet." subtitle="Check contributions, upcoming payouts, and member updates in one secure place." brandTitle="ChamaPulse Members" brandSubtitle="Stay synced with your group, anytime." brandPoints={["Track your savings contributions in real time.", "Get payout timelines and group updates instantly.", "Secure access for every member."]}>
    <div className="flex justify-center"><SignIn routing="hash" forceRedirectUrl={redirect} signUpUrl="/member-signup" /></div>
  </AuthShell>;
}

export default function MemberLoginPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><MemberLoginContent /></Suspense>;
}
