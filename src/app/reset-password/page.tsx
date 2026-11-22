"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthShell from "@/components/AuthShell";
import PasswordStrengthIndicator from "@/components/PasswordStrengthIndicator";

function ResetPasswordForm() {
  const params = useSearchParams();
  const [token, setToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [resetRole, setResetRole] = useState<"member" | "moderator" | "admin">("member");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setToken(params.get("token") ?? "");
    const requestedRole = params.get("role");
    setResetRole(requestedRole === "moderator" ? "moderator" : requestedRole === "admin" ? "admin" : "member");
    setTokenReady(true);
    if (params.has("token")) window.history.replaceState(null, "", window.location.pathname);
  }, [params]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!token) return setError("This recovery link is missing or expired. Request a new link to continue.");
    if (password.length < 12 || password.length > 128) return setError("Choose a password between 12 and 128 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setPending(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        const code = result.error.code?.toUpperCase();
        if (code?.includes("EXPIRED")) throw new Error("This recovery link has expired. Request a new one to continue.");
        throw new Error("This recovery link is invalid or has already been used. Request a new one to continue.");
      }
      setDone(true);
      setToken("");
      setPassword("");
      setConfirm("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't update your password. Request a new recovery link and try again.");
    } finally {
      setPending(false);
    }
  };

  return <AuthShell eyebrow="Account recovery" title={done ? "Your password is updated." : "Choose a new password."} subtitle={done ? "Your existing sessions have been signed out. Sign in again with your new password." : "Choose a new password to securely restore access to your account."} brandTitle="Secure recovery" brandSubtitle="Your group records stay connected to your account." brandPoints={["Recovery links expire after one hour.", "Each link can be used once.", "Other signed-in sessions are ended after reset."]}>
    {done ? <div className="space-y-5"><div className="auth-alert auth-alert--success" role="status"><CheckCircle2 className="mr-2 inline" size={18} aria-hidden="true" />Your password was changed successfully.</div><Link className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white" href={resetRole === "moderator" ? "/moderator-login" : resetRole === "admin" ? "/admin-login" : "/member-login"}>Continue to sign in</Link>{resetRole !== "moderator" ? <Link className="block text-center text-sm font-semibold text-[var(--accent)] underline underline-offset-2" href="/moderator-login">Moderator sign in</Link> : null}</div> : <form className="space-y-4" onSubmit={submit} noValidate>
      {!tokenReady ? <p role="status" className="auth-alert auth-alert--info"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Checking your recovery link…</p> : null}
      {tokenReady && !token ? <p role="alert" className="auth-alert auth-alert--error">This recovery link is missing or expired. Request another link to continue.</p> : null}
      <label htmlFor="reset-password" className="block space-y-1.5 text-sm font-medium">New password <span className="text-[var(--muted)]">(12–128 characters)</span><span className="relative block"><input id="reset-password" className="glass-input w-full pr-12" type={show ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby="reset-password-hint" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)]" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((value) => !value)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></span><span id="reset-password-hint" className="block text-xs font-normal text-[var(--muted)]">Use at least 12 characters. A longer passphrase is easier to remember and safer.</span><PasswordStrengthIndicator value={password} /></label>
      <label htmlFor="reset-confirm" className="block space-y-1.5 text-sm font-medium">Confirm new password<input id="reset-confirm" className="glass-input w-full" type={show ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={(event) => setConfirm(event.target.value)} aria-invalid={Boolean(confirm && confirm !== password)} aria-describedby={confirm && confirm !== password ? "reset-confirm-error" : undefined} />{confirm && confirm !== password ? <span id="reset-confirm-error" className="auth-field-error block" role="alert">The passwords do not match.</span> : null}</label>
      {error ? <p role="alert" className="auth-alert auth-alert--error">{error}</p> : null}
      <button disabled={pending || !tokenReady || !token} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{pending ? "Updating password…" : "Save new password"}</button>
      <p className="text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--accent)] underline underline-offset-2" href="/forgot-password">Request another recovery link</Link></p>
    </form>}
  </AuthShell>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<AuthShell eyebrow="Account recovery" title="Loading recovery." subtitle="Checking your secure link." brandTitle="Secure recovery" brandSubtitle="Your group records stay connected to your account." brandPoints={["Recovery links expire after one hour.", "Each link can be used once.", "Other signed-in sessions end after reset."]}><p role="status" className="auth-alert auth-alert--info">Loading your recovery link…</p></AuthShell>}><ResetPasswordForm /></Suspense>;
}
