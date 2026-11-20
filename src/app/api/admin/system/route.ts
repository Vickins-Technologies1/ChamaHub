import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { getMpesaReadiness } from "@/lib/payments/mpesa-readiness";
import { requireAdminPermission } from "@/lib/admin/access";
import { FEATURE_REGISTRY, getMaintenanceSettings } from "@/lib/platform/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireAdminPermission("system.read");
  if (access.response) return access.response;
  let database = "unavailable";
  try {
    await (await connectToDatabase()).command({ ping: 1 });
    database = "connected";
  } catch {
    database = "unavailable";
  }
  const mpesa = getMpesaReadiness();
  const maintenance = await getMaintenanceSettings().catch(() => null);
  return NextResponse.json({
    checkedAt: new Date(),
    services: {
      application: { status: "running", framework: "Next.js", authentication: "Better Auth" },
      database: { status: database, kind: "MongoDB" },
      authentication: { status: process.env.BETTER_AUTH_SECRET && process.env.MONGODB_URI ? "configured" : "incomplete", provider: "Better Auth" },
      email: { status: process.env.EMAIL_USER && process.env.EMAIL_PASS ? "configured" : "not configured" },
      sms: { status: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER ? "configured" : "not configured" },
      paymentGateway: { status: "disabled", provider: "M-Pesa", ready: mpesa.ready, mode: mpesa.mode, missingConfigurationKeys: mpesa.missing },
    },
    capabilities: {
      maintenanceMode: maintenance?.enabled ? "enabled" : "implemented and disabled",
      featureFlags: FEATURE_REGISTRY.length + " global switches available",
      subscriptions: "not implemented",
      supportTickets: "implemented in the platform support store",
      loginHistory: "authentication session events are stored in MongoDB",
      backgroundJobHistory: "not stored",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
