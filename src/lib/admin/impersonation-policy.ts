export type ImpersonationDenial = { status: 400 | 403 | 404; message: string };

export function hasRecentSecondFactor(
  factorVerificationAge: number[] | null | undefined,
  maximumAgeSeconds: number,
) {
  return Array.isArray(factorVerificationAge)
    && factorVerificationAge.length >= 2
    && factorVerificationAge.every((age) => Number.isFinite(age) && age >= 0 && age <= maximumAgeSeconds);
}

export function validateImpersonationTarget(input: {
  actorId: string;
  targetUserId: string;
  targetExists: boolean;
  targetSuspended: boolean;
  targetAdminRole: string | null;
  targetHasAdminGrant: boolean;
  actorCanImpersonateStaff: boolean;
}): ImpersonationDenial | null {
  if (!input.targetUserId || input.actorId === input.targetUserId) {
    return { status: 400, message: "Select another account to investigate." };
  }
  if (!input.targetExists || input.targetSuspended) {
    return { status: 404, message: "The target account was not found or is suspended." };
  }
  if (input.targetAdminRole === "SUPER_ADMIN") {
    return { status: 403, message: "The Super Admin account cannot be impersonated." };
  }
  if (input.targetHasAdminGrant && !input.actorCanImpersonateStaff) {
    return { status: 403, message: "Staff impersonation requires the separate staff impersonation permission." };
  }
  return null;
}

export function isImpersonationSessionLive(
  session: { actorId?: unknown; status?: unknown; expiresAt?: unknown } | null,
  actorId: string,
  now = Date.now(),
) {
  const expiry = session?.expiresAt instanceof Date ? session.expiresAt.getTime() : Number.NaN;
  return session?.actorId === actorId && session.status === "active" && Number.isFinite(expiry) && expiry > now;
}

export function impersonationTerminationQuery(tokenHash: string, actorId: string) {
  return { _id: tokenHash, actorId, status: "active" };
}

export function impersonationTerminationUpdate(endedAt: Date) {
  return { $set: { status: "ended", endedAt, endReason: "administrator_exit" } };
}
