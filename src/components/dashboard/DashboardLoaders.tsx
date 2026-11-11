"use client";

import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

type Tone = "sky" | "emerald" | "indigo";

const toneGlow: Record<Tone, string> = {
  sky: "bg-[radial-gradient(circle_at_top,_rgba(0,144,224,0.22),_transparent_55%)]",
  emerald: "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_55%)]",
  indigo: "bg-[radial-gradient(circle_at_top,_rgba(0,80,240,0.22),_transparent_55%)]",
};

export function PremiumDashboardShellLoader({
  label = "Loading your workspace...",
  tone = "sky",
}: {
  label?: string;
  tone?: Tone;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-6">
      <div className="glass-panel w-full max-w-xl p-6 sm:p-8 relative overflow-hidden">
        <div className={`absolute inset-0 opacity-70 ${toneGlow[tone]}`} />
        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <Skeleton variant="line" className="h-3 w-44" />
            <Skeleton variant="line" className="h-8 w-2/3" />
            <Skeleton variant="line" className="h-4 w-full" />
            <Skeleton variant="line" className="h-4 w-5/6" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4">
                <Skeleton variant="line" className="h-3 w-24" />
                <Skeleton variant="line" className="h-7 w-20 mt-3" />
                <Skeleton variant="line" className="h-3 w-32 mt-3" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-[var(--glass-border)] bg-white/60 p-4">
            <div className="flex items-center justify-between">
              <Skeleton variant="line" className="h-3 w-28" />
              <Skeleton variant="line" className="h-3 w-16" />
            </div>
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} variant="panel" className="h-12 rounded-2xl border border-[var(--glass-border)] bg-white/70" />
              ))}
            </div>
          </div>
          <p className="text-sm text-[var(--muted)]">{label}</p>
        </div>
      </div>
    </div>
  );
}

export function PremiumDashboardPageLoader({
  tone = "sky",
}: {
  tone?: Tone;
}) {
  return (
    <div className="space-y-8">
      <section className="glass-panel p-6 sm:p-8 relative overflow-hidden">
        <div className={`absolute inset-0 opacity-70 ${toneGlow[tone]}`} />
        <div className="relative z-10 space-y-4">
          <Skeleton variant="line" className="h-3 w-40" />
          <Skeleton variant="line" className="h-9 w-4/5" />
          <Skeleton variant="line" className="h-4 w-full" />
          <div className="flex flex-wrap gap-3 pt-2">
            <Skeleton className="h-10 w-36 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="glass-panel dash-card p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton variant="line" className="h-3 w-24" />
              <Skeleton variant="line" className="h-4 w-4 rounded-lg" />
            </div>
            <Skeleton variant="line" className="h-7 w-32" />
            <Skeleton variant="line" className="h-3 w-28" />
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="glass-panel p-6 sm:p-7 space-y-4">
          <Skeleton variant="line" className="h-3 w-44" />
          <Skeleton variant="line" className="h-7 w-1/2" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton
                key={item}
                className="h-16 rounded-2xl border border-[var(--glass-border)] bg-white/60"
              />
            ))}
          </div>
        </div>
        <div className="glass-panel p-6 sm:p-7 space-y-4">
          <Skeleton variant="line" className="h-3 w-36" />
          <Skeleton variant="line" className="h-7 w-2/3" />
          <Skeleton className="h-28 rounded-2xl border border-[var(--glass-border)] bg-white/60" />
          <Skeleton variant="line" className="h-3 w-40" />
        </div>
      </section>
    </div>
  );
}
