"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";

function ResetPasswordContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const role = params.get("role") === "moderator" ? "moderator" : "member";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    if (password !== confirmPassword) return setMessage("The passwords do not match.");
    if (!token) return setMessage("This reset link is missing or expired. Request a new one.");
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword: password, token }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status !== true) {
        const code = String(data?.code ?? data?.error ?? "");
        if (code.toLowerCase().includes("token")) {
          setMessage("This reset link has expired or was already used. Request a new password reset link.");
        } else {
          setMessage("We couldn't update your password. Request a new reset link and try again.");
        }
        return;
      }
      router.replace(role === "moderator" ? "/moderator-login?passwordReset=success" : "/member-login?passwordReset=success");
    } catch {
      setMessage("We couldn't reach the password service. Check your connection and try again, or request a new reset link.");
    } finally { setLoading(false); }
  };

  const forgotPasswordHref = role === "moderator" ? "/forgot-password?role=moderator" : "/forgot-password?role=member";
  return <AuthShell eyebrow="Choose a new password" title="Set a strong new password." subtitle="Use at least 8 characters and keep it unique to ChamaPulse." brandTitle="Secure recovery" brandSubtitle="Nearly back in your workspace." brandPoints={["One-time reset links", "Session safety", "Protected group records"]}><form onSubmit={submit} className="space-y-4"><input className="glass-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" minLength={8} required /><input className="glass-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" minLength={8} required /><button className="w-full rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-70" disabled={loading}>{loading ? "Saving…" : "Set new password"}</button></form>{message && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>}<p className="mt-6 text-sm text-[var(--muted)]"><Link className="font-semibold text-[var(--button-bg)] hover:underline" href={forgotPasswordHref}>Request another link</Link></p></AuthShell>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><ResetPasswordContent /></Suspense>;
}
