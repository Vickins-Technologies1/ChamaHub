import { NextResponse } from "next/server";
import { Types } from "mongoose";
import connectToDatabase from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import ChamaGroupModel from "@/lib/models/chama-group";
import { checkSameOrigin, enforceAdminRateLimit, parsePageParams, requireAdminPermission, writeAdminAudit } from "@/lib/admin/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ groupId: string }> }) {
  const access = await requireAdminPermission("groups.read");
  if (access.response) return access.response;
  const { groupId } = await context.params;
  if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group ID." }, { status: 400 });
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") ?? "overview";
  const db = await connectToDatabase();
  const id = new Types.ObjectId(groupId);
  const group = await db.collection("chamagroups").findOne({ _id: id });
  if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

  if (tab === "overview") {
    const [memberCounts, financial, rounds, recentTransactions, owner] = await Promise.all([
      db.collection("chamamembers").aggregate([
        { $match: { groupId: id, status: { $ne: "rejected" } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]).toArray(),
      db.collection("chamafinancialtransactions").aggregate([
        { $match: { groupId: id } },
        { $group: { _id: { type: "$type", status: "$status", currency: "$currency" }, count: { $sum: 1 }, amountMinor: { $sum: { $ifNull: ["$amountMinor", 0] } } } },
      ]).toArray(),
      db.collection("chamarounds").find({ groupId: id }, { projection: { roundNumber: 1, status: 1, dueDate: 1, potAmount: 1, totalContributions: 1, recipientMemberId: 1, completedAt: 1, receivedAt: 1, currencySnapshot: 1 } }).sort({ roundNumber: -1 }).limit(12).toArray(),
      db.collection("chamafinancialtransactions").find({ groupId: id }, { projection: { type: 1, status: 1, amountMinor: 1, legacyAmountMajor: 1, currency: 1, reference: 1, transactionDate: 1 } }).sort({ transactionDate: -1 }).limit(8).toArray(),
      db.collection("user").findOne({ id: group.createdBy }, { projection: { _id: 0, id: 1, name: 1, email: 1 } }),
    ]);
    return NextResponse.json({
      group: {
        id: groupId, name: group.name, description: group.description ?? "", status: group.status,
        createdAt: group.createdAt, owner: owner ? { id: owner.id, name: owner.name ?? "", email: owner.email ?? "" } : { id: group.createdBy ?? "", name: "Unknown account", email: "" },
        settings: { contributionAmount: group.contributionAmount, currency: group.currency, frequency: group.frequency, expectedMemberCount: group.expectedMemberCount ?? group.numberOfMembers, startDate: group.startDate, rotationType: group.rotationType, currentRound: group.currentRound },
      },
      summary: { memberCounts, financial: financial.map((row) => ({ type: row._id.type, status: row._id.status, currency: row._id.currency, count: row.count, amountMinor: row.amountMinor })), rounds, recentTransactions },
      financialDisclosure: "Ledger totals summarize recorded transactions. They are not an available cash balance and do not imply ownership of group funds.",
    });
  }

  const { page, pageSize, skip } = parsePageParams(params, 25);
  if (tab === "members") {
    const collection = db.collection("chamamembers");
    const filter = { groupId: id, status: { $ne: "rejected" } };
    const [total, rows] = await Promise.all([
      collection.countDocuments(filter),
      collection.find(filter, { projection: { userId: 1, name: 1, email: 1, phone: 1, role: 1, status: 1, invitedBy: 1, joinedAt: 1 } }).sort({ joinedAt: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
    ]);
    return NextResponse.json({ items: rows.map((row) => ({ id: String(row._id), ...row, _id: undefined })), total, page, pageSize });
  }
  if (["contributions", "payouts", "financial-records"].includes(tab)) {
    const filter: Record<string, unknown> = { groupId: id };
    if (tab === "contributions") filter.type = "contribution";
    if (tab === "payouts") filter.type = "payout";
    const collection = db.collection("chamafinancialtransactions");
    const [total, rows] = await Promise.all([
      collection.countDocuments(filter),
      collection.find(filter, { projection: { type: 1, direction: 1, amountMinor: 1, legacyAmountMajor: 1, currency: 1, memberId: 1, roundId: 1, recordedBy: 1, reference: 1, method: 1, transactionDate: 1, status: 1, verifiedBy: 1, confirmedBy: 1, reversalOf: 1, legacy: 1, description: 1 } }).sort({ transactionDate: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
    ]);
    return NextResponse.json({ items: rows.map((row) => ({ id: String(row._id), ...row, groupId, memberId: row.memberId ? String(row.memberId) : null, roundId: row.roundId ? String(row.roundId) : null, reversalOf: row.reversalOf ? String(row.reversalOf) : null, _id: undefined })), total, page, pageSize });
  }
  if (tab === "meetings") {
    const calls = db.collection("chamacalls");
    const [total, rows] = await Promise.all([
      calls.countDocuments({ groupId: id }),
      calls.find({ groupId: id }, { projection: { title: 1, scheduledFor: 1, accessType: 1, attendanceCapturedAt: 1, attendanceParticipantCount: 1, createdBy: 1, createdAt: 1 } }).sort({ scheduledFor: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
    ]);
    const attendances = await db.collection("chamacallattendances").aggregate([
      { $match: { callId: { $in: rows.map((row) => row._id) } } },
      { $project: { callId: 1, capturedAt: 1, participantCount: 1 } },
    ]).toArray();
    const attendanceMap = new Map(attendances.map((attendance) => [String(attendance.callId), attendance]));
    return NextResponse.json({ items: rows.map((row) => ({ id: String(row._id), title: row.title, scheduledFor: row.scheduledFor ?? null, attendanceCapturedAt: row.attendanceCapturedAt ?? null, participantCount: attendanceMap.get(String(row._id))?.participantCount ?? row.attendanceParticipantCount ?? null, createdBy: row.createdBy ?? "", createdAt: row.createdAt ?? null })), total, page, pageSize });
  }
  if (tab === "activity") {
    const audit = db.collection("chamafinancialaudits");
    const [total, rows] = await Promise.all([
      audit.countDocuments({ groupId: id }),
      audit.find({ groupId: id }).sort({ occurredAt: -1, _id: -1 }).skip(skip).limit(pageSize).toArray(),
    ]);
    return NextResponse.json({ items: rows.map((row) => ({ id: String(row._id), action: row.action, entityType: row.entityType, entityId: row.entityId, actorId: row.actorId, reason: row.reason ?? "", occurredAt: row.occurredAt, previousValues: row.previousValues ?? null, newValues: row.newValues ?? null })), total, page, pageSize });
  }
  if (tab === "settings") {
    return NextResponse.json({ settings: { name: group.name, description: group.description ?? "", status: group.status, contributionAmount: group.contributionAmount, currency: group.currency, frequency: group.frequency, expectedMemberCount: group.expectedMemberCount ?? group.numberOfMembers, startDate: group.startDate, rotationType: group.rotationType, currentRound: group.currentRound, createdBy: group.createdBy, createdAt: group.createdAt } });
  }
  return NextResponse.json({ error: "Unsupported group profile tab." }, { status: 400 });
}

export async function PATCH(request: Request, context: { params: Promise<{ groupId: string }> }) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;
  const access = await requireAdminPermission("groups.write");
  if (access.response) return access.response;
  const limited = await enforceAdminRateLimit({ userId: access.session.user.id, request, action: "group-status", limit: 10 });
  if (limited) return limited;
  const { groupId } = await context.params;
  if (!Types.ObjectId.isValid(groupId)) return NextResponse.json({ error: "Invalid group ID." }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action !== "archive" && body.action !== "activate") return NextResponse.json({ error: "Unsupported group action." }, { status: 400 });

  await connectMongoose();
  const group = await ChamaGroupModel.findById(groupId);
  if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });
  const before = { status: group.status, archivedAt: group.archivedAt ?? null, archivedBy: group.archivedBy ?? null };
  const nextStatus = body.action === "archive" ? "archived" : "active";
  if (group.status === nextStatus) return NextResponse.json({ ok: true, status: nextStatus, unchanged: true });
  group.status = nextStatus;
  group.archivedAt = body.action === "archive" ? new Date() : null;
  group.archivedBy = body.action === "archive" ? access.session.user.id : null;
  await group.save();
  await writeAdminAudit({
    actor: access.session,
    action: `group.${body.action}d`,
    entityType: "group",
    entityId: groupId,
    request,
    before,
    after: { status: group.status, archivedAt: group.archivedAt, archivedBy: group.archivedBy },
  });
  return NextResponse.json({ ok: true, status: group.status });
}
