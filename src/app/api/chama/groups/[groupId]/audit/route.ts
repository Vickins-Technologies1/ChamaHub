import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectMongoose } from "@/lib/mongoose";
import ChamaFinancialAuditModel from "@/lib/models/chama-financial-audit";
import { getGroupMember, getSessionUser, hasGroupRole, isSiteAdmin } from "@/lib/chama-access";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group id." }, { status: 400 });
    await connectMongoose();
    const member = await getGroupMember(groupId, user);
    if (!isSiteAdmin(user) && !hasGroupRole(member, ["admin", "treasurer"])) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const cursorText = searchParams.get("before");
    if (cursorText && !Types.ObjectId.isValid(cursorText)) return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
    const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit")) || 50));
    const query: Record<string, unknown> = { groupId: new Types.ObjectId(groupId) };
    if (cursorText) query._id = { $lt: new Types.ObjectId(cursorText) };
    const events = await ChamaFinancialAuditModel.find(query).sort({ occurredAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = events.length > limit;
    const page = events.slice(0, limit);
    return NextResponse.json({ events: page, nextCursor: hasMore ? String(page.at(-1)?._id) : null });
  } catch {
    return NextResponse.json({ error: "Unable to load financial audit history." }, { status: 500 });
  }
}
