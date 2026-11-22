"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

function AdminLoginContent() {
  const reason = useSearchParams().get("reason");
  return <AuthShell eyebrow="Administrator sign in" title="Sign in to your admin workspace." subtitle="Use your verified ChamaPulse administrator account to continue." brandTitle="ChamaPulse administration" brandSubtitle="Authorized staff access is checked before the workspace opens." brandPoints={["Sign in with your verified email.", "Access depends on your active staff permissions.", "Two-step verification is supported."]}>
    {reason === "session-expired" ? <p role="status" className="auth-alert auth-alert--info mb-4">Your session ended. Sign in again to continue.</p> : null}
    {reason === "unauthorized" ? <p role="alert" className="auth-alert auth-alert--error mb-4">This account does not have active administrator access. Use the invited account or contact your administrator.</p> : null}
    <AuthForm mode="sign-in" role="admin" nextPath="/auth/admin-continue" />
  </AuthShell>;
}

export default function AdminLoginPage() {
  return <Suspense fallback={<AuthShell eyebrow="Administrator sign in" title="Sign in to your admin workspace." subtitle="Use your verified staff account to continue." brandTitle="ChamaPulse administration" brandSubtitle="Authorized access is checked before the workspace opens." brandPoints={["Sign in with your verified email.", "Access depends on your staff permissions.", "Two-step verification is supported."]}><p role="status" className="auth-alert auth-alert--info">Loading administrator sign in…</p></AuthShell>}><AdminLoginContent /></Suspense>;
}
