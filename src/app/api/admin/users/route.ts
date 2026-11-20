import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { parsePageParams, requireAdminPermission } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: Request) {
  const access = await requireAdminPermission("users.read");
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  const { page, pageSize, skip } = parsePageParams(params);
  const filter: Record<string, unknown> = {};
  const clauses: Record<string, unknown>[] = [];
  const search = params.get("search")?.trim().slice(0, 120);
  if (search) {
    const expression = new RegExp(escapeRegex(search), "i");
    clauses.push({ $or: [{ name: expression }, { email: expression }, { phone: expression }, { id: expression }] });
  }
  const role = params.get("role");
  if (role && ["member", "moderator", "admin", "user"].includes(role)) filter.role = role;
  const status = params.get("status");
  if (status === "suspended") clauses.push({ $or: [{ status: "suspended" }, { banned: true }] });
  else if (status === "registered") clauses.push({ $and: [{ status: { $nin: ["suspended", "deleted"] } }, { banned: { $ne: true } }] });

  const createdFrom = params.get("createdFrom");
  const createdTo = params.get("createdTo");
  if (createdFrom || createdTo) {
    const createdAt: Record<string, Date> = {};
    if (createdFrom && !Number.isNaN(new Date(createdFrom).getTime())) createdAt.$gte = new Date(createdFrom);
    if (createdTo && !Number.isNaN(new Date(createdTo).getTime())) createdAt.$lt = new Date(createdTo);
    if (Object.keys(createdAt).length) clauses.push({ createdAt });
  }
  if (clauses.length) filter.$and = clauses;

  const users = (await connectToDatabase()).collection("user");
  const [total, rows] = await Promise.all([
    users.countDocuments(filter),
    users.find(filter, { projection: { _id: 0, id: 1, name: 1, email: 1, phone: 1, role: 1, status: 1, banned: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ createdAt: -1, id: 1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  const items = rows.map((user) => ({
    id: String(user.id ?? ""),
    name: typeof user.name === "string" ? user.name : "",
    email: typeof user.email === "string" ? user.email : "",
    phone: typeof user.phone === "string" ? user.phone : "",
    role: typeof user.role === "string" ? user.role : "member",
    status: user.banned === true || user.status === "suspended" ? "suspended" : "registered",
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  }));
  return NextResponse.json({ items, total, page, pageSize });
}
