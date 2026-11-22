"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, CalendarDays, LoaderCircle, ShieldCheck, Users } from "lucide-react";
import { formatMinorUnits } from "@/lib/finance/money";

type Tab = "overview" | "members" | "contributions" | "payouts" | "meetings" | "financial-records" | "activity" | "settings";
type Row = Record<string, unknown>;
type Result = { group?: Row; summary?: { memberCounts: Array<{ _id: string; count: number }>; financial: Array<{ type: string; status: string; currency: string; count: number; amountMinor: number }>; rounds: Row[]; recentTransactions: Row[] }; financialDisclosure?: string; items?: Row[]; settings?: Row; total?: number; page?: number; pageSize?: number };

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "members", label: "Members" }, { id: "contributions", label: "Contributions" },
  { id: "payouts", label: "Payouts" }, { id: "meetings", label: "Meetings" }, { id: "financial-records", label: "Financial records" },
  { id: "activity", label: "Activity" }, { id: "settings", label: "Settings" },
];

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date || typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function amount(row: Row) {
  if (typeof row.amountMinor === "number" && typeof row.currency === "string") {
    try { return formatMinorUnits(row.amountMinor, row.currency); } catch { return `${row.currency} ${row.amountMinor} minor units`; }
  }
  return typeof row.legacyAmountMajor === "number" ? `${String(row.currency ?? "")} ${row.legacyAmountMajor.toLocaleString()} · legacy amount` : "Historic amount unavailable";
}

export default function AdminGroupDetail({ groupId }: { groupId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ tab, page: String(page), pageSize: "25" });
      const response = await fetch(`/api/admin/groups/${encodeURIComponent(groupId)}?${query}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load group details.");
      setResult((previous) => ({ ...(data as Result), group: (data as Result).group ?? previous?.group }));
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unable to load group details.");
    } finally { setLoading(false); }
  }, [groupId, page, tab]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const group = result?.group;
  const columns = tab === "members" ? ["Member", "Email", "Group role", "Status", "Account setup", "Joined"] : tab === "meetings" ? ["Meeting", "Scheduled", "Attendees", "Attendance captured"] : tab === "activity" ? ["Time", "Action", "Record", "Actor", "Reason"] : ["Date", "Type", "Amount", "Status", "Reference"];
  const items = result?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / 25));

  return (
    <div className="space-y-5">
      <div><Link href="/admin/groups" className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--button-bg)]"><ArrowLeft size={14} />All savings groups</Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Group profile</p><h2 className="mt-1 text-2xl font-semibold">{text(group?.name)}</h2><p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">{text(group?.description)}</p></div><div className="rounded-full border border-[var(--dash-border)] px-3 py-1 text-xs capitalize">{text(group?.status)}</div></div>
        {group ? <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--muted)]"><span>Owner: {text((group.owner as Row | undefined)?.name)} · {text((group.owner as Row | undefined)?.email)}</span><span>Group ID: <span className="font-mono">{groupId}</span></span><span>Created {text(group.createdAt)}</span></div> : null}
      </div>

      <div className="glass-panel overflow-x-auto"><div className="flex min-w-max gap-1 border-b border-[var(--dash-border)] p-2">{tabs.map((item) => <button key={item.id} onClick={() => { setTab(item.id); setPage(1); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === item.id ? "bg-[var(--dash-sidebar-active)] text-[var(--button-bg)]" : "text-[var(--muted)] hover:bg-[var(--dash-sidebar-hover)]"}`}>{item.label}</button>)}</div>
        <div className="p-4 sm:p-5">
          {error ? <div className="rounded-lg border border-rose-300/40 p-3 text-sm text-rose-600">{error}</div> : null}
          {loading && !result ? <div className="flex h-40 items-center justify-center text-sm text-[var(--muted)]"><LoaderCircle size={16} className="mr-2 animate-spin" />Loading group data…</div> : null}
          {tab === "overview" && result ? <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-[var(--dash-border)] bg-[var(--dash-sidebar-hover)] p-3 text-xs text-[var(--muted)]"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--button-bg)]" />Platform administrators can inspect group records, but this access does not grant ownership of group funds or permit balance edits.</div>
            <div className="grid gap-3 sm:grid-cols-3"><SummaryCard icon={<Users size={17} />} label="Member records" value={String((result.summary?.memberCounts ?? []).reduce((sum, row) => sum + row.count, 0))} /><SummaryCard icon={<CalendarDays size={17} />} label="Rounds on record" value={String(result.summary?.rounds.length ?? 0)} /><SummaryCard icon={<Banknote size={17} />} label="Ledger entries shown" value={String((result.summary?.financial ?? []).reduce((sum, row) => sum + row.count, 0))} /></div>
            <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-[var(--dash-border)] p-4"><h3 className="font-semibold">Contribution and payout ledger</h3><p className="mt-1 text-xs text-[var(--muted)]">Aggregated from recorded transaction entries; not an available cash balance.</p><div className="mt-3 space-y-2">{result.summary?.financial.length ? result.summary.financial.map((row) => <div key={`${row.type}-${row.status}-${row.currency}`} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--dash-sidebar-hover)] px-3 py-2 text-sm"><span className="capitalize">{row.type} · {row.status.replaceAll("_", " ")}<small className="ml-2 text-[var(--muted)]">{row.count} entries</small></span><b className="font-semibold">{summaryAmount(row.amountMinor, row.currency)}</b></div>) : <p className="text-sm text-[var(--muted)]">No ledger entries found.</p>}</div></section>
              <section className="rounded-xl border border-[var(--dash-border)] p-4"><h3 className="font-semibold">Recent financial records</h3><div className="mt-3 space-y-2">{result.summary?.recentTransactions.map((row) => <div key={String(row._id)} className="flex items-center justify-between gap-3 border-b border-[var(--dash-border)] pb-2 text-xs last:border-0"><span><b className="capitalize">{text(row.type)}</b><span className="ml-2 text-[var(--muted)]">{text(row.status)}</span><time className="mt-1 block text-[var(--muted)]">{text(row.transactionDate)}</time></span><span className="font-semibold">{amount(row)}</span></div>)}</div></section>
            </div>
            <section className="rounded-xl border border-[var(--dash-border)] p-4"><h3 className="font-semibold">Group configuration</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries((group?.settings as Row | undefined) ?? {}).map(([key, value]) => <div key={key}><p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</p><p className="mt-1 text-sm font-medium">{text(value)}</p></div>)}</div></section>
          </div> : null}

          {tab !== "overview" && tab !== "settings" && !loading ? items.length ? <div className="overflow-x-auto"><table className="dashboard-table min-w-[760px] w-full text-left"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{items.map((row, index) => <tr key={String(row.id ?? index)}>
            {tab === "members" ? <><td><span className="font-medium">{text(row.name)}</span><small className="mt-1 block text-[10px] text-[var(--muted)]">{text(row.id)}</small></td><td>{text(row.email)}{row.phone ? <small className="mt-1 block text-[10px] text-[var(--muted)]">{text(row.phone)}</small> : null}</td><td className="capitalize">{text(row.role)}</td><td>{text(row.status)}</td><td>{String(row.accountSetupStatus ?? "not_invited").replaceAll("_", " ")}</td><td>{text(row.joinedAt)}</td></> : null}
            {tab === "meetings" ? <><td>{text(row.title)}</td><td>{text(row.scheduledFor)}</td><td>{text(row.participantCount)}</td><td>{text(row.attendanceCapturedAt)}</td></> : null}
            {tab === "activity" ? <><td>{text(row.occurredAt)}</td><td>{text(row.action)}</td><td>{text(row.entityType)} · {text(row.entityId)}</td><td>{text(row.actorId)}</td><td>{text(row.reason)}</td></> : null}
            {["contributions", "payouts", "financial-records"].includes(tab) ? <><td>{text(row.transactionDate)}</td><td className="capitalize">{text(row.type)} · {text(row.direction)}</td><td>{amount(row)}</td><td>{text(row.status)}</td><td>{text(row.reference)}</td></> : null}
          </tr>)}</tbody></table></div> : <div className="p-10 text-center text-sm text-[var(--muted)]">No records on this tab.</div> : null}

          {tab === "settings" && result?.settings ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(result.settings).map(([key, value]) => <div key={key} className="rounded-xl border border-[var(--dash-border)] p-4"><p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</p><p className="mt-2 text-sm font-semibold">{text(value)}</p></div>)}<div className="sm:col-span-2 lg:col-span-3 rounded-xl bg-[var(--dash-sidebar-hover)] p-4 text-xs text-[var(--muted)]">Settings are currently read-only in the platform data model. Changes must use existing group workflows.</div></div> : null}
        </div>
        {tab !== "overview" && tab !== "settings" ? <div className="flex items-center justify-between border-t border-[var(--dash-border)] px-4 py-3 text-xs text-[var(--muted)]"><span>{result?.total ?? 0} records</span><div className="flex items-center gap-2"><button className="dashboard-pagination-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>‹</button><span>{page} / {pageCount}</span><button className="dashboard-pagination-button" disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>›</button></div></div> : null}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="glass-panel p-4"><div className="flex items-center justify-between text-[var(--button-bg)]">{label}{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function summaryAmount(amountMinor: number, currency: string) {
  try { return formatMinorUnits(amountMinor, currency); }
  catch { return `${currency || "Unknown currency"} · ${amountMinor} minor units`; }
}
