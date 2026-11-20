"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";

export default function AdminInvitePage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Checking your invitation…");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded || started.current) return;
    if (!isSignedIn) return;
    started.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/admin/invitations/claim", { method: "POST" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "We could not verify this invitation.");
        setMessage("Administrative access is ready. Opening your workspace…");
        router.replace("/admin");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "We could not verify this invitation.");
      }
    })();
  }, [isLoaded, isSignedIn, router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="glass-panel w-full max-w-md p-8 text-center">
        {error ? <ShieldCheck size={30} className="mx-auto text-rose-500" /> : <LoaderCircle size={30} className="mx-auto animate-spin text-[var(--button-bg)]" />}
        <h1 className="mt-4 text-xl font-semibold">{error ? "Invitation needs attention" : "Setting up your access"}</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{error || (!isSignedIn && isLoaded ? "Sign in with the invited account to continue." : message)}</p>
        {error || (!isSignedIn && isLoaded) ? <a className="mt-5 inline-block font-semibold text-[var(--button-bg)] underline" href="/member-login?redirect_url=%2Fauth%2Fadmin-invite">Continue to sign in</a> : null}
      </section>
    </main>
  );
}
