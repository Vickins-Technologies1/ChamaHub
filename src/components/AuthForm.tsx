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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: address.trim().toLowerCase(),
          password,
          callbackURL: nextPath ?? `/auth/complete-signup?role=${role}`,
        });
        if (result.error) throw new Error(result.error.message || "Unable to create your account.");
        setMessage("Check your email for a verification link. It expires in one hour.");
      } else if (mode === "sign-in") {
        const result = await authClient.signIn.email({
          email: address.trim().toLowerCase(),
          password,
          rememberMe: true,
          callbackURL: callback,
        });
        if (result.error) throw new Error(result.error.message || "Email or password was not accepted.");
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
        if (result.error) throw new Error(result.error.message || "Unable to start password recovery.");
        setMessage("If an account uses this email, password reset instructions are on their way.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We could not complete that request.");
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
      <button type="submit" disabled={pending} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {pending && <LoaderCircle size={16} className="animate-spin" />}
        {pending ? "Please wait…" : title}
      </button>
      {mode === "recover" ? <p className="text-center text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--button-bg)] underline" href={role === "moderator" ? "/moderator-login" : "/member-login"}>Return to sign in</Link></p> : null}
    </form>
  );
}
