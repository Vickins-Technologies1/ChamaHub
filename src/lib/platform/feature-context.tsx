"use client";

import { createContext, useContext } from "react";

export type PlatformFeatureKey = "registration" | "group_creation" | "group_invitations" | "contributions" | "payouts" | "meeting_management" | "notifications" | "experimental";
const PlatformFeatureContext = createContext<Partial<Record<PlatformFeatureKey, boolean>> | null>(null);

export function PlatformFeatureProvider({ flags, children }: { flags: Partial<Record<PlatformFeatureKey, boolean>> | null; children: React.ReactNode }) {
  return <PlatformFeatureContext.Provider value={flags}>{children}</PlatformFeatureContext.Provider>;
}

export function usePlatformFeature(key: PlatformFeatureKey) {
  const flags = useContext(PlatformFeatureContext);
  return flags?.[key] !== false;
}
