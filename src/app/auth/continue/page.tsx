"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";

function ContinueContent() {
  const { data: session, isPending } = authClient.useSession();
  const params = useSearchParams();
  const router = useRouter();
  const handled = useRef(false);
  const requestedRole = params.get("role") === "moderator" ? "moderator" : "member";
  const callback = params.get("callbackUrl") ?? "/chama";
  const rawRole = (session?.user as ({ appRole?: string } | undefined))?.appRole ?? "member";
  const roles = rawRole.split(",").map((role) => role.trim());
  const verifiedSignupContinuation = callback === "/auth/complete-signup" || callback.startsWith("/auth/complete-signup?");
  const emailVerified = (session?.user as ({ emailVerified?: boolean } | undefined))?.emailVerified === true;
  const authorized = (verifiedSignupContinuation && emailVerified) || (requestedRole === "moderator" ? roles.includes("moderator") || roles.includes("admin") : roles.includes("member") || roles.includes("user"));

  useEffect(() => {
    if (isPending || handled.current) return;
    handled.current = true;
    if (!session?.user) {
      router.replace(requestedRole === "moderator" ? "/moderator-login" : "/member-login");
      return;
    }
    if (!authorized) {
      void authClient.signOut();
      router.replace(requestedRole === "moderator" ? "/moderator-login" : "/member-login");
      return;
    }
    const safeCallback = callback.startsWith("/") && !callback.startsWith("//") && !callback.startsWith("/admin") ? callback : "/chama";
    router.replace(safeCallback);
    router.refresh();
  }, [isPending, session, requestedRole, callback, authorized, router]);

  const message = !session?.user && !isPending
    ? "Sign in to continue."
    : session?.user && !authorized
      ? `This account does not have ${requestedRole} access.`
      : "Checking your account access…";
  return <main className="flex min-h-screen items-center justify-center p-6"><div className="glass-panel max-w-md p-8 text-center">{message}</div></main>;
}

export default function ContinuePage() {
  return <Suspense fallback={<div className="min-h-screen" />}><ContinueContent /></Suspense>;
}
