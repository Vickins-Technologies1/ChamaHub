import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import { getMpesaReadiness } from "@/lib/payments/mpesa-readiness";
import { requireAdminPermission } from "@/lib/admin/access";

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
  return NextResponse.json({
    checkedAt: new Date(),
    services: {
      application: { status: "running", framework: "Next.js", authentication: "Clerk" },
      database: { status: database, kind: "MongoDB" },
      authentication: { status: process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "configured" : "incomplete", provider: "Clerk" },
      email: { status: process.env.EMAIL_USER && process.env.EMAIL_PASS ? "configured" : "not configured" },
      sms: { status: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER ? "configured" : "not configured" },
      paymentGateway: { status: "disabled", provider: "M-Pesa", ready: mpesa.ready, mode: mpesa.mode, missingConfigurationKeys: mpesa.missing },
    },
    capabilities: {
      maintenanceMode: "not implemented",
      subscriptions: "not implemented",
      supportTickets: "not implemented",
      loginHistory: "not available from the current application data model",
      backgroundJobHistory: "not stored",
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
