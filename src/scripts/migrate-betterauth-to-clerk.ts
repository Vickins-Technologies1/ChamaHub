import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
dotenv.config({ path: ".env.local" });

type LegacyUser = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  emailVerified?: boolean;
  createdAt?: Date;
};

const normalizeRole = (value: unknown) => {
  const roles = typeof value === "string" ? value.split(",").map((role) => role.trim()).filter(Boolean) : [];
  if (roles.includes("admin")) return "admin";
  if (roles.includes("moderator")) return "moderator";
  return "member";
};

async function main() {
  const [{ clerkClient }, { default: connectToDatabase }] = await Promise.all([
    import("@clerk/nextjs/server"),
    import("@/lib/mongodb"),
  ]);
  if (!process.env.CLERK_SECRET_KEY) throw new Error("Set CLERK_SECRET_KEY before running this migration.");
  const db = await connectToDatabase();
  const legacyUsers = await db.collection<LegacyUser>("user").find({ email: { $type: "string" } }).toArray();
  const clerk = await clerkClient();
  let imported = 0;
  let skipped = 0;

  for (const legacy of legacyUsers) {
    const email = legacy.email?.trim().toLowerCase();
    if (!legacy.id || !email) {
      skipped += 1;
      continue;
    }

    const byExternalId = await clerk.users.getUserList({ externalId: [legacy.id], limit: 1 });
    const byEmail = byExternalId.data[0]
      ? null
      : await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
    const existing = byExternalId.data[0] ?? byEmail?.data[0] ?? null;
    const randomPassword = randomBytes(48).toString("base64url");
    const alreadyMigrated = existing?.externalId === legacy.id;
    const firstName = legacy.name?.trim().split(/\s+/)[0] || undefined;
    const lastName = legacy.name?.trim().split(/\s+/).slice(1).join(" ") || undefined;
    const publicMetadata = { ...(existing?.publicMetadata ?? {}), role: normalizeRole(legacy.role) };
    const privateMetadata = { ...(existing?.privateMetadata ?? {}), authMigrationResetRequired: true };

    const clerkUser = existing
      ? await clerk.users.updateUser(existing.id, {
        externalId: legacy.id,
        firstName: firstName ?? existing.firstName,
        lastName: lastName ?? existing.lastName,
        ...(alreadyMigrated ? {} : { password: randomPassword }),
        publicMetadata,
        privateMetadata,
      })
      : await clerk.users.createUser({
        externalId: legacy.id,
        emailAddress: [email],
        emailAddressIdentificationStatus: [legacy.emailVerified ? "verified" : "reserved"],
        firstName,
        lastName,
        password: randomPassword,
        publicMetadata,
        privateMetadata,
        createdAt: legacy.createdAt,
      });
    await db.collection("user").updateOne({ id: legacy.id }, { $set: { clerkId: clerkUser.id } });
    imported += 1;
    if (imported % 25 === 0) console.log(`Imported ${imported} accounts…`);
  }

  console.log(`Clerk account migration complete: ${imported} imported or updated, ${skipped} skipped.`);
  console.log("Existing users have random unknown passwords. They must use Forgot password on the Clerk sign-in page to choose a new one.");
  process.exitCode = 0;
}

main().catch((error) => {
  console.error("Clerk account migration failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
