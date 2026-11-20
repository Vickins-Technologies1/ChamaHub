export type IdentityExportEmail = {
  emailAddress?: string;
  verification?: { status?: string };
};

export type IdentityExportUser = {
  id?: string;
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  profileImageUrl?: string | null;
  primaryEmailAddress?: string | IdentityExportEmail | null;
  emailAddresses?: IdentityExportEmail[];
};

type LegacyIdentity = {
  id?: string;
  legacyProviderId?: string | null;
  clerkId?: string | null;
};

export function normalizeAuthEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function indexIdentityExport(users: IdentityExportUser[]) {
  const identities = new Map<string, IdentityExportUser>();
  for (const identity of users) {
    if (typeof identity.externalId === "string" && identity.externalId) identities.set(`app:${identity.externalId}`, identity);
    if (typeof identity.id === "string" && identity.id) identities.set(`provider:${identity.id}`, identity);
  }
  return identities;
}

export function matchExportIdentity(legacy: LegacyIdentity, identities: Map<string, IdentityExportUser>) {
  if (typeof legacy.id === "string" && legacy.id) {
    const stableMatch = identities.get(`app:${legacy.id}`);
    if (stableMatch) return stableMatch;
  }
  const providerId = legacy.legacyProviderId || legacy.clerkId;
  return providerId ? identities.get(`provider:${providerId}`) : undefined;
}

export function getExportIdentityEmail(identity: IdentityExportUser): { email: string; verified: boolean } | null {
  const primary = identity.primaryEmailAddress;
  const primaryEmail = typeof primary === "string" ? primary : primary?.emailAddress;
  if (!primaryEmail) return null;
  const email = normalizeAuthEmail(primaryEmail);
  const matching = identity.emailAddresses?.find((entry) => normalizeAuthEmail(entry.emailAddress) === email);
  const verified = (typeof primary === "object" && primary?.verification?.status === "verified")
    || matching?.verification?.status === "verified";
  return { email, verified };
}
