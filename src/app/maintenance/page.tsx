import { Wrench } from "lucide-react";
import { getMaintenanceSettings } from "@/lib/platform/config";

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  let announcement = "ChamaPulse is undergoing scheduled maintenance. Please check back shortly.";
  let restoration: Date | null = null;
  try {
    const settings = await getMaintenanceSettings();
    if (settings.announcement) announcement = settings.announcement;
    restoration = settings.expectedRestorationAt;
  } catch {
    // Keep the branded maintenance experience available when the database is unreachable.
  }
  return <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-5 py-12"><section className="glass-panel w-full max-w-2xl p-8 text-center sm:p-12"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--dash-sidebar-hover)] text-[var(--button-bg)]"><Wrench size={23} /></div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">ChamaPulse · Scheduled service work</p><h1 className="mt-3 text-3xl font-semibold">We’ll be back soon</h1><p className="mx-auto mt-4 max-w-lg whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{announcement}</p>{restoration ? <p className="mt-5 text-xs text-[var(--muted)]">Expected restoration: {new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short" }).format(restoration)}</p> : null}<div className="mt-8 border-t border-[var(--dash-border)] pt-5 text-xs text-[var(--muted)]">Your group and financial records remain protected during this maintenance window.</div></section></main>;
}
