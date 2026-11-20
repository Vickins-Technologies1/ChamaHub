"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";

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
    try {
      const result = backup
        ? await authClient.twoFactor.verifyBackupCode({ code: code.trim(), trustDevice: true })
        : await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: true });
      if (result.error) throw new Error(result.error.message || "That verification code was not accepted.");
      router.replace(safeCallback);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That verification code was not accepted.");
    } finally {
      setPending(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center p-6"><section className="glass-panel w-full max-w-md p-8">
    <ShieldCheck className="text-[var(--button-bg)]" size={30} />
    <h1 className="mt-4 text-2xl font-semibold">Two-step verification</h1>
    <p className="mt-2 text-sm text-[var(--muted)]">Enter the code from your authenticator app{backup ? " or backup code" : ""}.</p>
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <label className="block space-y-1.5 text-sm font-medium">{backup ? "Backup code" : "Authenticator code"}<input className="glass-input w-full" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={32} /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{pending && <LoaderCircle size={16} className="animate-spin" />}{pending ? "Verifying…" : "Verify and continue"}</button>
    </form>
    <button className="mt-4 w-full text-sm font-semibold text-[var(--button-bg)] underline" type="button" onClick={() => { setBackup((value) => !value); setCode(""); setError(""); }}>{backup ? "Use authenticator app" : "Use a backup code"}</button>
  </section></main>;
}

export default function TwoFactorPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><TwoFactorContent /></Suspense>;
}
