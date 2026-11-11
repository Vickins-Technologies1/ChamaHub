// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import type { NextRequest } from "next/server";

async function getHandler() {
  const auth = await getAuth();
  return toNextJsHandler(auth);
}

export async function GET(request: NextRequest) {
  const handler = await getHandler();
  return handler.GET(request);
}

export async function POST(request: NextRequest) {
  const handler = await getHandler();
  return handler.POST(request);
}
