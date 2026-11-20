"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  mode: "sign-in" | "sign-up" | "recover";
  role?: "member" | "moderator";
  email?: string;
  nextPath?: string;
};

const inputClass = "glass-input w-full";

export default function AuthForm({ mode, role = "member", email = "", nextPath }: AuthFormProps) {
  const router = useRouter();
  const callback = nextPath ?? `/auth/continue?role=${role}`;
  const [name, setName] = useState("");
  const [address, setAddress] = useState(email);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const verificationCallback = `/auth/complete-signup?role=${role}&verified=1`;

  const describeError = (code: string | undefined, fallback: string) => {
    switch (code?.toUpperCase()) {
      case "INVALID_EMAIL": return "Enter a valid email address.";
      case "INVALID_PASSWORD": return "Choose a password with at least 12 characters.";
      case "PASSWORD_TOO_SHORT": return "Choose a password with at least 12 characters.";
      case "PASSWORD_TOO_LONG": return "Choose a password with no more than 128 characters.";
      case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      case "EMAIL_ALREADY_EXISTS":
      case "CONFLICT": return "An account may already use this email. Sign in or reset your password. If it still needs verification, request a new link below.";
      case "EMAIL_NOT_VERIFIED": return "Your email still needs verification. Check your inbox for a link, or request a new one below.";
      case "EMAIL_ALREADY_VERIFIED": return "This email is already verified. Sign in to continue.";
      case "TOKEN_EXPIRED": return "This link has expired. Request a new verification email.";
      case "INVALID_TOKEN": return "This link is invalid or has already been used. Request a new verification email.";
      default: return fallback;
    }
  };

  const resendVerification = async () => {
    const normalizedEmail = address.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter your email address first.");
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
    setPending(true);
    setError("");
    setMessage("");
    setCanResend(false);
    try {
      if (mode === "sign-up") {
        if (!name.trim()) {
          setError("Enter your full name.");
          return;
        }
        if (password.length < 12) {
          setError("Choose a password with at least 12 characters.");
          return;
        }
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: address.trim().toLowerCase(),
          password,
          callbackURL: nextPath ?? verificationCallback,
        });
        if (result.error) {
          const code = result.error.code;
          throw Object.assign(new Error(describeError(code, "We couldn't create your account. Please try again.")), { code, safeAuthMessage: true });
        }
        setMessage("If this is a new account, check your inbox for a verification link. If you’re waiting on an earlier signup, request a fresh link below. Already have an account? Sign in or reset your password.");
        setCanResend(true);
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          email: address.trim().toLowerCase(),
          password,
          rememberMe: true,
          callbackURL: callback,
        });
        if (result.error) {
          const code = result.error.code;
          const message = describeError(code, "Email or password was not accepted. Check your details or reset your password.");
          throw Object.assign(new Error(message), { code, safeAuthMessage: true });
        }
        const data = result.data as { twoFactorRedirect?: boolean } | undefined;
        if (data?.twoFactorRedirect) {
          router.replace(`/two-factor?callbackUrl=${encodeURIComponent(callback)}`);
          return;
        }
        router.replace(callback);
        router.refresh();
      } else {
        const result = await authClient.requestPasswordReset({
          email: address.trim().toLowerCase(),
          redirectTo: "/reset-password",
        });
        if (result.error) throw Object.assign(new Error("We couldn't start password recovery. Please try again."), { safeAuthMessage: true });
        setMessage("If an account uses this email, password reset instructions are on their way.");
      }
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : undefined;
      const isSafeMessage = cause && typeof cause === "object" && "safeAuthMessage" in cause && cause.safeAuthMessage === true;
      const fallback = mode === "sign-in"
        ? "We couldn't reach the sign-in service. Check your connection and try again."
        : mode === "recover"
          ? "We couldn't start password recovery. Please try again."
          : "We couldn't complete account creation. Your details are still here; please try again.";
      setError(isSafeMessage && cause instanceof Error ? cause.message : fallback);
      if (mode === "sign-up" || code === "EMAIL_NOT_VERIFIED" || code === "TOKEN_EXPIRED" || code === "INVALID_TOKEN") setCanResend(true);
    } finally {
      setPending(false);
    }
  };

  const title = mode === "sign-up" ? "Create your account" : mode === "recover" ? "Reset your password" : "Sign in";
  const passwordLabel = mode === "sign-up" ? "Password (12 characters or more)" : "Password";

  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-4" aria-label={title}>
      {mode === "sign-up" && <label className="block space-y-1.5 text-sm font-medium">Full name<input className={inputClass} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} /></label>}
      <label className="block space-y-1.5 text-sm font-medium">Email address<input className={inputClass} type="email" autoComplete="email" value={address} onChange={(event) => setAddress(event.target.value)} required maxLength={254} /></label>
      {mode !== "recover" && <label className="block space-y-1.5 text-sm font-medium">{passwordLabel}<span className="relative block"><input className={`${inputClass} pr-12`} type={showPassword ? "text" : "password"} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "sign-up" ? 12 : 1} maxLength={128} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--muted)]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>}
      {mode === "sign-in" && <div className="text-right"><Link className="text-sm font-semibold text-[var(--button-bg)] underline" href="/forgot-password">Forgot password?</Link></div>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {canResend && (mode === "sign-up" || mode === "sign-in") && <button type="button" disabled={pending || resending} onClick={() => void resendVerification()} className="w-full rounded-xl border border-[var(--glass-border)] px-4 py-3 text-sm font-semibold text-[var(--button-bg)] disabled:opacity-60">{resending ? "Sending…" : "Resend verification email"}</button>}
      <button type="submit" disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {pending && <LoaderCircle size={16} className="animate-spin" />}
        {pending ? "Please wait…" : title}
      </button>
      {mode === "sign-up" ? <p className="text-center text-sm text-[var(--muted)]">Already have an account? <Link className="font-semibold text-[var(--button-bg)] underline" href={role === "moderator" ? "/moderator-login" : "/member-login"}>Sign in</Link></p> : null}
      {mode === "recover" ? <p className="text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--button-bg)] underline" href={role === "moderator" ? "/moderator-login" : "/member-login"}>Return to sign in</Link></p> : null}
    </form>
  );
}
