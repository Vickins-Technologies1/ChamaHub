"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return setError("This recovery link is missing or expired. Request a new one.");
    if (password !== confirm) return setError("The passwords do not match.");
    setPending(true);
    setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message || "This recovery link is invalid or expired.");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not reset your password.");
    } finally {
      setPending(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center p-6"><section className="glass-panel w-full max-w-lg p-8">
    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--accent-2)]">Account recovery</p>
    <h1 className="mt-3 text-2xl font-semibold">{done ? "Password updated" : "Choose a new password"}</h1>
    {done ? <><p className="mt-3 text-sm text-[var(--muted)]">Your password is set and your other sessions have been signed out.</p><Link className="mt-6 inline-flex rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white" href="/member-login">Continue to sign in</Link></> : <form className="mt-6 space-y-4" onSubmit={submit}>
      <label className="block space-y-1.5 text-sm font-medium">New password (12 characters or more)<span className="relative block"><input className="glass-input w-full pr-12" type={show ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 p-1" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
      <label className="block space-y-1.5 text-sm font-medium">Confirm password<input className="glass-input w-full" type={show ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!token && !error && <p className="text-sm text-rose-700">This recovery link is missing or expired. Request a new one.</p>}
      <button disabled={pending || !token} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{pending && <LoaderCircle size={16} className="animate-spin" />}{pending ? "Updating…" : "Save new password"}</button>
      <p className="text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--button-bg)] underline" href="/forgot-password">Request another link</Link></p>
    </form>}
  </section></main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><ResetPasswordForm /></Suspense>;
}
