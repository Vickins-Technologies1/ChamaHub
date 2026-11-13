"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Search,
  WalletCards,
} from "lucide-react";

type GroupSummary = {
  id: string;
  name: string;
  currency: string;
};

type Contribution = {
  id: string;
  roundId: string;
  memberId: string;
  amount: number;
  status: "paid" | "pending";
  method: string;
  reference?: string;
  paidAt?: string;
};

type Member = {
  id: string;
  name?: string;
  email?: string;
};

const pageSize = 10;
const formatCurrency = (amount: number, currency = "KES") =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "Date not recorded";

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function LedgerPage() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const currentGroup = groups.find((group) => group.id === selectedGroup);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chama/groups", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load groups.");
      const nextGroups: GroupSummary[] = data.groups ?? [];
      setGroups(nextGroups);
      setSelectedGroup((previous) => previous || nextGroups[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadContributions = useCallback(async (groupId: string) => {
    if (!groupId) {
      setContributions([]);
      setMembers([]);
      return;
    }
    setRecordsLoading(true);
    setError("");
    try {
      const [contribRes, membersRes] = await Promise.all([
        fetch(`/api/chama/groups/${groupId}/contributions`, { cache: "no-store" }),
        fetch(`/api/chama/groups/${groupId}/members`, { cache: "no-store" }),
      ]);
      const [contribData, membersData] = await Promise.all([contribRes.json(), membersRes.json()]);
      if (!contribRes.ok) throw new Error(contribData?.error || "Unable to load contributions.");
      if (!membersRes.ok) throw new Error(membersData?.error || "Unable to load members.");
      setContributions(contribData.contributions ?? []);
      setMembers(membersData.members ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load contributions.");
      setContributions([]);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => { void loadContributions(selectedGroup); }, [selectedGroup, loadContributions]);
  useEffect(() => { setPage(1); }, [query, statusFilter, sort, selectedGroup]);

  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const filteredContributions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contributions
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter((item) => {
        if (!normalizedQuery) return true;
        const member = memberMap.get(item.memberId);
        return [member?.name, member?.email, item.method, item.reference, item.status, item.amount]
          .some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        if (sort === "oldest") return new Date(a.paidAt ?? 0).getTime() - new Date(b.paidAt ?? 0).getTime();
        if (sort === "high") return b.amount - a.amount;
        if (sort === "low") return a.amount - b.amount;
        return new Date(b.paidAt ?? 0).getTime() - new Date(a.paidAt ?? 0).getTime();
      });
  }, [contributions, memberMap, query, sort, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredContributions.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredContributions.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paidCount = contributions.filter((item) => item.status === "paid").length;
  const pendingCount = contributions.filter((item) => item.status === "pending").length;
  const paidTotal = contributions.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amount, 0);

  const exportCsv = () => {
    const headers = ["Member", "Email", "Amount", "Currency", "Method", "Reference", "Status", "Date"];
    const rows = filteredContributions.map((item) => {
      const member = memberMap.get(item.memberId);
      return [member?.name || "Member", member?.email || "", item.amount, currentGroup?.currency || "KES", item.method, item.reference || "", item.status, formatDate(item.paidAt)];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(currentGroup?.name || "chama").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-contributions.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="space-y-5"><div className="glass-panel h-28 shimmer-line" /><div className="glass-panel h-80 shimmer-line" /></div>;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="dashboard-page-intro">
        <div className="dashboard-page-intro__icon"><WalletCards size={19} /></div>
        <div className="min-w-0 flex-1">
          <p className="dashboard-section-kicker">Financial records</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Contribution ledger</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Search and review the latest payment records across your groups.</p>
        </div>
        {currentGroup ? <span className="hidden rounded-lg border border-[var(--dash-border)] bg-[var(--glass-surface-muted)] px-3 py-2 text-xs font-semibold sm:inline-flex">{currentGroup.name}</span> : null}
      </section>

      {error ? <div className="glass-panel p-4 text-sm text-rose-600" role="alert">{error}</div> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Contribution summary">
        {[
          { label: "Collected in latest records", value: formatCurrency(paidTotal, currentGroup?.currency), helper: "Paid entries in the loaded record set", icon: WalletCards, tone: "blue" },
          { label: "Paid records", value: paidCount, helper: "Confirmed contributions", icon: CheckCircle2, tone: "green" },
          { label: "Pending records", value: pendingCount, helper: "Awaiting confirmation", icon: Clock3, tone: "amber" },
        ].map((stat) => <article className="glass-panel dashboard-ledger-stat" key={stat.label}>
          <span className={`dashboard-ledger-stat__icon is-${stat.tone}`}><stat.icon size={17} /></span>
          <div className="min-w-0"><p className="text-xs text-[var(--muted)]">{stat.label}</p><p className="mt-1 truncate text-lg font-semibold tabular-nums">{stat.value}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{stat.helper}</p></div>
        </article>)}
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--dash-border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1 sm:min-w-[210px] sm:flex-none">
              <label htmlFor="ledger-group" className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Group</label>
              <select id="ledger-group" className="glass-input !rounded-lg !py-2 !text-sm" value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)} disabled={groups.length === 0}>
                {groups.length === 0 ? <option value="">No groups available</option> : null}
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="hidden pl-2 pt-4 sm:block"><p className="text-sm font-semibold">Latest activity</p><p className="mt-1 text-[10px] text-[var(--muted)]">Up to 50 records are loaded</p></div>
          </div>
          <button type="button" onClick={exportCsv} disabled={filteredContributions.length === 0} className="dashboard-export-button">
            <Download size={15} /> Export view
          </button>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_160px_160px] sm:p-5">
          <label className="dashboard-search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member, method or reference" aria-label="Search contributions" />
          </label>
          <label className="sr-only" htmlFor="ledger-status">Filter by status</label>
          <select id="ledger-status" className="glass-input !rounded-lg !py-2.5 !text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option>
          </select>
          <label className="dashboard-sort-field"><ArrowDownUp size={15} /><select aria-label="Sort contributions" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="high">Amount: high to low</option><option value="low">Amount: low to high</option>
          </select></label>
        </div>

        {recordsLoading ? (
          <div className="space-y-3 px-5 pb-5"><div className="glass-panel h-11 shimmer-line" /><div className="glass-panel h-16 shimmer-line" /><div className="glass-panel h-16 shimmer-line" /></div>
        ) : filteredContributions.length === 0 ? (
          <div className="dashboard-empty mx-4 mb-5 sm:mx-5"><FileText size={18} /><span>{groups.length === 0 ? "Your contribution records will appear once you join a group." : contributions.length === 0 ? "No contribution records have been added to this group yet." : "No records match the selected filters."}</span></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="dashboard-table">
                <thead><tr><th>Member</th><th>Payment</th><th>Reference</th><th>Date</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
                <tbody>{pageRows.map((item) => {
                  const member = memberMap.get(item.memberId);
                  return <tr key={item.id}>
                    <td><div className="flex min-w-48 items-center gap-3"><span className="dashboard-member-avatar">{(member?.name || member?.email || "M").slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate font-semibold">{member?.name || "Member"}</span><span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{member?.email || ""}</span></span></div></td>
                    <td><span className="font-medium capitalize">{item.method || "Manual"}</span></td>
                    <td className="text-[var(--muted)]">{item.reference || "—"}</td>
                    <td className="text-[var(--muted)]">{formatDate(item.paidAt)}</td>
                    <td><span className={`dashboard-payment-status is-${item.status}`}>{item.status === "paid" ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{item.status}</span></td>
                    <td className="text-right font-semibold tabular-nums">{formatCurrency(item.amount, currentGroup?.currency)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <div className="divide-y divide-[var(--dash-border)] lg:hidden">
              {pageRows.map((item) => {
                const member = memberMap.get(item.memberId);
                return <article key={item.id} className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="dashboard-member-avatar">{(member?.name || member?.email || "M").slice(0, 1).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member?.name || "Member"}</p><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{item.method || "Manual"} · {formatDate(item.paidAt)}</p></div>
                    <div className="text-right"><p className="text-sm font-semibold tabular-nums">{formatCurrency(item.amount, currentGroup?.currency)}</p><span className={`dashboard-payment-status mt-1 is-${item.status}`}>{item.status}</span></div>
                  </div>
                  {item.reference ? <p className="mt-2 pl-11 text-[10px] text-[var(--muted)]">Ref: {item.reference}</p> : null}
                </article>;
              })}
            </div>
            <div className="flex flex-col gap-3 border-t border-[var(--dash-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-[var(--muted)]">Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredContributions.length)} of {filteredContributions.length} records</p>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button type="button" className="dashboard-pagination-button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={safePage <= 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span className="min-w-16 text-center text-xs font-medium">Page {safePage} of {totalPages}</span>
                <button type="button" className="dashboard-pagination-button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={safePage >= totalPages} aria-label="Next page"><ChevronRight size={16} /></button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
