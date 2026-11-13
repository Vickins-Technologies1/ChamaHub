"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const requestedRole = new URLSearchParams(window.location.search).get("role");
      const role = requestedRole === "moderator" ? "moderator" : "member";
      const redirectTo = new URL("/reset-password", window.location.origin);
      redirectTo.searchParams.set("role", role);
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), redirectTo: redirectTo.toString() }),
      });
      if (!response.ok) throw new Error();
      setMessage("If an account uses that email, a secure reset link is on its way.");
    } catch {
      setMessage("We could not start password recovery. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  };

  return <AuthShell eyebrow="Password recovery" title="Get back into your workspace." subtitle="Enter your email and we’ll send a secure password-reset link." brandTitle="Secure recovery" brandSubtitle="Your group’s records stay protected." brandPoints={["One-time reset links", "No account details are revealed", "Return to your workspace securely"]}><form onSubmit={submit} className="space-y-4"><input className="glass-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" required /><button className="w-full rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-70" disabled={loading}>{loading ? "Sending link…" : "Send reset link"}</button></form>{message && <p className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</p>}<p className="mt-6 text-sm text-[var(--muted)]">Remembered it? <Link className="font-semibold text-[var(--button-bg)] hover:underline" href="/member-login">Sign in</Link></p></AuthShell>;
}
