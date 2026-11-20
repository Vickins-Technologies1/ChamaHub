"use client";

import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";

function RecoveryContent() {
  const role = useSearchParams().get("role") === "moderator" ? "moderator" : "member";
  return <AuthShell eyebrow="Password recovery" title="Reset your ChamaPulse password." subtitle="Enter the email on your account, then choose “Forgot password?” in the secure sign-in form." brandTitle="Secure recovery" brandSubtitle="Clerk sends and validates one-time recovery codes." brandPoints={["Email ownership is verified.", "Recovery codes are single use.", "Your group records stay protected."]}>
    <div className="flex justify-center"><SignIn routing="hash" signUpUrl={role === "moderator" ? "/moderator-signup" : "/member-signup"} /></div>
    <p className="mt-5 text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--button-bg)] underline" href={role === "moderator" ? "/moderator-login" : "/member-login"}>Return to sign in</Link></p>
  </AuthShell>;
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><RecoveryContent /></Suspense>;
}
