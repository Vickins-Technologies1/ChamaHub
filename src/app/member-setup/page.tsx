"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthShell from "@/components/AuthShell";
import PasswordStrengthIndicator from "@/components/PasswordStrengthIndicator";

type SetupDetails = {
  memberName: string;
  groupName: string;
  emailHint: string;
  expiresAt: string;
  existingAccount: boolean;
  canLinkExistingAccount: boolean;
};

const memberSetupResumeKey = "chp-member-setup-resume";

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
    let savedToken = "";
    try {
      savedToken = window.sessionStorage.getItem(memberSetupResumeKey) ?? "";
      window.sessionStorage.removeItem(memberSetupResumeKey);
    } catch {
      // A direct invitation link still works if browser session storage is unavailable.
    }
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? savedToken;
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

  const signInWithInvitedEmail = async () => {
    setBusy(true);
    try {
      window.sessionStorage.setItem(memberSetupResumeKey, token);
      if (session?.user) await authClient.signOut();
      router.push(`/member-login?callbackUrl=${encodeURIComponent("/member-setup?resume=1")}`);
    } catch {
      setBusy(false);
      setError("We couldn't prepare sign in. Your invitation is still available; please try again.");
    }
  };

  if (success) {
    return <AuthShell eyebrow="Member invitation" title="Check your email." subtitle="One more step will secure your member account." brandTitle="Member access" brandSubtitle="Your account is connected to the invitation from your moderator." brandPoints={["Your member record stays linked to this account.", "Email verification protects your sign-in.", "The invitation cannot be reused."]}><CheckCircle2 className="text-[var(--auth-success-text)]" size={30} /><p role="status" className="auth-alert auth-alert--success mt-4">{success}</p><p className="mt-5 text-sm text-[var(--muted)]">Invitation email: <span className="font-semibold text-[var(--foreground)]">{details?.emailHint}</span></p><Link className="mt-6 inline-flex font-semibold text-[var(--accent)] underline underline-offset-2" href="/member-login">Go to member login</Link></AuthShell>;
  }

  return <AuthShell eyebrow="Secure member invitation" title="Activate your ChamaPulse account." subtitle="Create your password from the personal setup link sent by your group moderator." brandTitle="Member access" brandSubtitle="Your account is connected to the invitation from your moderator." brandPoints={["Your member record stays linked to this account.", "Email verification protects your sign-in.", "The invitation cannot be reused."]}>
    <ShieldCheck className="text-[var(--accent)]" size={28} />
    {loading ? <div className="mt-6 flex items-center gap-2 text-sm text-[var(--muted)]" role="status"><LoaderCircle size={17} className="animate-spin" />Checking your invitation…</div> : null}
    {!loading && details ? <>
      <div className="mt-5 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface-muted)] p-4 text-sm"><p>Member: <strong>{details.memberName}</strong></p><p className="mt-1">Group: <strong>{details.groupName}</strong></p><p className="mt-1 text-xs text-[var(--muted)]">Invitation sent to {details.emailHint}. Expires {new Date(details.expiresAt).toLocaleDateString()}.</p></div>
      {details.canLinkExistingAccount && session?.user ? <div className="mt-5 space-y-4"><p className="text-sm leading-6 text-[var(--muted)]">You are signed in with the verified email address on this invitation. Link your existing account to this member record.</p><button type="button" onClick={() => void linkExistingAccount()} disabled={busy} className="w-full rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Linking account…" : "Link account and continue"}</button></div> : details.existingAccount ? <div className="mt-5 space-y-4"><p className="text-sm leading-6 text-[var(--muted)]">An account already uses this invited email. Sign in or reset its password first, then reopen this invitation while signed in.</p>{session?.user && !details.canLinkExistingAccount ? <p role="alert" className="auth-alert auth-alert--error">You are signed in with a different email address. Sign out and use {details.emailHint}.</p> : null}<button type="button" onClick={() => void signInWithInvitedEmail()} disabled={busy} className="inline-flex min-h-12 w-full justify-center rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Preparing sign in…" : "Sign in with invited email"}</button><Link href="/forgot-password" className="block text-center text-sm font-semibold text-[var(--accent)] underline underline-offset-2">Reset password</Link></div> : <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
        <p className="text-sm leading-6 text-[var(--muted)]">Create your password to activate your member account. We will send a verification link to {details.emailHint} before your first sign-in.</p>
        <label htmlFor="member-new-password" className="block space-y-1.5 text-sm font-medium">Password <span className="text-[var(--muted)]">(12–128 characters)</span><span className="relative block"><input id="member-new-password" className="glass-input w-full pr-12" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required aria-describedby="member-password-hint" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span><span id="member-password-hint" className="block text-xs font-normal text-[var(--muted)]">Use at least 12 characters. A longer passphrase is easier to remember and safer.</span><PasswordStrengthIndicator value={password} /></label>
        <label htmlFor="member-confirm-password" className="block space-y-1.5 text-sm font-medium">Confirm password<input id="member-confirm-password" className="glass-input w-full" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required aria-invalid={Boolean(confirmPassword && confirmPassword !== password)} aria-describedby={confirmPassword && confirmPassword !== password ? "member-confirm-error" : undefined} />{confirmPassword && confirmPassword !== password ? <span id="member-confirm-error" className="auth-field-error block" role="alert">The passwords do not match.</span> : null}</label>
        <p className="text-xs leading-5 text-[var(--muted)]">Use at least 12 characters. Your password is stored securely, and this invitation can be used only once.</p>
        <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? <LoaderCircle size={16} className="animate-spin" /> : null}{busy ? "Setting up account…" : "Activate account"}</button>
      </form>}
    </> : null}
    {!loading && !details && error ? <div className="auth-alert auth-alert--error mt-5"><p role="alert">{error}</p><button type="button" onClick={() => token && void loadInvitation(token)} className="mt-3 font-semibold underline">Try again</button></div> : null}
    {details && error ? <p role="alert" className="auth-alert auth-alert--error mt-4">{error}</p> : null}
    <p className="mt-6 text-center text-xs text-[var(--muted)]">Did not expect this invitation? Contact your group moderator.</p>
  </AuthShell>;
}

export default function MemberSetupPage() {
  return <Suspense fallback={<AuthShell eyebrow="Secure member invitation" title="Loading your invitation." subtitle="Checking the one-time setup link from your group moderator." brandTitle="Member access" brandSubtitle="Your moderator controls member invitations." brandPoints={["The invitation is linked to your member record.", "Create a password from the secure link.", "Email verification protects your access."]}><div role="status" className="auth-alert auth-alert--info"><LoaderCircle size={16} className="mr-2 inline animate-spin" />Loading your invitation…</div></AuthShell>}><MemberSetupContent /></Suspense>;
}
