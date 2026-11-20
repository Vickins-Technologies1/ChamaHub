"use client";

import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";

function EnrollContent() {
  const params = useSearchParams();
  const role = params.get("role") === "moderator" ? "moderator" : "member";
  const destination = `/auth/complete-signup?role=${role}`;
  return <AuthShell eyebrow="Secure account setup" title={role === "moderator" ? "Create your moderator account." : "Create your member account."} subtitle="Verify your email and finish setting up your ChamaPulse account securely." brandTitle="Account security" brandSubtitle="Email verification and recovery are managed securely." brandPoints={["Verified email address", "Secure password recovery", "Your group data stays linked"]}>
    <div className="flex justify-center"><SignUp routing="hash" forceRedirectUrl={destination} signInForceRedirectUrl={`/auth/continue?role=${role}`} signInUrl={role === "moderator" ? "/moderator-login" : "/member-login"} unsafeMetadata={{ requestedRole: role }} /></div>
  </AuthShell>;
}

export default function EnrollPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><EnrollContent /></Suspense>;
}
