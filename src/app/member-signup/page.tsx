"use client";

import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";

function MemberSignupContent() {
  const params = useSearchParams();
  const groupName = params.get("groupName");
  const email = params.get("email") ?? undefined;
  return <AuthShell eyebrow="Member Signup" title="Create your ChamaPulse member profile." subtitle="Use the email address your group invited so we can link your account to your membership." brandTitle="Member Access" brandSubtitle="Join your savings circle with confidence." brandPoints={["See upcoming dues and payout timelines.", "Track your savings progress in real time.", "Secure onboarding built for member privacy."]}>
    {groupName && <div className="mb-5 rounded-2xl border border-[var(--glass-border)] bg-white/60 px-4 py-3 text-sm">You are joining <strong>{groupName}</strong>.</div>}
    <div className="flex justify-center"><SignUp routing="hash" initialValues={{ emailAddress: email }} forceRedirectUrl="/auth/complete-signup?role=member" signInForceRedirectUrl="/auth/continue?role=member" signInUrl="/member-login" unsafeMetadata={{ requestedRole: "member" }} /></div>
  </AuthShell>;
}

export default function MemberSignupPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><MemberSignupContent /></Suspense>;
}
