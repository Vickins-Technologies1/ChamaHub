"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";
import Link from "next/link";

function EnrollContent() {
  const role = useSearchParams().get("role") === "moderator" ? "moderator" : "member";
  if (role === "member") {
    return <AuthShell eyebrow="Member account setup" title="Use your group's secure invitation." subtitle="Members do not create accounts from a public registration page. Ask your moderator to send your personal account setup link." brandTitle="Member Access" brandSubtitle="Your moderator controls group invitations." brandPoints={["Your invitation is tied to your member record.", "Create your password from the one-time link.", "Email verification protects your account."]}>
      <Link className="inline-flex w-full justify-center rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white" href="/member-login">Go to member login</Link>
    </AuthShell>;
  }
  return <AuthShell eyebrow="Secure account setup" title={role === "moderator" ? "Create your moderator account." : "Create your member account."} subtitle="Verify your email and finish setting up your ChamaPulse account securely." brandTitle="Account security" brandSubtitle="Email verification and recovery stay under ChamaPulse control." brandPoints={["Verified email address", "Secure password recovery", "Your group data stays linked"]}>
    <AuthForm mode="sign-up" role={role} />
  </AuthShell>;
}

export default function EnrollPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><EnrollContent /></Suspense>;
}
