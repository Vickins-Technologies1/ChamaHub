"use client";

import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";

function ModeratorLoginContent() {
  const params = useSearchParams();
  const callback = params.get("callbackUrl") ?? "/chama";
  const safeCallback = callback.startsWith("/") && !callback.startsWith("/admin") ? callback : "/chama";
  const redirect = `/auth/continue?role=moderator&callbackUrl=${encodeURIComponent(safeCallback)}`;

  return <AuthShell eyebrow="Moderator Login" title="Run your ChamaPulse group with confidence." subtitle="Manage members, contributions, and payouts from your moderator command center." brandTitle="ChamaPulse Moderators" brandSubtitle="Coordinate group savings with total visibility." brandPoints={["Track rotations, payouts, and member activity.", "Send reminders before every due date.", "Stay ahead with clear group insights."]}>
    <div className="flex justify-center"><SignIn routing="hash" forceRedirectUrl={redirect} signUpUrl="/moderator-signup" /></div>
  </AuthShell>;
}

export default function ModeratorLoginPage() {
  return <Suspense fallback={<div className="min-h-screen" />}><ModeratorLoginContent /></Suspense>;
}
