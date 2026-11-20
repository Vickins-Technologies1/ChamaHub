import connectToDatabase from "@/lib/mongodb";
import { getAuth, getAuthSession } from "@/lib/auth-server";

export { getAuth, getAuthSession };

export const getAppUserId = (user: { id: string }) => user.id;

export async function syncAppUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
  appRole?: string | null;
}, role?: string) {
  const db = await connectToDatabase();
  const id = user.id;
  const email = user.email?.trim().toLowerCase() ?? null;
  const name = user.name?.trim() || null;
  const update: Record<string, unknown> = {
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    updatedAt: new Date(),
  };
  if (role) update.role = role;
  else if (typeof user.appRole === "string") update.role = user.appRole;
  const setOnInsert: Record<string, unknown> = { id, createdAt: new Date() };
  if (typeof update.role !== "string") setOnInsert.role = "member";
  await db.collection("user").updateOne(
    { id },
    { $set: update, $setOnInsert: setOnInsert },
    { upsert: true },
  );
  if (role) {
    await db.collection<Record<string, unknown> & { _id: string }>("auth_user").updateOne({ _id: id }, { $set: { appRole: role, updatedAt: new Date() } });
  }
  const account = await db.collection("user").findOne({ id }, { projection: { _id: 0, id: 1, email: 1, name: 1, role: 1 } });
  return {
    id,
    email: typeof account?.email === "string" ? account.email : email,
    name: typeof account?.name === "string" ? account.name : name,
    role: typeof account?.role === "string" ? account.role : role ?? user.appRole ?? "member",
  };
}

export async function updateAppUserRole(appUserId: string, role: string) {
  const db = await connectToDatabase();
  const result = await db.collection("user").updateOne({ id: appUserId }, { $set: { role, updatedAt: new Date() } });
  if (result.matchedCount) {
    await db.collection<Record<string, unknown> & { _id: string }>("auth_user").updateOne({ _id: appUserId }, { $set: { appRole: role, updatedAt: new Date() } });
  }
  return result.matchedCount > 0;
}

export async function revokeUserSessions(appUserId: string) {
  const db = await connectToDatabase();
  const result = await db.collection("auth_session").deleteMany({ userId: appUserId });
  return result.deletedCount;
}
