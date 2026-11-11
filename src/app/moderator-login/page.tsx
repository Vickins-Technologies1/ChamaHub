// src/app/moderator-login/page.tsx
"use client";

import { authClient } from "@/lib/auth-client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import AuthShell from "@/components/AuthShell";

const inputClass =
  "glass-input";

function ModeratorLoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const callbackUrl = useMemo(() => searchParams.get("callbackUrl") ?? "/chama", [searchParams]);
  const safeCallback = useMemo(() => {
    if (!callbackUrl.startsWith("/")) return "/chama";
    if (callbackUrl.startsWith("/admin")) return "/chama";
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
      setError("Invalid email or password.");
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
    const isModerator = roleList.includes("moderator");

    if (!isModerator) {
      await authClient.signOut();
      setError("This login is for ChamaHub moderators only.");
      setLoading(false);
      return;
    }

    router.replace(safeCallback);
    router.refresh();
    setLoading(false);
  };

  return (
    <AuthShell
      eyebrow="Moderator Login"
      title="Run your ChamaHub group with confidence."
      subtitle="Manage members, contributions, and payouts from a sleek moderator command center."
      brandTitle="ChamaHub Moderators"
      brandSubtitle="Coordinate group savings with total visibility."
      brandPoints={[
        "Track rotations, payouts, and member activity.",
        "Send reminders before every due date.",
        "Stay ahead with premium insights.",
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

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={inputClass}
        />

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
      </form>

      <div className="mt-6 text-sm text-[var(--muted)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <Link href="/moderator-signup" className="text-[var(--button-bg)] font-semibold hover:underline">
          Create a moderator account
        </Link>
        <Link href="/member-login" className="inline-flex items-center gap-2 hover:underline">
          Member login
          <ArrowRight size={14} />
        </Link>
      </div>
    </AuthShell>
  );
}

export default function ModeratorLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="glass-panel w-full max-w-md p-6 sm:p-8 text-center">
            Loading moderator login...
          </div>
        </div>
      }
    >
      <ModeratorLoginContent />
    </Suspense>
  );
}
