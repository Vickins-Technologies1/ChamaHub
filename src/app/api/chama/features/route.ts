import { NextResponse } from "next/server";
import { FEATURE_REGISTRY, isFeatureEnabled } from "@/lib/platform/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const values = await Promise.all(FEATURE_REGISTRY.map(async (feature) => [feature.key, await isFeatureEnabled(feature.key)] as const));
  return NextResponse.json({ flags: Object.fromEntries(values) }, { headers: { "Cache-Control": "no-store" } });
}
