"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

function EnrollContent() {
  const role = useSearchParams().get("role") === "moderator" ? "moderator" : "member";
  return <AuthShell eyebrow="Secure account setup" title={role === "moderator" ? "Create your moderator account." : "Create your member account."} subtitle="Verify your email and finish setting up your ChamaPulse account securely." brandTitle="Account security" brandSubtitle="Email verification and recovery stay under ChamaPulse control." brandPoints={["Verified email address", "Secure password recovery", "Your group data stays linked"]}>
    <AuthForm mode="sign-up" role={role} />
  </AuthShell>;
}

export default function EnrollPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><EnrollContent /></Suspense>;
}
