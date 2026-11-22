"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";
import AuthShell from "@/components/AuthShell";
import { safeInternalPath } from "@/lib/auth-navigation";

function ContinueContent() {
  const { data: session, isPending } = authClient.useSession();
  const params = useSearchParams();
  const router = useRouter();
  const handled = useRef(false);
  const requestedRole = params.get("role") === "moderator" ? "moderator" : "member";
  const callback = safeInternalPath(params.get("callbackUrl"));
  const rawRole = (session?.user as ({ appRole?: string } | undefined))?.appRole ?? "member";
  const roles = rawRole.split(",").map((role) => role.trim());
  const verifiedSignupContinuation = callback === "/auth/complete-signup" || callback.startsWith("/auth/complete-signup?");
  const emailVerified = (session?.user as ({ emailVerified?: boolean } | undefined))?.emailVerified === true;
  const authorized = (verifiedSignupContinuation && emailVerified) || (requestedRole === "moderator" ? roles.includes("moderator") || roles.includes("admin") : roles.includes("member") || roles.includes("user"));

  useEffect(() => {
    if (isPending || handled.current) return;
    handled.current = true;
    if (!session?.user) {
      router.replace(`${requestedRole === "moderator" ? "/moderator-login" : "/member-login"}?reason=session-expired`);
      return;
    }
    if (!authorized) {
      void authClient.signOut();
      router.replace(`${requestedRole === "moderator" ? "/moderator-login" : "/member-login"}?reason=unauthorized`);
      return;
    }
    const safeCallback = callback.startsWith("/admin") ? "/chama" : callback;
    router.replace(safeCallback);
    router.refresh();
  }, [isPending, session, requestedRole, callback, authorized, router]);

  const message = session?.user && !authorized
    ? `This account does not have ${requestedRole} access. Taking you to sign in…`
    : "Checking your account access…";
  return <AuthShell eyebrow="Secure access" title="Checking your account." subtitle="We are confirming your session and access before opening your workspace." brandTitle="Protected workspace" brandSubtitle="Your account is checked before private group details are shown." brandPoints={["Sessions are checked on protected pages.", "Access depends on your assigned role.", "You can sign in again if your session ended."]}><p role="status" className="auth-alert auth-alert--info">{message}</p></AuthShell>;
}

export default function ContinuePage() {
  return <Suspense fallback={<AuthShell eyebrow="Secure access" title="Checking your account." subtitle="Confirming your session and workspace access." brandTitle="Protected workspace" brandSubtitle="We check access before private group details are shown." brandPoints={["Sessions are checked on protected pages.", "Access depends on your assigned role.", "You can sign in again if your session ended."]}><p role="status" className="auth-alert auth-alert--info">Checking your account…</p></AuthShell>}><ContinueContent /></Suspense>;
}
