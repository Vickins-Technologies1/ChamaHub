import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import connectToDatabase from "@/lib/mongodb";
import { getSessionUser } from "@/lib/chama-access";
import { checkSameOrigin, parsePageParams } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
  const { page, pageSize, skip } = parsePageParams(new URL(request.url).searchParams, 20);
  const db = await connectToDatabase();
  const [total, unread, rows] = await Promise.all([
    db.collection("user_notifications").countDocuments({ userId: user.id }),
    db.collection("user_notifications").countDocuments({ userId: user.id, readAt: null }),
    db.collection("user_notifications").find({ userId: user.id }, { projection: { notificationId: 1, title: 1, message: 1, type: 1, createdAt: 1, readAt: 1, inAppStatus: 1, emailStatus: 1 } }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
  ]);
  return NextResponse.json({ items: rows.map((item) => ({ id: String(item._id), ...item, _id: undefined })), total, unread, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { id?: unknown; action?: unknown };
  if (typeof body.id !== "string" || !ObjectId.isValid(body.id) || body.action !== "read") return NextResponse.json({ error: "Provide a notification ID and the read action." }, { status: 400 });
  const db = await connectToDatabase();
  const result = await db.collection("user_notifications").updateOne(
    { _id: new ObjectId(body.id), userId: user.id, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return NextResponse.json({ ok: true, updated: result.modifiedCount === 1 });
}
