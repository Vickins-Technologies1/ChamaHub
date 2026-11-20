import { config as loadEnv } from "dotenv";
import connectToDatabase from "@/lib/mongodb";

loadEnv({ path: [".env.local", ".env"] });

const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
if (!email) throw new Error("Set SUPER_ADMIN_EMAIL to a verified ChamaPulse account email.");

const database = await connectToDatabase();
const identity = await database.collection("auth_user").findOne({ email, emailVerified: true }, { projection: { _id: 1, email: 1, name: 1 } });
if (!identity || identity._id == null) {
  throw new Error("The email must match exactly one verified Better Auth account. The owner must first claim the account and verify its email.");
}
const identityId = String(identity._id);
const user = await database.collection("user").findOne({ id: identityId }, { projection: { id: 1, email: 1, name: 1 } });
if (!user || typeof user.id !== "string") throw new Error("The verified identity is not linked to a ChamaPulse profile.");
if (user.email?.toLowerCase() !== email) throw new Error("The ChamaPulse profile email does not match the verified account email.");

const grants = database.collection("admin_access");
await grants.createIndex({ userId: 1 }, { unique: true });
const existing = await grants.findOne({ role: "SUPER_ADMIN", status: "active" });
if (existing) throw new Error("A Super Admin already exists. Use the in-app staff controls to grant later administrator roles.");

const now = new Date();
await grants.insertOne({
  userId: user.id,
  email,
  name: typeof user.name === "string" ? user.name : null,
  role: "SUPER_ADMIN",
  permissions: ["*"],
  status: "active",
  expiresAt: null,
  createdBy: "bootstrap",
  createdAt: now,
  updatedAt: now,
});
console.log(`Super Admin access provisioned for ${email}.`);
