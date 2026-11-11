// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins"; // ← This adds role typing

export const authClient = createAuthClient({
  plugins: [adminClient()],
});