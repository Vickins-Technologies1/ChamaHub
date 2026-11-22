import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { NextResponse } from "next/server";

async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (request.method === "POST" && path.startsWith("/api/auth/") && path.endsWith("/sign-up/email")) {
    return NextResponse.json(
      { message: "Account creation is available through a moderator registration or member invitation." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { GET, POST } = toNextJsHandler(await getAuth());
  return request.method === "GET" ? GET(request) : POST(request);
}

export { handle as GET, handle as POST };
