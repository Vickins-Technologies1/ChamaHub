"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

function CompleteSignupContent() {
  const { data: session, isPending } = authClient.useSession();
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState("");
  const role = params.get("role") === "moderator" ? "moderator" : "member";

  useEffect(() => {
    if (isPending || !session?.user || started.current) return;
    started.current = true;
    const finish = async () => {
      try {
        const endpoint = role === "moderator" ? "/api/chama/moderator-signup" : "/api/chama/member-signup";
        let body: Record<string, string> = {};
        if (role === "moderator") {
          const saved = sessionStorage.getItem("chamapulse-pending-moderator-signup");
          if (!saved) throw new Error("Your group setup details are missing. Please start moderator signup again.");
          body = JSON.parse(saved) as Record<string, string>;
        }
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "We could not finish account setup.");
        if (role === "moderator") sessionStorage.removeItem("chamapulse-pending-moderator-signup");
        router.replace(role === "moderator" ? `/moderator/onboarding?groupId=${encodeURIComponent(data.groupId)}` : "/chama");
        router.refresh();
      } catch (cause) {
        started.current = false;
        setError(cause instanceof Error ? cause.message : "We could not finish account setup.");
      }
    };
    void finish();
  }, [isPending, session, role, router]);

  return <main className="flex min-h-screen items-center justify-center p-6"><div className="glass-panel max-w-md p-8 text-center">{error ? <><h1 className="text-xl font-semibold">Account created; setup needs attention</h1><p className="mt-3 text-sm text-rose-700">{error}</p><a className="mt-5 inline-block font-semibold text-[var(--button-bg)] underline" href={role === "moderator" ? "/moderator-signup" : "/member-login"}>Continue</a></> : <p>Finishing your secure ChamaPulse setup…</p>}</div></main>;
}

export default function CompleteSignupPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><CompleteSignupContent /></Suspense>;
}
