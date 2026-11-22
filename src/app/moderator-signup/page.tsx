"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Users, Wallet } from "lucide-react";
import AuthShell from "@/components/AuthShell";

const inputClass = "glass-input";

export default function ModeratorSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    groupName: "", description: "", contributionAmount: "", frequency: "monthly",
    numberOfMembers: "5", startDate: new Date().toISOString().slice(0, 10), currency: "KES",
  });
  const [error, setError] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.groupName.trim() || Number(form.contributionAmount) < 1 || !form.startDate) {
      setError("Enter a group name, a contribution amount of at least 1, and a start date.");
      return;
    }
    try {
      localStorage.setItem("chamapulse-pending-moderator-signup", JSON.stringify(form));
    } catch {
      // The completion page can ask for these details again if browser storage is unavailable.
    }
    router.push("/auth/enroll?role=moderator");
  };

  return <AuthShell eyebrow="Moderator Signup" title="Launch your first ChamaPulse group." subtitle="Set up the group first, then create and verify your moderator account." brandTitle="Moderator Access" brandSubtitle="Launch a secure group workspace." brandPoints={["Define contribution cycles and payout schedules.", "Invite members and track every payment.", "Run your group with clear records."]}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1.5 text-sm font-medium">Group name<input className={inputClass} placeholder="e.g. Greenfield Savings Group" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} required maxLength={120} autoComplete="organization" /></label>
      <label className="block space-y-1.5 text-sm font-medium">Description <span className="font-normal text-[var(--muted)]">(optional)</span><input className={inputClass} placeholder="What is your group saving for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5 text-sm font-medium">Contribution amount<input className={inputClass} type="number" min="1" step="0.01" placeholder="e.g. 1,000" value={form.contributionAmount} onChange={(e) => setForm({ ...form, contributionAmount: e.target.value })} required /></label>
        <label className="block space-y-1.5 text-sm font-medium">Frequency<select className={inputClass} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}><option value="weekly">Weekly</option><option value="bi-weekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
        <label className="block space-y-1.5 text-sm font-medium">Expected members<input className={inputClass} type="number" min="1" max="10000" placeholder="5" value={form.numberOfMembers} onChange={(e) => setForm({ ...form, numberOfMembers: e.target.value })} /></label>
        <label className="block space-y-1.5 text-sm font-medium">First contribution date<input className={inputClass} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></label>
        <label className="block space-y-1.5 text-sm font-medium">Currency<select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option value="KES">KES</option><option value="USD">USD</option><option value="UGX">UGX</option><option value="TZS">TZS</option></select></label>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]"><span className="inline-flex items-center gap-2 rounded-full border px-3 py-2"><Users size={14} />Member management</span><span className="inline-flex items-center gap-2 rounded-full border px-3 py-2"><Wallet size={14} />Payments dashboard</span></div>
      {error && <p role="alert" className="auth-alert auth-alert--error">{error}</p>}
      <button type="submit" className="w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white">Continue to secure account setup <ArrowRight size={16} /></button>
    </form>
    <div className="mt-6 text-sm text-[var(--muted)]">Already a moderator? <Link href="/moderator-login" className="font-semibold text-[var(--button-bg)] hover:underline">Log in</Link></div>
  </AuthShell>;
}
