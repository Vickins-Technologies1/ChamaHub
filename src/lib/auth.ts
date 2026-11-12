// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin } from "better-auth/plugins";
import connectToDatabase from "@/lib/mongodb";
import transporter from "@/lib/nodemailer";

const PRODUCTION_SITE_URL = "https://chamahub.vickinstechnologies.com";

const getSiteUrl = () => {
  const configuredUrl =
    process.env.BETTER_AUTH_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    (process.env.NODE_ENV === "production" ? PRODUCTION_SITE_URL : "http://localhost:3000");

  return configuredUrl.replace(/\/$/, "");
};

async function createAuth() {
  const db = await connectToDatabase();
  return betterAuth({
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: Boolean(transporter),
      sendResetPassword: async ({ user, url }) => {
        if (!transporter || !user.email) return;
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: "Reset your ChamaHub password",
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220"><h2>Reset your password</h2><p>Use the secure link below to choose a new ChamaHub password.</p><p><a href="${url}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600">Reset password</a></p><p style="font-size:12px;color:#5a6882">If you did not request this, you can safely ignore this email.</p></div>`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        if (!transporter || !user.email) return;
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: "Verify your ChamaHub email",
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220"><h2>Verify your email</h2><p>Confirm your email address before joining your ChamaHub group.</p><p><a href="${url}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600">Verify email</a></p></div>`,
        });
      },
    },
    plugins: [
      admin({
        adminRoles: ["admin"],
        defaultRole: "user", // All new users start as "user"
      }),
    ],
    baseURL: getSiteUrl(),
    trustedOrigins: [
      "http://localhost:3000",
      PRODUCTION_SITE_URL,
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.BETTER_AUTH_BASE_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ].filter(Boolean) as string[],
    // Optional: enable if deploying on Vercel/Netlify/etc.
    // trustHost: true,
  });
}

type AuthInstance = Awaited<ReturnType<typeof createAuth>>;

let cachedAuth: AuthInstance | null = null;
let cachedAuthPromise: ReturnType<typeof createAuth> | null = null;

export async function getAuth() {
  if (cachedAuth) return cachedAuth;

  if (!cachedAuthPromise) {
    cachedAuthPromise = createAuth().then((auth) => {
      cachedAuth = auth;
      return auth;
    });
  }

  return cachedAuthPromise;
}
