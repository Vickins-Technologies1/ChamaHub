"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, Clock3, LogOut, ShieldAlert, UsersRound } from "lucide-react";

type Workspace = {
  active: boolean;
  error?: string;
  session?: { actorName: string; actorRole: string; targetName: string; targetEmail: string | null; reason: string; startedAt: string; expiresAt: string; remainingSeconds: number };
  account?: { id: string; name: string; email: string; role: string; status: string; createdAt: string | null };
  groups?: Array<{ id: string; name: string; status: string; currency: string; contributionAmount: number | null; frequency: string | null; memberRole: string; memberStatus: string; joinedAt: string | null }>;
  transactions?: Array<{ id: string; groupName: string; type: string; direction: string; amountMinor: number | null; legacyAmountMajor: number | null; currency: string; status: string; reference: string; transactionDate: string }>;
  financialHistoryAvailable?: boolean;
};

function date(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ImpersonationWorkspace() {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/impersonation", { cache: "no-store" });
    const result = await response.json() as Workspace;
    if (!response.ok) throw new Error(result.error ?? "Unable to load the restricted support view.");
    setData(result);
    setRemaining(result.session?.remainingSeconds ?? 0);
  }, []);

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load the restricted support view.")); }, [load]);
  useEffect(() => {
    if (!data?.session) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [data?.session]);

  const exit = async () => {
    setEnding(true);
    try {
      await fetch("/api/admin/impersonation", { method: "DELETE" });
      window.location.assign("/admin");
    } finally {
      setEnding(false);
    }
  };

  const duration = Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0");
  if (error) return <div className="glass-panel p-6 text-sm text-rose-600">{error}<button className="dashboard-export-button ml-3" onClick={() => void exit()}>End session</button></div>;
  if (!data?.session || !data.account) return <div className="glass-panel p-8 text-sm text-[var(--muted)]">Loading restricted account view…</div>;

  return <div className="space-y-4">
    <section role="alert" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950 shadow-sm dark:bg-amber-950 dark:text-amber-100">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3"><ShieldAlert size={22} className="mt-0.5 shrink-0" /><div><h2 className="font-bold tracking-wide">ADMIN IMPERSONATION MODE — You are viewing the platform as {data.session.targetName}.</h2><p className="mt-2 text-xs">Original administrator: {data.session.actorName} ({data.session.actorRole.replaceAll("_", " ")})</p><p className="mt-1 text-xs">Target account: {data.session.targetName} · {data.session.targetEmail ?? "No email on file"}</p><p className="mt-1 text-xs">Reason: {data.session.reason}</p><p className="mt-1 text-xs">Started: {date(data.session.startedAt)}</p></div></div>
        <button disabled={ending} onClick={() => void exit()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-950 px-4 text-xs font-semibold text-white disabled:opacity-50 dark:bg-amber-100 dark:text-amber-950"><LogOut size={14} />{ending ? "Ending…" : "Exit impersonation"}</button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs font-semibold"><Clock3 size={14} />Session ends in {duration}. This restricted workspace is read-only.</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-3">
      <article className="glass-panel p-4"><p className="text-xs text-[var(--muted)]">Account</p><p className="mt-2 font-semibold">{data.account.name || "Unnamed account"}</p><p className="mt-1 text-xs text-[var(--muted)]">{data.account.email || data.account.id}</p></article>
      <article className="glass-panel p-4"><p className="text-xs text-[var(--muted)]">Account role and status</p><p className="mt-2 font-semibold capitalize">{data.account.role} · {data.account.status}</p><p className="mt-1 text-xs text-[var(--muted)]">Joined {date(data.account.createdAt)}</p></article>
      <article className="glass-panel p-4"><p className="text-xs text-[var(--muted)]">Support context</p><p className="mt-2 text-sm">Read-only account and group details</p><p className="mt-1 text-xs text-[var(--muted)]">No Clerk session or account permissions were changed.</p></article>
    </div>
    <section className="glass-panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--dash-border)] p-4"><UsersRound size={16} className="text-[var(--button-bg)]" /><h3 className="font-semibold">Group memberships</h3></div>
      {(data.groups ?? []).length ? <div className="divide-y divide-[var(--dash-border)]">{data.groups?.map((group) => <div key={group.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{group.name}</p><p className="mt-1 text-xs text-[var(--muted)]">Member since {date(group.joinedAt)}</p></div><p className="text-xs capitalize text-[var(--muted)]">{group.memberRole} · {group.memberStatus} · group {group.status}</p></div>)}</div> : <p className="p-6 text-sm text-[var(--muted)]">No group membership records found.</p>}
    </section>
    {data.financialHistoryAvailable ? <section className="glass-panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--dash-border)] p-4"><Banknote size={16} className="text-[var(--button-bg)]" /><h3 className="font-semibold">Financial record references</h3><span className="text-xs text-[var(--muted)]">read only</span></div>
      {(data.transactions ?? []).length ? <div className="overflow-x-auto"><table className="dashboard-table min-w-[650px] w-full text-left"><thead><tr><th>Group</th><th>Entry</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{data.transactions?.map((item) => <tr key={item.id}><td>{item.groupName}</td><td>{item.type} · {item.direction}</td><td>{item.amountMinor !== null ? item.currency + " " + item.amountMinor : item.legacyAmountMajor !== null ? item.currency + " " + item.legacyAmountMajor + " · legacy" : "Unknown"}</td><td>{item.status}</td><td>{date(item.transactionDate)}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-[var(--muted)]">No ledger entries found for this account.</p>}
      <p className="flex items-center gap-2 p-4 text-xs text-[var(--muted)]"><AlertTriangle size={14} />Recorded ledger history is not a statement of cash held by ChamaPulse.</p>
    </section> : null}
  </div>;
}
