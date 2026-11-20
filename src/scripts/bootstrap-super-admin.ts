import "dotenv/config";
import { clerkClient } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/mongodb";

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
if (!email) throw new Error("Set SUPER_ADMIN_EMAIL to the verified email of an existing ChamaPulse account.");

const database = await connectToDatabase();
const clerk = await clerkClient();
const clerkResult = await clerk.users.getUserList({ emailAddress: [email], limit: 2 });
const matchingClerkUsers = clerkResult.data.filter((user) =>
  user.emailAddresses.some((address) => address.emailAddress.toLowerCase() === email && address.verification?.status === "verified"),
);
if (matchingClerkUsers.length !== 1) {
  throw new Error("The email must match exactly one existing Clerk account with a verified email address.");
}

const identity = matchingClerkUsers[0];
const user = await database.collection("user").findOne({ clerkId: identity.id }, { projection: { id: 1, email: 1, name: 1 } });
if (!user || typeof user.id !== "string") {
  throw new Error("The Clerk account is not linked to an existing ChamaPulse user. Sign in to the app once, then retry.");
}
if (typeof user.email !== "string" || user.email.toLowerCase() !== email) {
  throw new Error("The ChamaPulse account email does not match the verified Clerk email.");
}

const access = database.collection("admin_access");
const activeOwners = await access.countDocuments({ role: "SUPER_ADMIN", status: "active" });
const existing = await access.findOne({ userId: user.id });
if (activeOwners > 0 && existing?.role !== "SUPER_ADMIN") {
  throw new Error("A Super Admin is already provisioned. Use the /admin staff controls to grant other administrative roles.");
}

const now = new Date();
await access.updateOne(
  { userId: user.id },
  {
    $set: {
      userId: user.id,
      clerkId: identity.id,
      email,
      name: typeof user.name === "string" ? user.name : null,
      role: "SUPER_ADMIN",
      permissions: [],
      status: "active",
      expiresAt: null,
      updatedAt: now,
      createdBy: "verified-email-bootstrap",
    },
    $setOnInsert: { createdAt: now },
  },
  { upsert: true },
);
await database.collection("admin_audit").insertOne({
  actorId: "system-bootstrap",
  actorRole: "SYSTEM",
  action: "super_admin.provisioned",
  entityType: "admin_access",
  entityId: user.id,
  occurredAt: now,
  ipAddress: null,
  before: existing ? { role: existing.role, status: existing.status } : null,
  after: { role: "SUPER_ADMIN", status: "active" },
  metadata: { email },
  impersonation: null,
});

console.log(`Provisioned the verified ChamaPulse account ${email} as SUPER_ADMIN.`);
