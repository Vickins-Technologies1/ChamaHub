import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

async function handle(request: Request) {
  const { GET, POST } = toNextJsHandler(await getAuth());
  return request.method === "GET" ? GET(request) : POST(request);
}

export { handle as GET, handle as POST };
