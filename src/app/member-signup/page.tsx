// src/app/member-signup/page.tsx
"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import AuthShell from "@/components/AuthShell";

const inputClass =
  "glass-input";

function MemberSignupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefillEmail = searchParams.get("email") ?? "";
  const groupName = searchParams.get("groupName");

  const [form, setForm] = useState({
    name: "",
    email: prefillEmail,
    password: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/chama/member-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email.trim().toLowerCase(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create member account.");
      }

      const { error } = await authClient.signIn.email({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (error) {
        throw new Error("Account created, but sign-in failed. Please log in.");
      }

      setStatus("success");
      setMessage("Member account created. Redirecting...");
      router.replace("/chama");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  };

  return (
    <AuthShell
      eyebrow="Member Signup"
      title="Create your ChamaHub member profile."
      subtitle="Use the same email you received your group invite with to automatically link to your chama."
      brandTitle="Member Access"
      brandSubtitle="Join your savings circle with confidence."
      brandPoints={[
        "See upcoming dues and payout timelines.",
        "Track your savings progress in real time.",
        "Secure onboarding built for member privacy.",
      ]}
    >
      {groupName && (
        <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 px-4 py-3 text-sm text-[var(--foreground)]">
          You are joining <span className="font-semibold">{groupName}</span>.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          className={inputClass}
          placeholder="Full name"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
        <input
          className={inputClass}
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />
        <input
          className={inputClass}
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          required
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold disabled:opacity-70"
        >
          {status === "loading" ? "Creating account..." : "Create member account"}
          <ArrowRight size={16} />
        </button>
      </form>

      {message && (
        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            status === "success"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-rose-500/10 text-rose-500"
          }`}
        >
          {message}
        </div>
      )}

      <div className="mt-6 text-sm text-[var(--muted)]">
        Already a member?{" "}
        <Link href="/member-login" className="text-[var(--button-bg)] font-semibold hover:underline">
          Log in
        </Link>
      </div>
    </AuthShell>
  );
}

export default function MemberSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="glass-panel w-full max-w-md p-6 sm:p-8 text-center">
            Loading member signup...
          </div>
        </div>
      }
    >
      <MemberSignupContent />
    </Suspense>
  );
}
