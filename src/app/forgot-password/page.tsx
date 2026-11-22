"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

function RecoveryContent() {
  const requestedRole = useSearchParams().get("role");
  const role = requestedRole === "moderator" ? "moderator" : requestedRole === "admin" ? "admin" : "member";
  return <AuthShell eyebrow="Password recovery" title="Reset your ChamaPulse password." subtitle="We’ll email a single-use recovery link that expires in one hour." brandTitle="Secure recovery" brandSubtitle="Your group records stay connected to your account." brandPoints={["Email ownership is verified.", "Recovery links are single use.", "Existing sessions are revoked after reset."]}>
    <AuthForm mode="recover" role={role} />
  </AuthShell>;
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={<AuthShell eyebrow="Password recovery" title="Reset your password." subtitle="We’ll email a single-use recovery link that expires in one hour." brandTitle="Secure recovery" brandSubtitle="Your group records stay connected to your account." brandPoints={["Email ownership is verified.", "Recovery links are single use.", "Sessions end after a password reset."]}><p role="status" className="auth-alert auth-alert--info">Loading password recovery…</p></AuthShell>}><RecoveryContent /></Suspense>;
}
