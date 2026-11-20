import Link from "next/link";
import { CircleOff } from "lucide-react";

export default async function FeatureUnavailablePage({ searchParams }: { searchParams: Promise<{ feature?: string }> }) {
  const params = await searchParams;
  const title = params.feature === "registration" ? "New account registration is paused" : "This feature is temporarily unavailable";
  return <main className="flex min-h-screen items-center justify-center px-5 py-12"><section className="glass-panel w-full max-w-lg p-8 text-center"><CircleOff size={24} className="mx-auto text-[var(--muted)]" /><h1 className="mt-4 text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm text-[var(--muted)]">The platform administrator has temporarily disabled this feature. Existing group and financial records remain available where permitted.</p><Link href="/" className="dashboard-export-button mt-6 inline-flex">Return to ChamaPulse</Link></section></main>;
}
