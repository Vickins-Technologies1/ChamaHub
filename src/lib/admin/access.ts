import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import type { Collection, Db, Document } from "mongodb";
import connectToDatabase from "@/lib/mongodb";
import { getSessionUser, type SessionUser } from "@/lib/chama-access";
import { canAccessPermission, type AdminPermission, type AdminRole } from "./policy";

export { ADMIN_PERMISSIONS, ADMIN_ROLES, canAccessPermission, parsePageParams } from "./policy";
export type { AdminPermission, AdminRole } from "./policy";

export type AdminGrant = {
  userId: string;
  clerkId: string;
  email: string | null;
  name: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
  status: "active" | "suspended" | "revoked";
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

export type AdminSession = { user: SessionUser; grant: AdminGrant };

let indexPromise: Promise<void> | null = null;
export async function ensureAdminIndexes(db?: Db) {
  if (!indexPromise) {
    indexPromise = (async () => {
      const database = db ?? (await connectToDatabase());
      await Promise.all([
        database.collection("admin_access").createIndex({ userId: 1 }, { unique: true }),
        database.collection("admin_access").createIndex({ status: 1, role: 1 }),
        database.collection("admin_access_invites").createIndex({ inviteId: 1 }, { unique: true }),
        database.collection("admin_access_invites").createIndex({ email: 1, status: 1 }),
        database.collection("admin_audit").createIndex({ occurredAt: -1, _id: -1 }),
        database.collection("admin_audit").createIndex({ actorId: 1, occurredAt: -1 }),
        database.collection("admin_audit").createIndex({ action: 1, occurredAt: -1 }),
        database.collection("admin_audit").createIndex({ entityType: 1, entityId: 1, occurredAt: -1 }),
        database.collection("admin_action_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        database.collection("admin_user_notes").createIndex({ targetUserId: 1, createdAt: -1 }),
        database.collection("user").createIndex({ createdAt: -1 }),
        database.collection("user").createIndex({ email: 1 }),
        database.collection("chamagroups").createIndex({ createdAt: -1, _id: -1 }),
        database.collection("chamagroups").createIndex({ status: 1, createdAt: -1 }),
        database.collection("chamamembers").createIndex({ groupId: 1, status: 1, joinedAt: -1 }),
        database.collection("chamamembers").createIndex({ userId: 1, groupId: 1 }),
        database.collection("chamamembers").createIndex({ email: 1 }),
        database.collection("chamarounds").createIndex({ status: 1, dueDate: 1 }),
        database.collection("chamafinancialtransactions").createIndex({ transactionDate: -1, _id: -1 }),
        database.collection("chamafinancialtransactions").createIndex({ type: 1, status: 1, transactionDate: -1 }),
        database.collection("chamafinancialtransactions").createIndex({ reference: 1 }),
      ]);
    })().catch((error) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
}

export async function getAdminGrantForUser(userId: string): Promise<AdminGrant | null> {
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  return db.collection<AdminGrant>("admin_access").findOne({
    userId,
    status: "active",
    $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const grant = await getAdminGrantForUser(user.id);
  return grant ? { user, grant } : null;
}

export async function requireAdminPermission(permission: AdminPermission) {
  const session = await getAdminSession();
  if (!session) {
    const user = await getSessionUser();
    return {
      session: null,
      response: NextResponse.json(
        { error: user ? "Administrative access is required." : "Unauthorized." },
        { status: user ? 403 : 401 },
      ),
    } as const;
  }
  if (!canAccessPermission(session.grant, permission)) {
    return { session: null, response: NextResponse.json({ error: "Permission denied." }, { status: 403 }) } as const;
  }
  return { session, response: null } as const;
}

export function isSuperAdmin(grant: AdminGrant) {
  return grant.role === "SUPER_ADMIN";
}

export function checkSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const expectedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? request.headers.get("host");
  try {
    if (!expectedHost || new URL(origin).host.toLowerCase() !== expectedHost.toLowerCase()) {
      return NextResponse.json({ error: "Cross-origin administrative requests are not allowed." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  return null;
}

export async function enforceAdminRateLimit(input: {
  userId: string;
  request: Request;
  action: string;
  limit?: number;
  windowMs?: number;
}) {
  const limit = input.limit ?? 20;
  const windowMs = input.windowMs ?? 60_000;
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const key = createHash("sha256").update(`${input.userId}:${input.action}:${bucket}`).digest("hex");
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const result = await db.collection<{ _id: string; count: number; expiresAt: Date }>("admin_action_limits").findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } },
    { upsert: true, returnDocument: "after" },
  );
  const count = result?.count ?? 0;
  return count > limit
    ? NextResponse.json({ error: "Too many administrative actions. Try again shortly." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(((bucket + 1) * windowMs - now) / 1000))) } })
    : null;
}

function safeAuditValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(safeAuditValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/(password|token|secret|credential|sessioncookie)/i.test(key))
      .slice(0, 100)
      .map(([key, entry]) => [key, safeAuditValue(entry)]));
  }
  return String(value);
}

export async function writeAdminAudit(input: {
  actor: AdminSession;
  action: string;
  entityType: string;
  entityId: string;
  request?: Request;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  const db = await connectToDatabase();
  await ensureAdminIndexes(db);
  const requestHeaders = input.request ? new Headers(input.request.headers) : await headers();
  const forwardedIp = requestHeaders.get("x-real-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await db.collection("admin_audit").insertOne({
    actorId: input.actor.user.id,
    actorRole: input.actor.grant.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    occurredAt: new Date(),
    ipAddress: forwardedIp,
    before: safeAuditValue(input.before) ?? null,
    after: safeAuditValue(input.after) ?? null,
    metadata: safeAuditValue(input.metadata) ?? null,
    impersonation: null,
  });
}

export function sanitizeAdminGrant(grant: Document) {
  return {
    userId: String(grant.userId),
    clerkId: String(grant.clerkId ?? ""),
    email: typeof grant.email === "string" ? grant.email : null,
    name: typeof grant.name === "string" ? grant.name : null,
    role: grant.role,
    permissions: Array.isArray(grant.permissions) ? grant.permissions : [],
    status: grant.status,
    expiresAt: grant.expiresAt ?? null,
    createdAt: grant.createdAt,
    updatedAt: grant.updatedAt,
  };
}

export type AdminCollection<T extends Document = Document> = Collection<T>;
