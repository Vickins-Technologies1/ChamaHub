"use client";

import React from "react";

type SkeletonVariant = "line" | "block" | "panel";

export function Skeleton({
  className = "",
  variant = "block",
}: {
  className?: string;
  variant?: SkeletonVariant;
}) {
  const variantClass =
    variant === "line"
      ? "rounded-full bg-[var(--border)]/55"
      : variant === "panel"
      ? "rounded-3xl border border-[var(--glass-border)] bg-white/60"
      : "rounded-2xl bg-[var(--border)]/55";

  return (
    <div
      aria-hidden="true"
      className={`shimmer-line ${variantClass} ${className}`.trim()}
    />
  );
}

