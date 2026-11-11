import { headers } from "next/headers";
import { Types } from "mongoose";
import { getAuth } from "@/lib/auth";
import ChamaMemberModel from "@/lib/models/chama-member";
import { connectMongoose } from "@/lib/mongoose";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

export const getSessionUser = async () => {
  const auth = await getAuth();
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session && typeof session === "object" && "user" in session ? session.user : null;
  if (!user) return null;
  return user as SessionUser;
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
  member: { role?: string | null } | null,
  roles: Array<"admin" | "treasurer" | "secretary">
) => {
  if (!member?.role) return false;
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
