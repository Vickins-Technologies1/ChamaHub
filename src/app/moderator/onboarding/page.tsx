// src/app/moderator/onboarding/page.tsx
"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Users, Wallet } from "lucide-react";

function ModeratorOnboardingContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");
  const groupName = searchParams.get("groupName") ?? "your ChamaHub group";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="glass-panel w-full max-w-3xl p-6 sm:p-10">
        <div className="flex items-center gap-3 text-[var(--button-bg)] text-xs sm:text-sm uppercase tracking-[0.3em]">
          <CheckCircle2 size={16} />
          Onboarding Complete
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold mt-3">
          {groupName} is ready for your members.
        </h1>
        <p className="text-sm text-[var(--muted)] mt-3">
          You are now the moderator. Invite members, set expectations, and start your first contribution cycle.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[var(--glass-border)] bg-white/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users size={16} />
              Invite members
            </div>
            <p className="text-sm text-[var(--muted)] mt-2">
              Add members by email or phone and assign roles like treasurer or secretary.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--glass-border)] bg-white/70 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Wallet size={16} />
              Start contributions
            </div>
            <p className="text-sm text-[var(--muted)] mt-2">
              Record member payments and track the payout order from the dashboard.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={groupId ? `/chama/groups/${groupId}` : "/chama"}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[var(--button-bg)] text-white text-sm font-semibold"
          >
            Go to moderator dashboard
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/chama/ledger"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-[var(--glass-border)] bg-white/70 text-sm font-semibold"
          >
            Preview member ledger
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ModeratorOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="glass-panel w-full max-w-md p-6 sm:p-8 text-center">
            Loading onboarding...
          </div>
        </div>
      }
    >
      <ModeratorOnboardingContent />
    </Suspense>
  );
}
