// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin } from "better-auth/plugins";
import connectToDatabase from "@/lib/mongodb";

async function createAuth() {
  const db = await connectToDatabase();
  return betterAuth({
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
      // Optional: strengthen password requirements
      // minPasswordLength: 8,
    },
    plugins: [
      admin({
        adminRoles: ["admin"],
        defaultRole: "user", // All new users start as "user"
      }),
    ],
    baseURL: process.env.BETTER_AUTH_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
    trustedOrigins: [
      "http://localhost:3000",
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.BETTER_AUTH_BASE_URL,
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
