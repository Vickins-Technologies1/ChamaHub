"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";
import { authClient } from "@/lib/auth-client";

function AdminInviteContent() {
  const { data: session, isPending } = authClient.useSession();
  const params = useSearchParams();
  const router = useRouter();
  const started = useRef(false);
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [message, setMessage] = useState("Checking your invitation…");
  const [error, setError] = useState("");
  const callback = token ? `/auth/admin-invite?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}` : "/auth/admin-invite";

  useEffect(() => {
    if (isPending || !session?.user || started.current) return;
    started.current = true;
    void (async () => {
      try {
        if (!token) throw new Error("This invitation link is missing its verification token. Ask the administrator to send a new invitation.");
        const response = await fetch("/api/admin/invitations/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error ?? "We could not verify this invitation.");
        setMessage("Administrative access is ready. Opening your workspace…");
        router.replace("/admin");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "We could not verify this invitation.");
      }
    })();
  }, [isPending, session, token, router]);

  if (!isPending && !session?.user) return <AuthShell eyebrow="Administrative invitation" title="Accept your ChamaPulse invitation." subtitle="Create an account or sign in using the invited email address, then verify your email to activate access." brandTitle="Secure admin access" brandSubtitle="Invitations are single use and expire after seven days." brandPoints={["Email must match the invitation.", "A verified address is required.", "Access is granted only after claim."]}>
    <div className="space-y-6"><AuthForm mode="sign-in" email={email} nextPath={callback} /><div className="border-t border-[var(--glass-border)] pt-5"><AuthForm mode="sign-up" email={email} nextPath={callback} /></div><p className="text-center text-xs text-[var(--muted)]"><Link href="/forgot-password" className="underline">Recover an existing account</Link></p></div>
  </AuthShell>;

  return <main className="flex min-h-screen items-center justify-center p-6"><section className="glass-panel w-full max-w-md p-8 text-center">
    {error ? <ShieldCheck size={30} className="mx-auto text-rose-500" /> : <LoaderCircle size={30} className="mx-auto animate-spin text-[var(--button-bg)]" />}
    <h1 className="mt-4 text-xl font-semibold">{error ? "Invitation needs attention" : "Setting up your access"}</h1>
    <p className="mt-3 text-sm text-[var(--muted)]">{error || message}</p>
    {error && <Link className="mt-5 inline-block font-semibold text-[var(--button-bg)] underline" href="/member-login">Return to sign in</Link>}
  </section></main>;
}

export default function AdminInvitePage() {
  return <Suspense fallback={<div className="min-h-screen" />}><AdminInviteContent /></Suspense>;
}
