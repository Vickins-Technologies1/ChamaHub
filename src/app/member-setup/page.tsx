"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type SetupDetails = {
  memberName: string;
  groupName: string;
  emailHint: string;
  expiresAt: string;
  existingAccount: boolean;
  canLinkExistingAccount: boolean;
};

function MemberSetupContent() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [token, setToken] = useState("");
  const [details, setDetails] = useState<SetupDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const loadInvitation = useCallback(async (value: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chama/member-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "inspect", token: value }) });
      const result = await response.json().catch(() => ({})) as SetupDetails & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "This setup link is not available. Ask your moderator to send another one.");
      setDetails(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't check this setup link. Try again.");
      setDetails(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    if (!value) {
      setError("This setup link is missing its invitation token. Ask your moderator to send a new link.");
      setLoading(false);
      return;
    }
    setToken(value);
    window.history.replaceState(null, "", "/member-setup");
    void loadInvitation(value);
  }, [loadInvitation]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (password.length < 12 || password.length > 128) {
      setError("Choose a password between 12 and 128 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/chama/member-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; code?: string; verificationRequired?: boolean; accountActivated?: boolean };
      if (!response.ok) {
        if (result.code === "ACCOUNT_EXISTS") setDetails((current) => current ? { ...current, existingAccount: true } : current);
        throw new Error(result.error ?? "We couldn't set up your account. Please try again.");
      }
      if (result.verificationRequired) {
        setSuccess("Your account is set up. Check your inbox for the email verification link. After verifying, you will be signed in and taken to your member dashboard.");
      } else {
        router.replace("/chama");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't set up your account. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const linkExistingAccount = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/chama/member-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "link-existing-account" }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "We couldn't link this account.");
      router.replace("/chama");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't link this account.");
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return <main className="flex min-h-screen items-center justify-center p-5"><section className="glass-panel w-full max-w-lg p-7 sm:p-9"><CheckCircle2 className="text-emerald-600" size={30} /><h1 className="mt-4 text-2xl font-semibold">Check your email</h1><p role="status" className="mt-3 text-sm leading-6 text-[var(--muted)]">{success}</p><p className="mt-5 text-sm">Invitation email: <span className="font-semibold">{details?.emailHint}</span></p><Link className="mt-6 inline-flex font-semibold text-[var(--button-bg)] underline" href="/member-login">Go to member login</Link></section></main>;
  }

  return <main className="flex min-h-screen items-center justify-center p-5"><section className="glass-panel w-full max-w-lg p-7 sm:p-9">
    <ShieldCheck className="text-[var(--button-bg)]" size={28} />
    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Secure member invitation</p>
    <h1 className="mt-2 text-2xl font-semibold">Activate your Chama Hub account</h1>
    {loading ? <div className="mt-6 flex items-center gap-2 text-sm text-[var(--muted)]" role="status"><LoaderCircle size={17} className="animate-spin" />Checking your invitation…</div> : null}
    {!loading && details ? <>
      <div className="mt-5 rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4 text-sm"><p>Member: <strong>{details.memberName}</strong></p><p className="mt-1">Group: <strong>{details.groupName}</strong></p><p className="mt-1 text-xs text-[var(--muted)]">Invitation sent to {details.emailHint}. Expires {new Date(details.expiresAt).toLocaleDateString()}.</p></div>
      {details.canLinkExistingAccount && session?.user ? <div className="mt-5 space-y-4"><p className="text-sm leading-6 text-[var(--muted)]">You are signed in with the verified email address on this invitation. Link your existing account to this member record.</p><button type="button" onClick={() => void linkExistingAccount()} disabled={busy} className="w-full rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Linking account…" : "Link account and continue"}</button></div> : details.existingAccount ? <div className="mt-5 space-y-4"><p className="text-sm leading-6 text-[var(--muted)]">An account already uses this invited email. Sign in or reset its password first, then reopen this invitation while signed in.</p>{session?.user && !details.canLinkExistingAccount ? <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">You are signed in with a different email address. Sign out and use {details.emailHint}.</p> : null}<Link href={`/member-login?callbackUrl=${encodeURIComponent(`/member-setup#token=${token}`)}`} className="inline-flex w-full justify-center rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white">Sign in with invited email</Link><Link href="/forgot-password" className="block text-center text-sm font-semibold text-[var(--button-bg)] underline">Reset password</Link></div> : <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
        <p className="text-sm leading-6 text-[var(--muted)]">Create your password to activate your member account. We will send a verification link to {details.emailHint} before your first sign-in.</p>
        <label className="block space-y-1.5 text-sm font-medium">Password <span className="text-[var(--muted)]">(12–128 characters)</span><span className="relative block"><input className="glass-input w-full pr-12" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
        <label className="block space-y-1.5 text-sm font-medium">Confirm password<input className="glass-input w-full" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
        <p className="text-xs leading-5 text-[var(--muted)]">Use at least 12 characters. Your password is stored securely, and this invitation can be used only once.</p>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{busy ? "Setting up account…" : "Activate account"}</button>
      </form>}
    </> : null}
    {!loading && !details && error ? <div className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700"><p role="alert">{error}</p><button type="button" onClick={() => token && void loadInvitation(token)} className="mt-3 font-semibold underline">Try again</button></div> : null}
    {details && error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    <p className="mt-6 text-center text-xs text-[var(--muted)]">Did not expect this invitation? Contact your group moderator.</p>
  </section></main>;
}

export default function MemberSetupPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-6"><div className="glass-panel p-8 text-sm text-[var(--muted)]">Loading your invitation…</div></main>}><MemberSetupContent /></Suspense>;
}
