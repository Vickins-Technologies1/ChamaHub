"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import PasswordStrengthIndicator from "@/components/PasswordStrengthIndicator";

type AuthRole = "member" | "moderator" | "admin";
type AuthFormProps = {
  mode: "sign-in" | "sign-up" | "recover";
  role?: AuthRole;
  email?: string;
  nextPath?: string;
  invitationToken?: string;
  verificationCallbackUrl?: string;
  showModeLinks?: boolean;
};

const inputClass = "glass-input auth-field w-full";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PasswordInput({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
  hint,
  error,
  confirmation = false,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  error?: string;
  confirmation?: boolean;
  onBlur?: () => void;
}) {
  const id = `auth-${confirmation ? "confirm" : "password"}`;
  const errorId = `${id}-error`;
  return <label htmlFor={id} className="block space-y-1.5 text-sm font-medium">
    <span>{label}</span>
    <span className="relative block">
      <input id={id} className={`${inputClass} pr-12`} type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} required minLength={autoComplete === "new-password" ? 12 : 1} maxLength={128} aria-invalid={Boolean(error)} aria-describedby={[hint ? `${id}-hint` : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined} />
      <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)]" aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </span>
    {hint ? <span id={`${id}-hint`} className="block text-xs font-normal text-[var(--muted)]">{hint}</span> : null}
    {autoComplete === "new-password" && !confirmation ? <PasswordStrengthIndicator value={value} /> : null}
    {error ? <span id={errorId} className="auth-field-error block" role="alert">{error}</span> : null}
  </label>;
}

export default function AuthForm({ mode, role = "member", email = "", nextPath, invitationToken, verificationCallbackUrl, showModeLinks = true }: AuthFormProps) {
  const router = useRouter();
  const callback = nextPath ?? `/auth/continue?role=${role}`;
  const [name, setName] = useState("");
  const [address, setAddress] = useState(email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const verificationCallback = verificationCallbackUrl ?? (role === "admin"
    ? "/auth/admin-invite"
    : `/auth/complete-signup?role=${role}&verified=1`);
  const normalizedEmail = address.trim().toLowerCase();
  const emailError = emailTouched && !emailPattern.test(normalizedEmail) ? "Enter a valid email address." : "";
  const passwordError = passwordTouched
    ? mode === "sign-up" && password.length < 12
      ? "Use at least 12 characters."
      : mode === "sign-in" && !password
        ? "Enter your password."
        : ""
    : "";
  const confirmError = confirmTouched && mode === "sign-up" && password !== confirmPassword ? "The passwords do not match." : "";
  const title = mode === "sign-up" ? "Create your account" : mode === "recover" ? "Send reset link" : "Sign in";
  const passwordHint = mode === "sign-up" ? "Use 12–128 characters. A longer passphrase is easier to remember and safer." : undefined;

  const resendVerification = async () => {
    if (!emailPattern.test(normalizedEmail)) {
      setEmailTouched(true);
      setError("Enter a valid email address first.");
      return;
    }
    setResending(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({ email: normalizedEmail, callbackURL: verificationCallback });
      if (result.error) throw result.error;
      setMessage("If this address needs verification, a new email is on its way. Check your inbox and spam folder.");
      setCanResend(false);
    } catch {
      setError("We couldn't send a new verification email. Please wait a moment and try again.");
    } finally {
      setResending(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setEmailTouched(true);
    if (!emailPattern.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (mode === "sign-in" && !password) {
      setPasswordTouched(true);
      setError("Enter your password.");
      return;
    }
    if (mode === "sign-up") {
      setPasswordTouched(true);
      setConfirmTouched(true);
      if (!name.trim() && role !== "member") {
        setError("Enter your full name.");
        return;
      }
      if (password.length < 12 || password.length > 128) {
        setError("Choose a password between 12 and 128 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }
      if (role === "member") {
        setError("Members can create accounts only from a secure invitation link sent by their group moderator.");
        return;
      }
      if (role === "admin" && !invitationToken) {
        setError("Open the administrator invitation link to create this account.");
        return;
      }
    }

    setPending(true);
    setCanResend(false);
    try {
      if (mode === "sign-up" && role === "moderator") {
        const response = await fetch("/api/chama/moderator-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: normalizedEmail, password }),
        });
        const result = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "We couldn't create your account. Please try again.");
        setMessage("If this is a new account, check your inbox for a verification link. If you are waiting on an earlier signup, request a fresh link below.");
        setCanResend(true);
      } else if (mode === "sign-up" && role === "admin") {
        const response = await fetch("/api/admin/invitations/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: normalizedEmail, password, token: invitationToken }),
        });
        const result = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "We couldn't create your account. Check your invitation and try again.");
        setMessage("Your account is created. Verify your email using the link we sent, then return here to finish accepting the invitation.");
        setCanResend(true);
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email: normalizedEmail, password, rememberMe, callbackURL: callback });
        if (result.error) {
          if (result.error.code === "EMAIL_NOT_VERIFIED") {
            setCanResend(true);
            throw new Error("Verify your email before signing in. Check your inbox or request a new verification link below.");
          }
          throw new Error("Email or password was not accepted. Check your details or reset your password.");
        }
        const data = result.data as { twoFactorRedirect?: boolean } | undefined;
        if (data?.twoFactorRedirect) {
          router.replace(`/two-factor?callbackUrl=${encodeURIComponent(callback)}`);
          return;
        }
        router.replace(callback);
        router.refresh();
      } else {
        const resetRedirect = role === "admin" ? "/reset-password?role=admin" : role === "moderator" ? "/reset-password?role=moderator" : "/reset-password";
        const result = await authClient.requestPasswordReset({ email: normalizedEmail, redirectTo: resetRedirect });
        if (result.error) throw new Error("We couldn't start password recovery. Please try again.");
        setMessage("If an account uses this email, password reset instructions are on their way.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't complete your request. Please try again.");
      const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
      if (mode === "sign-up" || code === "EMAIL_NOT_VERIFIED") setCanResend(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full space-y-4" aria-label={title} noValidate>
      {mode === "sign-up" ? <label htmlFor="auth-name" className="block space-y-1.5 text-sm font-medium">Full name<input id="auth-name" className={inputClass} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label> : null}
      <label htmlFor="auth-email" className="block space-y-1.5 text-sm font-medium">Email address<input id="auth-email" className={inputClass} type="email" inputMode="email" autoComplete="email" value={address} onChange={(event) => setAddress(event.target.value)} onBlur={() => { setAddress(normalizedEmail); setEmailTouched(true); }} required maxLength={254} aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "auth-email-error" : undefined} />{emailError ? <span id="auth-email-error" className="auth-field-error block" role="alert">{emailError}</span> : null}</label>
      {mode !== "recover" ? <>
        <PasswordInput label="Password" value={password} onChange={setPassword} onBlur={() => setPasswordTouched(true)} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} hint={passwordHint} error={passwordError} />
        {mode === "sign-up" ? <PasswordInput label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} visible={showPassword} onToggle={() => setShowPassword((value) => !value)} autoComplete="new-password" error={confirmError} confirmation /> : null}
      </> : null}
      {mode === "sign-in" ? <div className="flex items-center justify-between gap-3 text-sm"><label className="inline-flex items-center gap-2 text-[var(--muted)]"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />Remember me</label><Link className="font-semibold text-[var(--accent)] underline underline-offset-2" href={`/forgot-password?role=${role}`}>Forgot password?</Link></div> : null}
      {error ? <p role="alert" className="auth-alert auth-alert--error">{error}</p> : null}
      {message ? <p role="status" className="auth-alert auth-alert--success">{message}</p> : null}
      {canResend && (mode === "sign-up" || mode === "sign-in") ? <button type="button" disabled={pending || resending} onClick={() => void resendVerification()} className="w-full rounded-xl border border-[var(--glass-border-strong)] px-4 py-3 text-sm font-semibold text-[var(--accent)] disabled:opacity-60">{resending ? "Sending verification email…" : "Resend verification email"}</button> : null}
      <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : null}
        {pending ? mode === "sign-in" ? "Signing in…" : mode === "recover" ? "Sending reset link…" : "Creating account…" : title}
      </button>
      {showModeLinks && mode === "sign-up" ? <p className="text-center text-sm text-[var(--muted)]">Already have an account? <Link className="font-semibold text-[var(--accent)] underline underline-offset-2" href={role === "moderator" ? "/moderator-login" : role === "admin" ? `/auth/admin-invite${invitationToken ? `#token=${encodeURIComponent(invitationToken)}` : ""}` : "/member-login"}>Sign in</Link></p> : null}
      {showModeLinks && mode === "recover" ? <p className="text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--accent)] underline underline-offset-2" href={role === "moderator" ? "/moderator-login" : role === "admin" ? "/admin-login" : "/member-login"}>Return to sign in</Link></p> : null}
    </form>
  );
}
