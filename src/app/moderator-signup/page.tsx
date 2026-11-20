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
    if (!form.groupName.trim() || Number(form.contributionAmount) <= 0 || !form.startDate) {
      setError("Enter a group name, a contribution amount above zero, and a start date.");
      return;
    }
    sessionStorage.setItem("chamapulse-pending-moderator-signup", JSON.stringify(form));
    router.push("/auth/enroll?role=moderator");
  };

  return <AuthShell eyebrow="Moderator Signup" title="Launch your first ChamaPulse group." subtitle="Set up the group first, then create and verify your moderator account." brandTitle="Moderator Access" brandSubtitle="Launch a secure group workspace." brandPoints={["Define contribution cycles and payout schedules.", "Invite members and track every payment.", "Run your group with clear records."]}>
    <form onSubmit={submit} className="space-y-4">
      <input className={inputClass} placeholder="Chama group name" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} required />
      <input className={inputClass} placeholder="Group description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input className={inputClass} type="number" min="0.01" step="0.01" placeholder="Contribution amount" value={form.contributionAmount} onChange={(e) => setForm({ ...form, contributionAmount: e.target.value })} required />
        <select className={inputClass} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}><option value="weekly">Weekly</option><option value="bi-weekly">Bi-weekly</option><option value="monthly">Monthly</option></select>
        <input className={inputClass} type="number" min="1" placeholder="Expected members" value={form.numberOfMembers} onChange={(e) => setForm({ ...form, numberOfMembers: e.target.value })} />
        <input className={inputClass} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
        <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option value="KES">KES</option><option value="USD">USD</option><option value="UGX">UGX</option><option value="TZS">TZS</option></select>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]"><span className="inline-flex items-center gap-2 rounded-full border px-3 py-2"><Users size={14} />Member management</span><span className="inline-flex items-center gap-2 rounded-full border px-3 py-2"><Wallet size={14} />Payments dashboard</span></div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <button type="submit" className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[var(--button-bg)] px-5 py-3 text-sm font-semibold text-white">Continue to secure account setup <ArrowRight size={16} /></button>
    </form>
    <div className="mt-6 text-sm text-[var(--muted)]">Already a moderator? <Link href="/moderator-login" className="font-semibold text-[var(--button-bg)] hover:underline">Log in</Link></div>
  </AuthShell>;
}
