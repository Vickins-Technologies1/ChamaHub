import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { twoFactor } from "better-auth/plugins";
import { headers as nextHeaders } from "next/headers";
import connectToDatabase, { getMongoClient } from "@/lib/mongodb";
import { escapeHtml, sendTransactionalEmail } from "@/lib/email";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createHash, randomUUID } from "node:crypto";

const production = process.env.NODE_ENV === "production";

function getSiteUrl() {
  return process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

async function recordAuthEvent(event: Record<string, unknown>) {
  try {
    const db = await connectToDatabase();
    await db.collection("auth_audit_events").insertOne({ ...event, occurredAt: new Date() });
  } catch (error) {
    console.error("Unable to persist authentication audit event", error);
  }
}

async function createAuth() {
  const siteUrl = getSiteUrl();
  const trustedOrigins = [...new Set([siteUrl, process.env.NEXT_PUBLIC_SITE_URL].filter((origin): origin is string => Boolean(origin)))];
  if (production && !siteUrl.startsWith("https://")) {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  }
  if (production && (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)) {
    throw new Error("Set BETTER_AUTH_SECRET to a randomly generated value of at least 32 characters.");
  }
  if (production && (!process.env.EMAIL_USER || !process.env.EMAIL_PASS)) {
    throw new Error("EMAIL_USER and EMAIL_PASS must be configured for production account recovery and verification.");
  }
  const [db, client] = await Promise.all([connectToDatabase(), getMongoClient()]);
  const hello = await db.admin().command({ hello: 1 });
  const supportsTransactions = Boolean(hello.setName || hello.msg === "isdbgrid");
  return betterAuth({
    appName: "ChamaPulse",
    baseURL: siteUrl,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: supportsTransactions ? mongodbAdapter(db, { client }) : mongodbAdapter(db),
    user: {
      modelName: "auth_user",
      additionalFields: {
        appRole: { type: "string", required: false, defaultValue: "member", input: false },
        legacyProviderId: { type: "string", required: false, input: false },
        legacyAuthMigrationVersion: { type: "number", required: false, input: false },
        legacyAuthMigratedAt: { type: "date", required: false, input: false },
        legacyAuthSessionsRevokedAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      modelName: "auth_session",
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 10 * 60,
    },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => {
        await recordAuthEvent({ type: "password.reset.requested", userId: user.id });
        const safeUrl = escapeHtml(url);
        await sendTransactionalEmail({
          to: user.email,
          subject: "Reset your ChamaPulse password",
          text: `Use this single-use link to reset your password. It expires in one hour: ${url}`,
          html: `<p>We received a request to reset your ChamaPulse password.</p><p><a href="${safeUrl}">Reset your password</a></p><p>This single-use link expires in one hour. If you did not request it, you can ignore this email.</p>`,
        });
      },
      onPasswordReset: async ({ user }) => {
        await recordAuthEvent({ type: "password.reset", userId: user.id });
        try {
          await sendTransactionalEmail({
            to: user.email,
            subject: "Your ChamaPulse password was changed",
            text: "Your password was changed. All existing sessions were revoked. Contact support if you did not make this change.",
          });
        } catch (error) {
          console.error("Unable to send password-change alert", error);
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await recordAuthEvent({ type: "email.verification.sent", userId: user.id });
        const safeUrl = escapeHtml(url);
        await sendTransactionalEmail({
          to: user.email,
          subject: "Verify your ChamaPulse email",
          text: `Verify your email within one hour: ${url}`,
          html: `<p>Verify your email address to finish setting up your ChamaPulse account.</p><p><a href="${safeUrl}">Verify email address</a></p><p>This link expires in one hour. If you did not create an account, you can ignore this email.</p>`,
        });
      },
      afterEmailVerification: async (user) => {
        await recordAuthEvent({ type: "email.verified", userId: user.id });
        try {
          const database = await connectToDatabase();
          await database.collection("chamamembers").updateMany(
            { userId: user.id, accountSetupStatus: "activation_pending_verification" },
            { $set: { accountSetupStatus: "account_activated", updatedAt: new Date() } },
          );
        } catch (error) {
          console.error("Unable to update member invitation activation status", error);
        }
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/two-factor/*": { window: 60, max: 5 },
      },
    },
    advanced: {
      database: { generateId: () => randomUUID() },
      useSecureCookies: production,
      cookiePrefix: "chamahub",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
      },
    },
    plugins: [twoFactor({ issuer: "ChamaPulse", twoFactorTable: "auth_two_factor" })],
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email") {
          const body = ctx.body as { email?: unknown };
          const identifier = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
          await recordAuthEvent({
            type: "login.attempt",
            outcome: ctx.context.newSession ? "authenticated" : "challenge-or-rejected",
            userId: ctx.context.newSession?.user.id ?? null,
            identifierHash: identifier ? createHash("sha256").update(identifier).digest("hex") : null,
            ipAddress: ctx.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          });
          return;
        }
        const twoFactorEvents: Record<string, string> = {
          "/two-factor/enable": "two_factor.enable.started",
          "/two-factor/disable": "two_factor.disabled",
          "/two-factor/verify-totp": "two_factor.totp.verified",
          "/two-factor/verify-otp": "two_factor.otp.verified",
          "/two-factor/verify-backup-code": "two_factor.backup_code.verified",
          "/two-factor/generate-backup-codes": "two_factor.backup_codes.generated",
        };
        const eventType = twoFactorEvents[ctx.path];
        if (!eventType) return;
        const userId = ctx.context.session?.user.id ?? ctx.context.newSession?.user.id ?? null;
        await recordAuthEvent({ type: eventType, userId });
        if (userId && ["two_factor.enable.started", "two_factor.disabled"].includes(eventType)) {
          try {
            const database = await connectToDatabase();
            const identity = await database.collection<Record<string, unknown> & { _id: string }>("auth_user").findOne({ _id: userId }, { projection: { email: 1 } });
            if (typeof identity?.email === "string") {
              await sendTransactionalEmail({
                to: identity.email,
                subject: eventType === "two_factor.disabled" ? "Two-step verification disabled" : "Two-step verification setup started",
                text: `Two-step verification was ${eventType === "two_factor.disabled" ? "disabled" : "set up"} for your ChamaPulse account. Contact support if you did not make this change.`,
              });
            }
          } catch (error) {
            console.error("Unable to send two-factor change alert", error);
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const database = await connectToDatabase();
            const emailPattern = user.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const existingProfile = await database.collection("user").findOne(
              { id: { $ne: user.id }, email: { $regex: `^${emailPattern}$`, $options: "i" } },
              { projection: { id: 1 } },
            );
            if (existingProfile) {
              throw new APIError("CONFLICT", { message: "An account may already exist for this email. Sign in or reset the password instead." });
            }
            return { data: user };
          },
          after: async (user) => {
            const database = await connectToDatabase();
            await database.collection("user").updateOne(
              { id: user.id },
              {
                $setOnInsert: {
                  id: user.id,
                  email: user.email.toLowerCase(),
                  name: user.name || null,
                  role: user.appRole || "member",
                  createdAt: user.createdAt,
                },
                $set: { updatedAt: new Date() },
              },
              { upsert: true },
            );
            await recordAuthEvent({ type: "account.created", userId: user.id });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const database = await connectToDatabase();
            const profile = await database.collection("user").findOne({ id: session.userId }, { projection: { banned: 1, status: 1 } });
            if (!profile || profile.banned === true || profile.status === "suspended") {
              await recordAuthEvent({ type: "session.creation_blocked", userId: session.userId });
              throw new APIError("FORBIDDEN", { message: "This account is not available. Contact ChamaPulse support." });
            }
          },
          after: async (session) => {
            await recordAuthEvent({
              type: "session.created",
              userId: session.userId,
              sessionId: session.id,
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
            try {
              const database = await connectToDatabase();
              const user = await database.collection<Record<string, unknown> & { _id: string }>("auth_user").findOne({ _id: session.userId }, { projection: { email: 1 } });
              if (typeof user?.email === "string") {
                await sendTransactionalEmail({
                  to: user.email,
                  subject: "New sign-in to your ChamaPulse account",
                  text: `A new sign-in was detected for your account. If this was not you, reset your password and contact support. IP: ${session.ipAddress ?? "unavailable"}`,
                });
              }
            } catch (error) {
              console.error("Unable to send new sign-in alert", error);
            }
          },
        },
        delete: {
          after: async (session) => recordAuthEvent({ type: "session.revoked", userId: session.userId, sessionId: session.id }),
        },
      },
      account: {
        update: {
          after: async (account) => {
            if (account.providerId !== "credential") return;
            await recordAuthEvent({ type: "password.changed", userId: account.userId });
            try {
              const database = await connectToDatabase();
              const user = await database.collection<Record<string, unknown> & { _id: string }>("auth_user").findOne({ _id: account.userId }, { projection: { email: 1 } });
              if (typeof user?.email === "string") {
                await sendTransactionalEmail({
                  to: user.email,
                  subject: "Your ChamaPulse password was changed",
                  text: "Your password was changed. If you did not make this change, contact support immediately.",
                });
              }
            } catch (error) {
              console.error("Unable to send password-change alert", error);
            }
          },
        },
      },
    },
  });
}

let authPromise: ReturnType<typeof createAuth> | null = null;

export async function getAuth() {
  if (!authPromise) {
    authPromise = createAuth().catch((error) => {
      authPromise = null;
      throw error;
    });
  }
  return authPromise!;
}

export async function getAuthSession(requestHeaders?: Headers) {
  return (await getAuth()).api.getSession({ headers: requestHeaders ?? await nextHeaders() });
}

export async function sendPasswordReset(email: string) {
  return (await getAuth()).api.requestPasswordReset({
    body: { email: email.toLowerCase(), redirectTo: `${getSiteUrl().replace(/\/$/, "")}/reset-password` },
  });
}
