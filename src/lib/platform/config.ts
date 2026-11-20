import connectToDatabase from "@/lib/mongodb";

export type MaintenanceSettings = {
  enabled: boolean;
  announcement: string;
  expectedRestorationAt: Date | null;
  affectedRoutes: string[];
  exemptAdmins: boolean;
  updatedBy: string | null;
  updatedAt: Date | null;
};

const DEFAULT_MAINTENANCE: MaintenanceSettings = {
  enabled: false,
  announcement: "ChamaPulse is undergoing scheduled maintenance. Please check back shortly.",
  expectedRestorationAt: null,
  affectedRoutes: ["/"],
  exemptAdmins: true,
  updatedBy: null,
  updatedAt: null,
};

export async function getMaintenanceSettings() {
  const db = await connectToDatabase();
  const stored = await db.collection<{ _id: string; [key: string]: unknown }>("platform_settings").findOne({ _id: "maintenance" });
  return {
    ...DEFAULT_MAINTENANCE,
    ...(stored ?? {}),
    expectedRestorationAt: stored?.expectedRestorationAt instanceof Date ? stored.expectedRestorationAt : null,
    affectedRoutes: Array.isArray(stored?.affectedRoutes) ? stored.affectedRoutes.filter((item: unknown) => typeof item === "string") : DEFAULT_MAINTENANCE.affectedRoutes,
  } as MaintenanceSettings;
}

export const FEATURE_REGISTRY = [
  { key: "registration", name: "New user registration", description: "Allow new ChamaPulse account signups.", enabledByDefault: true },
  { key: "group_creation", name: "Savings group creation", description: "Allow eligible users to create a savings group.", enabledByDefault: true },
  { key: "group_invitations", name: "Group invitations", description: "Allow group members to invite people into a group.", enabledByDefault: true },
  { key: "contributions", name: "Contributions", description: "Allow contribution ledger operations through the existing finance rules.", enabledByDefault: true },
  { key: "payouts", name: "Payouts", description: "Allow payout workflow actions through the existing finance rules.", enabledByDefault: true },
  { key: "meeting_management", name: "Meeting management", description: "Allow group meeting and call management.", enabledByDefault: true },
  { key: "notifications", name: "Notifications", description: "Allow group and platform notification publishing.", enabledByDefault: true },
] as const;

export type FeatureKey = (typeof FEATURE_REGISTRY)[number]["key"];

export async function isFeatureEnabled(key: FeatureKey) {
  const db = await connectToDatabase();
  const flag = await db.collection("platform_feature_flags").findOne({ key }, { projection: { enabled: 1 } });
  const definition = FEATURE_REGISTRY.find((item) => item.key === key);
  return typeof flag?.enabled === "boolean" ? flag.enabled : Boolean(definition?.enabledByDefault);
}
