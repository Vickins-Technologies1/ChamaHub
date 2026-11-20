"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function ContinueContent() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const params = useSearchParams();
  const router = useRouter();
  const handled = useRef(false);
  const [message, setMessage] = useState("Checking your account access…");
  const requestedRole = params.get("role") === "moderator" ? "moderator" : "member";
  const callback = params.get("callbackUrl") ?? "/chama";

  useEffect(() => {
    if (!isLoaded || handled.current) return;
    handled.current = true;
    if (!isSignedIn || !user) {
      router.replace(requestedRole === "moderator" ? "/moderator-login" : "/member-login");
      return;
    }
    const roles = String(user.publicMetadata.role ?? "member").split(",").map((role) => role.trim());
    const authorized = requestedRole === "moderator" ? roles.includes("moderator") || roles.includes("admin") : roles.includes("member") || roles.includes("user");
    if (!authorized) {
      setMessage(requestedRole === "moderator" ? "This account does not have moderator access." : "This account does not have member access.");
      void signOut();
      return;
    }
    const safeCallback = callback.startsWith("/") && !callback.startsWith("/admin") ? callback : "/chama";
    router.replace(safeCallback);
    router.refresh();
  }, [isLoaded, isSignedIn, user, requestedRole, callback, router, signOut]);

  return <main className="flex min-h-screen items-center justify-center p-6"><div className="glass-panel max-w-md p-8 text-center">{message}<div className="mt-4 flex justify-center gap-4 text-sm"><a className="font-semibold text-[var(--button-bg)] underline" href="/member-login">Member login</a><a className="font-semibold text-[var(--button-bg)] underline" href="/moderator-login">Moderator login</a></div></div></main>;
}

export default function ContinuePage() {
  return <Suspense fallback={<div className="min-h-screen" />}><ContinueContent /></Suspense>;
}
