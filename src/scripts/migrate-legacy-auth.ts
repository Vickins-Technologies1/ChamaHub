import { config as loadEnv } from "dotenv";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hash } from "@node-rs/argon2";
import connectToDatabase from "@/lib/mongodb";
import { getExportIdentityEmail, indexIdentityExport, matchExportIdentity, normalizeAuthEmail, type IdentityExportUser } from "@/lib/auth-migration";

loadEnv({ path: [".env.local", ".env"] });

type LegacyUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  avatar?: string | null;
  role?: string | null;
  clerkId?: string | null;
  legacyProviderId?: string | null;
  createdAt?: Date | string;
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const exportFlag = args.indexOf("--identity-export");
const exportPath = exportFlag >= 0 ? args[exportFlag + 1] : undefined;
if (apply && process.env.AUTH_MIGRATION_BACKUP_CONFIRMED !== "YES") {
  throw new Error("Back up the configured MongoDB database first, then set AUTH_MIGRATION_BACKUP_CONFIRMED=YES to apply.");
}
if (args.includes("--identity-export") && !exportPath) throw new Error("Provide a file path after --identity-export.");

const opts = { algorithm: 2 as const, memoryCost: 65_536, timeCost: 3, parallelism: 4, outputLen: 32 };

async function loadIdentityExport(file: string | undefined): Promise<IdentityExportUser[]> {
  if (!file) return [];
  const parsed = JSON.parse(await readFile(file, "utf8")) as IdentityExportUser[] | { data?: IdentityExportUser[]; users?: IdentityExportUser[] };
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.users)) return parsed.users;
  throw new Error("The identity export must be a JSON array or contain a `data` or `users` array.");
}

function duplicateEmails(users: LegacyUser[]) {
  const counts = new Map<string, number>();
  for (const user of users) {
    const email = normalizeAuthEmail(user.email);
    if (email) counts.set(email, (counts.get(email) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).length;
}

function duplicateIds(users: LegacyUser[]) {
  const counts = new Map<string, number>();
  for (const user of users) {
    if (typeof user.id === "string" && user.id) counts.set(user.id, (counts.get(user.id) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).length;
}

async function main() {
  const database = await connectToDatabase();
  const users = await database.collection<LegacyUser>("user").find({}).toArray();
  const exportUsers = await loadIdentityExport(exportPath);
  const identities = indexIdentityExport(exportUsers);

  const invalid = users.filter((user) => typeof user.id !== "string" || !normalizeAuthEmail(user.email));
  const duplicateLegacyEmails = duplicateEmails(users);
  const duplicateLegacyIds = duplicateIds(users);
  const authUsers = database.collection<Record<string, unknown> & { _id: string }>("auth_user");
  const authAccounts = database.collection<Record<string, unknown> & { _id: string }>("auth_account");
  let authEmailConflicts = 0;
  const duplicateStoredAuthEmails = await authUsers.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$email", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  const unmatchedExport = new Set(exportUsers.map((identity) => identity.id).filter((id): id is string => typeof id === "string"));
  const plans: Array<{ legacy: LegacyUser; identity?: IdentityExportUser; existing?: Record<string, unknown>; credential?: Record<string, unknown>; email: string; name: string; image: string | null; providerId: string | null; emailVerified: boolean }> = [];

  for (const legacy of users) {
    if (typeof legacy.id !== "string") continue;
    const email = normalizeAuthEmail(legacy.email);
    if (!email) continue;
    const identity = matchExportIdentity(legacy, identities);
    if (identity?.id) unmatchedExport.delete(identity.id);
    const existing = await authUsers.findOne({ _id: legacy.id }) as Record<string, unknown> | null;
    const emailOwner = await authUsers.findOne({ email, _id: { $ne: legacy.id } }, { projection: { _id: 1 } });
    if (emailOwner) authEmailConflicts += 1;
    const credentials = await authAccounts.find({ userId: legacy.id, providerId: "credential" }).toArray();
    const primary = identity ? getExportIdentityEmail(identity) : null;
    const nameFromExport = identity ? [identity.firstName, identity.lastName].filter(Boolean).join(" ") : "";
    plans.push({
      legacy,
      identity,
      existing: existing ?? undefined,
      credential: credentials[0] as Record<string, unknown> | undefined,
      email,
      name: (typeof legacy.name === "string" && legacy.name.trim()) || nameFromExport || email.split("@")[0],
      image: legacy.image || legacy.imageUrl || legacy.avatar || identity?.imageUrl || identity?.profileImageUrl || null,
      providerId: identity?.id || legacy.legacyProviderId || legacy.clerkId || null,
      emailVerified: existing?.emailVerified === true || primary?.verified === true,
    });
  }

  let duplicateCredentialAccounts = 0;
  for (const plan of plans) {
    if (!plan.legacy.id) continue;
    const count = await authAccounts.countDocuments({ userId: plan.legacy.id, providerId: "credential" });
    if (count > 1) duplicateCredentialAccounts += 1;
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    businessAccounts: users.length,
    accountsReadyForMigration: plans.length,
    recordsMissingIdOrEmail: invalid.length,
    duplicateBusinessEmailGroups: duplicateLegacyEmails,
    duplicateBusinessIdGroups: duplicateLegacyIds,
    duplicateStoredAuthEmailGroups: duplicateStoredAuthEmails.length,
    emailConflictsWithExistingAuthUsers: authEmailConflicts,
    duplicateCredentialAccounts,
    exportedIdentities: exportUsers.length,
    matchedExportIdentities: exportUsers.length - unmatchedExport.size,
    unmatchedExportIdentities: unmatchedExport.size,
    verifiedEmailsInExport: plans.filter((plan) => plan.emailVerified).length,
    passwordsToResetWithoutHashReuse: plans.filter((plan) => !(plan.existing?.legacyAuthMigrationVersion === 1 && typeof plan.credential?.password === "string" && plan.credential.password.length > 0)).length,
  }, null, 2));

  if (!apply) {
    console.log("Read-only dry run. Review database backup, duplicate report, and optional identity export before applying.");
    return;
  }
  if (invalid.length || duplicateLegacyEmails || duplicateLegacyIds || authEmailConflicts || duplicateStoredAuthEmails.length || duplicateCredentialAccounts) {
    throw new Error("Migration stopped because the audit found missing identity data or duplicate accounts. Resolve the reported conflicts before applying.");
  }

  await database.collection("auth_audit_events").createIndex({ userId: 1, occurredAt: -1 }, { name: "auth_audit_user_occurred_idx" });

  let migrated = 0;
  let skippedCredentials = 0;
  for (const plan of plans) {
    const id = plan.legacy.id!;
    const now = new Date();
    const credentialAlreadyMigrated = plan.existing?.legacyAuthMigrationVersion === 1
      && typeof plan.credential?.password === "string"
      && plan.credential.password.length > 0;
    const identityDocument = {
      name: plan.name,
      email: plan.email,
      emailVerified: plan.emailVerified,
      image: plan.image,
      createdAt: plan.existing?.createdAt ?? (plan.legacy.createdAt ? new Date(plan.legacy.createdAt) : now),
      updatedAt: now,
      appRole: plan.legacy.role || plan.existing?.appRole || "member",
      ...(plan.providerId ? { legacyProviderId: plan.providerId } : {}),
    };
    await authUsers.updateOne({ _id: id }, { $set: identityDocument }, { upsert: true });

    if (!credentialAlreadyMigrated) {
      const unusablePassword = await hash(randomBytes(64).toString("base64url"), opts);
      await authAccounts.deleteMany({ userId: id, providerId: "credential" });
      await authAccounts.insertOne({
        _id: randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: unusablePassword,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      skippedCredentials += 1;
    }
    await authUsers.updateOne(
      { _id: id },
      { $set: { legacyAuthMigrationVersion: 1, legacyAuthMigratedAt: plan.existing?.legacyAuthMigratedAt ?? now } },
    );
    migrated += 1;
  }
  const sessionIdsForRevocation = plans
    .filter((plan) => !plan.existing?.legacyAuthSessionsRevokedAt)
    .map((plan) => plan.legacy.id)
    .filter((id): id is string => typeof id === "string");
  const revokedSessions = sessionIdsForRevocation.length
    ? (await database.collection("auth_session").deleteMany({ userId: { $in: sessionIdsForRevocation } })).deletedCount
    : 0;
  if (sessionIdsForRevocation.length) {
    await authUsers.updateMany(
      { _id: { $in: sessionIdsForRevocation } },
      { $set: { legacyAuthSessionsRevokedAt: new Date() } },
    );
  }
  console.log(JSON.stringify({ migrated, existingCredentialRecordsLeftIntact: skippedCredentials, revokedSessions, authRecordsCreated: true, businessCollectionsChanged: false }, null, 2));
}

void main().catch((error) => {
  console.error("Legacy auth migration failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
