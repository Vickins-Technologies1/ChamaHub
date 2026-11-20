"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

function MemberSignupContent() {
  const params = useSearchParams();
  const groupName = params.get("groupName");
  const email = params.get("email") ?? "";
  return <AuthShell eyebrow="Member Signup" title="Create your ChamaPulse member profile." subtitle="Use the email address your group invited so we can link your account to your membership." brandTitle="Member Access" brandSubtitle="Join your savings circle with confidence." brandPoints={["See upcoming dues and payout timelines.", "Track your savings progress in real time.", "Secure onboarding built for member privacy."]}>
    {groupName && <div className="mb-5 rounded-2xl border border-[var(--glass-border)] bg-white/60 px-4 py-3 text-sm">You are joining <strong>{groupName}</strong>.</div>}
    <AuthForm mode="sign-up" role="member" email={email} />
    <p className="mt-5 text-center text-sm text-[var(--muted)]">Already have an account? <Link className="font-semibold text-[var(--button-bg)] underline" href="/member-login">Sign in</Link></p>
  </AuthShell>;
}

export default function MemberSignupPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><MemberSignupContent /></Suspense>;
}
