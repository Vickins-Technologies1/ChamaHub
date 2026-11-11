"use client";

import { useMemo } from "react";

type WheelMember = {
  id: string;
  name?: string | null;
  role?: string | null;
  status?: string | null;
};

type RotationWheelProps = {
  members: WheelMember[];
  highlightedId?: string | null;
};

export default function RotationWheel({ members, highlightedId }: RotationWheelProps) {
  const activeMembers = useMemo(
    () => members.filter((member) => member.status !== "rejected"),
    [members]
  );

  const radius = 110;
  const center = 140;

  return (
    <div className="relative w-[280px] h-[280px] mx-auto">
      <div className="absolute inset-0 rounded-full border border-[var(--glass-border)] bg-white/40" />
      <div className="absolute inset-6 rounded-full border border-[var(--glass-border)] bg-white/60" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full bg-[var(--button-bg)]/10 text-[var(--button-bg)] px-4 py-2 text-xs uppercase tracking-[0.3em]">
          Rotation
        </div>
      </div>
      {activeMembers.map((member, index) => {
        const angle = (index / activeMembers.length) * Math.PI * 2 - Math.PI / 2;
        const x = center + radius * Math.cos(angle) - 22;
        const y = center + radius * Math.sin(angle) - 22;
        const initials = member.name?.split(" ").map((word) => word[0]).join("").slice(0, 2) || "M";
        const isHighlighted = highlightedId && member.id === highlightedId;
        return (
          <div
            key={member.id}
            className={`absolute flex flex-col items-center justify-center w-11 h-11 rounded-full text-xs font-semibold ${
              isHighlighted
                ? "bg-[var(--button-bg)] text-white shadow-lg"
                : "bg-white/90 text-[var(--foreground)] border border-[var(--glass-border)]"
            }`}
            style={{ left: x, top: y }}
          >
            {initials.toUpperCase()}
          </div>
        );
      })}
    </div>
  );
}
