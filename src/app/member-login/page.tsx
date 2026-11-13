// src/app/member-login/page.tsx
"use client";

import { authClient } from "@/lib/auth-client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import AuthShell from "@/components/AuthShell";

const inputClass =
  "glass-input";

function MemberLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const callbackUrl = useMemo(() => searchParams.get("callbackUrl") ?? "/chama", [searchParams]);
  const passwordReset = searchParams.get("passwordReset") === "success";
  const safeCallback = useMemo(() => {
    if (!callbackUrl.startsWith("/")) return "/chama";
    if (callbackUrl.startsWith("/admin")) return "/chama";
    if (callbackUrl.startsWith("/moderator")) return "/chama";
    return callbackUrl;
  }, [callbackUrl]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    const { error: signinError } = await authClient.signIn.email({
      email: normalizedEmail,
      password,
    });

    if (signinError) {
      setError(passwordReset
        ? "Your password reset was accepted, but this sign-in attempt failed. Check that you're using the email and latest password for this member account. If needed, request another reset link."
        : "We couldn't sign you in with these details. Check your email and password, or request a reset link if you no longer know the password.");
      setLoading(false);
      return;
    }

    const sessionResult = await authClient.getSession();
    const session =
      sessionResult && typeof sessionResult === "object" && "data" in sessionResult
        ? sessionResult.data
        : sessionResult;
    const role = session?.user?.role ?? "";
    const roleList = role.split(",").map((value: string) => value.trim());
    const isMember = roleList.includes("member") || roleList.includes("user");

    if (!isMember) {
      await authClient.signOut();
      setError("This login is for ChamaPulse members. Use the moderator or admin login.");
      setLoading(false);
      return;
    }

    router.replace(safeCallback);
    router.refresh();
    setLoading(false);
  };

  return (
    <AuthShell
      eyebrow="Member Login"
      title="Access your ChamaPulse member wallet."
      subtitle="Check contributions, upcoming payouts, and member updates in one secure place."
      brandTitle="ChamaPulse Members"
      brandSubtitle="Stay synced with your group, anytime."
      brandPoints={[
        "Track your savings contributions in real time.",
        "Get payout timelines and group updates instantly.",
        "Secure access for every member.",
      ]}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
        />

        <div className="relative"><input type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className={`${inputClass} pr-12`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--button-bg)]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[var(--button-bg)] hover:bg-blue-700 text-white font-semibold rounded-full transition disabled:opacity-70"
        >
          {loading ? "Signing in..." : "Login"}
        </button>

        {error && (
          <p className="text-rose-500 text-center text-sm bg-rose-50 dark:bg-rose-900/30 py-2 rounded-lg">
            {error}
          </p>
        )}
        {passwordReset && !error && (
          <p role="status" className="text-center text-sm rounded-lg bg-emerald-50 text-emerald-800 py-2">
            Password updated. Sign in with your new password.
          </p>
        )}
      </form>

      <div className="mt-6 text-sm text-[var(--muted)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <Link href="/member-signup" className="text-[var(--button-bg)] font-semibold hover:underline">
          Create a member account
        </Link>
        <div className="flex items-center gap-4"><Link href="/forgot-password?role=member" className="hover:text-[var(--button-bg)] hover:underline">Forgot password?</Link><Link href="/moderator-login" className="inline-flex items-center gap-2 hover:underline">Moderator login <ArrowRight size={14} /></Link></div>
      </div>
    </AuthShell>
  );
}

export default function MemberLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="glass-panel w-full max-w-md p-6 sm:p-8 text-center">
            Loading member login...
          </div>
        </div>
      }
    >
      <MemberLoginContent />
    </Suspense>
  );
}
