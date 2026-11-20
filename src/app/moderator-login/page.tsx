"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import AuthForm from "@/components/AuthForm";

function ModeratorLoginContent() {
  const params = useSearchParams();
  const callback = params.get("callbackUrl") ?? params.get("redirect_url") ?? "/chama";
  const safeCallback = callback.startsWith("/") && !callback.startsWith("//") ? callback : "/chama";
  const redirect = `/auth/continue?role=moderator&callbackUrl=${encodeURIComponent(safeCallback)}`;
  return <AuthShell eyebrow="Moderator Login" title="Run your ChamaPulse group with confidence." subtitle="Manage members, contributions, and payouts from your moderator command center." brandTitle="ChamaPulse Moderators" brandSubtitle="Coordinate group savings with total visibility." brandPoints={["Track rotations, payouts, and member activity.", "Send reminders before every due date.", "Stay ahead with clear group insights."]}>
    <AuthForm mode="sign-in" role="moderator" nextPath={redirect} />
    <p className="mt-5 text-center text-sm text-[var(--muted)]">Starting a group? <Link className="font-semibold text-[var(--button-bg)] underline" href="/moderator-signup">Create a moderator account</Link></p>
  </AuthShell>;
}

export default function ModeratorLoginPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><ModeratorLoginContent /></Suspense>;
}
