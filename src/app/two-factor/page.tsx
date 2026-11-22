"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthShell from "@/components/AuthShell";

function TwoFactorContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const callback = params.get("callbackUrl") ?? "/chama";
  const safeCallback = callback.startsWith("/") && !callback.startsWith("//") ? callback : "/chama";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    if (!code.trim()) {
      setError(backup ? "Enter a backup code." : "Enter the code from your authenticator app.");
      setPending(false);
      return;
    }
    try {
      const result = backup
        ? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: true })
        : await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: true });
      if (result.error) throw new Error("That verification code was not accepted. Check it and try again.");
      router.replace(safeCallback);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That verification code was not accepted. Check it and try again.");
    } finally {
      setPending(false);
    }
  };

  return <AuthShell eyebrow="Account security" title="Two-step verification." subtitle="Confirm it is you with a code from your authenticator app or a saved backup code." brandTitle="Extra account protection" brandSubtitle="Your account uses a second check to protect your group information." brandPoints={["Enter a fresh code from your authenticator.", "Backup codes work if your device is unavailable.", "Your sign-in continues after verification."]}>
    <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--accent)]"><ShieldCheck size={19} aria-hidden="true" />{backup ? "Backup code" : "Authenticator code"}</div>
    <form className="space-y-4" onSubmit={submit} noValidate>
      <label htmlFor="two-factor-code" className="block space-y-1.5 text-sm font-medium">{backup ? "Enter a backup code" : "Enter your 6-digit code"}<input id="two-factor-code" className="glass-input w-full" autoComplete="one-time-code" inputMode={backup ? "text" : "numeric"} value={code} onChange={(event) => setCode(backup ? event.target.value.slice(0, 32) : event.target.value.replace(/\D/g, "").slice(0, 6))} required maxLength={backup ? 32 : 6} aria-invalid={Boolean(error)} /></label>
      {error ? <p role="alert" className="auth-alert auth-alert--error">{error}</p> : null}
      <button disabled={pending || !code.trim()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{pending ? "Checking code…" : "Verify and continue"}</button>
    </form>
    <button className="mt-4 w-full rounded-xl border border-[var(--glass-border-strong)] px-4 py-3 text-sm font-semibold text-[var(--accent)]" type="button" onClick={() => { setBackup((value) => !value); setCode(""); setError(""); }}>{backup ? "Use authenticator app" : "Use a backup code"}</button>
  </AuthShell>;
}

export default function TwoFactorPage() {
  return <Suspense fallback={<AuthShell eyebrow="Account security" title="Two-step verification." subtitle="Confirm it is you to continue signing in." brandTitle="Extra account protection" brandSubtitle="Your account uses a second check to protect your group information." brandPoints={["Enter a fresh authenticator code.", "Use a saved backup code if needed.", "Your sign-in continues after verification."]}><p role="status" className="auth-alert auth-alert--info"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Loading verification…</p></AuthShell>}><TwoFactorContent /></Suspense>;
}
