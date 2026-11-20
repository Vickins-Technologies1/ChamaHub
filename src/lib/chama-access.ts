import { Types } from "mongoose";
import { getAuthSession } from "@/lib/auth-server";
import connectToDatabase from "@/lib/mongodb";
import ChamaMemberModel from "@/lib/models/chama-member";
import { connectMongoose } from "@/lib/mongoose";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

export const getSessionUser = async () => {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  const db = await connectToDatabase();
  const user = await db.collection("user").findOne({ id: session.user.id });
  if (!user || user.banned === true || user.status === "suspended") return null;
  const role = user.role;
  return {
    id: String(user.id),
    email: typeof user.email === "string" ? user.email : null,
    name: typeof user.name === "string" ? user.name : null,
    role: typeof role === "string" ? role : "member",
  } satisfies SessionUser;
};

export const isSiteAdmin = (user: SessionUser | null) => {
  if (!user?.role) return false;
  return user.role
    .split(",")
    .map((value) => value.trim())
    .includes("admin");
};

export const isModerator = (user: SessionUser | null) => {
  if (!user?.role) return false;
  return user.role
    .split(",")
    .map((value) => value.trim())
    .includes("moderator");
};

export const isMemberUser = (user: SessionUser | null) => {
  if (!user?.role) return false;
  return user.role
    .split(",")
    .map((value) => value.trim())
    .some((role) => role === "member" || role === "user");
};

export const getGroupMember = async (groupId: string, user: SessionUser) => {
  if (!Types.ObjectId.isValid(groupId)) return null;
  const orConditions: Record<string, unknown>[] = [{ userId: user.id }];
  if (user.email) {
    orConditions.push({ email: user.email.toLowerCase() });
  }
  const query = {
    groupId: new Types.ObjectId(groupId),
    status: "active",
    $or: orConditions,
  };
  return (await ChamaMemberModel.findOne(query).lean()) as
    | {
        _id?: unknown;
        userId?: string;
        email?: string | null;
        role?: string | null;
        status?: string | null;
      }
    | null;
};

export const hasGroupRole = (
  member: { role?: string | null; status?: string | null } | null,
  roles: Array<"admin" | "treasurer" | "secretary">
) => {
  if (!member?.role || member.status !== "active") return false;
  return roles.includes(member.role as "admin" | "treasurer" | "secretary");
};

export const linkMemberToUser = async (user: SessionUser | null) => {
  if (!user?.id || !user.email) return;
  try {
    await connectMongoose();
    const normalizedEmail = user.email.toLowerCase();
    await ChamaMemberModel.updateMany(
      {
        email: normalizedEmail,
        $or: [{ userId: { $exists: false } }, { userId: null }, { userId: "" }],
      },
      { $set: { userId: user.id } }
    );
  } catch {
    // Ignore linking failures to avoid breaking requests.
  }
};
