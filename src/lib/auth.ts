import { clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/mongodb";

export { clerkClient };

/**
 * ChamaPulse uses Clerk as its identity provider. Keep this small adapter in
 * one place so server routes don't depend on Clerk's SDK shape directly.
 */
export const getClerkUserByAppId = async (appUserId: string) => {
  const client = await clerkClient();
  const result = await client.users.getUserList({ externalId: [appUserId], limit: 1 });
  return result.data[0] ?? null;
};

export const getAppUserId = (user: { id: string; externalId?: string | null }) =>
  user.externalId || user.id;

export const syncAppUser = async (user: {
  id: string;
  externalId?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  firstName?: string | null;
  lastName?: string | null;
  publicMetadata: Record<string, unknown>;
}, role?: string) => {
  const db = await connectToDatabase();
  const id = getAppUserId(user);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  const update: Record<string, unknown> = {
    clerkId: user.id,
    email: user.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null,
    name,
    updatedAt: new Date(),
  };
  if (role) update.role = role;
  else if (typeof user.publicMetadata.role === "string") update.role = user.publicMetadata.role;
  await db.collection("user").updateOne(
    { id },
    { $set: update, $setOnInsert: { id, createdAt: new Date() } },
    { upsert: true },
  );
  return { id, email: update.email as string | null, name, role: update.role as string | undefined };
};

export const updateAppUserRole = async (appUserId: string, role: string) => {
  const db = await connectToDatabase();
  const result = await db.collection("user").updateOne({ id: appUserId }, { $set: { role, updatedAt: new Date() } });
  return result.matchedCount > 0;
};
