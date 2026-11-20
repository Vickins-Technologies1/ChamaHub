"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

function RecoveryContent() {
  const role = useSearchParams().get("role") === "moderator" ? "moderator" : "member";
  return <AuthShell eyebrow="Password recovery" title="Reset your ChamaPulse password." subtitle="We’ll email a single-use recovery link that expires in one hour." brandTitle="Secure recovery" brandSubtitle="Your group records stay connected to your account." brandPoints={["Email ownership is verified.", "Recovery links are single use.", "Existing sessions are revoked after reset."]}>
    <AuthForm mode="recover" role={role} />
  </AuthShell>;
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><RecoveryContent /></Suspense>;
}
